# Adapters

Shared adapters for email, SMS, templates, and storage. Used by gc-notify, notifications, and other API packages. Adapters are pluggable and selected via configuration.

## Configuration

Adapter selection is driven by environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_ADAPTER` | `nodemailer` | Email adapter name (see registry) |
| `SMS_ADAPTER` | `twilio` | SMS adapter name |
| `GC_NOTIFY_DEFAULT_TEMPLATE_ENGINE` | `jinja2` | Default template engine when template has no `engine` |

Legacy env vars `EMAIL_TRANSPORT` and `SMS_TRANSPORT` are still supported for backward compatibility.

The app registers `AdaptersModule.forRoot()` in `app.module.ts` using the registry in `delivery.registry.ts`.

## Template engine selection

Templates can specify which engine (handlebars, jinja2, etc.) to use via the optional `engine` field when creating or updating a template. If omitted, the consuming module's default engine is used.

- **Template-level**: Set `engine` in `CreateTemplateRequest` when creating/updating templates.
- **Module default**: Each module (gc-notify, notifications) configures its default via `defaultTemplateEngine` in `forRoot()` options or `GC_NOTIFY_DEFAULT_TEMPLATE_ENGINE` env var.
- **Registry**: Available engines are in `TEMPLATE_RENDERER_REGISTRY_MAP`; modules can override via `templateRenderers` in `forRoot()`.

## Using adapters in a service

Adapters are provided globally. Inject them via the DI tokens:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { EMAIL_ADAPTER, SMS_ADAPTER } from '../adapters/tokens';
import type { IEmailTransport, ISmsTransport } from '../adapters/interfaces';

@Injectable()
export class MyService {
  constructor(
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter: IEmailTransport,
    @Inject(SMS_ADAPTER) private readonly smsAdapter: ISmsTransport,
  ) {}

  async sendEmail(to: string, subject: string, body: string) {
    return this.emailAdapter.send({ to, subject, body });
  }

  async sendSms(to: string, body: string) {
    return this.smsAdapter.send({ to, body });
  }
}
```

## Available delivery adapters

| Name | Type | Description |
|------|------|-------------|
| `ches` | Email | CHES (Common Hosted Email Service) REST API |
| `nodemailer` | Email | SMTP via Nodemailer (e.g. Mailpit for local dev) |
| `twilio` | SMS | Twilio API (logs only when credentials are unset) |

**Passthrough keys** (`provider:passthrough`): Use `gc-notify:passthrough` or `ches:passthrough` to forward requests to the external API instead of sending via a local adapter. See [DeliveryContext](../common/delivery-context/README.md).

## Available template engines

| Engine | Syntax | Description |
|--------|--------|-------------|
| `handlebars` | `{{ name }}` | Handlebars |
| `jinja2` | `{{ name }}`, `{% for %}` | Jinja2-style via Nunjucks (default) |
| `nunjucks` | `{{ name }}`, `{% for %}` | Nunjucks (Jinja2-inspired) |
| `ejs` | `<%= name %>` | EJS (Embedded JavaScript) |
| `mustache` | `{{ name }}` | Mustache (logic-less) |

## Storage (templates, senders)

AdaptersModule provides in-memory storage for templates and senders, used by [TemplatesModule](../templates/templates.module.ts) and [SendersModule](../senders/senders.module.ts):

| Provider | Implementation | Purpose |
|----------|----------------|---------|
| `InMemoryTemplateStore` | In-memory map | Template storage for v1/templates CRUD |
| `SENDER_STORE` | `InMemorySenderStore` | Sender storage for v1/senders CRUD |

Inject via `InMemoryTemplateStore` (class) or `SENDER_STORE` (token) from `../adapters/tokens`.

## Structure

```
adapters/
├── interfaces/
│   ├── delivery/       # IEmailTransport, ISmsTransport
│   ├── template/       # ITemplateResolver, ITemplateRenderer
│   └── storage/        # ITemplateStore, ISenderStore
├── implementations/
│   ├── delivery/
│   │   ├── email/
│   │   │   ├── ches/
│   │   │   └── nodemailer/
│   │   └── sms/twilio/
│   ├── template/
│   │   ├── renderer/
│   │   │   ├── handlebars/
│   │   │   ├── jinja2/
│   │   │   ├── nunjucks/
│   │   │   ├── ejs/
│   │   │   ├── mustache/
│   │   │   └── utils/
│   │   └── resolver/in-memory/
│   └── storage/in-memory/
├── delivery.registry.ts
├── template-renderer.registry.ts
├── adapters.module.ts
├── tokens.ts
└── README.md
```
