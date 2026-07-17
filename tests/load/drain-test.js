import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'

/**
 * Queue-drain producer.
 *
 * Fires a fixed BURST of notifysimple requests as fast as possible to pile jobs
 * onto the ingestion queue, then exits. This script only PRODUCES the burst and
 * confirms it was accepted (202); the actual DRAIN RATE and peak queue depth are
 * measured by the workflow's monitor step (oc + redis-cli against the Bull queues),
 * because the app exposes no queue-depth metric or API-key-readable status.
 *
 * This is the test that exposes INGESTION_WORKER_CONCURRENCY=1 as the drain
 * bottleneck. Email delivery is sunk to the log adapter so drain isn't gated on CHES.
 *
 * Env: BACKEND_URL, API_KEY, BURST_SIZE (default 1000), BURST_VUS (default 50).
 */
const BACKEND_URL = (__ENV.BACKEND_URL || '').replace(/\/$/, '')
const API_KEY = __ENV.API_KEY || ''
const TO = __ENV.TO || 'loadtest@example.com'
const BURST_SIZE = parseInt(__ENV.BURST_SIZE || '1000', 10)
const BURST_VUS = parseInt(__ENV.BURST_VUS || '50', 10)

export const errorRate = new Rate('ingress_errors')

const HEADERS = { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY }

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: BURST_VUS,
      iterations: BURST_SIZE,
      maxDuration: '10m',
    },
  },
  thresholds: {
    ingress_errors: ['rate<0.01'], // the burst itself should be accepted cleanly
  },
}

export function setup() {
  if (!BACKEND_URL) throw new Error('BACKEND_URL is required')
  if (!API_KEY) throw new Error('API_KEY is required')
  console.log(`setup: producing burst of ${BURST_SIZE} notifications with ${BURST_VUS} VUs`)
}

export default function () {
  const payload = JSON.stringify({
    email: {
      recipients: { to: [TO] },
      content: { subject: 'Drain burst', body: 'queue drain test', bodyType: 'text' },
    },
  })
  const res = http.post(`${BACKEND_URL}/v1/notifysimple`, payload, {
    headers: HEADERS,
    tags: { name: 'notifysimple-burst' },
  })
  const ok = check(res, { 'accepted (202)': (r) => r.status === 202 })
  errorRate.add(!ok)
  if (!ok) console.error(`burst send failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`)
}

export function handleSummary(data) {
  const m = data.metrics || {}
  const v = (a, b) => (m[a] && m[a].values && m[a].values[b] != null ? m[a].values[b] : undefined)
  const accepted = v('http_reqs', 'count')
  const enqueueRate = v('http_reqs', 'rate')
  const errRate = v('ingress_errors', 'rate')
  const md = [
    `<!-- load-test-report:drain-produce -->`,
    `## 🚀 Load test — queue-drain (burst produced)`,
    '',
    `Enqueued **${accepted ? Number(accepted).toFixed(0) : 'n/a'}** notifications at ` +
      `**${enqueueRate ? Number(enqueueRate).toFixed(1) : 'n/a'} req/s**, ` +
      `error rate ${errRate == null ? 'n/a' : (Number(errRate) * 100).toFixed(2) + '%'}.`,
    '',
    `_Drain rate + peak queue depth are reported by the workflow monitor step below._`,
  ].join('\n')
  return {
    'summary-drain-produce.json': JSON.stringify(data, null, 2),
    'summary-drain-produce.md': md,
    stdout: `\n${md}\n`,
  }
}
