#!/usr/bin/env python3
"""Rewrite a YAML file in place with all anchors/aliases materialized (expanded inline).

Why this exists:
  routes.yaml uses YAML anchors/aliases to DRY the shared plugin configs (jwt-keycloak,
  key-auth, rate-limiting, pre-function). After envsubst those anchors survive as literal
  text in the generated per-env file, and both publish paths would otherwise carry them:
    - DEV/PR: `gwa apply` reads the generated file directly.
    - TEST/PROD: gwservice-to-kong.py re-emits shared refs as `&id001`/`*id001`.
  Some gwa/deck consumers may not accept YAML anchors, so we expand them here at the
  generation boundary. The published config then contains fully materialized config maps
  and never depends on anchor support.

Behavior-preserving: aliases expand to identical copies, so the parsed structure is
unchanged - only the on-disk representation loses the `&`/`*` markers.

Usage: expand-yaml-anchors.py <file.yaml>   (rewrites the file in place)
"""
import sys
import yaml


# ignore_aliases -> True makes the dumper write every node inline, even when it is the
# same Python object referenced multiple times (which is exactly what an alias becomes
# after load). Result: no `&anchor` / `*alias` in the output.
class _MaterializingDumper(yaml.SafeDumper):
    pass


_MaterializingDumper.ignore_aliases = lambda self, data: True


def main(path):
    with open(path) as f:
        docs = [d for d in yaml.safe_load_all(f) if d is not None]
    with open(path, "w") as f:
        yaml.dump_all(docs, f, Dumper=_MaterializingDumper, sort_keys=False, width=4096)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: expand-yaml-anchors.py <file.yaml>\n")
        sys.exit(2)
    main(sys.argv[1])
