Consume SMS delivery reports so "sent" reflects actual delivery


PROBLEM

Our SMS pipeline marks a recipient "sent" when the provider accepts the request, not
when the message is delivered. Nothing in the system ever learns the real outcome -
there is no consumer of provider delivery reports for ACS or Twilio.

This was found when a message showed as sent on the dashboard but never arrived. The
sending toll-free number has not completed Canadian regulatory approval, so ACS accepts
the request and the carrier silently drops it. The same blind spot hides blocked
numbers, unreachable handsets, and valid-but-undeliverable numbers.

The prerequisite is already done: ACS sends now set enableDeliveryReport true and tag
each send with our notifyId (see acs-sms.adapter.ts). ACS emits no delivery events at
all without that flag, so reports exist only for messages sent after that change.


SCOPE

1. Inbound endpoint to receive ACS delivery reports via Event Grid.
2. The same for Twilio, via a per-message statusCallback URL.
3. A status model that distinguishes "accepted by provider" from "delivered".
4. Surface the distinction on the dashboard and the request-status page.


ACCEPTANCE CRITERIA

- An ACS SMSDeliveryReportReceived event updates the matching
  notification_request_detail row to a delivered or undelivered state, recording the
  provider's failure reason when one is present.
- A Twilio status callback does the same.
- The Event Grid subscription validation handshake is handled (see technical notes).
- Replayed or duplicate events are idempotent. Event Grid and Twilio are both
  at-least-once delivery.
- An event that matches no known message is logged and discarded, not returned as a 500.
- The endpoint rejects unauthenticated callers (see technical notes).
- Request status shows delivered versus merely sent, and a failure reason where there
  is one.
- Rows created before this ticket keep working and simply never advance past "sent".


TECHNICAL NOTES

Correlation. The detail row already stores the provider message id in
providerResponseId, set by markRecipientSent. ACS reports carry both that id and our
tag, which is the notifyId. Either can key the lookup, but tag plus recipient is the
more robust pair for a bulk send, where one notifyId spans many recipients.

Status model. notification_request_detail.status is currently pending, sent, failed or
blocked, and "sent" is terminal. Adding delivered and undelivered needs a Flyway
migration for notification_status_code, plus a decision on how the parent request
reconciles - a request whose recipients are all delivered versus one whose recipients
are merely all sent. See the reconciliation in EmailDeliveryWorker and
SmsDeliveryWorker.processMergeBatch; both currently settle on completed,
partially_completed or failed at send time.

Authentication. This endpoint is called by Azure and Twilio, not by tenants, so neither
NotifyServiceGuard (API key) nor NotifyFrontendRoleGuard (user JWT) fits. It needs its
own guard: the Event Grid validation handshake plus a shared secret, and Twilio's
X-Twilio-Signature HMAC check. It also needs a route in
api-gateway/templates/routes.yaml with no key-auth plugin, which will be the first
route of that shape, so the plugin configuration needs care.

Event Grid handshake. The first request to a new subscription is a
SubscriptionValidationEvent. The endpoint must echo back the validationCode or the
subscription is never activated. This is easy to miss and fails silently.

Batching. Event Grid delivers events as an array, so handle N events per request.

Documentation. Per AGENTS.md section 22.1 this is an externally callable route, so it
needs full ApiOperation and ApiResponse decorators and a mirror into
docs/apis/notify.yaml.


OUT OF SCOPE

- Retrying undelivered messages. This ticket records the outcome only.
- Email delivery reports. CHES has its own status API and should be a separate ticket.
- Toll-free number regulatory approval itself, which is an operational task rather than
  a code change.


OPEN QUESTIONS FOR REFINEMENT

- Should the parent request status advance on delivery? It currently settles at send
  time, so making it wait would change when a request is considered finished.
- Should delivered be a new status value, or a separate timestamp column alongside the
  existing status? A column avoids the migration to notification_status_code and keeps
  "sent" meaning what it means today.
