# GC Notify

GC Notify–compatible API for template-based email and SMS notifications. Sends via shared [adapters](../adapters/README.md); template resolution and rendering use adapters from the same module.

## Core API

**Core** (`v2/core/`) – GC Notify spec–aligned notification API:

- `POST /gc-notify/v2/notifications/email` – Send email
- `POST /gc-notify/v2/notifications/sms` – Send SMS
- `POST /gc-notify/v2/notifications/bulk` – Bulk notifications
- `GET /gc-notify/v2/notifications` – List notifications
- `GET /gc-notify/v2/notifications/:id` – Get notification
- `GET /gc-notify/v2/templates` – List templates
- `GET /gc-notify/v2/template/:id` – Get template

Templates and senders CRUD (create, update, delete) live in the universal API modules:

- **Templates** – [TemplatesModule](../templates/templates.module.ts): `GET/POST/PUT/DELETE /v1/templates`
- **Senders** – [SendersModule](../senders/senders.module.ts): `GET/POST/PUT/DELETE /v1/senders`

## GC-Specific Adapters

Template and sender infrastructure lives in [adapters](../adapters/README.md) (delivery, template, storage):

| Component | Default | Purpose |
|-----------|---------|---------|
| **Template resolver** | `InMemoryTemplateResolver` | Resolve template by ID |
| **Template renderers** | `{ handlebars, jinja2, ejs, mustache, nunjucks }` | Registry of engine → renderer |
| **Default template engine** | `jinja2` | Engine used when template has no `engine` |
| **Template store** | `InMemoryTemplateStore` | In-memory template storage (from AdaptersModule) |
| **Sender store** | `InMemorySenderStore` | In-memory sender storage (from AdaptersModule) |

Flow: request → template ID + personalisation → resolver fetches template → engine resolved (`template.engine ?? default`) → registry returns renderer → subject/body produced → shared email/SMS adapter sends. Senders (email reply-to, SMS sender ID) are resolved from the sender store via [SendersService](../senders/senders.service.ts).

To swap implementations, pass options to `GcNotifyModule.forRoot()`:

```ts
GcNotifyModule.forRoot({
  templateResolver: CustomTemplateResolver,
  templateRenderers: { handlebars: HandlebarsTemplateRenderer, jinja2: Jinja2TemplateRenderer },
  defaultTemplateEngine: 'jinja2',  // or from config.gcNotify.defaultTemplateEngine
})
```

## Structure

```
gc-notify/
├── gc-notify.service.ts      # Business logic (delegates templates/senders to TemplatesService, SendersService)
├── gc-notify.module.ts       # Module wiring
└── v2/core/                  # GC Notify API (notifications, templates read)
    ├── gc-notify-api.module.ts
    ├── gc-notify.controller.ts
    └── schemas/
```

Adapters (template resolver, renderer, storage) live in [../adapters/](../adapters/README.md).

## Dependencies

- **Shared adapters** – Email/SMS delivery and storage (template store, sender store) via [AdaptersModule](../adapters/README.md)
- **TemplatesModule** – Template CRUD; gc-notify delegates `getTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`
- **SendersModule** – Sender CRUD and resolution; gc-notify delegates `getSenders`, `getSender`, `createSender`, `updateSender`, `deleteSender` and uses `findById`, `getDefaultSender` for send flow
- **Config** – Nodemailer and Twilio settings from `configuration.ts`
