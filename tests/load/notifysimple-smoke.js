import http from 'k6/http'
import { check } from 'k6'

/**
 * Smoke test for the notification ingress path.
 *
 * Goal: prove ONE authenticated `POST /api/v1/notifysimple` is accepted (202)
 * before we ramp anything. This validates the k6 harness, the API key, the
 * payload shape, gateway routing, and connectivity end-to-end.
 *
 * This sends exactly one request → one notification enqueued → (at most) one
 * real downstream send. Harmless. We settle the CHES-vs-sink question before
 * ramping to volume.
 *
 * Run:
 *   k6 run tests/load/notifysimple-smoke.js
 *
 * Override defaults via env:
 *   k6 run -e GATEWAY_URL=https://gw-fe8c5-notify-pr-147.dev.api.gov.bc.ca \
 *          -e API_KEY=GgFdwGOg1JR4Cfbz5nCMbrXOlkaFj1vE \
 *          -e TO=loadtest@example.com \
 *          tests/load/notifysimple-smoke.js
 */

// One request, one time. No ramp.
export const options = {
  vus: 1,
  iterations: 1,
}

const GATEWAY_URL =
  __ENV.GATEWAY_URL || 'https://gw-fe8c5-notify-pr-147.dev.api.gov.bc.ca'
const API_KEY = __ENV.API_KEY || 'GgFdwGOg1JR4Cfbz5nCMbrXOlkaFj1vE'
const TO = __ENV.TO || 'loadtest@example.com'

export default function () {
  const url = `${GATEWAY_URL}/api/v1/notifysimple`

  const payload = JSON.stringify({
    email: {
      recipients: { to: [TO] },
      content: {
        subject: 'Notify load-test smoke',
        body: 'Single smoke request from k6 — verifying ingress accept path.',
        bodyType: 'text',
      },
    },
  })

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
    },
  }

  const res = http.post(url, payload, params)

  // Print everything so a failing smoke run is self-diagnosing.
  console.log(`POST ${url}`)
  console.log(`status: ${res.status}`)
  console.log(`body:   ${res.body}`)

  check(res, {
    'status is 202 (accepted + enqueued)': (r) => r.status === 202,
    'response has a body': (r) => !!r.body && r.body.length > 0,
  })
}
