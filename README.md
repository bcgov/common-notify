# Notify Service — Overview

> [!INFO] version 4

***[ Swagger API Spec](https://citz-do.atlassian.net/wiki/spaces/CCP/pages/657719331/Notification+API+definition)***

## What it does

The Notify service is a **multi-channel, multi-tenanted, notification service**. It comprises a user
interface which provides administration capabilities, and an API which is called by your application
to send notifications on your behalf, using the defaults you have configured for your service. You
send it a request, and it delivers an email, an SMS, or a 3rd-party message - or any combination of
these — through a single, consistent interface. The service handles :

- template creation, management and rendering for both simple and complex use-cases
- recipient management through integration with subscription services and CSTAR groups
- sender identity management
- delivery tracking
- flexible attachment capabilities including templating and parameter substitution
- callbacks for error and/or success at an individual message granularity
- reporting capabilities
- integration with multiple service providers (SMPT Gateways, SMS providers, 3rd-party messaging
  providers)
- test notification capabilites

This means your application does not have to integrate directly with SMTP gateways, SMS providers or
3rd-party messaging applications - in fact it can be completely abstracted from the message channel,
recipients, format or even content - in its simplest form only calling a REST API with a single
**notification event** - and the service takes care of the rest.

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

1. The second design principle revolves around **_separation of concerns_**. Specifically, how much
   the calling application needs to know about the mechanics of the notification it is required to
   send (recipients, content, channels etc.) and how much is actually the concern of others. In most
   cases, the calling application (and by extension, the developer of the calling application)
   really only knows and cares that an event has occurred and a notification needs to be sent to
   inform people (or channels) of this event - with the targetted, specific details of the event. It
   is usually the responsibility of a completely separate authority to determine the exact wording
   of the email, the branding, who it should be sent to and through what channel. The design
   specifically addresses this through the use of **Notification Events**. The notification caller
   simply needs to specify the unique **notification event type** in the call, and all the mechanics
   are taken care of by preconfigured settings in the system. These settings are configured (and
   remain configurable through the lifetime of the initiative ) by a well-defined group of users
   responsible for the details of the notification.

1. The third design principle caters to the invariable **_extensions and exceptions_** . By
   recognising that not all notification users fall into the category of the second design principle
   (for example, applications which have, as part of their core functionality, the maintenance of
   user groups and their channels, or applications which only want to send simple and direct
   messages with their own content and known users ) we have created a system of cascading defaults
   where replacement and augmentation of any and all settings which may have been configured through
   notification event types in the UI are able to overriden or augmented. In fact there is even a
   separate notification call which does not even use notification event types - you provide
   everything in the call.

1. The fourth design principle tackles the issue of **\*idempotency** - which really means that if
   your app (mistakenly) sends exactly the same notification multiple times in a certain time
   period, the system only sends it once. This is provided through an internal comparison of
   notification payload (after all defaults have been resolved). If this is identical to a
   notification on the queue within a configurable time period, no action is taken UNLESS an
   override switch is set in the call.
  
1. The fifth design principle covers the use of downstream services. Services are configured in the Admin UI and are  called at runtime during notification processing.  Current services comprise :
**Subscriptions**   - called to determine recipients and channels for a particular notification event. Subscription services cover such things as opt-in/out , notification defaults for individual users or mailing lists.
**Templates** - for rendering notification content with substitutable parameters to customise the notification at runtime. Multiple template engines are supported, as well as inline parameter substitution and CDOGS. 
**Templated attachments** - a service which passes substitutable parameters into a predefined template, renders the output and attaches it to a notification - all at runtime. This powerful feature allows items like templated PDF documents to be added directly to emails without the calling application needing to render and attach them to the notification. 
1. The final design principles cover important API usage parameters such as **_rate-limiting_**, 
   **_correlation id's_** , **_cursor-based pagination_** and **_error handling_**. For these, details are
   provided in the User Guide.

---

## Flexibility by design: a layered defaults system

Notifications cascade through four layers of configuration, the lower 3 being customisable by
service administrators (defined during tenant creation) through the UI as required :

**System Default → Tenant Default → Notification Event → Notification Request**

**System Default** defines the default SMTP, SMS and 3rd-party messaging providers. These cannot be
modified by tenants.

**Tenant Default** . Tenant Admins may change the settings of these and/or select different
providers (where integrated). This is particularly useful for 3rd-party messaging providers like
Teams, Rocketchat, Slack etc. In addition Tenants can specify templates, subscription providers and
callbacks

**Notification Event** is a powerful feature which completely removes the need for the calling
application to manage the details of the notification. The defaults for a Notification Event can be
defined within the tenancy through the UI by notification designers/admins (who are specified in
CSTAR) . Every aspect of the notification can be defined, including channels (email, SMS, 3rd party
messaging), and for each channel, recipients, templates, subject, body, sender, attachments and
more. It is anticipated that most notification requests to the API will contain a Notification Event
Type, a handful of substitutable parameters and nothing else - after all, the calling application
mostly should not care particularly about message format, recipients, templates and so on, but only
that a notification event has occurred and should be triggered. These details are typically the
province of an administrator, a subscription service or a team service (CSTAR) **HOWEVER** - the
design caters to complete or partial overriding of any or all defaults configured in Notification
Events through the last element of the cascade, the Notification Request.

> [!NOTE]
>
> **Notification Event** - The application-specific description of the event for which the
> notification is required
>
> **Notification Event Type** - The user-defined unique shortname for the notification event. This
> is the "hook" on which the notification defaults are hung, and what is passed into the API.
>
> Examples : 
> 
> | Notification Event | Notification Event Type |
> | --- | --- | 
> |Application Received | AppRec | 
> |Permit Issued| PermitIssued |
> | Payment Received | RecPayment |


**Notification Request**. This is what is sent into the API from the calling application - mostly
via a POST request. Every aspect of the notification can be specified here - there is no need to use
Notification Events if not required - however the capability to OVERRIDDE or AUGMENT any or all
defaults specified in any supplied Notification Event provides ultimate flexibility if a combination
of Notification Event and Notification Requests are combined. .

The rule is simple: **if the request specifies it, that wins; if not, it inherits from the layer
above**. This means a tenant can set sensible defaults once and individual requests only need to
specify what's different.

**Substitutable parameters**
These are arbitrary name-value pair parameters passed in as part of the notification request by the calling application in a field named "params". They are often used to substitute for template variables or get passed into downstream services to customise the output of the notification. These, too, are cascading - the top level "params" structure can be augmented or overridden by channel or service "params" fields. The channel or service receives all the values of the parent JSON structure as well as its own custom values. In most cases the single, top-level "params" field will suffice as it gets passed into all channels and services anyway but it does provide flexibility for more complex scenarios.

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

> [!NOTE]
> All the following examples comprise 3 sections :
> * Admin UI which describes the one-time setup required in the Notify Administrative interface to make use of the feature. 
> * API - the API endpoint
> * Payload - the JSON payload sent to the endpoint

### 1. Simple send

#### 1.1 Send an email

Send a single email through the tenant default email channel using NO defaults NO templates NO
parameters 

**Admin UI** 

No setup except tenant sender email address. 

**API** 

POST to /notifysimple/email 

**Payload**

```json
{ 
  "recipients" : {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"]
  },
  "content" : {
    "subject": "A really simple email",
    "body": "This is an example of how simple the API can be",
    "bodyType": "text"
  }
}
```

alternatively - 

POST to /notifysimple 

**Payload**

```json
{
  "email": {
    "recipients" : {
      "to": ["me@example.com", "you@example.com"],
      "cc": ["copyto@example.com"],
      "bcc": ["blindcopyto@example.com"]
    },
    "content" : {
      "subject": "A really simple email",
      "body": "This is an example of how simple the API can be",
      "bodyType": "text"
    }
  }
}
```

#### 1.2 Same as 1.1 except add SMS

**Admin UI** 

No setup except tenant sender email address. 

**API** 

POST to /notifysimple 

**Payload**

```json
{
  "email": {
    "recipients" : {
      "to": ["me@example.com", "you@example.com"],
      "cc": ["copyto@example.com"],
      "bcc": ["blindcopyto@example.com"]
    },
    "content" : {
      "subject": "A really simple email",
      "body": "This is an example of how simple the API can be",
      "bodyType": "text"
    }
  }
  "sms": {
    "recipients" : {
      "to": ["+17787001234"]
    },
    "content" : {
      "body": "This is an example of how simple the API can be",
      "bodyType": "text"  }
  }
}
```

### 2. Use of templates and parameter substitution

#### 2.1 Send an email using  inline templating

Add templated content and email addresses using the "handlebars" templating engine (double curly braces) , add parameter substitution

**Admin UI** 

No setup except tenant sender email address. 

**API** 

POST to /notifysimple/email

**Payload**

```json
{
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  }  
  "recipients" : {
    "to": ["{{substitute-my-email}}", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"]
  }
  "content": {
    "subject": "{{subject}}",
    "body": "This is an example of {{body-part}}",
    "renderer" : "handlebar"
  },
}
```
In this case, the "to" address is substituted with "my@example.com" the subject is replaced  with "Sample Subject" and the body with "This is an example of templating and parameter substitution"
#### 2.2 Preview 2.1

Preview the output of the previous example, no actual sending


**Admin UI**
 
 No setup except tenant sender email address. 
 > [!NOTE] The admin UI can be used to preview emails and perform test sends as well.

 **API** 
 
 POST to /notifysimple/email/preview 

**Payload**

As per 2.1


**Return**

```json
{
  "recipients" : {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"]
  }
  "content": {
    "subject": "Sample subject",
    "body": "This is an example of templating and parameter substitution",
    "renderer" : "handlebar"
  },
}

```

> [!NOTE]
>
> - Variable substitutions are performed on templates
> - Variable substititions are performed on recipient fields
> - The result is exactly what would be sent to the SMTP email gateway or SMS API

#### 2.3 Send an email using a server template

Pass a templateId into the API, with parameter substitution

**Admin UI**

Create a template using the template UI - say "Sample template". The template might look like the
  following

```json
{
  "subject": "{{subject}}",
  "body": "This is an example of {{body-part}}"
}
```
**API**

- GET the template with a GET reqest to /templates?name="Sample template" This returns a GUID of the
  template, say \<GUID>
- POST to /notifysimple/email
  
**Payload**

```json
{
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  }
  "recipients" : {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"]
  }
  "content": {
    "templateId": "<GUID>"
  }
}
```

> [!NOTE]
>
> - The advantage of this is that the template is no longer part of the calling application and can
>   be managed by a separate team / skill.
> - If "/preview" were appended to the URL the result would be the same as 2.2
> - Previews of templates are supported in the Admin UI.

#### 2.4 Send an email with inline attachments at a specified  time

Extend 2.3 with inline base64 encoded attachments and delayed send

**Admin UI**

As per 2.3

**API**

 POST to /notifysimple/email

 **Payload**

```json
{
  "params": {
    "substitute-my-email": "me@example.com",
    "subject": "Sample subject",
    "body-part": "templating and parameter substitution"
  },
  "recipients" : {
    "to": ["me@example.com", "you@example.com"],
    "cc": ["copyto@example.com"],
    "bcc": ["blindcopyto@example.com"]
  },
  "content": {
    "templateId": "<GUID>"
  },
  "attachments" : [
                  { "content": "PGI+SGVsbG8gV29ybGRcITwvYj4=",
                    "contentType": "image/png",
                    "filename": "myimage.png"},
                  { "content": "PGI+CHESswe8893wsdfsdggTYYW=",
                    "contentType": "application/pdf",
                    "filename": "mypdf.pdf"}
  ],
  "delayedSend" : "2025-06-25T15:15:00"
}



```

> [!NOTE]
>
> - Attachment contents must be base64 encoded. Size limits apply. 
> - DelayedSend date-time  is relative to UTC and is ISO8601 format

### 3. Use of Notification Events

##### 3.1 Send a notification from an application using a Notification Event.

Send a notification from a "Funding Application webapp" using notification defaults. Notify the
successful applicant and internal staff using predefined templates, default addresses and channels assocated with a Notification Event, customised with substitutable parameters. 
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
> [!NOTE]
>
> - For SMS templates there is no subject. 
- Create a **Notification Event Type** called "funding-approved".
- Under **Email defaults**
  - Add the **Funding Approved Email** template to the "**template**" field
  - Add recipient "**{{emailaddress}}**" to the "**to**" field.
  - Attach group "**FundingApprovers**" to the CC field. (Note: Group **FundingApprovers** comes
    directly from **CSTAR**)
- Under **SMS Defaults**
  - Add the **Funding Approved Email** template to the "**template**" field
  - Add recipient "**{{phonenumber}}**" to the "**to**" field.
> [!NOTE]
   Variable substitution can occur in "to" and other recipient fields

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

**API** 

POST to /notifyevent/preview 

**Payload**

As per 3.1

**Return**

```json
{
  "email": {
      "recipients": {
        "to": ["lucky@me.com"],
        "cc": ["fred@gov.bc.ca", "joan@gov.bc.ca"]
      }
      "content" : {
        "subject" : "Nofication of funding approval for Small Business Development Fund",
        "body": "Dear Lucky Applicant \n
           Your funding to the amount of $1000 for program Small Business Development fund has been approved",
        "bodyType": "text",
      },
  }
  "sms": {
    "recipients" :{
      "to": ["7787001234"]
    }
    "content" : {
      "message": "Hey Lucky Applicant You just got awarded $1000 for Small Business Development fund"
    }
  }
}
```

  > [!NOTE]
  >
  > - CSTAR group email addresses are resolved
  > - Variable substitutions are performed on templates
  > - Variable substititions are performed on recipient fields
  > - The result is exactly what would be sent to the SMTP email gateway or SMS API
  > - This result can be viewed directly in the preview capability of the admin UI - it is required to provide the substitutable params

##### 3.3 SMS Overrides

As per 3.1 but overrride so that no SMS is sent 

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
  "overrides" : {
    "sms" :{}
  }
}
```

##### 3.4 Template Overrides

As per 3.3 but overrride the email template with one on the server (given by \<guid\> )

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
  "overrides" : {
    "email" : {
      "content": {
        "template" : {
            "templateId": "<guid>"
        }
      }
    }
    "sms" :{}
  }
}
```

##### 3.5 Augment recipients

As per 3.4 but add an additional recipient to the CC list.

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
  },
  "overrides" : {
    "email" : {
      "content": {
        "template" : {
            "templateId": "<guid>"
        }
      }
    },
    "sms" :{},
  },
  "augments" : {
    "email":{
      "recipients" : {
        "cc": ["tom@gov.bc.ca"]
      }
    }
  }
}

````
> [!NOTE]
>
> - A combination of augments and overrides can replace or supplement almost any part of the notification 
> -  This is not expected to be the normal use of Notification Event Types, but it does provide flexibility where needed or for testing purposes

## Mail merge (Bulk Send) ## 

Notify provides 
## Services ##

Services are call-outs to external systems for things like templates, recipients or documents - performed at run-time while processing a notification. Like notification event types and other defaults they are configured in the admin UI once, then activated by notification requests. 

A notification service component is usually configured with the URL of the service, the authentication key or token for the service, any service-specific parameters and any mapping between service parameters and notification parameters (both inbound and outbound). Then at runtime, when the service is called, the list of cascading notification params is mapped to service parameters and the service is called with these parameters in the payload. On return, the return payload is mapped to notification variables (things like "to", "cc", "bcc", attachments, "content" ) which get passed onto the next stage of notification.

### Subscriptions ###
### Templates ###
### Attachments ###
### Webhooks ###






<!-- Testing API gateway automation -->
