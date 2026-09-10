# APS test-instance gateway (`notify-test`)

DEV, TEST and every PR publish their routes here. PROD stays on `gw-fe8c5` on the
production APS instance.

The reason is the Credential Issuer API: it exists only on the APS test instance, and a key
issued there authenticates only against a gateway on that instance. The layout matches
`gw-fe8c5` — a `dev` qualifier holding DEV plus each open PR at `/pr-<n>`, and a `test`
qualifier holding TEST.

| Stage | Service | Published host | Served as |
|---|---|---|---|
| DEV | `notify-test-notify-dev` | `notify-test.dev.api.gov.bc.ca` | `notify-test-dev-api-gov-bc-ca.test.api.gov.bc.ca` |
| PR `<n>` | `notify-test-notify-pr-<n>` | same as DEV, at `/pr-<n>` | same as DEV, at `/pr-<n>` |
| TEST | `notify-test-notify-test` | `notify-test.test.api.gov.bc.ca` | `notify-test-test-api-gov-bc-ca.test.api.gov.bc.ca` |

Two `gwa` quirks apply to every command below. `publish-gateway` ignores `--gateway`, so
run `gwa config set gateway notify-test` first. And input paths are resolved against the
current directory even when absolute, so pass a relative path.

Generate with `GATEWAY_INSTANCE=test` in front of the usual commands, e.g.
`GATEWAY_INSTANCE=test api-gateway/scripts/generate-gateway-config.sh test`. CI publishes
with `api-gateway/scripts/publish-test-instance.sh`.

## Cutover, in order

Each step depends on the one before it.

1. **CI service account.** On the test instance, create a service account on `notify-test`
   with `GatewayConfig.Publish`, and store `{"client_id": "...", "client_secret": "..."}` as
   the repository secret `GWA_ACCT_TEST_INSTANCE`. Pushing this branch runs the new pr-open
   for its own PR, which fails without it.

2. **Remove the credential-issuer sandbox config** — before any CI publish. The sandbox
   published under the unqualified tag `ns.notify-test`, on the same host and `/pr-<n>`
   paths the `dev` qualifier now uses, so leaving it produces duplicate routes. An
   unqualified publish of an empty config reconciles that tag to nothing. Dry-run first and
   confirm it would delete only the sandbox services:

   ```bash
   gwa config set gateway notify-test
   printf "_format_version: '3.0'\nservices: []\n" > /tmp/empty-kong.yaml
   (cd /tmp && gwa publish-gateway empty-kong.yaml \
     --host api-gov-bc-ca.test.api.gov.bc.ca --dry-run)
   ```

   Then run it again without `--dry-run`.

3. **Publish.** Push the branch (its PR publishes the `dev` qualifier), then merge (DEV and
   TEST publish).

4. **Product.** Once `notify-test-notify-dev` and `notify-test-notify-test` exist, apply
   `product.yaml`. Read the new `test` Environment's appId with
   `gwa get products --host api-gov-bc-ca.test.api.gov.bc.ca --gateway notify-test --json`.

5. **Point the frontends here.** Set `api-gateway-notify-url` in `notify-frontend-config`
   and restart the frontend:
   - `f6bc3f-dev`: `https://notify-test-dev-api-gov-bc-ca.test.api.gov.bc.ca`
   - `f6bc3f-test`: `https://notify-test-test-api-gov-bc-ca.test.api.gov.bc.ca`

   PR frontends are set by `pr-open.yml`.

6. **Backend credentials.** Set `APS_*` in `app-api-secrets` for `f6bc3f-dev` and
   `f6bc3f-test`. Both use the same credential-issuer service account;
   `APS_ENVIRONMENT_APP_ID` is the `dev` Environment's appId in DEV and the `test`
   Environment's appId in TEST. Then enable `api_key_self_service` in each.

## Not verified before the first publish

- That the test instance accepts and serves `notify-test.test.api.gov.bc.ca`. Only the `dev`
  host has been published here so far.
- That the test instance's data plane reaches `f6bc3f-test`. It reaches `f6bc3f-dev`, and
  TEST's backend network policy is the same shape.
- That an unqualified empty publish (step 2) touches only `ns.notify-test` and not the
  qualified tags. Running it before any qualified publish makes this moot, which is why it
  comes first.
