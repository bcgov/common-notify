# GC Notify Passthrough

A thin proxy between Common Notify clients and the
[GC Notify API](https://documentation.notification.canada.ca).

## How it works

```
Client
  │  X-GC-Notify-Api-Key header + Kong/JWT credentials
  ▼
TenantGuard        — validates caller identity (Kong headers or JWT Bearer token)
  ▼
GcNotifyController — validates request body, extracts GC Notify API key
  ▼
GcNotifyApiClient  — forwards request to GC Notify, maps response
  ▼
GC Notify API      (https://api.notification.canada.ca)
```

Callers supply their own GC Notify API key via `X-GC-Notify-Api-Key`. It is forwarded as
`Authorization: ApiKey-v1 <key>` and never stored. `uri` fields and pagination links in responses
are rewritten to the local proxy path.

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

| Environment variable | Description            | Example                              |
| -------------------- | ---------------------- | ------------------------------------ |
| `GC_NOTIFY_BASE_URL` | GC Notify API base URL | `https://api.notification.canada.ca` |
