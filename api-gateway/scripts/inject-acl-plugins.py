#!/usr/bin/env python3
"""
Put the tenant's CSTAR id into a request header.

Kong only injects `X-Consumer-Groups` when an `acl` plugin runs. `routes.yaml` has none,
which is why an authenticated request arrives with the clientId and Kong's own UUIDs but
nothing identifying the tenant:

    x-consumer-username=8C3427AB-FB2E6DF7342   <- clientId, not the tenant
    x-consumer-custom-id=8C3427AB-FB2E6DF7342
    x-credential-identifier=a96dd2f1-...
    x-consumer-id=3cbd7801-...

This adds an `acl` plugin to every route that authenticates with `key-auth`. Kong reports
every group a consumer belongs to, not only the one that matched, so the CSTAR id rides
along in the header while the authorization rule stays static as tenants come and go.

Two modes, because who controls group membership on an APS `kong-api-key-acl` environment
is not documented and the service account cannot read it back (`Namespace.View` is not
granted, so `GET /gateways/{id}` is a 403):

  deny  — deny a sentinel group nobody is in. Authorizes every authenticated consumer and
          still injects X-Consumer-Groups, so the logs reveal the real group names. This
          is a diagnostic, not a permanent posture: it is no more permissive than having
          no acl plugin at all, which is where this started.
  allow — allow exactly the named group. The real rule, safe to switch on once the logs
          have shown that the group is actually assigned.

Guessing a group name straight into an allow-list produces "You cannot consume this
service" on every request with nothing to explain it, which is how this arrived here.

Bound per-route rather than to the service on purpose. The frontend routes authenticate
with `jwt-keycloak`, and those callers are not gateway consumers and have no ACL groups —
a service-level plugin would 403 every one of them.

Usage: inject-acl-plugins.py <generated.yaml> <acl-group> <allow|deny>
"""
import sys
import yaml


def main() -> int:
    path, group = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else "deny"
    if mode not in ("allow", "deny"):
        print(f"inject-acl-plugins: mode must be allow or deny, got {mode!r}", file=sys.stderr)
        return 1

    with open(path) as handle:
        docs = [d for d in yaml.safe_load_all(handle) if d]

    service = next((d for d in docs if d.get("kind") == "GatewayService"), None)
    if service is None:
        print("inject-acl-plugins: no GatewayService document found", file=sys.stderr)
        return 1

    plugins = service.setdefault("plugins", [])
    key_auth_routes = [p["route"] for p in plugins if p.get("name") == "key-auth" and p.get("route")]

    if not key_auth_routes:
        print("inject-acl-plugins: no key-auth routes found", file=sys.stderr)
        return 1

    already = {p.get("route") for p in plugins if p.get("name") == "acl"}

    for route in key_auth_routes:
        if route in already:
            continue
        plugins.append(
            {
                "name": "acl",
                "tags": list(service.get("tags", [])),
                "protocols": ["http", "https"],
                "enabled": True,
                "route": route,
                "config": {
                    # A group no consumer is in, so the deny rule never matches and every
                    # authenticated consumer passes — while the header still gets injected.
                    **({"allow": [group]} if mode == "allow" else {"deny": ["__none__"]}),
                    # The whole point of this plugin here. Left at Kong's default the
                    # header is sent, but say so explicitly: turning it on silently
                    # removes the only tenant identifier the backend gets.
                    "hide_groups_header": False,
                },
            }
        )

    with open(path, "w") as handle:
        yaml.safe_dump_all(docs, handle, sort_keys=False, default_flow_style=False, width=4096)

    rule = f"allow {group}" if mode == "allow" else "deny __none__ (diagnostic: allows all)"
    print(f"  ✓ acl plugin added to {len(key_auth_routes)} key-auth routes ({rule})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
