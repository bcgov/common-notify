import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { readFileSync } from 'node:fs'

const tls = Boolean(process.env.MCP_TLS_CERT_FILE)
const request = (tls ? httpsGet : httpGet)(
  {
    hostname: '127.0.0.1',
    port: Number(process.env.PORT ?? 3101),
    path: '/health',
    timeout: 4000,
    ...(tls
      ? {
          servername: process.env.MCP_TLS_SERVER_NAME,
          ca: readFileSync(process.env.MCP_TLS_CA_FILE),
        }
      : {}),
  },
  (response) => {
    response.resume()
    process.exitCode = response.statusCode === 200 ? 0 : 1
  },
)
request.on('timeout', () => request.destroy(new Error('Healthcheck timed out')))
request.on('error', () => {
  process.exitCode = 1
})
