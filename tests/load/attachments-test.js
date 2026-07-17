import http from 'k6/http'
import { check } from 'k6'
import encoding from 'k6/encoding'
import { Rate, Trend } from 'k6/metrics'

/**
 * Attachment + ClamAV load test.
 *
 * Sends notifysimple requests each carrying an inline base64 attachment (there is
 * no upload endpoint — attachments are inline on the request body). This stresses:
 * larger request bodies -> S3/MinIO store -> ClamAV scan on the ingestion worker.
 *
 * NOTE: most of the attachment cost is DOWNSTREAM (store + scan happen on the
 * worker), so the 202 accept latency here reflects mainly payload handling; the
 * scan/store impact shows up in the queue-drain test. Requires CLAMAV_ENABLED in
 * the target env for the scan to actually run.
 *
 * Env: BACKEND_URL, API_KEY, TARGET_RPS (default 25 — heavier payloads),
 *      RAMP_SECONDS (60), ATTACH_KB (attachment size in KB, default 50).
 */
const BACKEND_URL = (__ENV.BACKEND_URL || '').replace(/\/$/, '')
const API_KEY = __ENV.API_KEY || ''
const TO = __ENV.TO || 'loadtest@example.com'
const TARGET_RPS = parseInt(__ENV.TARGET_RPS || '25', 10)
const RAMP_SECONDS = parseInt(__ENV.RAMP_SECONDS || '60', 10)
const ATTACH_KB = parseInt(__ENV.ATTACH_KB || '50', 10)

export const errorRate = new Rate('ingress_errors')
export const acceptLatency = new Trend('accept_latency_ms', true)

// Build the base64 attachment once (module scope) so it's not recomputed per request.
const RAW = 'load-test-attachment-bytes-'.repeat(Math.ceil((ATTACH_KB * 1024) / 26))
const ATTACHMENT_B64 = encoding.b64encode(RAW.slice(0, ATTACH_KB * 1024))
const HEADERS = { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY }

export const options = {
  scenarios: {
    attachment_ramp: {
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
    accept_latency_ms: ['p(95)<2000'], // larger bodies
  },
}

export function setup() {
  if (!BACKEND_URL) throw new Error('BACKEND_URL is required')
  if (!API_KEY) throw new Error('API_KEY is required')
  console.log(`setup: attachment size ~${ATTACH_KB}KB (base64 ${Math.round(ATTACHMENT_B64.length / 1024)}KB)`)
}

export default function () {
  const payload = JSON.stringify({
    email: {
      recipients: { to: [TO] },
      content: { subject: 'Load test with attachment', body: 'See attached.', bodyType: 'text' },
      attachments: [
        { filename: 'loadtest.txt', mimeType: 'text/plain', content: ATTACHMENT_B64 },
      ],
    },
  })
  const res = http.post(`${BACKEND_URL}/v1/notifysimple`, payload, {
    headers: HEADERS,
    tags: { name: 'notifysimple-attachment' },
  })
  acceptLatency.add(res.timings.duration)
  const ok = check(res, { 'accepted (202)': (r) => r.status === 202 })
  errorRate.add(!ok)
  if (!ok) console.error(`attachment send failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`)
}

export function handleSummary(data) {
  return summarize(data, 'attachment', BACKEND_URL, TARGET_RPS)
}

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
    `## 🚀 Load test — ${testName} (~${ATTACH_KB}KB attachment)`,
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
    `_Target: \`${target}\` · peak ${rps} req/s · ClamAV scan + S3 store happen downstream (see drain test)._`,
  ].join('\n')
  const stem = `summary-${testName}`
  return { [`${stem}.json`]: JSON.stringify(data, null, 2), [`${stem}.md`]: md, stdout: `\n${md}\n` }
}
