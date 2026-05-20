#!/usr/bin/env node

/**
 * Kong Routes Generator
 * Generates Kong routes from routes.yaml template using environment variables
 *
 * Usage: node generate-kong-routes.js /path/to/env/file /path/to/routes.yaml
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const yaml = require('js-yaml')
const dotenv = require('dotenv')

// Parse CLI arguments
const envFile = process.argv[2]
const routesTemplate = process.argv[3]
const kongAdminUrl = process.argv[4] || 'http://kong:8001'

if (!envFile || !routesTemplate) {
  console.error('Usage: node generate-kong-routes.js <env-file> <routes-template> [kong-admin-url]')
  process.exit(1)
}

// Load environment
console.log(`Loading environment from ${envFile}...`)
const env = dotenv.parse(fs.readFileSync(envFile, 'utf8'))

// Validate required variables
const requiredVars = [
  'GATEWAY_ID',
  'GATEWAY_SERVICE_NAME',
  'BACKEND_HOST',
  'ROUTE_PREFIX',
  'GATEWAY_HOSTNAME',
  'KEYCLOAK_ISSUER',
  'FRONTEND_KEYCLOAK_ISSUER',
  'ALLOWED_AUDIENCE',
  'FRONTEND_ALLOWED_AUDIENCE',
]

for (const varName of requiredVars) {
  if (!env[varName]) {
    console.error(`ERROR: Required variable ${varName} not set in ${envFile}`)
    process.exit(1)
  }
}

console.log(`Reading routes from ${routesTemplate}...`)
const routesYaml = fs.readFileSync(routesTemplate, 'utf8')

// Simple variable substitution
let routesContent = routesYaml
for (const [key, value] of Object.entries(env)) {
  routesContent = routesContent.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
}

let routesConfig
try {
  routesConfig = yaml.load(routesContent)
} catch (err) {
  console.error('ERROR: Failed to parse routes YAML:', err.message)
  process.exit(1)
}

// Utility to make HTTP requests to Kong Admin API
function kongRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, kongAdminUrl)
    const protocol = url.protocol === 'https:' ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    const req = protocol.request(options, (res) => {
      let responseBody = ''
      res.on('data', (chunk) => {
        responseBody += chunk
      })
      res.on('end', () => {
        try {
          const parsed = responseBody ? JSON.parse(responseBody) : {}
          resolve({ status: res.statusCode, data: parsed })
        } catch {
          resolve({ status: res.statusCode, data: responseBody })
        }
      })
    })

    req.on('error', reject)
    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

// Wait for Kong to be ready
async function waitForKong(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await kongRequest('GET', '/status')
      if (response.status === 200) {
        console.log('Kong is ready!')
        return true
      }
    } catch (err) {
      // Continue waiting
    }
    console.log(`Waiting for Kong... (${i + 1}/${maxAttempts})`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Kong failed to become ready')
}

// Create Kong service
async function createService(serviceName, backendHost) {
  console.log(`Creating service: ${serviceName}...`)
  try {
    const response = await kongRequest('POST', '/services', {
      name: serviceName,
      url: `http://${backendHost}`,
      protocol: 'http',
    })

    if (response.status === 201 || response.status === 409) {
      console.log(`  ✓ Service ${serviceName} ready`)
      return true
    }
    console.log(`  Warning: Service creation returned status ${response.status}`)
    return false
  } catch (err) {
    console.error(`  Error creating service: ${err.message}`)
    return false
  }
}

// Create Kong routes
async function createRoutes(serviceName, routes) {
  let created = 0
  let skipped = 0

  for (const route of routes) {
    const routeName = route.name || `route-${created}`
    try {
      const routeData = {
        name: routeName,
        paths: route.paths,
        methods: route.methods || [],
        strip_path: route.strip_path !== undefined ? route.strip_path : false,
        https_redirect_status_code: route.https_redirect_status_code || 426,
        path_handling: route.path_handling || 'v0',
        request_buffering: route.request_buffering !== undefined ? route.request_buffering : true,
        response_buffering:
          route.response_buffering !== undefined ? route.response_buffering : true,
      }

      const response = await kongRequest('POST', `/services/${serviceName}/routes`, routeData)

      if (response.status === 201) {
        console.log(`  ✓ ${routeName}`)
        created++
      } else if (response.status === 409) {
        console.log(`  ~ ${routeName} (already exists)`)
        skipped++
      } else {
        console.log(`  ✗ ${routeName} (status ${response.status})`)
      }
    } catch (err) {
      console.error(`  ✗ ${routeName} (error: ${err.message})`)
    }
  }

  return { created, skipped }
}

// Main execution
;(async () => {
  try {
    console.log(`\nConnecting to Kong Admin API at ${kongAdminUrl}...`)
    await waitForKong()

    // Create service
    const serviceName = env.GATEWAY_SERVICE_NAME
    const backendHost = env.BACKEND_HOST
    await createService(serviceName, backendHost)

    // Create routes
    console.log('\nCreating routes...')
    const routes = routesConfig.routes || []
    const { created, skipped } = await createRoutes(serviceName, routes)

    console.log(`\n✅ Routes generation complete!`)
    console.log(`   Created: ${created}, Skipped (existing): ${skipped}`)
    console.log(`   Total routes: ${routes.length}`)
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`)
    process.exit(1)
  }
})()
