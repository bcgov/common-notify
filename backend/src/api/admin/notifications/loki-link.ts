/** Grafana in f6bc3f-tools reads the Loki that every environment's backend ships to. */
export const GRAFANA_URL = 'https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca'

/** Provisioned in monitoring/grafana-stack/grafana/values-tools-sso.yaml. */
const LOKI_DATASOURCE_UID = 'loki'

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
  // Grafana 10+ reads Explore state from `panes`, keyed by an arbitrary pane id; the older
  // `left` param is no longer honoured and lands on the home page instead.
  const datasource = { type: 'loki', uid: LOKI_DATASOURCE_UID }
  const panes = {
    logs: {
      datasource: LOKI_DATASOURCE_UID,
      queries: [
        {
          refId: 'A',
          datasource,
          expr: `{job="common-notify-backend",namespace="${namespace}"} |= "${requestId}"`,
        },
      ],
      range: {
        from: String(from.getTime() - BEFORE_MS),
        to: String(to.getTime() + AFTER_MS),
      },
    },
  }
  return `${GRAFANA_URL}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`
}
