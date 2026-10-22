# n8n-nodes-etermin

n8n community nodes for [eTermin](https://www.etermin.net/online-terminplaner-api), the online appointment scheduler.

- **eTermin** – book, change and cancel appointments, find free time slots, and manage contacts, calendars, services, working hours, absences, vouchers and more: every endpoint of the eTermin API, with a few settings deliberately left out (see [Security and privacy](#security-and-privacy)).
- **eTermin Trigger** – start a workflow when an appointment is created, changed or deleted. No setup in eTermin, works behind firewalls.

Typical uses: let an AI agent book appointments, sync bookings into your CRM or calendar, send your own reminders or follow-ups, block calendars from a holiday planner, or report on ratings and cancellations.

## What you can do

| Resource | Operations |
| --- | --- |
| Appointment | Create, Get, Get by External ID, Get Many, Update, Delete, Delete Many (date range), Get Deleted |
| Time Slot | Get Many (free slots on a day, or search ahead for the next free day) |
| Contact | Create, Get, Get Many, Update, Delete, Set/Get Booking Limit, Set/Get Permissions |
| Calendar | Create, Get, Get Many, Update, Delete, Get/Add/Remove Services |
| Service | Create, Get, Get Many, Update, Delete, Get Calendars |
| Service Group | Create, Get, Get Many, Update, Delete |
| Working Time | Create, Get Many, Get Many for All Calendars, Update, Delete |
| Special Working Time | Create, Get Many, Update, Delete (hours for a specific date) |
| Absence | Create, Get Many, Update, Delete |
| Anchor Time | Create, Create for Date, Get Many, Get Many for Dates, Update, Update for Date, Delete, Delete for Date |
| Return Time | Create, Get Many, Update, Delete |
| Voucher | Create, Get Many, Update, Delete |
| External Appointment | Create, Update, Delete, Get Changes (sync with an external system) |
| Number Search Rule | Create, Get Many, Update, Delete |
| Rating, Survey Result, Message Log, Booking Page Log | Get Many (Message Log also Get and Get SMS Count) |
| Company | Get (profile, time zone, currency) |

Calendars, services and service groups can be picked from a list. Reading appointments, deleted appointments, contacts, calendars, services, time slots, working times, special working times, vouchers, ratings, message logs and the company profile offers **Simplified**, **Raw** or **Selected Fields** output, so AI agents only see what they need; the other read operations return eTermin's data as it is. The node can be used as a **tool for the n8n AI Agent**.

## Installation

In a self-hosted n8n instance open **Settings → Community Nodes**, choose **Install** and enter `n8n-nodes-etermin`. Once the node is verified by n8n, it can also be added from the nodes panel, including on n8n Cloud. See the [n8n guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management).

## Credentials

You need an eTermin account with API access. In eTermin open **API Schnittstellen (API interfaces) → API & Web-Push**. You see three keys:

| eTermin field | Use in n8n |
| --- | --- |
| Öffentlicher API Schlüssel (public API key) | **Public Key** |
| Privater API Schlüssel (private API key) | **Private Key** – needed to create, change or delete |
| Privater API Schlüssel (Read-only requests) | **Private Key** – enough for reading and for the trigger |
| – | **Account Time Zone** (optional), e.g. `Europe/Berlin` |

Create an **eTermin API** credential in n8n with the public key and one private key. Optionally enter your account's **time zone** (eTermin shows `W. Europe Standard Time` for `Europe/Berlin`); otherwise the workflow's time zone is used. Then click **Test**. Every request is signed with a fresh random salt and HMAC-SHA256 as eTermin requires; the private key stays in n8n and is never sent. The credential only allows the documented eTermin endpoints and does not follow redirects. If you use the read-only key and try to change data, the node tells you so instead of failing silently.

## Using the eTermin node

- **Appointments** are identified by their numeric **ID** (field `ID`). eTermin needs a second, external ID for some changes; the node looks it up for you. To start from a booking reference, use **Get by External ID**.
- **Times** without a time zone are used as entered, in the time zone of your eTermin account. Times with a time zone (for example from `{{$now}}` or an AI agent) are converted into the account time zone from the credential – or, if it is empty, into the workflow's time zone. For external appointments the UTC times are calculated for you when you leave them empty.
- **Date ranges include the end date.** eTermin itself treats the end as exclusive; the node adds the day for you, so "1 to 3 November" means what it says.
- **Deleting** returns `{"deleted": true}`. Before deleting a **calendar, service or service group**, the node first reads the record by ID (reads are account-scoped) and refuses with an error if your account has no such record – eTermin's answer otherwise does not reveal whether anything was actually deleted (measured). For other records, if eTermin deleted nothing because the ID does not exist, the node reports an error instead of a false confirmation. **Delete Many** removes the appointments of all calendars in the range, accepts at most 31 days per run and returns how many were deleted – it deletes permanently, so set the range deliberately, especially when the node is used as an AI tool.
- **Creating** returns `success` and the new record's `id`. For appointments you get the numeric `ID` (use it for Get, Update and Delete), the `externalId` and the `referenceCode` shown to customers.
- **Double bookings:** **Check Availability** is on by default, so eTermin rejects a time that is no longer free (without it, eTermin books the same time twice). Switch it off only for capacities or deliberate overbooking; the node then leaves the switch out entirely, because eTermin keeps checking even when it is sent as "0" (measured).
- **Texts in several languages** (service names, descriptions) are added as language code + text, for example `en` + "Consultation".

### Example: free slots, then book

1. **eTermin → Time Slot → Get Many** with a date, calendar and service.
2. Pick a slot, then **eTermin → Appointment → Create** with the slot's `start` and `end`, the calendar and the customer's details.

Two importable example workflows without credentials are included: [`examples/find-free-slots.json`](examples/find-free-slots.json) and [`examples/read-calendars.json`](examples/read-calendars.json).

## Using the eTermin Trigger

Choose the events (created, modified, deleted) and the polling interval. The trigger reads eTermin's change feed: on its first activation it only remembers the current position (no history is replayed). After that, each poll that finds changes starts one workflow run with one item per change; every change is delivered once. If you pause the workflow, the changes made in the meantime are delivered when you activate it again, so no booking is lost. A test run before the first activation shows the five newest changes. Each item contains `event` and the appointment (simplified to ten fields, or all fields with **Simplify** off). Several workflows can use the trigger independently. To test, create or change an appointment in eTermin and click **Fetch Test Event**.

## eTermin behaviour the node handles for you

These were measured against a real eTermin account and are covered by tests:

- Error messages arrive as XML even when JSON is requested – the node shows eTermin's message as a normal n8n error.
- Some answers are empty with status 200 – the node returns an empty list instead of failing.
- Changing data with a read-only key fails with status 420 – the node explains which key to use.
- End dates are exclusive – the node includes the day you enter.
- Vouchers can only be changed by an internal number – the node looks it up from the voucher code.
- New calendars ignore their settings – the node applies them right after creating.
- Some switches react to their mere presence – **Check Availability** keeps checking even as "0", so when it is off the node leaves it out; read and delete filters are left out when off too.
- eTermin reports a delete of a calendar, service or service group as successful without revealing whether a record was actually removed – the node reads the record first (reads are account-scoped) and refuses if your account does not have it.
- Appointment updates merge – fields you leave out keep their stored value.

## Security and privacy

- **Zero runtime dependencies.** The package ships only its own compiled code; `n8n-workflow` is provided by your n8n instance.
- No file-system or environment-variable access.
- Published from GitHub Actions with an [npm provenance statement](https://docs.npmjs.com/generating-provenance-statements).
- Deliberately not offered: setting contact passwords and adding custom JavaScript to the booking page (both are risky in AI-driven workflows), and image upload for services.
- Confirmation emails and provider notifications are off unless you turn them on: in the test account, leaving **Send Confirmation Email** / **Notify Provider** off sent nothing and turning one on sent it (measured against the message log). The node sends an **SMS** switch only when you turn it on, so a booking never sends an SMS by accident; turning it on may cost credits.
- An appointment **Update** only changes the fields you set; fields you leave out keep their stored value (measured for appointments – eTermin merges rather than replacing the record).

Development tooling notes: [DEVELOPMENT_SECURITY.md](https://github.com/VantixOps/n8n-nodes-etermin/blob/main/DEVELOPMENT_SECURITY.md) in the repository.

## Testing

`npm test` builds the package and runs the tests in [`tests/`](tests/): request signing, endpoint restrictions, request mapping, date, time-zone and ID validation, error handling and the trigger. A completeness test compares the node with every endpoint and parameter of the eTermin API description, so nothing is silently missing, and a mutation probe checks that the tests notice planted bugs. Before release, 32 read and 23 write scenarios covering every resource were run against a dedicated eTermin test account through n8n's own request engine and read back; cancelling with notification, the date-range limits, the availability-check and send switches, update merging, the account-scoped delete check and the trigger in a real n8n instance were measured too. No customer data was used.

## Compatibility

Built with the official `n8n-node` CLI against `n8n-workflow` 2.44.1 and tested in n8n 2.44.4. Node version 1 (package 0.1.x) keeps working unchanged; new nodes use version 2. The package declares Node.js 22.16 or newer.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run dev -- --custom-user-folder /absolute/path/to/a/disposable-n8n-folder
```

Use a disposable n8n folder for `npm run dev`, never your production data.

## Resources

- [eTermin API](https://www.etermin.net/online-terminplaner-api) and [API description](https://api.swaggerhub.com/apis/etermin.net/eTermin-API/1.0.0)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## About

An independent integration built and maintained by [VantixOps](https://vantix-ops.de/) – developed with AI assistance. Every release is built, tested and linted in GitHub Actions before it is published. It is not affiliated with or endorsed by eTermin. Questions and bug reports: [GitHub issues](https://github.com/VantixOps/n8n-nodes-etermin/issues) or kontakt@vantix-ops.de.

## License

[MIT](LICENSE)
