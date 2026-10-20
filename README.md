# n8n-nodes-etermin

Read calendars, bookable services and available time slots from [eTermin](https://www.etermin.net/online-terminplaner-api).

**Unpublished development package. Not verified by n8n or endorsed by eTermin.** The GitHub repository URL in package metadata is a proposed publication destination, not a live repository. Publication requires owner approval and the remaining release gates documented in the parent roadmap.

## Operations

| Resource | Operation | API endpoint |
| --- | --- | --- |
| Calendar | Get Many | GET /api/calendar |
| Service | Get Many | GET /api/service |
| Time Slot | Get Many | GET /api/timeslots |

Use this node to build availability lookups for service businesses without rebuilding eTermin request signing in every HTTP Request node. This version does not create, reserve, change or cancel appointments. Available slots do not guarantee that a later booking will succeed.

## Installation

This package is not available from npm yet. For development use Node.js 22.16 or newer, run `npm ci`, `npm test`, and `npm run lint`. To load a preview, use `npm run dev -- --custom-user-folder /absolute/path/to/disposable-n8n-state` in a disposable n8n instance. Never point the preview at production state.

A future public release is intended for installation through n8n Community Nodes. Cloud availability requires n8n verification and is not currently claimed. Tested code dependencies: n8n-workflow 2.44.1 and n8n-core 2.44.2; these are development test versions, not a compatibility promise for every n8n release.

## Credentials

An eTermin account with API access is required. In the eTermin account settings obtain the public and private API keys and enter them in an **eTermin API** credential in n8n. Both fields are masked. Do not put keys in workflow parameters, notes, example files or source code.

Each request uses a fresh random salt and HMAC-SHA256/Base64 signature according to the provider documentation. The private key is used locally for signing and is not sent in the HTTP request. This credential permits only the three fixed HTTPS read endpoints above and disables redirects. No OAuth flow is documented in the selected API specification.

The credential connection test reads calendars. It does not modify the account. A dedicated synthetic trial account is now available. Calendar, service and time-slot requests passed authenticated provider checks using the provider's private read-only key. Never use a production/customer account for development acceptance.

## Setup

1. Add an eTermin node and select your credential.
2. Choose Calendar, Service or Time Slot and Get Many.
3. Optionally specify one positive integer Calendar ID or Service ID. An empty ID means all applicable resources.
4. For Service choose a two-letter Language Code (default EN; use DE for German names). The request sends `languageid` so the API returns `Service` and `Info` instead of language-specific field names. Names remain as configured by your account; no translation is generated.
5. For Time Slot supply a real date as YYYY-MM-DD. Set Service ID when the account restricts slots by service; missing account-specific filters may produce an empty response.
6. Keep Return All enabled, or choose a local output limit from 1 to 10000. The API endpoints used here have no documented pagination in the selected specification. A local limit reduces output, not upstream download size.
7. Choose Simplified, Raw or Selected Fields. Simplified returns at most eight essential fields. Selected Fields uses comma-separated API field names and always includes the resource identifier. Raw can include account contact details and internal service configuration; use it deliberately.

The node is also usable as an optional AI tool; use simplified or selected output and review what you send to a model. Enabling tool use is not required for ordinary workflows.

## Examples

Calendar lookup without a filter can return:

```json
[{"CalendarID":42,"CalendarName":"Synthetic calendar","Enabled":true}]
```

A time-slot lookup uses Date `2026-10-20`, Calendar ID `42`, Service ID `7`. Each returned slot becomes its own n8n item. A synthetic output is:

```json
{"start":"2026-10-20T10:00:00","end":"2026-10-20T10:30:00","calendarid":42,"calendarname":"Synthetic calendar"}
```

Time strings remain exactly as provided by eTermin. No timezone conversion is invented. An empty array means no matching API records, not a completed reservation. `examples/read-calendars.json` is a credential-free importable example; assign your credential after import.

## Failure handling and limits

Invalid IDs and impossible dates stop before an API request. Unexpected response shapes stop processing instead of appearing as a successful empty result. Network, authentication and rate-limit failures propagate through n8n; no custom response-body logging or hidden retry loop is added. Requests time out after 30 seconds. Configure workflow error handling for your own environment.

This first version intentionally excludes appointment records, contact records, writes and webhook triggers. The project contains no runtime dependencies, filesystem access or environment-variable access in the node/credential code. No customer data or real API keys were used for the tests.

## Tests and acceptance

`npm test` runs contract tests for signing, target restrictions, parameter mapping, dates, response validation, output modes, item preservation, unequal result counts across multiple inputs, and the real n8n response-routing implementation. Test transport is synthetic. The node has also been inspected in a disposable n8n 2.44.4 editor: calendars, services, time slots, output choices and masked credential fields. This used a local custom-extension loader, not a published npm installation. Twelve authenticated provider checks also passed using a dedicated synthetic trial account and the real n8n routing implementation. These include localized service names, output selection, filters, slots and an invalid signature. A saved, inactive workflow in a disposable n8n 2.44.4 instance also passed a real credential connection test and all three provider operations, with expected names, price, duration and nine time slots independently read back. Public registry installation and n8n approval remain separate acceptance steps; passing these checks is not n8n verification.

The pinned CLI 0.54.0 is tagged beta. The same source also passes build and lint using CLI 0.53.2; modern Node16 module resolution is configured. Development dependency audit findings remain unresolved, so this package is not cleared for publication. See the parent project roadmap for dependency-audit findings and publication blockers. Development tools have a separate dependency chain from the dependency-free npm runtime package. Do not interpret an empty production-only dependency audit as approval of the build environment.

## API and attribution

[Authentication](https://www.etermin.net/online-terminplaner-api) and [provider-linked OpenAPI specification](https://api.swaggerhub.com/apis/etermin.net/eTermin-API/1.0.0) were checked on 2026-10-20. This is an independent VantixOps integration. eTermin and n8n names identify the compatible services. The neutral calendar icon is original project artwork.

Direction and final control: VantixOps owner. Software and technical documentation: Codex, with independent technical review. Contributions are not presented as a personal examination completed by the owner.

## License

MIT. See LICENSE. Contact: kontakt@vantix-ops.de.
