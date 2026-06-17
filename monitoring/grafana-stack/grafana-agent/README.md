# Grafana Agent Configuration

Grafana Agent runs as a DaemonSet in each environment (dev, test, prod) and collects logs from application pods, forwarding them to Loki.

## Configuration

The agent is configured to:
- Scrape logs from all pods with label `app=common-notify`
- Parse JSON structured logs
- Extract fields: timestamp, level, message, context, notificationId, tenantId, channel, status, error, duration
- Add Kubernetes metadata: namespace, pod, container, app, component, env
- Forward to Loki in f6bc3f-tools namespace

## Deployment

### Dev Environment
```bash
cd monitoring/grafana-stack/grafana-agent
./deploy.sh
```

### Test/Prod Environments
Edit the namespace in the YAML files:
- `configmap.yaml`: Update namespace and Loki tenant_id
- `rbac.yaml`: Update namespace
- `daemonset.yaml`: Update namespace

Then apply:
```bash
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
kubectl apply -f daemonset.yaml
```

## Verification

Check agent pods are running:
```bash
kubectl get pods -n f6bc3f-dev -l app=grafana-agent
```

View agent logs:
```bash
kubectl logs -n f6bc3f-dev -l app=grafana-agent -f
```

## Resource Usage

Each agent pod uses:
- CPU: 100m request, 200m limit
- Memory: 64Mi request, 128Mi limit

With 3 nodes in dev, total usage: ~300m CPU, ~384Mi memory
