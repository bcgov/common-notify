#!/usr/bin/env python3
"""
Make the sandbox forward the real backend path.

`routes.yaml` sets `strip_path: true`, and Kong strips the *entire* matched route path —
not just a leading prefix — so a route whose path is `/pr-210/api/v1/notifysimple` proxies
`/` to the backend and Nest answers `Cannot POST /`.

The production gateway never had this problem: CI does not publish routes.yaml directly, it
runs `gwservice-to-kong.py` first, which already forces `strip_path: false` and strips the
`/pr-<n>` prefix. The sandbox is published with `gwa apply` straight from routes.yaml, so it
gets no such conversion — this script is the sandbox's equivalent of that step, and its
logic is deliberately identical.

It is easy to convince yourself this is working when it is not: the backend mounts a bare
`GET /` health handler ahead of its global prefix, so a fully-stripped request returns
`{"status":"ok"}` and both `gwa status` and a manual `/health` check look green while every
real route is broken. Verify with `/pr-<n>/api/health`, which returns a *different* body
depending on whether the path survived.

Usage: fix-upstream-path.py <generated.yaml> <path-prefix>
"""
import sys
import yaml


def strip_lua(prefix: str) -> str:
    """Kong access-phase Lua removing the leading /pr-<n>. Mirrors gwservice-to-kong.py."""
    return (
        "local p = kong.request.get_path()\n"
        "local prefix = %r\n"
        "if p == prefix then\n"
        "  kong.service.request.set_path('/')\n"
        "elseif p:sub(1, #prefix + 1) == prefix .. '/' then\n"
        "  kong.service.request.set_path(p:sub(#prefix + 1))\n"
        "end\n"
    ) % (prefix,)


def main() -> int:
    path, prefix = sys.argv[1], sys.argv[2]

    with open(path) as handle:
        docs = [d for d in yaml.safe_load_all(handle) if d]

    service = next((d for d in docs if d.get("kind") == "GatewayService"), None)
    if service is None:
        print("fix-upstream-path: no GatewayService document found", file=sys.stderr)
        return 1

    for route in service.get("routes", []):
        route["strip_path"] = False

    # With no release prefix the matched path is already the backend's own path, so
    # strip_path: false is the whole fix and the rewrite would be a no-op.
    if not prefix:
        with open(path, "w") as handle:
            yaml.safe_dump_all(docs, handle, sort_keys=False, default_flow_style=False, width=4096)
        print("  ✓ strip_path: false on all routes (no release prefix to strip)")
        return 0

    lua = strip_lua(prefix)
    plugins = service.setdefault("plugins", [])
    # Bound per route rather than to the service: Kong applies only ONE pre-function per
    # route, and a route-scoped one shadows a service-scoped one entirely. The gcnotify
    # routes already carry a pre-function (the ApiKey-v1 header extractor), so a
    # service-level plugin would silently never run on exactly those routes.
    by_route = {
        p["route"]: p for p in plugins if p.get("name") == "pre-function" and p.get("route")
    }

    merged = added = 0
    for route in service.get("routes", []):
        name = route["name"]
        existing = by_route.get(name)
        if existing:
            # Path strip runs FIRST, before any existing access logic.
            existing.setdefault("config", {}).setdefault("access", []).insert(0, lua)
            merged += 1
        else:
            plugins.append(
                {
                    "name": "pre-function",
                    "tags": list(service.get("tags", [])),
                    "protocols": ["http", "https"],
                    "enabled": True,
                    "route": name,
                    "config": {"access": [lua]},
                }
            )
            added += 1

    with open(path, "w") as handle:
        yaml.safe_dump_all(docs, handle, sort_keys=False, default_flow_style=False, width=4096)

    print(f"  ✓ strip_path: false; {prefix} strip on {added + merged} routes ({merged} merged)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
