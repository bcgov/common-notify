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

This adds an `acl` plugin to every route that authenticates with `key-auth`, allowing one
shared group. The tenant's own group is deliberately NOT in the allow-list: Kong reports
every group a consumer belongs to, not only the one that matched, so the CSTAR id rides
along in the header while the allow-list stays static as tenants come and go.

Bound per-route rather than to the service on purpose. The frontend routes authenticate
with `jwt-keycloak`, and those callers are not gateway consumers and have no ACL groups —
a service-level plugin would 403 every one of them.

Usage: inject-acl-plugins.py <generated.yaml> <acl-group>
"""
import sys
import yaml


def main() -> int:
    path, group = sys.argv[1], sys.argv[2]

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
                    "allow": [group],
                    # The whole point of this plugin here. Left at Kong's default the
                    # header is sent, but say so explicitly: turning it on silently
                    # removes the only tenant identifier the backend gets.
                    "hide_groups_header": False,
                },
            }
        )

    with open(path, "w") as handle:
        yaml.safe_dump_all(docs, handle, sort_keys=False, default_flow_style=False, width=4096)

    print(f"  ✓ acl plugin added to {len(key_auth_routes)} key-auth routes (group: {group})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
