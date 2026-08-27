#!/usr/bin/env python3
"""
Make the sandbox forward the real backend path.

`routes.yaml` sets `strip_path: true` on every route. Kong strips the *entire* matched
route path, not just a leading prefix, so a route whose path is `/pr-210/api/v1/notifysimple`
proxies `/` to the backend and Nest answers `Cannot POST /`.

This is easy to miss because the backend mounts a bare `GET /` health handler ahead of its
global prefix, so a fully-stripped request returns `{"status":"ok"}` and both `gwa status`
and a manual `/health` check look green while every real route is broken.

The fix is two changes that only make sense together:

  1. strip_path: false  — forward the path Kong matched instead of discarding it.
  2. a service-level pre-function that removes just the `/pr-<n>` release prefix,
     which is the only part the backend does not know about.

Applied here rather than in `routes.yaml` deliberately: the production gateway configs are
generated from the same template and are not being changed as part of this work. The same
defect exists there — see docs/api-key-followup-tickets.md.

Usage: fix-upstream-path.py <generated.yaml> <path-prefix>
"""
import sys
import yaml

STRIP_PREFIX_LUA = """\
local prefix = "{prefix}"
local path = kong.request.get_path()
if path:sub(1, #prefix) == prefix then
  local rest = path:sub(#prefix + 1)
  if rest == "" then rest = "/" end
  kong.service.request.set_path(rest)
end
"""


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
    if prefix:
        service.setdefault("plugins", []).append(
            {
                "name": "pre-function",
                "tags": list(service.get("tags", [])),
                "protocols": ["http", "https"],
                "enabled": True,
                "config": {"access": [STRIP_PREFIX_LUA.format(prefix=prefix)]},
            }
        )

    with open(path, "w") as handle:
        yaml.safe_dump_all(docs, handle, sort_keys=False, default_flow_style=False, width=4096)

    return 0


if __name__ == "__main__":
    sys.exit(main())
