import http from 'k6/http'
import { check } from 'k6'
import { Rate, Trend } from 'k6/metrics'

/**
 * Backend ingress load test — POST /api/v1/notifysimple.
 *
 * Measures the SYNCHRONOUS accept path: gateway (Kong key-auth) -> NotifyServiceGuard
 * -> validation -> DB insert -> enqueue -> 202. Downstream delivery is async and is
 * NOT what this test measures; during load the PR env should run the `log` email sink
 * (DELIVERY_EMAIL_ADAPTER=log) so nothing is delivered externally.
 *
 * Auth: must go through the per-PR Kong gateway, which injects x-credential-identifier.
 * Hitting the apps.silver backend route directly returns 401 (no Kong).
 *
 * Required env:
 *   BACKEND_URL  Gateway base incl. /api, e.g. https://gw-fe8c5-notify-pr-147.dev.api.gov.bc.ca/api
 *   API_KEY      Kong API key bound to a tenant in the PR env (sent as X-API-KEY)
 *
 * Optional env (ramp shape):
 *   TARGET_RPS   peak requests/sec (default 50)
 *   RAMP_SECONDS seconds to ramp up and hold each (default 60)
 *   TO           recipient address (default loadtest@example.com)
 *
 * Run locally:
 *   k6 run -e BACKEND_URL=https://gw-...dev.api.gov.bc.ca/api -e API_KEY=... tests/load/backend-test.js
 */

const BACKEND_URL = (__ENV.BACKEND_URL || '').replace(/\/$/, '')
const API_KEY = __ENV.API_KEY || ''
const TO = __ENV.TO || 'loadtest@example.com'
const TARGET_RPS = parseInt(__ENV.TARGET_RPS || '50', 10)
const RAMP_SECONDS = parseInt(__ENV.RAMP_SECONDS || '60', 10)

export const errorRate = new Rate('ingress_errors')
export const acceptLatency = new Trend('accept_latency_ms', true)

export const options = {
  scenarios: {
    // Open model: hold an arrival RATE regardless of response time, so a slowing
    // backend shows up as a growing queue of VUs + rising latency, not throttled load.
    ingress_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: Math.ceil(TARGET_RPS / 2), duration: `${RAMP_SECONDS}s` }, // ramp to half
        { target: TARGET_RPS, duration: `${RAMP_SECONDS}s` }, // ramp to peak
        { target: TARGET_RPS, duration: `${RAMP_SECONDS}s` }, // hold at peak
        { target: 0, duration: '15s' }, // ramp down
      ],
    },
  },
  thresholds: {
    // CI fails the load test if the accept path breaks its SLO.
    ingress_errors: ['rate<0.01'], // <1% non-202 responses
    accept_latency_ms: ['p(95)<1000'], // p95 accept under 1s
  },
}

export function setup() {
  if (!BACKEND_URL) throw new Error('BACKEND_URL is required (gateway base incl. /api)')
  if (!API_KEY) throw new Error('API_KEY is required (Kong key bound to a tenant)')
  // Fail fast if the target is unreachable before spending the whole ramp.
  const health = http.get(`${BACKEND_URL}/health`)
  console.log(`setup: GET ${BACKEND_URL}/health -> ${health.status}`)
}

export default function () {
  const payload = JSON.stringify({
    email: {
      recipients: { to: [TO] },
      content: {
        subject: 'Notify ingress load test',
        body: 'Load-test notification (delivery sunk to log adapter).',
        bodyType: 'text',
      },
    },
  })

  const res = http.post(`${BACKEND_URL}/v1/notifysimple`, payload, {
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
    tags: { name: 'notifysimple' },
  })

  acceptLatency.add(res.timings.duration)
  const accepted = check(res, { 'accepted (202)': (r) => r.status === 202 })
  errorRate.add(!accepted)
  if (!accepted) {
    console.error(`notifysimple failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`)
  }
}

// Emit a durable, human-readable report at end of test.
// Marker on the first line lets the CI step upsert a single sticky PR comment.
const REPORT_MARKER = '<!-- load-test-report -->'

export function handleSummary(data) {
  const m = data.metrics || {}
  const val = (metric, field) =>
    m[metric] && m[metric].values && m[metric].values[field] != null
      ? m[metric].values[field]
      : undefined
  const ms = (v) => (v == null ? 'n/a' : `${Number(v).toFixed(0)} ms`)
  const rate = (v) => (v == null ? 'n/a' : `${(Number(v) * 100).toFixed(2)}%`)
  const n = (v, d = 0) => (v == null ? 'n/a' : Number(v).toFixed(d))

  const reqCount = val('http_reqs', 'count')
  const reqRate = val('http_reqs', 'rate')
  const avg = val('http_req_duration', 'avg')
  const p90 = val('http_req_duration', 'p(90)')
  const p95 = val('http_req_duration', 'p(95)') ?? val('accept_latency_ms', 'p(95)')
  const maxd = val('http_req_duration', 'max')
  const errRate = val('ingress_errors', 'rate') ?? val('http_req_failed', 'rate')
  const checksRate = val('checks', 'rate')

  const thresholds = []
  for (const [name, metric] of Object.entries(m)) {
    if (metric.thresholds) {
      for (const [expr, res] of Object.entries(metric.thresholds)) {
        thresholds.push(`${res.ok ? '✅' : '❌'} \`${name}: ${expr}\``)
      }
    }
  }
  const allOk = thresholds.length > 0 && thresholds.every((t) => t.startsWith('✅'))

  const md = [
    REPORT_MARKER,
    '## 🚀 Backend ingress load test',
    '',
    `**Result:** ${allOk ? '✅ thresholds passed' : '❌ thresholds failed'}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Accepts (total) | ${n(reqCount)} |`,
    `| Throughput | ${n(reqRate, 1)} req/s |`,
    `| Accept latency (avg) | ${ms(avg)} |`,
    `| Accept latency (p90) | ${ms(p90)} |`,
    `| Accept latency (p95) | ${ms(p95)} |`,
    `| Accept latency (max) | ${ms(maxd)} |`,
    `| Error rate | ${rate(errRate)} |`,
    `| Checks passed | ${rate(checksRate)} |`,
    '',
    '**Thresholds**',
    ...(thresholds.length ? thresholds.map((t) => `- ${t}`) : ['- (none)']),
    '',
    `_Target: \`${BACKEND_URL}\` · peak ${TARGET_RPS} req/s · email delivery sunk to the log adapter._`,
  ].join('\n')

  return {
    'summary.json': JSON.stringify(data, null, 2),
    'summary.md': md,
    stdout: `\n${md}\n`,
  }
}
