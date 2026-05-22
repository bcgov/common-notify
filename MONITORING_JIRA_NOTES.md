# Monitoring & Logging Implementation - JIRA Ticket Notes

## Executive Summary

**Recommendation:** Implement **Grafana Stack (Loki + Grafana + Mimir)** as primary logging solution + **Sysdig** for infrastructure monitoring

**Why:** As a notification application, powerful log querying is mission-critical for:
- Tracking individual notification delivery status
- Debugging failed notifications
- Providing audit trails per tenant
- Troubleshooting GC Notify API integration issues
- Monitoring delivery times and SLAs

**Total Estimated Effort:** 3-5 days (1 developer)

---

## Epic: Implement Observability for common-notify

### Story 1: Deploy Grafana Stack for Log Aggregation
**Priority:** 🔴 **HIGH (CRITICAL for notification app)**
**Estimated Effort:** 2-3 days
**Assignee:** DevOps + Backend Developer

#### Description
Deploy Grafana, Loki, and Mimir to enable powerful log querying and correlation for the notification application. This is essential for tracking notification delivery, debugging failures, and providing audit trails.

#### Tasks & Estimates

**1. Deploy Grafana Stack to f6bc3f-tools namespace (1 day)**
- [ ] Create Helm values for Grafana deployment (2h)
- [ ] Create Helm values for Loki deployment (2h)
- [ ] Create Helm values for Mimir deployment (optional but recommended) (2h)
- [ ] Deploy using Helm charts (1h)
- [ ] Verify pods are running and healthy (1h)

**2. Deploy Grafana Agent to application namespaces (0.5 day)**
- [ ] Configure Grafana Agent for f6bc3f-dev (1h)
- [ ] Configure Grafana Agent for f6bc3f-test (1h)
- [ ] Configure Grafana Agent for f6bc3f-prod (1h)
- [ ] Verify logs are flowing to Loki (1h)

**3. Configure Grafana datasources and access (0.5 day)**
- [ ] Configure Loki datasource in Grafana (1h)
- [ ] Configure Mimir datasource in Grafana (1h)
- [ ] Set up Grafana authentication/access control (1h)
- [ ] Create initial dashboard folder structure (1h)

**Components to Deploy:**
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation and storage
- **Mimir**: Metrics storage (optional but recommended for correlation)
- **Grafana Agent**: Log and metric collection from pods

**Reference Implementation:**
- Example: https://github.com/bcgov/DITP-DevOps/issues/117
- BC Gov teams are using this stack successfully

#### Acceptance Criteria
- [ ] Grafana is accessible via browser (https://grafana-common-notify.apps.silver.devops.gov.bc.ca or similar)
- [ ] Loki is receiving logs from all namespaces (dev, test, prod)
- [ ] Can query logs using LogQL in Grafana Explore
- [ ] Mimir is collecting metrics (if deployed)
- [ ] No performance impact on application pods

#### Dependencies
- Access to f6bc3f-tools namespace
- OpenShift route for Grafana access
- Basic knowledge of Helm charts

---

### Story 2: Implement Structured JSON Logging
**Priority:** 🔴 **HIGH (CRITICAL for notification app)**
**Estimated Effort:** 1 day
**Assignee:** Backend Developer

#### Description
Implement structured JSON logging in the NestJS backend to enable powerful log querying in Loki. All notification events (sent, failed, retry, delivered) must be logged with complete metadata for troubleshooting and audit trails.

#### Tasks & Estimates

**1. Configure structured logging in backend (3h)**
- [ ] Install/configure winston or pino for JSON logging (1h)
- [ ] Set up log levels (info, warn, error, debug) (0.5h)
- [ ] Configure log format with required fields (1h)
- [ ] Test logging output is valid JSON (0.5h)

**2. Implement notification event logging (3h)**
- [ ] Log notification creation with metadata (1h)
- [ ] Log notification sent events (0.5h)
- [ ] Log notification delivery status from GC Notify (1h)
- [ ] Log notification failures with error details (1h)
- [ ] Log retry attempts (0.5h)

**3. Add correlation IDs and tracing (2h)**
- [ ] Generate unique notificationId for each notification (0.5h)
- [ ] Include tenantId in all logs (0.5h)
- [ ] Add requestId/correlationId for request tracing (1h)

**Required Log Fields:**
```json
{
  "timestamp": "ISO 8601 format",
  "level": "info|warn|error",
  "service": "common-notify",
  "component": "notification-service|gc-notify-client|email-worker",
  "notificationId": "unique ID",
  "tenantId": "tenant identifier",
  "channel": "email|sms|app",
  "recipient": "masked/hashed email/phone",
  "status": "created|queued|sent|delivered|failed",
  "deliveryTime": "milliseconds",
  "errorCode": "error code if failed",
  "errorMessage": "error details",
  "retryCount": "number",
  "gcNotifyId": "GC Notify reference ID",
  "metadata": "additional context"
}
```

#### Acceptance Criteria
- [ ] All notification events are logged in JSON format
- [ ] Logs include all required fields for querying
- [ ] Can search logs by notificationId in Loki
- [ ] Can search logs by tenantId in Loki
- [ ] Can filter by channel, status, errors
- [ ] PII is properly masked/hashed in logs
- [ ] Log volume is reasonable (< 100MB/day for dev)

#### Dependencies
- Story 1 completed (Loki deployed)
- Access to backend codebase

---

### Story 3: Create Grafana Dashboards for Notifications
**Priority:** 🟡 **MEDIUM**
**Estimated Effort:** 1 day
**Assignee:** Backend Developer or DevOps

#### Description
Create pre-built Grafana dashboards for monitoring notification delivery, tracking failures, and analyzing performance.

#### Tasks & Estimates

**1. Notification Overview Dashboard (2h)**
- [ ] Panel: Total notifications sent (last 24h, 7d, 30d) (0.5h)
- [ ] Panel: Success rate by channel (email, SMS, app) (0.5h)
- [ ] Panel: Delivery time percentiles (p50, p95, p99) (0.5h)
- [ ] Panel: Notifications by tenant (top 10) (0.5h)

**2. Failure Analysis Dashboard (2h)**
- [ ] Panel: Failed notifications timeline (0.5h)
- [ ] Panel: Failure reasons (grouped by error type) (0.5h)
- [ ] Panel: Retry queue depth (0.5h)
- [ ] Panel: Recent failures table with details (0.5h)

**3. GC Notify Integration Dashboard (2h)**
- [ ] Panel: GC Notify API response times (0.5h)
- [ ] Panel: GC Notify API errors/rate limits (0.5h)
- [ ] Panel: GC Notify delivery confirmations (0.5h)
- [ ] Panel: API call volume (0.5h)

**4. Operational Dashboard (2h)**
- [ ] Panel: Queue processing rate (0.5h)
- [ ] Panel: Queue lag/backlog (0.5h)
- [ ] Panel: Worker pod status (0.5h)
- [ ] Panel: Database connection pool status (0.5h)

#### Acceptance Criteria
- [ ] 4 dashboards created and saved in Grafana
- [ ] Dashboards auto-refresh every 30-60 seconds
- [ ] All panels show real data from Loki/Mimir
- [ ] Dashboards are shared with team
- [ ] Dashboard JSON exported and committed to repo

#### Dependencies
- Story 1 completed (Grafana deployed)
- Story 2 completed (Structured logging implemented)

---

### Story 4: Set Up Sysdig Monitoring (Secondary)
**Priority:** 🟢 **MEDIUM-LOW**
**Estimated Effort:** 0.5 day
**Assignee:** DevOps or Backend Developer

#### Description
Set up Sysdig monitoring for infrastructure-level metrics (CPU, memory, pod health, restarts). This complements the Grafana Stack by providing system-level visibility.

#### Tasks & Estimates

**1. Create Sysdig Team (1h)**
- [ ] Request Sysdig access via #devops-sysdig (0.5h)
- [ ] Create team for common-notify project (0.5h)

**2. Configure Sysdig Dashboards (2h)**
- [ ] Dashboard: Pod CPU/Memory usage (0.5h)
- [ ] Dashboard: Pod restart events (0.5h)
- [ ] Dashboard: Database connection metrics (0.5h)
- [ ] Dashboard: HTTP request metrics (0.5h)

**3. Set Up Alerts (1h)**
- [ ] Alert: Pod restart > 3 times in 10 minutes (0.25h)
- [ ] Alert: CPU usage > 80% for 5 minutes (0.25h)
- [ ] Alert: Memory usage > 90% (0.25h)
- [ ] Alert: Pod crash loop detected (0.25h)

#### Acceptance Criteria
- [ ] Sysdig team created with appropriate access
- [ ] Can view common-notify metrics in Sysdig
- [ ] Basic dashboards created
- [ ] Alerts configured and tested
- [ ] Team has access to Sysdig dashboard

#### Dependencies
- GitHub account with bcgov org membership
- Access to #devops-sysdig Rocket.Chat

#### Reference Documentation
- https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/docs/app-monitoring/sysdig-monitor-onboarding/

---

### Story 5: Configure Alerting Rules
**Priority:** 🟡 **MEDIUM**
**Estimated Effort:** 0.5 day
**Assignee:** Backend Developer or DevOps

#### Description
Set up Grafana alerting rules for critical notification failures and performance issues.

#### Tasks & Estimates

**1. Configure Grafana Alerting (1h)**
- [ ] Set up alert notification channels (email, Slack, etc.) (0.5h)
- [ ] Configure alert evaluation interval (0.5h)

**2. Create Alert Rules (3h)**
- [ ] Alert: Notification failure rate > 5% (0.5h)
- [ ] Alert: No notifications sent in last 15 minutes (0.5h)
- [ ] Alert: Delivery time > 30 seconds (0.5h)
- [ ] Alert: Queue depth > 1000 notifications (0.5h)
- [ ] Alert: GC Notify API returning errors (0.5h)
- [ ] Alert: Retry queue stuck (no processing in 10 min) (0.5h)

**3. Test Alerts (1h)**
- [ ] Trigger test alerts to verify notifications work (0.5h)
- [ ] Document alert runbooks/responses (0.5h)

#### Acceptance Criteria
- [ ] All critical alerts configured in Grafana
- [ ] Alert notifications delivered to team channel
- [ ] Alerts tested and verified working
- [ ] Alert documentation created
- [ ] On-call team has access to alerts

#### Dependencies
- Story 1 completed (Grafana deployed)
- Story 2 completed (Logs flowing to Loki)
- Story 3 completed (Dashboards showing metrics)

---

## Summary Table

| Story | Priority | Effort | Status |
|-------|----------|--------|--------|
| 1. Deploy Grafana Stack | 🔴 HIGH | 2-3 days | Not Started |
| 2. Implement Structured Logging | 🔴 HIGH | 1 day | Not Started |
| 3. Create Grafana Dashboards | 🟡 MEDIUM | 1 day | Not Started |
| 4. Set Up Sysdig | 🟢 MEDIUM-LOW | 0.5 day | Not Started |
| 5. Configure Alerting | 🟡 MEDIUM | 0.5 day | Not Started |
| **TOTAL** | | **5-6 days** | |

---

## Recommended Implementation Order

### **Sprint 1 (Critical - Must Have):**
1. ✅ **Story 1:** Deploy Grafana Stack (2-3 days)
2. ✅ **Story 2:** Implement Structured Logging (1 day)

**After Sprint 1:** You can query notification logs and troubleshoot issues

### **Sprint 2 (Important - Should Have):**
3. ✅ **Story 3:** Create Grafana Dashboards (1 day)
4. ✅ **Story 5:** Configure Alerting (0.5 day)

**After Sprint 2:** You have visibility into notification performance and get alerted to issues

### **Sprint 3 (Nice to Have - Could Have):**
5. ✅ **Story 4:** Set Up Sysdig (0.5 day)

**After Sprint 3:** Full observability stack complete

---

## Technology Stack

### **Primary (Recommended):**
- **Grafana** (v10+) - Visualization
- **Loki** (v2.9+) - Log aggregation
- **Mimir** (v2.10+) - Metrics storage
- **Grafana Agent** (v0.39+) - Log/metric collection

### **Secondary (Complementary):**
- **Sysdig Monitor** - Infrastructure monitoring

### **Backend Changes:**
- **winston** or **pino** - Structured JSON logging for NestJS

---

## Success Metrics

After implementation, you should be able to:

✅ **Answer these questions in < 30 seconds:**
- "Did notification X get delivered?"
- "Why did notification Y fail?"
- "Show all failed notifications in last hour"
- "What's our SMS delivery success rate today?"
- "Which tenant sent the most notifications this week?"
- "Is there a backlog in the queue?"

✅ **Receive alerts for:**
- High failure rates
- Processing delays
- API errors
- System issues

✅ **View dashboards showing:**
- Real-time notification flow
- Success rates by channel
- Performance trends
- Error analytics

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Grafana Stack deployment complexity | 🔴 High | Follow bcgov example implementations; allocate 3 days |
| Log volume too high | 🟡 Medium | Implement log sampling; set retention policies |
| Performance impact from logging | 🟡 Medium | Use async logging; test in dev first |
| Team unfamiliar with LogQL | 🟢 Low | Provide LogQL cheat sheet; create saved queries |
| Grafana maintenance overhead | 🟡 Medium | Use Helm for easy updates; minimal config |

---

## Resources & References

### BC Gov Documentation:
- Sysdig Onboarding: https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/docs/app-monitoring/sysdig-monitor-onboarding/
- Sysdig Overview: https://digital.gov.bc.ca/cloud/services/private/products-tools/sysdig/
- Platform Developer Docs: https://developer.gov.bc.ca/docs/default/component/platform-developer-docs/

### Example Implementations:
- Grafana/Loki Implementation: https://github.com/bcgov/DITP-DevOps/issues/117
- Grafana Stack: https://github.com/bcgov/sso-dashboard/pkgs/container/sso-loki

### Official Documentation:
- Grafana Loki: https://grafana.com/oss/loki/
- Grafana: https://grafana.com/oss/grafana/
- Mimir: https://grafana.com/oss/mimir/
- LogQL Query Language: https://grafana.com/docs/loki/latest/query/

### Support:
- Rocket.Chat: #devops-sysdig (Sysdig help)
- Rocket.Chat: #devops-operations (General platform help)
- Email: PlatformServicesTeam@gov.bc.ca

---

## Cost Analysis

### **Grafana Stack (Self-Hosted):**
- **License:** FREE (open source)
- **Infrastructure:** Uses existing OpenShift resources
- **Storage:** Minimal (logs retained 7-30 days typically)
- **Maintenance:** ~2 hours/month for updates
- **Total Cost:** $0 (uses existing platform resources)

### **Sysdig:**
- **License:** FREE (included with Silver/Gold tier)
- **Infrastructure:** Managed by Platform Services
- **Maintenance:** 0 hours (managed service)
- **Total Cost:** $0 (included in platform)

---

## Notes for Product Owner

**Why Grafana Stack over just Sysdig?**

For a notification application specifically:
1. **Audit & Compliance:** Need to prove notification delivery for SLAs
2. **Troubleshooting:** "Why didn't user X get their notification?" requires log search
3. **Customer Support:** Support team needs to lookup notification status quickly
4. **SLA Monitoring:** Track delivery times per channel/tenant
5. **Integration Debugging:** Troubleshoot GC Notify API failures

Sysdig is excellent for infrastructure monitoring but NOT designed for application-level log search and correlation that notification apps require.

**Investment:** 5-6 days upfront, then minimal maintenance
**Value:** Ability to troubleshoot any notification delivery issue in seconds, not hours

---

## Decision: Grafana Stack (Loki + Grafana) + Sysdig

**Verdict:** ✅ **HIGHLY RECOMMENDED**

**Timeline:** Complete Stories 1-2 in next sprint (critical)
**Owner:** Backend Developer + DevOps collaboration
