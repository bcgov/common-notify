#!/usr/bin/env python3
"""
Convert gwa `kind: GatewayService` documents into a raw Kong/deck config that
`gwa publish-gateway` accepts.

Why this exists:
  - `gwa apply` publishes a `kind: GatewayService` resource but sends NO qualifier,
    so it cannot reconcile qualifier-scoped entities (it 409s trying to re-create
    services that already exist, and silently no-ops on updates).
  - `gwa publish-gateway --qualifier <env>` reconciles the qualifier-scoped set
    correctly, but it requires a raw Kong/deck config (services -> routes -> plugins),
    not the `kind: GatewayService` wrapper.

What this does:
  - Unwraps each `GatewayService` into a Kong `service` (routes stay nested).
  - Nests each top-level plugin under its target route (or service) — deck rejects
    top-level plugins here ("Invalid base entity plugins").
  - Forces `strip_path: false` on every route. The backend (NestJS, global prefix
    /api + version v1) expects the full `/api/v1/...` path; a literal `strip_path: true`
    strips it and the backend returns `Cannot POST /` (404). The gwa-api's own apply
    path does not strip, so this restores the working behaviour.
  - PR routes only: strips the `/pr-<number>` path prefix before forwarding.
    PR environments are isolated by a path prefix on the shared dev host
    (e.g. /pr-123/api/v1/...), but the backend still expects /api/v1/... (its
    global prefix is /api). Since strip_path is false (needed for the /api part),
    we add a `pre-function` plugin that removes only the leading /pr-<number>
    segment from the request path. Permanent envs (dev/test/prod) have no such
    prefix, so this is a no-op there.

Usage:
  python3 gwservice-to-kong.py <gw-routes-file.yaml> > <gw-kong-file.yaml>
"""
import re
import sys
import yaml

# Matches a leading /pr-<digits> prefix on a route path, for both literal
# ("/pr-123/api/...") and regex ("~/pr-123/api/...") Kong path forms.
_PR_PREFIX_RE = re.compile(r"^~?(/pr-\d+)(/|$)")


def _pr_prefix_for_route(route):
    """Return the '/pr-<n>' prefix if all of the route's paths carry one, else None."""
    paths = route.get("paths") or []
    prefixes = set()
    for p in paths:
        m = _PR_PREFIX_RE.match(p)
        if not m:
            return None  # a path without the PR prefix -> don't strip (permanent env)
        prefixes.add(m.group(1))
    # All paths must share the same single prefix to strip it unambiguously.
    return prefixes.pop() if len(prefixes) == 1 else None


def _pr_strip_plugin(prefix, tags):
    """A pre-function plugin that removes the leading /pr-<n> from the request path.

    strip_path stays false so /api/v1/... is preserved; this only trims the
    /pr-<n> segment, leaving the path the backend expects. Carries the route's
    ns.<gateway>.<env> tags — gwa rejects any plugin without them ("no tags found").
    """
    lua = (
        "local p = kong.request.get_path()\n"
        "local prefix = %r\n"
        "if p == prefix then\n"
        "  kong.service.request.set_path('/')\n"
        "elseif p:sub(1, #prefix + 1) == prefix .. '/' then\n"
        "  kong.service.request.set_path(p:sub(#prefix + 1))\n"
        "end\n"
    ) % (prefix,)
    plugin = {"name": "pre-function", "enabled": True, "config": {"access": [lua]}}
    if tags:
        plugin["tags"] = list(tags)
    return plugin


# The source template (routes.yaml) uses YAML anchors/aliases to DRY shared plugin
# configs. safe_load collapses each aliased block into a single shared Python object,
# and PyYAML's default dumper would RE-EMIT those as `&id001`/`*id001` in the output.
# We force full materialization (every config map written inline) so the published
# Kong/deck config never depends on gwa/deck accepting YAML anchors.
class _MaterializingDumper(yaml.SafeDumper):
    pass


_MaterializingDumper.ignore_aliases = lambda self, data: True


def convert(path):
    services, plugins = [], []
    for doc in yaml.safe_load_all(open(path)):
        if not doc:
            continue
        if doc.get("kind") == "GatewayService":
            services.append({k: v for k, v in doc.items() if k not in ("kind", "plugins")})
            plugins.extend(doc.get("plugins", []) or [])
        else:
            sys.stderr.write(f"WARN skipping unsupported kind={doc.get('kind')!r}\n")

    svc_by_name = {s["name"]: s for s in services}
    route_by_name = {}
    for svc in services:
        for route in svc.get("routes", []) or []:
            route["strip_path"] = False
            # PR routes carry a /pr-<n> path prefix that the backend does not
            # expect. Since strip_path is false, add a pre-function to trim just
            # that prefix. No-op for permanent envs (no prefix -> None).
            pr_prefix = _pr_prefix_for_route(route)
            if pr_prefix:
                route.setdefault("plugins", []).append(
                    _pr_strip_plugin(pr_prefix, route.get("tags"))
                )
            route_by_name[route["name"]] = route

    unresolved = []
    for plugin in plugins:
        body = {k: v for k, v in plugin.items() if k not in ("route", "service")}
        target = route_by_name.get(plugin.get("route")) or svc_by_name.get(plugin.get("service"))
        if target is None:
            unresolved.append(plugin.get("route") or plugin.get("service") or "?")
            continue
        target.setdefault("plugins", []).append(body)

    if unresolved:
        sys.stderr.write(
            f"WARN {len(unresolved)} plugin(s) had no matching route/service: {unresolved[:5]}\n"
        )

    return {"_format_version": "3.0", "services": services}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: gwservice-to-kong.py <gw-routes-file.yaml>\n")
        sys.exit(2)
    yaml.dump(
        convert(sys.argv[1]),
        sys.stdout,
        Dumper=_MaterializingDumper,
        sort_keys=False,
        width=4096,
    )
