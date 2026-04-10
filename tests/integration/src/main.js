import dotenv from 'dotenv'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

import pkg from 'lodash'

dotenv.config()

const { isEqual, omit } = pkg

const __filename = fileURLToPath(import.meta.url)

const __dirname = path.dirname(__filename)
const apiName = process.env.API_NAME
const BASE_URL = process.env.BASE_URL

// JWT Token fetching for protected endpoints
async function getJWTToken() {
  try {
    const keycloakUrl = process.env.E2E_TEST_KEYCLOAK_URL || 'https://dev.loginproxy.gov.bc.ca/auth'
    const clientId = process.env.E2E_TEST_CLIENT_ID
    const clientSecret = process.env.E2E_TEST_CLIENT_SECRET
    const realm = process.env.E2E_TEST_KEYCLOAK_REALM || 'apigw'

    if (!clientId || !clientSecret) {
      console.warn(
        'E2E_TEST_CLIENT_ID or E2E_TEST_CLIENT_SECRET not set, tests may fail for protected endpoints',
      )
      return null
    }

    const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )

    console.info('✓ JWT token obtained from Keycloak')
    return response.data.access_token
  } catch (error) {
    console.warn('Failed to obtain JWT token from Keycloak:', error.message)
    return null
  }
}

async function performEachMethod(BASE_URL, testCase, method, id, authToken) {
  let url = BASE_URL + testCase.path
  if (id && (method === 'GET' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    if (url.endsWith('/') === false) {
      url = url + '/' + id
    } else {
      url = url + id
    }
  }
  let payload
  if (method === 'POST') {
    payload = testCase.data?.post_payload
  } else if (method === 'PUT') {
    payload = testCase.data?.put_payload
  } else if (method === 'PATCH') {
    payload = testCase.data?.patch_payload
  }

  const headers = {
    ...testCase.headers,
  }

  // Add Authorization header if token is available
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await axios({
    method: method,
    url: url,
    headers: headers,
    data: payload,
  })
  console.info(`Response for ${method} ${url} : ${response.status}`)
  const methodAssertion = testCase.assertions.find((assertion) => assertion.method === method)
  const responseData = response.data?.data || response.data
  if (methodAssertion) {
    if (methodAssertion.status_code) {
      assert(response.status === methodAssertion.status_code)
    }
    if (methodAssertion.body) {
      assert(isEqual(omit(responseData, testCase.data.id_field), methodAssertion.body) === true)
    }
  }
  if (method === 'POST') {
    return responseData[testCase.data.id_field]
  }
}

async function performTesting(testSuitesDir, testSuiteFile, authToken) {
  console.info(`Running test suite for : ${testSuiteFile}`)
  const testSuitePath = path.join(testSuitesDir, testSuiteFile)
  const testSuite = JSON.parse(await fs.promises.readFile(testSuitePath, 'utf-8'))
  for (const testCase of testSuite.tests) {
    let id = null
    for (const method of testCase.methods) {
      const responseId = await performEachMethod(BASE_URL, testCase, method, id, authToken)
      if (responseId) {
        id = responseId
      }
    }
  }
}

const main = async () => {
  // Fetch JWT token for protected endpoints
  const authToken = await getJWTToken()

  const testSuitesDir = path.join(__dirname, 'test_suites')
  const testSuiteFiles = await fs.promises.readdir(testSuitesDir)
  const testFile = testSuiteFiles.find((file) => file.includes(apiName))
  await performTesting(testSuitesDir, testFile, authToken)
}

try {
  await main()
} catch (e) {
  if (e instanceof assert.AssertionError) {
    console.error(e)
    process.exit(137)
  }
  console.error(e)
  process.exit(137)
}
