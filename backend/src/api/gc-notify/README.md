# GC Notify-compatible API

This module exposes GC Notify-compatible endpoints through `GcNotifyController` while tenants
migrate to Common Notify's internal delivery pipeline.

## Execution model

Requests arrive through Kong with `Authorization: ApiKey-v1 <key>` and an authenticated
`x-credential-identifier`. `GcNotifyServiceGuard` resolves that credential to a tenant and retains
the authorization header for operations that still use the upstream fallback.

For each supported operation, `GcNotifyRoutingService` checks the tenant's routing feature flag:

- Enabled operations execute through `GcNotifyInternalExecutionService` and the Common Notify
  pipeline.
- Disabled operations use `GcNotifyApiClient`, which forwards the request to the upstream
  [GC Notify API](https://documentation.notification.canada.ca) and maps its response to the local
  GC Notify-compatible shape.
- Bulk sends currently always use `GcNotifyApiClient`.

When the upstream fallback is used, response resource URIs and pagination links are rewritten to the
local `/gcnotify/v2` paths.

## Endpoints

All routes are mounted under `/gcnotify/v2`.

| Method | Path                             | Description                                                                               |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST` | `/notifications/email`           | Send an email notification                                                                |
| `POST` | `/notifications/sms`             | Send an SMS notification                                                                  |
| `POST` | `/notifications/bulk`            | Send a bulk batch (max 50,000 recipients; supply `rows` **or** `csv`)                     |
| `GET`  | `/notifications`                 | List notifications (`template_type`, `status`, `reference`, `older_than`, `include_jobs`) |
| `GET`  | `/notifications/:notificationId` | Get a notification by ID                                                                  |
| `GET`  | `/templates`                     | List templates (`type`)                                                                   |
| `GET`  | `/template/:templateId`          | Get a template by ID                                                                      |

## Configuration

| Environment variable | Description                                   | Example                              |
| -------------------- | --------------------------------------------- | ------------------------------------ |
| `GC_NOTIFY_BASE_URL` | Upstream base URL used by fallback operations | `https://api.notification.canada.ca` |
