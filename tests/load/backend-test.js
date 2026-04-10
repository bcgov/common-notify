import { check } from 'k6'
import http from 'k6/http'
import { Rate } from 'k6/metrics'

export let errorRate = new Rate('errors')

function checkStatus(response, checkName, statusCode = 200) {
  let success = check(response, {
    [checkName]: (r) => {
      if (r.status === statusCode) {
        return true
      } else {
        console.error(checkName + ' failed. Incorrect response code.' + r.status)
        return false
      }
    },
  })
  errorRate.add(!success, { tag1: checkName })
}

export default function () {
  // Test the health endpoint (no auth required)
  let healthUrl = `${__ENV.BACKEND_URL}/health`
  let healthParams = {
    headers: {
      'Content-Type': 'application/json',
    },
  }
  let healthRes = http.get(healthUrl, healthParams)
  checkStatus(healthRes, 'health-check', 200)

  // Test the health endpoint with /api prefix (no auth required)
  let apiHealthUrl = `${__ENV.BACKEND_URL}/api/health`
  let apiHealthRes = http.get(apiHealthUrl, healthParams)
  checkStatus(apiHealthRes, 'api-health-check', 200)
}
