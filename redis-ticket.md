# Redis chart values are not applied — prod runs a single 192Mi master with no failover

## Summary

`charts/redis/values.yml` nests every setting under a top-level `redis:` key, but the deploy
installs the upstream `bitnami/redis` chart directly (`.github/workflows/.deployer.yml`,
`helm upgrade --install … bitnami/redis --version 25.4.1 -f charts/redis/values.yml`). The
Bitnami chart has no `redis:` key, so **the whole file is ignored** and every environment runs
the chart defaults.

This means the Redis OOM fix from #202 (1Gi memory, `maxmemory 768mb`, `noeviction`) never
reached the pods, and the Sentinel failover the file describes does not exist.

> Found by rendering the chart locally. The live cluster has **not** been checked yet — see
> "Confirm first" below.

## Evidence

Rendered with `helm template` against `bitnami/redis` 25.4.1, using
`charts/redis/values.yml` + `charts/redis/values-prod.yml`:

| Setting                        | `values.yml` says | Actually rendered                        |
| ------------------------------ | ----------------- | ---------------------------------------- |
| Sentinel (automatic failover)  | enabled           | **disabled** — one master, no failover   |
| Replicas                       | 2                 | 3                                        |
| Memory limit (master/replica)  | 1Gi               | **192Mi** (Bitnami `nano` preset)        |
| `maxmemory 768mb` / `noeviction` | set             | **not set**                              |
| Persistence size               | 1Gi               | 8Gi                                      |
| Auth                           | disabled          | enabled (password in `common-notify-redis` secret) |

192Mi is the exact limit #202 identified as the cause of the 3-day dev OOM crash loop (master
300+ restarts, replicas 400+). The fix edited the ignored file, so the underlying problem is
still present in every environment.

`AGENTS.md` §5.1 documents `maxmemory 768mb` / `noeviction` as live; it is not.

## Impact

- **Every master restart stops queueing.** The backend connects only to
  `common-notify-redis-master`. With no Sentinel there is no failover, so queueing is down until
  that one pod is back. Replica restarts have no effect on the app.
- **The master is more likely to restart than it should be.** At 192Mi with the Bull queue
  loaded, it is the configuration that OOM-looped in dev.
- **No memory ceiling inside Redis.** Without `maxmemory`, Redis grows until the kernel
  OOM-kills it, rather than rejecting writes cleanly.

### What the app does during a Redis outage (for context)

- **New requests are still accepted.** The row is saved to Postgres as `PENDING`, the API
  returns 202, and the queue `add` runs afterwards in the background. Bull's clients use
  `maxRetriesPerRequest: null` with the offline queue enabled, so the `add` waits in memory and
  completes on reconnect. If the pod dies first, the row stays `PENDING` and the retry sweep
  queues it later. Delivery is delayed, not lost.
- **No delivery happens** during the outage — workers cannot fetch jobs.
- **Each backend pod buffers pending `add`s in memory**, so a long outage grows every pod's
  heap (the JS-heap OOM that took the dev backend down in #202).
- **Status updates published during the outage are dropped** after ioredis's retries (~10s).
  Live status updates and the webhooks triggered by them do not fire for those changes.
- **Up to ~1s of queued jobs can be lost on a master crash** (AOF `everysec`). Those rows are
  already `QUEUED` in Postgres, and the sweep only picks up `PENDING`, so they are **never
  sent**. Tracked as a follow-up below.

## Do not simply remove the `redis:` nesting

Rendering the *intended* config (nesting removed, Sentinel on) produces services
`common-notify-redis` and `common-notify-redis-headless` — **no `-master` service**.
`common-notify-redis` spreads connections across every node, including read-only replicas.

The backend's `REDIS_HOST` is `common-notify-redis-master`
(`charts/app/templates/backend/templates/deployment.yaml`, `.deployer.yml`), and none of the
Redis clients are Sentinel-aware. Un-nesting as-is would take queueing down in every
environment.

## Proposed fix

**Option 1 — apply the intended settings, keep a single master (recommended for this ticket).**

- Remove the `redis:` wrapper from `values.yml`, `values-prod.yml` and `values-dev.yml`.
- Set `sentinel.enabled: false` everywhere, so the `-master` service and the app's connection
  settings stay the same.
- Keep the 1Gi limit, `maxmemory 768mb` and `maxmemory-policy noeviction` from #202.
- Decide explicitly on auth. The file says disabled, but the running release has it enabled and
  the backend reads the password from the `common-notify-redis` secret. Keep it enabled unless
  there is a reason not to.
- Check the rendered persistence size. Going from 8Gi to 1Gi on an existing StatefulSet PVC
  will not shrink it and may fail the upgrade.
- Check image registries. The file points Sentinel/exporter at
  `artifacts.developer.gov.bc.ca/docker-remote`, which the chart rejects unless
  `global.security.allowInsecureImages: true`.

**Option 2 — real failover (separate ticket).**

Enable Sentinel and make the backend Sentinel-aware: ioredis `sentinels` + master name for the
Bull queues, `createRedisClient`, `NotificationPubSubService`, `WebhookTriggerService` and
`CstarCacheStore`. Alternatively, use the chart's `sentinel.masterService.enabled` so a stable
master service still exists. Larger change; needs testing in TEST before prod.

## Confirm first

Before starting, confirm the live release matches the render (someone may have deployed by hand):

```bash
helm get values common-notify-redis -n f6bc3f-prod
oc get pods,svc -l app.kubernetes.io/name=redis -n f6bc3f-prod
oc get statefulset common-notify-redis-master -n f6bc3f-prod \
  -o jsonpath='{.spec.template.spec.containers[0].resources}'
```

Repeat for `f6bc3f-test` and `f6bc3f-dev`.

## Acceptance criteria

- [ ] `helm template` of the Redis chart with the repo values renders the intended memory
      limits, `maxmemory 768mb` and `maxmemory-policy noeviction`.
- [ ] The `common-notify-redis-master` service still exists in every environment.
- [ ] After deploy, `redis-cli CONFIG GET maxmemory` on the master returns `805306368`.
- [ ] Backend queueing works end to end in TEST after the Redis upgrade (send an email and an
      SMS; both reach `COMPLETED`).
- [ ] Deleting the master pod in TEST: requests are still accepted, and queued notifications
      are delivered once the pod is back.
- [ ] `AGENTS.md` §5.1 matches what is deployed.

## Follow-ups (separate tickets)

1. **Real failover** — Option 2 above.
2. **Notifications stuck in `QUEUED` after Redis data loss** — the sweep only retries
   `PENDING`. Something needs to re-queue `QUEUED` rows whose job no longer exists in Redis
   (e.g. `QUEUED` older than N minutes with no matching Bull job).
3. **Job-management endpoints during an outage** — cancelling or rescheduling a scheduled send
   (`notify.controller.ts`, around line 502) waits on Redis directly. Not yet traced; likely
   hangs or fails while Redis is down.
