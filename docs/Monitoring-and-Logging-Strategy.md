# Monitoring and Logging Strategy for common-notify

> **Last Updated:** May 4, 2026
> **Status:** Proposed
> **Decision:** Deploy Grafana Stack (Primary) + Sysdig (Secondary)

## Table of Contents

- [Executive Summary](#executive-summary)
- [Context: Why Monitoring Matters for Notification Apps](#context-why-monitoring-matters-for-notification-apps)
- [Available Tools Analysis](#available-tools-analysis)
  - [Option 1: Sysdig Monitor](#option-1-sysdig-monitor)
  - [Option 2: Grafana Stack (Loki + Grafana + Mimir)](#option-2-grafana-stack-loki--grafana--mimir)
  - [Option 3: OpenShift Built-in Logging](#option-3-openshift-built-in-logging)
- [Detailed Comparison](#detailed-comparison)
- [Recommendation](#recommendation)
- [Implementation Plan](#implementation-plan)
- [Expected Outcomes](#expected-outcomes)
- [References](#references)

---

## Executive Summary

### The Challenge
As a **notification delivery application**, common-notify requires:
- Ability to track individual notification delivery status
- Debug failed notifications with detailed context
- Provide audit trails per tenant
- Monitor integration with GC Notify API
- Answer customer support questions like "Did my notification get delivered?"

### The Recommendation

**✅ Deploy BOTH: Grafana Stack (Primary) + Sysdig (Secondary)**

| Tool | Purpose | Priority |
|------|---------|----------|
| **Grafana Stack** (Loki + Grafana + Mimir) | Application logs, notification tracking, debugging | 🔴 **CRITICAL** |
| **Sysdig Monitor** | Infrastructure metrics, pod health, resource usage | 🟡 **IMPORTANT** |

**Why both?**
- **Grafana Stack:** Essential for application-level log querying (notification status, failures, audit)
- **Sysdig:** Excellent for infrastructure monitoring (CPU, memory, pod crashes)
- They complement each other, not compete

**Total Cost:** $0 (both are free/included in BC Gov OpenShift platform)

---

## Context: Why Monitoring Matters for Notification Apps

### Critical Questions We Must Answer

As a notification delivery service, we need to answer these questions **quickly and accurately**:

#### Customer Support Scenarios:
1. ❓ "Did notification #12345 get delivered to user@example.com?"
2. ❓ "Why didn't John Smith receive his SMS notification?"
3. ❓ "Show me all notifications sent to tenant ABC in the last 24 hours"
4. ❓ "What was the delivery time for this email notification?"

#### Operational Scenarios:
5. ❓ "Why are SMS notifications failing right now?"
6. ❓ "Is the GC Notify API having issues?"
7. ❓ "How many notifications are stuck in the retry queue?"
8. ❓ "What's our notification success rate by channel (email, SMS, app)?"

#### Compliance & Audit:
9. ❓ "Prove that notification was delivered (SLA compliance)"
10. ❓ "Show audit trail of all notifications for tenant XYZ"

### The Problem
**Standard infrastructure monitoring tools (like Sysdig alone) CANNOT answer these questions.**

They show:
- ✅ "Is the pod running?"
- ✅ "What's the CPU usage?"
- ❌ "Did notification X get delivered?" → **Cannot answer**
- ❌ "Why did notification Y fail?" → **Cannot answer**

---

## Available Tools Analysis

### Option 1: Sysdig Monitor

#### What is Sysdig?
Sysdig Monitor is BC Government's **official infrastructure monitoring tool** for OpenShift applications.

#### What It's Good At

**✅ Infrastructure Monitoring:**
- Pod CPU, memory, disk usage
- Pod restart events and crash loops
- Container health and lifecycle
- Network traffic and connections
- Database connection pools
- HTTP request metrics (rate, latency, errors)

**✅ Alerting:**
- Alert when pods restart repeatedly
- Alert when CPU/memory exceeds thresholds
- Alert when pods crash
- Alert on infrastructure anomalies

**✅ Operational Dashboards:**
- System-level performance metrics
- Resource usage trends
- Infrastructure health at a glance

#### What It's NOT Good At

**❌ Application Log Querying:**
- Cannot search logs for specific notification IDs
- Cannot filter by tenant, channel, or status
- Limited log parsing capabilities
- Not designed for application-level troubleshooting

**❌ Notification Tracking:**
- Cannot track individual notification delivery
- Cannot show notification flow/lifecycle
- Cannot correlate notification failures with errors

**❌ Audit Trails:**
- Not suitable for compliance/audit logging
- Cannot provide detailed notification history per tenant

#### BC Gov Support

| Aspect | Details |
|--------|---------|
| **Official Support** | ✅ Yes - Managed by Platform Services |
| **Cost** | ✅ Free (included with Silver/Gold tier) |
| **Documentation** | https://digital.gov.bc.ca/cloud/services/private/products-tools/sysdig/ |
| **Onboarding** | https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/docs/app-monitoring/sysdig-monitor-onboarding/ |
| **Support Channel** | Rocket.Chat: `#devops-sysdig` |
| **Setup Time** | ~30 minutes (already available) |
| **Maintenance** | Managed by platform (zero effort) |

#### Verdict for common-notify

**🟡 Important but Insufficient**

- ✅ Use it for infrastructure monitoring
- ❌ Don't rely on it alone for notification tracking
- ✅ Complements Grafana Stack

---

### Option 2: Grafana Stack (Loki + Grafana + Mimir)

#### What is the Grafana Stack?

A suite of **open-source tools for observability**:

| Component | Purpose |
|-----------|---------|
| **Grafana Loki** | Log aggregation and storage (like Elasticsearch but simpler) |
| **Grafana** | Visualization, dashboards, and alerting |
| **Grafana Mimir** | Metrics storage (optional but recommended) |
| **Grafana Agent** | Collects logs and metrics from pods |

#### What It's Good At

**✅ Powerful Log Querying (LogQL):**

```logql
# Find specific notification by ID
{app="common-notify"} | json | notificationId="notif_12345"

# Show all failed SMS in last hour
{app="common-notify", channel="sms"} | json | status="failed"

# All notifications for tenant ABC
{app="common-notify"} | json | tenantId="tenant_abc"

# Find why GC Notify failed
{app="common-notify"} |= "GC Notify error" | json
```

**✅ Notification Tracking:**
- Track complete notification lifecycle (created → queued → sent → delivered/failed)
- See delivery times, retry attempts, error messages
- Filter by tenant, channel, recipient, status

**✅ Log Correlation:**
- Correlate logs with metrics in single dashboard
- Link log errors to infrastructure events
- Trace requests across services

**✅ Advanced Visualization:**
- Custom dashboards for notification analytics
- Real-time notification flow visualization
- Success rate trends by channel/tenant

**✅ Audit & Compliance:**
- Complete audit trail per notification
- Searchable history for compliance
- Export logs for reporting

#### What It's NOT Good At

**❌ Infrastructure Metrics (Without Mimir):**
- Loki alone doesn't collect pod CPU/memory
- Need Mimir for full metrics (but that's included in stack)

**❌ Out-of-the-Box:**
- Requires deployment and configuration
- Not managed by platform services
- Team maintains it

#### BC Gov Support

| Aspect | Details |
|--------|---------|
| **Official Support** | ⚠️ No - Teams deploy/manage themselves |
| **Cost** | ✅ Free (open source) |
| **Infrastructure** | Uses existing OpenShift resources |
| **Example Implementations** | bcgov teams are using it: https://github.com/bcgov/DITP-DevOps/issues/117 |
| **Community Support** | Grafana community + bcgov teams on Rocket.Chat |
| **Setup Time** | 2-3 days initial deployment |
| **Maintenance** | ~2 hours/month for updates |

#### Technical Architecture

```
┌─────────────────────────────────────────────────┐
│           f6bc3f-tools Namespace                │
├─────────────────────────────────────────────────┤
│  📊 Grafana         (Dashboards & Queries)      │
│  📝 Loki            (Log Storage)               │
│  📈 Mimir           (Metrics Storage)           │
└─────────────────────────────────────────────────┘
         ↑                    ↑                ↑
         │                    │                │
         Logs                 │                Metrics
         │                    │                │
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│  f6bc3f-dev    │   │  f6bc3f-test   │   │  f6bc3f-prod   │
├────────────────┤   ├────────────────┤   ├────────────────┤
│ Grafana Agent  │   │ Grafana Agent  │   │ Grafana Agent  │
│ (Collector)    │   │ (Collector)    │   │ (Collector)    │
│       ↑        │   │       ↑        │   │       ↑        │
│ App Pods       │   │ App Pods       │   │ App Pods       │
└────────────────┘   └────────────────┘   └────────────────┘
```

#### Verdict for common-notify

**🔴 CRITICAL - Must Have**

- ✅ Essential for notification tracking
- ✅ Enables powerful log search for troubleshooting
- ✅ Provides audit trails
- ✅ Worth the 2-3 day setup investment

---

### Option 3: OpenShift Built-in Logging

#### What is it?
OpenShift provides basic log viewing through the console.

#### Capabilities
- ✅ View pod logs in browser
- ✅ Basic search (grep-like)
- ✅ Stream logs in real-time
- ✅ Download logs

#### Limitations
- ❌ Cannot query across multiple pods
- ❌ Limited search (no complex queries)
- ❌ No log aggregation
- ❌ No retention (logs disappear when pods restart)
- ❌ No dashboards or visualization
- ❌ Cannot correlate with metrics

#### Verdict for common-notify

**❌ Insufficient - Don't Rely On It**

- Use only for quick debugging during development
- Not suitable for production troubleshooting
- Not suitable for audit/compliance

---

## Detailed Comparison

### Feature Matrix

| Feature | Sysdig | Grafana Stack | OpenShift Logs |
|---------|--------|---------------|----------------|
| **Infrastructure Metrics** | ✅ Excellent | ✅ Good (with Mimir) | ❌ None |
| **Application Log Search** | ❌ Limited | ✅ Excellent | 🟡 Basic |
| **Query Language** | Limited | ✅ LogQL (powerful) | 🟡 grep-like |
| **Notification Tracking** | ❌ No | ✅ Yes | ❌ No |
| **Audit Trails** | ❌ No | ✅ Yes | ❌ No |
| **Custom Dashboards** | ✅ Yes | ✅ Excellent | ❌ No |
| **Alerting** | ✅ Excellent | ✅ Excellent | ❌ No |
| **BC Gov Support** | ✅ Official | ⚠️ Community | ✅ Built-in |
| **Setup Time** | ⚡ 30 min | 🕐 2-3 days | ⚡ Instant |
| **Maintenance** | ✅ Zero (managed) | 🟡 ~2h/month | ✅ Zero |
| **Cost** | ✅ Free | ✅ Free | ✅ Free |
| **Log Retention** | 🟡 Limited | ✅ Configurable | ❌ None (pod lifetime) |
| **Multi-pod Search** | 🟡 Limited | ✅ Yes | ❌ No |
| **JSON Log Parsing** | 🟡 Limited | ✅ Excellent | ❌ No |
| **Learning Curve** | 🟢 Easy | 🟡 Moderate | 🟢 Easy |

### Use Case Suitability

| Use Case | Sysdig | Grafana Stack | OpenShift Logs |
|----------|--------|---------------|----------------|
| "Is my pod healthy?" | ✅ Perfect | 🟡 OK | 🟡 OK |
| "What's my CPU usage?" | ✅ Perfect | ✅ Good | ❌ No |
| "Did notification X get delivered?" | ❌ Cannot answer | ✅ Perfect | ❌ Cannot answer |
| "Why did SMS fail?" | ❌ Cannot answer | ✅ Perfect | 🟡 Maybe (if you find the right pod) |
| "Show all failures in last hour" | ❌ Cannot answer | ✅ Perfect | ❌ Cannot answer |
| "Audit trail for tenant ABC" | ❌ Cannot answer | ✅ Perfect | ❌ Cannot answer |
| "Is GC Notify API down?" | ✅ Good | ✅ Perfect | 🟡 Maybe |
| "Alert on pod crashes" | ✅ Perfect | 🟡 OK | ❌ No |

---

## Recommendation

### Decision: Deploy BOTH Tools

**✅ Grafana Stack (Loki + Grafana + Mimir)** - PRIMARY
- **Purpose:** Application log querying, notification tracking, audit trails
- **Priority:** 🔴 CRITICAL
- **Setup:** 2-3 days
- **When:** Deploy in Sprint 1

**✅ Sysdig Monitor** - SECONDARY
- **Purpose:** Infrastructure monitoring, pod health, resource usage
- **Priority:** 🟡 IMPORTANT
- **Setup:** 30 minutes
- **When:** Can be done in parallel or Sprint 2

### Why Both?

They serve **different purposes** and **complement each other**:

```
Grafana Stack answers:
  "What happened to notification #12345?"
  "Why did it fail?"
  "Show me all failures for tenant ABC"

Sysdig answers:
  "Is the infrastructure healthy?"
  "Are pods running?"
  "Is CPU/memory usage normal?"
```

**Real-world scenario:**
1. **Sysdig alerts:** "Pod restarted 3 times in 10 minutes"
2. **You investigate in Grafana/Loki:** Query logs to see what errors caused the crash
3. **Root cause found:** GC Notify API returning rate limit errors
4. **Fix:** Implement better rate limiting

**Cost:** $0 for both (Sysdig is included, Grafana is open source)

### Recommendation Confidence

| Aspect | Confidence |
|--------|-----------|
| **Grafana Stack for notification app** | ✅ **Very High** - Essential |
| **Sysdig for infrastructure** | ✅ **High** - Important |
| **Using both together** | ✅ **High** - Best practice |
| **Cost effectiveness** | ✅ **Very High** - Both are free |
| **Maintenance burden** | ✅ **Medium** - Worth the ~2h/month |

---

## Implementation Plan

### Phase 1: Deploy Grafana Stack (Sprint 1)
**Duration:** 2-3 days
**Priority:** 🔴 CRITICAL

**Week 1 Tasks:**
1. Deploy Grafana, Loki, Mimir to `f6bc3f-tools` namespace
2. Deploy Grafana Agent to `f6bc3f-dev`, `f6bc3f-test`, `f6bc3f-prod`
3. Configure datasources and verify logs flowing
4. Implement structured JSON logging in backend
5. Test log queries with LogQL

**Deliverables:**
- ✅ Grafana accessible at URL
- ✅ Logs queryable in Grafana Explore
- ✅ Can search by notificationId, tenantId, status

### Phase 2: Create Dashboards & Alerts (Sprint 2)
**Duration:** 1.5 days
**Priority:** 🟡 IMPORTANT

**Week 2 Tasks:**
1. Create notification overview dashboard
2. Create failure analysis dashboard
3. Create GC Notify integration dashboard
4. Set up alerting rules (failure rate, queue depth, etc.)
5. Configure alert notifications (email/Slack)

**Deliverables:**
- ✅ 3-4 operational dashboards
- ✅ Critical alerts configured
- ✅ Team has access to dashboards

### Phase 3: Set Up Sysdig (Sprint 2 or 3)
**Duration:** 0.5 day
**Priority:** 🟢 MEDIUM

**Tasks:**
1. Request Sysdig team access via #devops-sysdig
2. Configure basic infrastructure dashboards
3. Set up pod health alerts
4. Grant team access

**Deliverables:**
- ✅ Sysdig dashboards for CPU/memory/pods
- ✅ Infrastructure alerts configured

### Total Timeline

| Phase | Duration | Can Start |
|-------|----------|-----------|
| Phase 1 (Grafana Stack) | 2-3 days | Immediately |
| Phase 2 (Dashboards) | 1.5 days | After Phase 1 |
| Phase 3 (Sysdig) | 0.5 day | In parallel or after Phase 1 |
| **Total** | **4-5 days** | Over 2-3 sprints |

---

## Expected Outcomes

### After Phase 1 (Grafana Stack Deployed)

**You can:**
- ✅ Search logs by notification ID, tenant, channel, status
- ✅ Find specific notifications in < 30 seconds
- ✅ Debug failed notifications with full context
- ✅ Trace notification lifecycle from creation to delivery

**Example queries you can run:**
```logql
# Find notification by ID
{app="common-notify"} | json | notificationId="notif_12345"

# All failed notifications today
{app="common-notify"} | json | status="failed" | line_format "{{.timestamp}} {{.channel}} {{.errorMessage}}"

# SMS failures from GC Notify
{app="common-notify", channel="sms"} |= "GC Notify" |= "error"

# Slow notifications (> 5 seconds)
{app="common-notify"} | json | deliveryTime > 5000
```

### After Phase 2 (Dashboards Created)

**You can:**
- ✅ View real-time notification success rates
- ✅ Monitor queue depth and processing lag
- ✅ See failure trends by channel
- ✅ Get alerted to issues before customers complain

**Dashboards:**
1. **Notification Overview** - Total sent, success rate, delivery times
2. **Failure Analysis** - What's failing and why
3. **GC Notify Integration** - API health and errors
4. **Operational** - Queue status, worker health

### After Phase 3 (Sysdig Added)

**You can:**
- ✅ Monitor pod CPU, memory, restarts
- ✅ Get alerted to infrastructure issues
- ✅ Correlate infrastructure problems with application errors
- ✅ Complete observability stack

### Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Time to answer "Did notification X deliver?" | 10-30 min (manual pod log search) | < 30 seconds | < 1 minute |
| Time to find why notification failed | 30-60 min | < 2 minutes | < 5 minutes |
| Visibility into notification success rate | None | Real-time dashboard | 100% visibility |
| Alerting on issues | Manual monitoring | Automated alerts | < 5 min detection |
| Audit trail availability | None | Complete searchable history | 30 day retention |

---

## Required Changes to Application

### Implement Structured JSON Logging

**Current logging (example):**
```typescript
logger.log('Notification sent successfully');
```

**New structured logging (required):**
```typescript
logger.info({
  notificationId: 'notif_12345',
  tenantId: 'tenant_abc',
  channel: 'email',
  recipient: 'user@example.com', // or hashed
  status: 'sent',
  deliveryTime: 2340,
  gcNotifyId: 'gc_notify_xyz',
  timestamp: new Date().toISOString()
});
```

**Why JSON?**
- Loki can parse JSON fields automatically
- Enables powerful querying by any field
- Makes logs machine-readable for analytics

**Effort:** 1 day to implement across all notification events

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Grafana Stack deployment complexity | 🔴 High | 🟡 Medium | Follow bcgov examples; allocate 3 days; seek help on Rocket.Chat |
| Log volume too high (storage cost) | 🟡 Medium | 🟢 Low | Set retention to 7-30 days; implement log sampling if needed |
| Performance impact from logging | 🟡 Medium | 🟢 Low | Use async logging; test in dev first; monitor overhead |
| Team unfamiliar with LogQL | 🟢 Low | 🟡 Medium | Provide LogQL cheat sheet; create saved query templates |
| Grafana maintenance overhead | 🟡 Medium | 🟢 Low | Use Helm for easy updates; minimal config changes needed |
| Grafana becomes single point of failure | 🟡 Medium | 🟢 Low | Monitoring is read-only; app continues if Grafana is down |

---

## Alternatives Considered

### Alternative 1: Sysdig Only
**Decision:** ❌ Rejected

**Reason:** Cannot answer critical notification tracking questions. Not designed for application log search.

### Alternative 2: ELK Stack (Elasticsearch + Logstash + Kibana)
**Decision:** ❌ Rejected

**Reason:**
- More complex to deploy and maintain
- Higher resource requirements
- Loki is simpler and sufficient for our needs
- bcgov teams are moving to Loki (see references)

### Alternative 3: Cloud-Based SaaS (Datadog, New Relic)
**Decision:** ❌ Rejected

**Reason:**
- Not approved for BC Gov OpenShift
- Additional cost
- Data sovereignty concerns
- Grafana Stack provides same capabilities

### Alternative 4: OpenShift Logging Operator
**Decision:** ⚠️ Possible but Not Recommended

**Reason:**
- Platform-managed, which is good
- But we don't control it (feature requests go through platform team)
- Grafana Stack gives us more control and customization
- If platform team deploys cluster-wide Loki later, we can switch

---

## References

### BC Government Documentation

**Sysdig:**
- Sysdig Overview: https://digital.gov.bc.ca/cloud/services/private/products-tools/sysdig/
- Sysdig Onboarding: https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/docs/app-monitoring/sysdig-monitor-onboarding/
- Support Channel: Rocket.Chat `#devops-sysdig`

**Platform Services:**
- Developer Docs: https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/
- Support: PlatformServicesTeam@gov.bc.ca
- Rocket.Chat: `#devops-operations`

### BC Gov Example Implementations

**Teams Using Grafana/Loki:**
- DITP DevOps Grafana Implementation: https://github.com/bcgov/DITP-DevOps/issues/117
- SSO Dashboard Loki: https://github.com/bcgov/sso-dashboard/pkgs/container/sso-loki

### Official Grafana Documentation

- Grafana Loki: https://grafana.com/oss/loki/
- Grafana: https://grafana.com/oss/grafana/
- Grafana Mimir: https://grafana.com/oss/mimir/
- LogQL Query Language: https://grafana.com/docs/loki/latest/query/
- Grafana Agent: https://grafana.com/docs/agent/latest/

### Learning Resources

- LogQL Cheat Sheet: https://grafana.com/docs/loki/latest/query/log_queries/
- Grafana Tutorials: https://grafana.com/tutorials/
- Loki Best Practices: https://grafana.com/docs/loki/latest/best-practices/

---

## Appendix A: Sample LogQL Queries

### Finding Notifications

```logql
# By notification ID
{app="common-notify"} | json | notificationId="notif_12345"

# By tenant
{app="common-notify"} | json | tenantId="tenant_abc"

# By channel
{app="common-notify"} | json | channel="email"

# By status
{app="common-notify"} | json | status="failed"
```

### Analyzing Failures

```logql
# All failures with error messages
{app="common-notify"} | json | status="failed"
  | line_format "{{.timestamp}} [{{.channel}}] {{.errorMessage}}"

# GC Notify API errors
{app="common-notify"} |= "GC Notify" |= "error" | json

# Rate limiting errors
{app="common-notify"} |= "429" or |= "rate limit"

# Failures by channel (count)
sum by (channel) (
  count_over_time(
    {app="common-notify"} | json | status="failed" [1h]
  )
)
```

### Performance Analysis

```logql
# Slow notifications (> 5 seconds)
{app="common-notify"} | json | deliveryTime > 5000

# Average delivery time by channel
avg by (channel) (
  avg_over_time(
    {app="common-notify"} | json | unwrap deliveryTime [1h]
  )
)

# Delivery time percentiles
quantile_over_time(0.95,
  {app="common-notify"} | json | unwrap deliveryTime [1h]
)
```

### Audit & Compliance

```logql
# All notifications for tenant in date range
{app="common-notify"} | json
  | tenantId="tenant_abc"
  | timestamp >= "2026-05-01T00:00:00Z"
  | timestamp <= "2026-05-31T23:59:59Z"

# Notification delivery proof
{app="common-notify"} | json
  | notificationId="notif_12345"
  | line_format "{{.timestamp}} {{.status}} {{.gcNotifyId}}"
```

---

## Appendix B: Sample Dashboard Panels

### Notification Overview Dashboard

**Panel 1: Total Notifications (Last 24h)**
```logql
sum(count_over_time({app="common-notify"} | json | status=~"sent|delivered" [24h]))
```

**Panel 2: Success Rate by Channel**
```logql
sum by (channel) (
  count_over_time({app="common-notify"} | json | status="delivered" [1h])
)
/
sum by (channel) (
  count_over_time({app="common-notify"} | json [1h])
) * 100
```

**Panel 3: Delivery Time (p95)**
```logql
quantile_over_time(0.95,
  {app="common-notify"} | json | unwrap deliveryTime [1h]
) / 1000
```

### Failure Analysis Dashboard

**Panel 1: Failures Over Time**
```logql
sum by (channel) (
  count_over_time({app="common-notify"} | json | status="failed" [$__interval])
)
```

**Panel 2: Top Failure Reasons**
```logql
topk(5,
  sum by (errorCode) (
    count_over_time({app="common-notify"} | json | status="failed" [1h])
  )
)
```

---

## Appendix C: Alert Rules

### Critical Alerts

**High Failure Rate:**
```yaml
- alert: HighNotificationFailureRate
  expr: |
    sum(rate({app="common-notify"} | json | status="failed" [5m]))
    /
    sum(rate({app="common-notify"} | json [5m]))
    > 0.05
  for: 5m
  annotations:
    summary: "Notification failure rate > 5%"
```

**Queue Stuck:**
```yaml
- alert: NotificationQueueStuck
  expr: |
    count_over_time({app="common-notify"} | json | status="queued" [10m]) > 0
    and
    count_over_time({app="common-notify"} | json | status="sent" [10m]) == 0
  annotations:
    summary: "No notifications processed in 10 minutes"
```

**GC Notify API Issues:**
```yaml
- alert: GCNotifyAPIErrors
  expr: |
    sum(rate({app="common-notify"} |= "GC Notify" |= "error" [5m])) > 1
  for: 5m
  annotations:
    summary: "GC Notify API returning errors"
```

---

## Approval & Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Recommending** | DevOps Team | 2026-05-04 | |
| **Approving** | Product Owner | | |
| **Implementing** | Backend Team | | |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-04 | DevOps/Backend | Initial recommendation document |

---

## Questions or Feedback?

For questions about this recommendation:
- Rocket.Chat: `#devops-operations` or `#common-notify-team`
- Email: Platform Services Team
- GitHub Discussion: [Link to discussion]
