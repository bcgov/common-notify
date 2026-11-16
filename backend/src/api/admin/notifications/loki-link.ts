/** Grafana in f6bc3f-tools reads the Loki that every environment's backend ships to. */
export const GRAFANA_URL = 'https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca'

const BEFORE_MS = 5 * 60_000
const AFTER_MS = 15 * 60_000

/**
 * A Grafana Explore link to this environment's backend logs that mention the request id. Workers
 * prefix their lines with `[<request id>]`, so a line filter finds the whole send.
 *
 * @param namespace The pod's namespace (the chart sets NAMESPACE); without it, as when running
 *   locally, the logs aren't in Loki and there is no link
 */
export function lokiLogsUrl(
  requestId: string,
  from: Date,
  to: Date,
  namespace: string | undefined = process.env.NAMESPACE,
): string | null {
  if (!namespace) return null
  const left = {
    datasource: 'loki',
    queries: [
      {
        refId: 'A',
        expr: `{job="common-notify-backend",namespace="${namespace}"} |= "${requestId}"`,
      },
    ],
    range: {
      from: String(from.getTime() - BEFORE_MS),
      to: String(to.getTime() + AFTER_MS),
    },
  }
  return `${GRAFANA_URL}/explore?orgId=1&left=${encodeURIComponent(JSON.stringify(left))}`
}
