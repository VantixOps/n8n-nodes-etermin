# Changelog

## 0.2.0

- New node version 2 with every function of the eTermin API: appointments (create, get, get by external ID, get many, update, delete, delete by date range, deleted list), contacts (incl. booking limits and permissions), calendars and their services, services, service groups, working times, special working times, absences, anchor times, return times, vouchers, external appointment sync, number search rules, ratings, survey results, message logs, booking page logs and the company profile.
- New eTermin Trigger: starts workflows when appointments are created, changed or deleted (polling, no setup in eTermin).
- Calendars, services and service groups can be picked from a list; selected output fields are a multi-select.
- Clear errors for eTermin's XML messages, read-only keys (status 420) and empty answers; IDs and reference codes of new records reach the workflow.
- Handles measured eTermin behaviour: exclusive end dates, voucher updates by internal number, calendar settings after creation, presence-sensitive read filters, and merging updates (fields left out keep their value).
- Switching **Check Availability** off now actually books: eTermin keeps checking when it is sent as "0", so the node leaves the switch out (measured). The send switches (email, provider notification) are off unless turned on.
- Before deleting a calendar, service or service group, the node confirms your account has the record and refuses otherwise – eTermin's delete answer does not reveal whether a record was actually removed (measured). Switching an SMS option off leaves it out entirely, so a booking never sends an SMS by accident.
- Booking returns the numeric appointment ID (for update/delete), the external ID and the reference code; Check Availability is on by default (eTermin otherwise books the same time twice).
- Optional account time zone in the credential; UTC times of external appointments are calculated automatically.
- Contacts can be picked from a searchable list; Delete Many is limited to 31 days per run.
- The credential restricts requests to the documented eTermin endpoints and methods, and additionally rejects custom booking-page scripts (`jscode`) and passwords, which the node never sends.
- Node version 1 is unchanged; existing workflows keep working.

## 0.1.1

- Rewrite the README for users: installation, credential setup, usage, AI Agent tool use, errors, security and testing.
- Add search keywords; package homepage, issue link and in-editor documentation links now point to the repository README.
- Add a "free slots for tomorrow" example workflow and update the calendar example note.
- Keep development tooling notes in the repository instead of the published package.
- Derive the release archive name from the package version in the publish workflow.
- No change to node behaviour.

## 0.1.0

- First release: read calendars, bookable services and available time slots with eTermin's signed API.
- Check IDs, dates and response shapes before and after each request.
- Output modes Simplified, Selected Fields and Raw; usable as an AI Agent tool.
- Service names in the language you choose.
