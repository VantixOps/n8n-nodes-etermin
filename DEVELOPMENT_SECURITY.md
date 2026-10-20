# Development security

Acceptance snapshot: 2026-10-20. This document describes a bounded assessment of the development tools. It is not a guarantee that the entire toolchain or every possible command is safe.

## Known findings

The pinned development dependency tree reports 36 affected package entries: one critical, five high and thirty moderate. Parent packages repeat the impact of five underlying libraries and thirteen advisories. No audit finding was suppressed and no forced downgrade or package override was used.

| Library in the development tree | Relevant advisory | Condition needed to reach the reported flaw |
| --- | --- | --- |
| braces 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Deep attacker-controlled brace patterns; no patched version listed at assessment time |
| fast-xml-parser 4.4.1 | [GHSA-m7jm-9gc2-mpf2](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2) and five related XML advisories | Untrusted XML parsing, building or subsequent rendering |
| qs 6.15.2 | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | Specific untrusted query objects or parsing options |
| stream-json 1.9.1 | [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) | Specific path filters, JSONC comment handling or object assembly with untrusted data |
| uuid 8.3.2 / 10.0.0 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | v3/v5/v6 calls with invalid caller-supplied output buffer bounds |

## Observed command boundary

A temporary CommonJS diagnostic preloader counted calls during the exact build, lint and contract-test commands. A harmless positive control called all five libraries and confirmed that the diagnostic could see them. Only braces was called by the build, with the fixed pattern `**/*.{png,svg}` from the CLI's static-file copier. No calls to the other listed library functions were observed in those commands. Importing a module was counted separately from calling a function. The actual n8n-workflow branch loaded uuid 11.1.1.

This observation is limited to those controlled commands and inputs. It is not complete static verification, does not prove coverage of arbitrary ESM code, and does not clear unrelated AWS, LangChain, parser or development-server paths. The diagnostic is not shipped in this package. A separate fresh GitHub-hosted run installed the pinned dependencies and passed build, ten contract tests, lint and package preview without publishing rights.

## Release controls

The prepared publication workflow uses separate fresh runners for build and publication. The builder has read-only repository permissions, no provider credentials and no OIDC publishing permission. The publication job does not check out source, install development dependencies or execute package lifecycle scripts: it uploads only the tested tarball with `--ignore-scripts` and a provenance statement. The default staged path requires personal 2FA approval on npm before the package contents go live. A first-release session credential, if explicitly approved, is limited to the staging step and removed after bootstrap; the normal direct path uses configured OIDC trust. Actions are pinned to full commit IDs. Workflows run manually and release builds do not use dependency caches.

The tarball checksum is checked across the job boundary. This proves transfer identity; it does not prove that a compromised builder could not produce a malicious artifact. These controls reduce the publishing authority exposed to development dependencies and do not repair the underlying advisories.

The package bundles no external runtime dependencies. Its n8n-workflow peer is supplied by the n8n host; the host's dependencies and security updates are a separate responsibility. Compatible upstream fixes must still be tracked. Public installation, provenance verification and n8n's own review are separate acceptance steps.

References: [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
