#!/usr/bin/env python3
"""Extracts only endpoint paths, methods and parameter names from eTermin's OpenAPI file (no descriptions).
Usage: python3 devtools/extract-api-parameters.py <etermin-openapi.json> > tests/fixtures/etermin-api-parameters.json"""
import json, sys
spec = json.load(open(sys.argv[1]))
def ref(o):
    while isinstance(o, dict) and '$ref' in o:
        x = spec
        for k in o['$ref'].lstrip('#/').split('/'): x = x[k]
        o = x
    return o
out = {}
for path, ops in sorted(spec['paths'].items()):
    for method, op in ops.items():
        if method not in ('get', 'post', 'put', 'delete'): continue
        params = [ref(p) for p in op.get('parameters', [])]
        out[f"{method.upper()} {path[len('/api'):]}"] = {
            'required': sorted(p['name'] for p in params if p.get('required')),
            'optional': sorted(p['name'] for p in params if not p.get('required')),
        }
json.dump({'source': 'eTermin API 1.0.0 (SwaggerHub etermin.net/eTermin-API/1.0.0), names only, extracted 2026-10-22', 'operations': out}, sys.stdout, indent=1, sort_keys=True)
print()
