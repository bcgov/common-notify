# Common Notify - Monitoring & Logging Solution

Complete monitoring and logging solution for Common Notify using the Grafana Stack (Loki + Grafana + Mimir).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  f6bc3f-dev (Application Namespace)                         │
│  ┌─────────────────┐      ┌──────────────────────┐         │
│  │  Common Notify  │      │   Grafana Agent      │         │
│  │  Pods           │──────│   (DaemonSet)        │         │
│  │  (JSON logs)    │      │   Scrapes pod logs   │         │
│  └─────────────────┘      └──────────┬───────────┘         │
└────────────────────────────────────────┼────────────────────┘
                                         │
                                         │ Forward logs
                                         ▼
┌─────────────────────────────────────────────────────────────┐
│  f6bc3f-tools (Monitoring Namespace)                        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │    Loki      │   │   Grafana    │   │    Mimir     │   │
│  │ Log Storage  │◄──│ Visualization│   │   Metrics    │   │
│  │  (7 days)    │   │  & Queries   │   │  (optional)  │   │
│  └──────────────┘   └──────────────┘   └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Loki (Log Aggregation)
- **Purpose:** Store and index application logs
- **Retention:** 7 days
- **Storage:** 3Gi (netapp-file-standard)
- **Resources:** 512Mi memory, 500m CPU

### 2. Grafana (Visualization)
- **Purpose:** Query logs and display dashboards
- **Storage:** 2Gi for dashboards
- **Resources:** 256Mi memory, 300m CPU
- **URL:** https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca

### 3. Mimir (Metrics - Optional)
- **Purpose:** Store application metrics
- **Retention:** 7 days
- **Storage:** 2Gi
- **Resources:** 512Mi memory, 300m CPU

### 4. Grafana Agent (Log Collection)
- **Purpose:** Collect logs from application pods
- **Deployment:** DaemonSet (runs on each node)
- **Resources:** 128Mi memory, 200m CPU per pod

## Quick Start

### 1. Deploy Entire Stack
```bash
cd monitoring
./deploy-all.sh
```

This will deploy all components in order:
1. Loki (f6bc3f-tools)
2. Grafana (f6bc3f-tools)
3. Mimir (f6bc3f-tools)
4. Grafana Agent (f6bc3f-dev)

### 2. Access Grafana Web Interface

Run the access helper script:
```bash
./access-grafana.sh
```

This will display the Grafana URL, username, and password.

**Or access manually:**

**🌐 URL:** https://grafana-f6bc3f-tools.apps.silver.devops.gov.bc.ca

**Username:** admin

**Password:** (Get with this command)
```bash
kubectl get secret --namespace f6bc3f-tools grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

> **Note:** The URL is automatically created by OpenShift Route when Grafana is deployed. No additional gateway configuration needed!

### 3. Import Dashboard

Once logged into Grafana:
1. Click **Dashboards** → **Import**
2. Upload `monitoring/dashboards/notification-logs.json`
3. Click **Import**
4. View your logs!

## Structured Logging

The application uses structured JSON logging via `StructuredLoggerService`.

### Log Format
```json
{
  "timestamp": "2026-06-15T12:34:56.789Z",
  "level": "info",
  "message": "Notification delivered successfully",
  "context": "EmailDeliveryWorker",
  "notificationId": "abc123",
  "tenantId": "tenant-1",
  "channel": "email",
  "status": "success",
  "gcNotifyId": "gc-xyz",
  "duration": 1234
}
```

### Key Fields
- `notificationId` - Unique notification identifier
- `tenantId` - Tenant identifier
- `channel` - Delivery channel (email, sms)
- `status` - Notification status (pending, processing, success, failed)
- `gcNotifyId` - GC Notify external ID
- `duration` - Processing time in milliseconds
- `error` - Error details (when applicable)

### Usage in Code

```typescript
import { StructuredLoggerService } from './common/logger'

export class MyWorker {
  private readonly logger = new StructuredLoggerService('MyWorker')

  async process(notificationId: string, tenantId: string) {
    // Log notification start
    this.logger.logNotificationStart(notificationId, tenantId, 'email')

    try {
      // ... process notification ...

      // Log success
      this.logger.logNotificationSuccess(
        notificationId,
        tenantId,
        'email',
        'gc-notify-id',
        1234, // duration in ms
      )
    } catch (error) {
      // Log failure
      this.logger.logNotificationFailure(
        notificationId,
        tenantId,
        'email',
        error,
      )
    }
  }
}
```

## Querying Logs

### LogQL Examples

**All logs from Common Notify:**
```logql
{namespace="f6bc3f-dev", app="common-notify"}
```

**Error logs only:**
```logql
{namespace="f6bc3f-dev", app="common-notify"} | json | level="error"
```

**Failed notifications:**
```logql
{namespace="f6bc3f-dev", app="common-notify"} | json | status="failed"
```

**Specific notification by ID:**
```logql
{namespace="f6bc3f-dev", app="common-notify"} | json | notificationId="abc123"
```

**Email deliveries only:**
```logql
{namespace="f6bc3f-dev", app="common-notify"} | json | channel="email"
```

**Log count per minute:**
```logql
sum(count_over_time({namespace="f6bc3f-dev", app="common-notify"} [1m]))
```

**Notifications by status:**
```logql
sum by (status) (count_over_time({namespace="f6bc3f-dev", app="common-notify"} | json | status != "" [1m]))
```

## Manual Deployment

### Deploy Individual Components

**Loki:**
```bash
cd grafana-stack/loki
./deploy.sh
```

**Grafana:**
```bash
cd grafana-stack/grafana
./deploy.sh
```

**Mimir:**
```bash
cd grafana-stack/mimir
./deploy.sh
```

**Grafana Agent:**
```bash
cd grafana-stack/grafana-agent
./deploy.sh
```

## Verification

### Check Pod Status
```bash
# Tools namespace (Loki, Grafana, Mimir)
kubectl get pods -n f6bc3f-tools

# Dev namespace (Grafana Agent)
kubectl get pods -n f6bc3f-dev -l app=grafana-agent

# Application pods (should have label app=common-notify)
kubectl get pods -n f6bc3f-dev -l app=common-notify
```

### View Component Logs
```bash
# Loki logs
kubectl logs -n f6bc3f-tools -l app.kubernetes.io/name=loki -f

# Grafana logs
kubectl logs -n f6bc3f-tools -l app.kubernetes.io/name=grafana -f

# Grafana Agent logs
kubectl logs -n f6bc3f-dev -l app=grafana-agent -f
```

### Test Log Collection

1. Generate a test log from your application
2. Wait 30 seconds for collection
3. In Grafana Explore, query:
```logql
{namespace="f6bc3f-dev", app="common-notify"} |= "test"
```

## Resource Usage Summary

| Component | Namespace | Pods | CPU Request | CPU Limit | Memory Request | Memory Limit | Storage |
|-----------|-----------|------|-------------|-----------|----------------|--------------|---------|
| Loki | tools | 1 | 200m | 500m | 256Mi | 512Mi | 3Gi |
| Grafana | tools | 1 | 100m | 300m | 128Mi | 256Mi | 2Gi |
| Mimir | tools | 1 | 100m | 300m | 256Mi | 512Mi | 2Gi |
| Agent | dev | 3* | 300m | 600m | 192Mi | 384Mi | - |
| **Total** | | | **700m** | **1700m** | **832Mi** | **1664Mi** | **7Gi** |

*Assuming 3 nodes in dev cluster

## Troubleshooting

### Grafana Agent not collecting logs

1. Check agent pods are running:
```bash
kubectl get pods -n f6bc3f-dev -l app=grafana-agent
```

2. Check agent logs for errors:
```bash
kubectl logs -n f6bc3f-dev -l app=grafana-agent -f
```

3. Verify app pods have correct label:
```bash
kubectl get pods -n f6bc3f-dev -l app=common-notify
```

### No logs appearing in Grafana

1. Check Loki is running:
```bash
kubectl get pods -n f6bc3f-tools -l app.kubernetes.io/name=loki
```

2. Test Loki API directly:
```bash
kubectl port-forward -n f6bc3f-tools svc/loki 3100:3100
curl http://localhost:3100/ready
```

3. Check Grafana datasource configuration:
   - In Grafana, go to **Configuration** → **Data sources**
   - Select **Loki**
   - Click **Test** button

### Application not logging in JSON format

1. Verify `LoggerModule` is imported in `app.module.ts`
2. Check `NODE_ENV` or `KUBERNETES_SERVICE_HOST` environment variables
3. View application logs to confirm JSON format:
```bash
kubectl logs -n f6bc3f-dev -l app=common-notify --tail=10
```

## Cleanup

### Remove entire monitoring stack:
```bash
# Remove Grafana Agent
kubectl delete -f grafana-stack/grafana-agent/daemonset.yaml
kubectl delete -f grafana-stack/grafana-agent/rbac.yaml
kubectl delete -f grafana-stack/grafana-agent/configmap.yaml

# Remove Helm releases
helm uninstall loki -n f6bc3f-tools
helm uninstall grafana -n f6bc3f-tools
helm uninstall mimir -n f6bc3f-tools

# Remove PVCs (optional - deletes stored data)
kubectl delete pvc -n f6bc3f-tools -l app.kubernetes.io/name=loki
kubectl delete pvc -n f6bc3f-tools -l app.kubernetes.io/name=grafana
kubectl delete pvc -n f6bc3f-tools -l app.kubernetes.io/name=mimir
```

## References

- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Grafana Agent Documentation](https://grafana.com/docs/agent/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/logql/)
