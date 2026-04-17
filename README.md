# Notify Service — Overview

> [!INFO] version 3

## What it does

The Notify service is a **multi-channel, multi-tenanted, notification service**. It comprises a user interface which provides administration capabilities, and an API which is called by your application to send notifications on your behalf, using the defaults you have configured for your service. You send it a request, and it delivers an email, an SMS, or a 3rd-party message - or any  combination of these — through a single, consistent interface. The service handles : 
* template creation, management and rendering for both simple and complex use-cases
* recipient management through integration with subscription services and CSTAR groups
* sender identity management
* delivery tracking 
* flexible attachment capabilities including templating and parameter substitution
* callbacks for error and/or success at an individual message granularity
* reporting capabilities
* integration with multiple service providers (SMPT Gateways, SMS providers, 3rd-party messaging providers)
* test notification capabilites
  
This means your application does not have to integrate directly with SMTP gateways, SMS providers or 3rd-party messaging applications - in fact it can be completely abstracted from the message channel, recipients, format or even content - in its simplest form only calling a REST API with a single **notification event** - and the service takes care of the rest. 

### Multi-tenancy

Both API and UI are **multi-tenanted** - in other words, your application or initiative has its own
set of defaults, settings, user-groups, integrations, templates etc. - in effect giving you a fully
featured environment, isolated from other tenants.

Each calling application (tenant) is identified via a secure token (e.g., JWT) or request header,
and all configuration, rate limits, and notification history are scoped to that tenant.

In order to use the service it is mandatory that you register for the service (which effectively
creates a tenancy for your application or initiative). This is either done through the API Gateway
(link), or preferably through the Tenant Management System, CSTAR. The latter provides a distinct
advantage in that it allows you to delegate the creation and management of groups which participate
in the notification process (for example recipients, notification service administrators or support
personnel) to appropriate personnel. Otherwise you have to manage all your recipients in your
application and pass them through the API. Plus you are only allowed a single administrator - the
user who creates the subscription.

The second advantage of using CSTAR to manage your tenancy is that you are able to link your
notification tenant to other shared services - for example workflow or forms.

---

## Design principles

1. The first design princple revolves around the **_REST API_**. While the API follows REST
   principles, there are fundamental differences between a traditional "CRUD" REST API and the
   Notification API. Traditional REST API's typically manage resources (like files and folders, or
   online store items, or social media posts), where the resource can be created, deleted, updated
   or read atomically and synchronously. Notifications are a bit different in that a single
   notification invariably calls one or more sub-systems, each of which may have internal queues,
   retry logic, failures or delays. So, although it is possible to think of a notification as an
   entry on a notification queue (and this is exactly what the REST API manages - the status and
   validity of the entry on the notification queue ) , it is not possible to determine whether a
   notification was succesful or not synchronously. For this reason, there are 2 mechanisms whereby
   the delayed, or asynchronous nature of the notification request are managed. The first is through
   the polling or querying of a notification request, the second is through a callback mechanism
   whereby an API you define is called whenever an email/SMS/message can or cannot be delivered (as
   configured in the callback mechanism).

1. The second design principle revolves around ***separation of concerns***. Specifically, how much the calling application needs to know about the mechanics of the notification it is required to send (recipients, content, channels etc.) and how much is actually the concern of others. In most cases, the calling application (and by extension, the developer of the calling application) really only knows and cares that an event has occurred and a notification needs to be sent to inform people (or channels) of this event - with the targetted, specific details of the event. It is usually the responsibility of a completely separate authority to determine the exact wording of the email, the branding, who it should be sent to and through what channel. The design specifically addresses this through the use of **Notification Events**. The notification caller simply needs to specify the unique **notification event type** in the call, and all the mechanics are taken care of by preconfigured settings in the system. These settings are configured (and remain configurable through the lifetime of the initiative ) by a well-defined group of users responsible for the details of the notification.

1. The third design principle caters to the invariable ***extensions and exceptions*** . By recognising that not all notification users fall into the category of the second design principle (for example, applications which have, as part of their core functionality, the maintenance of user groups and their channels, or applications which only want to send simple and direct messages with their own content and known users ) we have created a system of cascading defaults where replacement and augmentation of any and all settings which may have been configured through notification event types in the UI are able to overriden or augmented. In fact there is even a separate notification call which does not even use notification event types - you provide everything in the call. 

1. The fourth design principle tackles the issue of **\*idempotency** - which really means that if
   your app (mistakenly) sends exactly the same notification multiple times in a certain time
   period, the system only sends it once. This is provided through an internal comparison of
   notification payload (after all defaults have been resolved). If this is identical to a
   notification on the queue within a configurable time period, no action is taken UNLESS an
   override switch is set in the call.

1. The final design principles cover important API usage parameters such as **_rate-limiting,
   correlation id's, cursor-based pagination_** and **_error handling_**. For these, details are
   provided in the User Guide.

---

## Flexibility by design: a layered defaults system

Notifications cascade through four layers of configuration, the lower 3 being customisable by service administrators (defined during tenant creation) through the UI as required :

**System Default → Tenant Default → Notification Event → Notification Request**

**System Default** defines the default SMTP, SMS and 3rd-party messaging providers. These cannot be
modified by tenants.

**Tenant Default** . Tenant Admins may change the settings of these and/or select different
providers (where integrated). This is particularly useful for 3rd-party messaging providers like
Teams, Rocketchat, Slack etc. In addition Tenants can specify templates, subscription providers and
callbacks

 **Notification Event** is a powerful feature which completely removes the need for the calling application to manage the details of the notification. The defaults for a Notification Event can be defined within the tenancy through the UI by notification designers/admins (who are specified in CSTAR) .  Every aspect of the notification can be defined, including channels (email, SMS, 3rd party messaging), and for each channel, recipients, templates, subject, body, sender, attachments and more. It is anticipated that most notification requests to the API will contain a Notification Event Type, a handful of substitutable parameters and nothing else - after all, the calling application mostly should not care particularly about message format, recipients, templates and so on, but only that a notification event has occurred and should be triggered. These details are typically the province of an administrator, a subscription service or a team service (CSTAR)
  **HOWEVER** - the design caters to complete or partial overriding of any or all defaults configured in Notification Events through the last element of the cascade, the Notification Request.
  
 
  **Notification Request**. This is what is sent into the API from the calling application - mostly via a POST request. Every aspect of the notification can be specified here - there is no need to use Notification Events if not required - however the capability to OVERRIDDE or AUGMENT any or all defaults specified in any supplied Notification Event provides ultimate flexibility if a combination of Notification Event and Notification Requests are combined. . 


 The rule is simple: **if the request specifies it, that wins; if not, it inherits from the layer above**. This means a tenant can set sensible defaults once and individual requests only need to specify what's different.

> [!NOTE]  
> 
> **Notification Event** - The application-specific description of the event for which the notification is required
>  **Notification Event Type** - The user-defined unique shortname for the notification event. This is the "hook" on which the notification defaults are hung, and what is passed into the API.
> 
> Examples : 
> | Notification Event | Notification Event Type |
> | --- | --- |
> |Application Received | AppRec |
> |Permit Issued| PermitIssued | 
> | Payment Received | PaymentRec | 

---
## Other key features

## Extensibility and plugins

Channels are defined to be extensible, currently covering email, SMS and third-party messaging
applications. (`email`, `sms`, and `msgApp`). The plug-in architecture allows different
implementations of any of these channels in future (e.g. Amazon SNS, MS Teams, Slack), giving the
capability to mix and match between different service providers.

## Tracking and status

Every send returns a `notifyId` and a `statusUrl`. Clients can poll `GET /notify/{notifyId}` to
check delivery status per channel, or query `GET /notify` to search notification history by
correlation ID, date range, status, or tag. For real-time updates, tenants can configure a **webhook
callback** in their defaults — the API will POST status events (delivered, failed, etc.) to the
tenant's endpoint with structured data including whether the failure is retryable.

## Preview before sending

Each send endpoint has a corresponding `/preview` variant. Previews render the template with the
provided parameters and return the final content without actually delivering anything — useful for
confirmation screens or testing.

## Legacy API compatibility

The spec includes passthrough endpoints for existing provider-specific integrations. These are
maintained for backward compatibility during migration and will be deprecated once tenants
transition to the universal API.

---

## Examples

### 1. Simple send

#### 1.1 Send an email

Send a single email through the tenant default email channel using NO defaults NO templates NO
parameters **Admin UI** No setup except tenant sender email address. **API** POST to
/notifysimple/email **Payload**

```json
{
  "to": ["me@example.com", "you@example.com"],
  "cc": ["copyto@example.com"],
  "bcc": ["blindcopyto@example.com"],
  "subject": "A really simple email",
  "body": "This is an example of how simple the API can be",
  "bodyType": "text"
}
```

alternatively - POST to /notifysimple **Payload**

```json
{
  "email": {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"],
    "subject": "A really simple email",
    "body": "This is an example of how simple the API can be",
    "bodyType": "text"
  }
}
```

#### 1.2 Same as 1.1 except add SMS

**Admin UI** No setup except tenant sender email address. **API** POST to /notifysimple **Payload**

```json
{
  "email": {
    "to": [ "me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": [ "blindcopyto@example.com"],
    "subject": "A really simple email",
    "body": "This is an example of how simple the API can be",
    "bodyType": "text"
  },
  "sms": {
        "to": [+17787001234"],
        "message": "This is a sample SMS"
  }
}
```

### 2. Use of templates and parameter substitution

#### 2.1 Send an email using an inline template

Pass a template into the API, add parameter substitution

**Admin UI** No setup except tenant sender email address. **API** POST to /notifysimple/email
**Payload**

```json
{
  "to": ["{{substitute-my-email}}", "you@example.com"],
  "cc": ["copyto@example.com"],
  "bcc": ["blindcopyto@example.com"],
  "template": {
    "subject": "{{subject}}",
    "body": "This is an example of {{body-part}}"
  },
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  }
}
```

#### 2.2 Preview 2.1

Preview the output of the previous example, no actual sending

**Admin UI** No setup except tenant sender email address. **API** POST to
/notifysimple/email/preview **Payload**

```json
{
  "to": ["{{substitute-my-email}}", "you@example.com"],
  "cc": ["copyto@example.com"],
  "bcc": ["blindcopyto@example.com"],
  "template": {
    "subject": "{{subject}}",
    "body": "This is an example of {{body-part}}"
  },
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  }
}
```

**Return**

```json
{
  "email": {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"],
    "subject": "Sample subject",
    "body": "This is an example of templating and parameter substitution",
    "bodyType": "text"
  }
}
```

> [!NOTE]
>
> - Variable substitutions are performed on templates
> - Variable substititions are performed on recipient fields
> - The result is exactly what would be sent to the SMTP email gateway or SMS API

#### 2.3 Send an email using a default template

Pass a templateId into the API, add parameter substitution

**Admin UI**

- Create a template using the template UI - say "Sample template". The template might look like the
  following

```json
{
  "subject": "{{subject}}",
  "body": "This is an example of {{body-part}}"
}
```

**API**

- GET the template with a GET on /templates?name="Sample template" This returns a GUID of the
  template, say \<GUID>
- POST to /notifysimple/email **Payload**

```json
{
  "to": ["{{substitute-my-email}}", "you@example.com"],
  "cc": ["copyto@example.com"],
  "bcc": ["blindcopyto@example.com"],
  "templateId": "<GUID>",
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  }
}
```

> [!NOTE]
>
> - The advantage of this is that the template is no longer part of the calling application and can
>   be managed by a separate team / skill.
> - If "/preview" were appended to the URL the result would be the same as 2.2

### 3. Use of Notification Defaults

##### 3.1 Send a notification from an application using ALL defaults.

Send a notification from an "approved funding application" using notification defaults. Notify the
successful applicant and internal staff using predefined templates, default addresses, channels and
parameter substitution

**Admin UI**

- Create a template "Funding Approved Email" using the template UI . The template might look like
  the following

```json
{
  "subject" : "Notification of funding approval for {{program}}"
  "body" : "Dear {{firstname}} {{lastname}} \n
           Your funding to the amount of ${{amount}} for program {{program}} has been approved"
}
```

- Create another template "Funding Approved SMS" using the template UI .

```json
{
  "message": "Hey {{firstname}} {{lastname}} You just got awarded ${{amount}} for {{program}}"
}
```
* Create a **Notification Event Type** called  "funding-approved". 
* Under **Email defaults**  
  * Add the **Funding Approved Email** template to the "**template**" field
  * Add recipient "**{{emailaddress}}**" to the "**to**" field. 
  * Attach group "**FundingApprovers**" to the CC field. (Note: Group **FundingApprovers** comes directly from **CSTAR**)
* Under **SMS Defaults** 
  * Add the **Funding Approved Email** template to the "**template**" field
  * Add recipient "**{{phonenumber}}**" to the "**to**" field.
> [!NOTE]
> Variable substitution can occur in "to" and other recipient fields
> 
**API**
POST to /notifyevent
  **Payload** 
```json
{
"notificationEventType": "funding-approval",
  "params": {
    "firstname": "Lucky",
    "lastname" : "Applicant",
    "program" : "Small Business Development Fund",
    "amount" : "1000",
    "emailaddress":"lucky@me.com",
    "phonenumber":"7787001234"
  }
```

> [!NOTE]
>
> The parameter list passed into the API call can now be restricted to data generated or managed by
> the calling application. This keeps the application simple and pushes all notification logic into
> configuration, making content, formatting and recipient updates easier without code changes.

##### 3.2 Preview

As per 3.1 , but don't actually send the notification, just preview exactly what would be sent

**API** POST to /notifyevent/preview **Payload**

```json
{
"notificationEventType": "funding-approval",
  "params": {
    "firstname": "Lucky",
    "lastname" : "Applicant",
    "program" : "Small Business Development Fund",
    "amount" : "1000",
    "emailaddress":"lucky@me.com",
    "phonenumber":"7787001234"
  }
```

**Return** **API**

```json
{
  "email": {
    "to": ["lucky@me.com"],
    "cc": ["fred@gov.bc.ca", "joan@gov.bc.ca"],
    "subject": "Notification of funding approval for Small Business Development Fund",
    "body": "Dear Lucky Applicant \n
           Your funding to the amount of $1000 for program Small Business Development fund has been approved",
    "bodyType": "text",
 },
  "sms": {
    "to": ["7787001234"],
    "message": "Hey Lucky Applicant You just got awarded $1000 for Small Business Development fund",
    }
}
```

> [!NOTE]
>
> - CSTAR group email addresses are resolved
> - Variable substitutions are performed on templates
> - Variable substititions are performed on recipient fields
> - The result is exactly what would be sent to the SMTP email gateway or SMS API

##### 3.3 SMS Overrides

As per 3.1 but overrride so that no SMS is sent **API** POST to /notifyevent **Payload**

```json
{
"notificationEventType": "funding-approval",
  "params": {
    "firstname": "Lucky",
    "lastname" : "Applicant",
    "program" : "Small Business Development Fund",
    "amount" : "1000",
    "emailaddress":"lucky@me.com",
    "phonenumber":"7787001234"
  }
  "overrides" : {
    "sms" :{}
  }
}
```

##### 3.4 Template Overrides

As per 3.3 but overrride the email template POST to /notifyevent **Payload**

```json
{
"notificationEventType": "funding-approval",
  "params": {
    "firstname": "Lucky",
    "lastname" : "Applicant",
    "program" : "Small Business Development Fund",
    "amount" : "1000",
    "emailaddress":"lucky@me.com",
    "phonenumber":"7787001234"
  }
  "overrides" : {
    "email" : {
      "template" : {
                "subject" : "Funding rejected",
                "body" : "Dear {{firstname}} {{lastname}} \n
                      Your funding to the amount of ${{amount}} for program {{program}} has been rejected"
                  }
    }
    "sms" :{}
  }
}
```

##### 3.5 Augment recipients

As per 3.4 but add an additional recipient to the CC list. POST to /notifyevent **Payload**

```json
{
"notificationEventType": "funding-approval",
  "params": {
    "firstname": "Lucky",
    "lastname" : "Applicant",
    "program" : "Small Business Development Fund",
    "amount" : "1000",
    "emailaddress":"lucky@me.com",
    "phonenumber":"7787001234"
  }
  "overrides" : {
    "email" : {
      "template" : {
                "subject" : "Funding rejected",
                "body" : "Dear {{firstname}} {{lastname}} \n
                      Your funding to the amount of ${{amount}} for program {{program}} has been rejected"
                  }
    }
    "sms" :{}
  }
  "augments" : {
    "email" : {
      "cc": ["tom@gov.bc.ca"]
     }
    "sms" :{}
  }
}
```
