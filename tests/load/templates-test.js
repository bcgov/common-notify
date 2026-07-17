import http from 'k6/http'
import { check } from 'k6'
import { Rate, Trend } from 'k6/metrics'

/**
 * Template-rendering load test.
 *
 * setup() creates one EMAIL template, then the ramp sends notifysimple requests
 * that render it (content.templateId + params for {{substitution}}). Measures the
 * accept path WITH server-side template resolution/rendering under load.
 * teardown() deletes the template.
 *
 * Env: BACKEND_URL (gateway incl. /api), API_KEY, TARGET_RPS (50), RAMP_SECONDS (60).
 */
const BACKEND_URL = (__ENV.BACKEND_URL || '').replace(/\/$/, '')
const API_KEY = __ENV.API_KEY || ''
const TO = __ENV.TO || 'loadtest@example.com'
const TARGET_RPS = parseInt(__ENV.TARGET_RPS || '50', 10)
const RAMP_SECONDS = parseInt(__ENV.RAMP_SECONDS || '60', 10)

export const errorRate = new Rate('ingress_errors')
export const acceptLatency = new Trend('accept_latency_ms', true)

const HEADERS = { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY }

export const options = {
  scenarios: {
    template_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: Math.ceil(TARGET_RPS / 2), duration: `${RAMP_SECONDS}s` },
        { target: TARGET_RPS, duration: `${RAMP_SECONDS}s` },
        { target: TARGET_RPS, duration: `${RAMP_SECONDS}s` },
        { target: 0, duration: '15s' },
      ],
    },
  },
  thresholds: {
    ingress_errors: ['rate<0.01'],
    accept_latency_ms: ['p(95)<1500'], // rendering adds work vs plain ingress
  },
}

export function setup() {
  if (!BACKEND_URL) throw new Error('BACKEND_URL is required')
  if (!API_KEY) throw new Error('API_KEY is required')
  const body = JSON.stringify({
    name: `loadtest-template-${__ENV.RUN_ID || 'local'}`,
    description: 'Ephemeral load-test template',
    channelCode: 'EMAIL',
    subject: 'Load test for {{firstName}}',
    body: 'Dear {{firstName}} {{lastName}}, your amount is ${{amount}}.',
    engineCode: 'handlebars',
  })
  const res = http.post(`${BACKEND_URL}/v1/templates`, body, { headers: HEADERS })
  if (res.status !== 201) {
    throw new Error(`template create failed: HTTP ${res.status} ${String(res.body).slice(0, 300)}`)
  }
  const templateId = res.json('id')
  console.log(`setup: created template ${templateId}`)
  return { templateId }
}

export default function (data) {
  const payload = JSON.stringify({
    params: { firstName: 'Alice', lastName: 'Smith', amount: '5000' },
    email: {
      recipients: { to: [TO] },
      content: { templateId: data.templateId },
    },
  })
  const res = http.post(`${BACKEND_URL}/v1/notifysimple`, payload, {
    headers: HEADERS,
    tags: { name: 'notifysimple-template' },
  })
  acceptLatency.add(res.timings.duration)
  const ok = check(res, { 'accepted (202)': (r) => r.status === 202 })
  errorRate.add(!ok)
  if (!ok) console.error(`template send failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`)
}

export function teardown(data) {
  if (data && data.templateId) {
    const res = http.del(`${BACKEND_URL}/v1/templates/${data.templateId}`, null, { headers: HEADERS })
    console.log(`teardown: delete template ${data.templateId} -> ${res.status}`)
  }
}

export function handleSummary(data) {
  return summarize(data, 'template', BACKEND_URL, TARGET_RPS)
}

// Shared report builder (kept inline per-file to avoid k6 module resolution in CI).
function summarize(data, testName, target, rps) {
  const m = data.metrics || {}
  const v = (a, b) => (m[a] && m[a].values && m[a].values[b] != null ? m[a].values[b] : undefined)
  const ms = (x) => (x == null ? 'n/a' : `${Number(x).toFixed(0)} ms`)
  const rate = (x) => (x == null ? 'n/a' : `${(Number(x) * 100).toFixed(2)}%`)
  const n = (x, d = 0) => (x == null ? 'n/a' : Number(x).toFixed(d))
  const thr = []
  for (const [name, met] of Object.entries(m)) {
    if (met.thresholds) for (const [e, r] of Object.entries(met.thresholds)) thr.push(`${r.ok ? '✅' : '❌'} \`${name}: ${e}\``)
  }
  const ok = thr.length > 0 && thr.every((t) => t.startsWith('✅'))
  const md = [
    `<!-- load-test-report:${testName} -->`,
    `## 🚀 Load test — ${testName}`,
    '',
    `**Result:** ${ok ? '✅ thresholds passed' : '❌ thresholds failed'}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Accepts (total) | ${n(v('http_reqs', 'count'))} |`,
    `| Throughput | ${n(v('http_reqs', 'rate'), 1)} req/s |`,
    `| Accept p95 | ${ms(v('http_req_duration', 'p(95)') ?? v('accept_latency_ms', 'p(95)'))} |`,
    `| Accept max | ${ms(v('http_req_duration', 'max'))} |`,
    `| Error rate | ${rate(v('ingress_errors', 'rate') ?? v('http_req_failed', 'rate'))} |`,
    '',
    ...(thr.length ? thr.map((t) => `- ${t}`) : ['- (no thresholds)']),
    '',
    `_Target: \`${target}\` · peak ${rps} req/s · email sunk to log adapter._`,
  ].join('\n')
  const stem = `summary-${testName}`
  return { [`${stem}.json`]: JSON.stringify(data, null, 2), [`${stem}.md`]: md, stdout: `\n${md}\n` }
}
