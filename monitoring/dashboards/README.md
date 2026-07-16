# Grafana Dashboards

## Available Dashboards

### Notification Logs Dashboard
**File:** `notification-logs.json`

A comprehensive dashboard for viewing and analyzing notification logs from Loki.

**Panels:**
1. **Recent Notification Logs** - Live stream of all logs from common-notify pods
2. **Log Volume Over Time** - Total log count per minute
3. **Logs by Level** - Breakdown by log level (debug, info, warn, error)
4. **Notifications by Status** - Track notifications by status (processing, success, failed)
5. **Notifications by Channel** - Split by delivery channel (email, sms)
6. **Error Logs** - Filtered view of error-level logs only
7. **Failed Notifications** - Filtered view of failed notification deliveries

**LogQL Queries Used:**
- Basic logs: `{namespace="f6bc3f-dev", app="common-notify"}`
- Error logs: `{namespace="f6bc3f-dev", app="common-notify"} | json | level="error"`
- Failed notifications: `{namespace="f6bc3f-dev", app="common-notify"} | json | status="failed"`
- Count over time: `sum(count_over_time({namespace="f6bc3f-dev", app="common-notify"} [1m]))`

## Importing Dashboards

### Via Grafana UI
1. Open Grafana: https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca
2. Go to **Dashboards** → **Import**
3. Upload `notification-logs.json`
4. Click **Import**

### Via kubectl + ConfigMap
```bash
# Create ConfigMap with dashboard
kubectl create configmap grafana-dashboard-notify-logs \
  --from-file=notification-logs.json \
  --namespace=f6bc3f-tools \
  -o yaml --dry-run=client | kubectl apply -f -

# Label it so Grafana picks it up
kubectl label configmap grafana-dashboard-notify-logs \
  grafana_dashboard=1 \
  --namespace=f6bc3f-tools
```

## Customizing for Test/Prod

To use these dashboards in test or prod environments, update the namespace filter:
- Dev: `namespace="f6bc3f-dev"`
- Test: `namespace="f6bc3f-test"`
- Prod: `namespace="f6bc3f-prod"`

You can also add environment as a dashboard variable to switch between environments dynamically.
