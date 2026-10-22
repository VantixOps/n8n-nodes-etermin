// Contract tests for node version 2. Everything runs against the compiled node; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Etermin } = require('../dist/nodes/Etermin/Etermin.node.js');
const { EterminApi } = require('../dist/credentials/EterminApi.credentials.js');
const { resources, findOperation } = require('../dist/nodes/Etermin/v2/spec.js');
const transport = require('../dist/nodes/Etermin/v2/transport.js');
const api = require('./fixtures/etermin-api-parameters.json').operations;

const description = new Etermin().description;
const allOps = resources.flatMap((r) => r.operations);
const fieldsOf = (op) => [...op.fields, ...(op.collections ?? []).flatMap((c) => c.fields)];

// ---------- completeness against eTermin's API ----------

// API parameters the node deliberately does not offer, with the reason.
const EXCLUDED = {
	'POST /contact': { password: 'contact passwords must not travel through workflows or AI tools' },
	'PUT /contact': { password: 'contact passwords must not travel through workflows or AI tools' },
	'POST /service': { jscode: 'custom JavaScript on the booking page is a security risk in an AI-usable node', image: 'binary upload not supported yet' },
	'PUT /service': { jscode: 'custom JavaScript on the booking page is a security risk in an AI-usable node', image: 'binary upload not supported yet' },
	'DELETE /contact': { email: 'bulk delete by email can remove several contacts; delete by contact ID instead', id: 'delete by contact ID instead' },
	'DELETE /appointmentsync': { start: 'bulk delete by date range not offered for synced appointments', end: 'bulk delete by date range not offered for synced appointments' },
	'DELETE /workingtimesdate': {},
	'GET /workingtimes': {},
};
// Parameters the node sends although the API description does not list them (measured or to be measured live).
const EXTRA = {
	'PUT /contact': {
		cid: 'the API description lists no identifier; measured 22.10.2026: updates by cid work',
		firstname: 'missing for updating in the API description; measured 22.10.2026: it is applied',
	},
	'POST /calendar': { '*': 'the API description lists no parameters; measured 22.10.2026: eTermin ignores them, the node sets them with a follow-up update' },
	'DELETE /calendarservice': { calendarid: 'measured 22.10.2026: without it eTermin answers "calendarid is missing!"' },
};

function translationPrefixes(op) {
	return fieldsOf(op).filter((f) => f.translations).map((f) => f.translations);
}
function covers(op, name) {
	if (fieldsOf(op).some((f) => !f.translations && f.apiName === name)) return true;
	if (Object.hasOwn(op.fixed ?? {}, name)) return true;
	if (op.resolve && name === 'id') return true; // looked up by the node (appointment external ID)
	// eTermin documents language variants as "<prefix>de" or as a placeholder "<prefix>languagecode".
	return translationPrefixes(op).some((p) => name === `${p}languagecode` || (name.startsWith(p) && /^[a-z]{2}$/.test(name.slice(p.length))));
}

test('every eTermin API operation is offered by at least one node operation', () => {
	const offered = new Set(allOps.map((op) => `${op.method} ${op.path}`));
	const missing = Object.keys(api).filter((key) => !offered.has(key));
	assert.deepEqual(missing, []);
});

test('every documented parameter is offered, or excluded on purpose with a reason', () => {
	const gaps = [];
	for (const [key, { required, optional }] of Object.entries(api)) {
		const ops = allOps.filter((op) => `${op.method} ${op.path}` === key);
		for (const name of [...required, ...optional]) {
			if (ops.some((op) => covers(op, name))) continue;
			if (Object.hasOwn(EXCLUDED[key] ?? {}, name)) continue;
			gaps.push(`${key}: ${name}`);
		}
	}
	// Known, deliberate gaps (bulk deletes that wipe whole calendars):
	const deliberate = ['DELETE /workingtimesdate: calendarid'];
	assert.deepEqual(gaps.filter((g) => !deliberate.includes(g)), []);
});

test('the node sends no parameter that the API description does not know, except listed measurements', () => {
	const unknown = [];
	for (const op of allOps) {
		const key = `${op.method} ${op.path}`;
		if (key === 'GET /company') continue; // measured endpoint, not in the description
		const known = new Set([...(api[key]?.required ?? []), ...(api[key]?.optional ?? [])]);
		for (const field of fieldsOf(op)) {
			if (field.translations) {
				const base = [...known].some((n) => n === `${field.translations}languagecode` ||
					(n.startsWith(field.translations) && n.length === field.translations.length + 2));
				if (!base && !EXTRA[key]?.['*']) unknown.push(`${key}: ${field.translations}xx`);
				continue;
			}
			if (known.has(field.apiName) || EXTRA[key]?.[field.apiName] || EXTRA[key]?.['*']) continue;
			unknown.push(`${key}: ${field.apiName}`);
		}
	}
	assert.deepEqual(unknown, []);
});

test('parameters the API marks as required are required in the node (or set by it)', () => {
	const notRequired = [];
	const allowed = new Set([
		'GET /workingtimes: calendarid', // 'Get Many for All Calendars' sends all=true instead, as documented
		'PUT /appointment: id', // the node fills it from 'Appointment' (looked up)
		'PUT /servicegroup: displayindex', // measured: eTermin keeps the position when it is left out
		// derived from 'Start' / 'End' and the account time zone when left empty
		'POST /appointmentsync: startutc', 'POST /appointmentsync: endutc', 'PUT /appointmentsync: startutc', 'PUT /appointmentsync: endutc',
	]);
	for (const op of allOps) {
		const key = `${op.method} ${op.path}`;
		for (const name of api[key]?.required ?? []) {
			const field = op.fields.find((f) => f.apiName === name);
			if ((field && field.required) || Object.hasOwn(op.fixed ?? {}, name) || allowed.has(`${key}: ${name}`)) continue;
			notRequired.push(`${op.resource}.${op.value}: ${name}`);
		}
	}
	assert.deepEqual(notRequired, []);
});

// ---------- UI ----------

const v2Props = description.properties.filter((p) => JSON.stringify(p.displayOptions ?? {}).includes('"gte":2'));

test('node has two versions, defaults to 2 and offers every resource and operation', () => {
	assert.deepEqual(description.version, [1, 2]);
	assert.equal(description.defaultVersion, 2);
	const resourceParam = v2Props.find((p) => p.name === 'resource');
	assert.equal(resourceParam.options.length, resources.length);
	const opCount = v2Props.filter((p) => p.name === 'operation').reduce((n, p) => n + p.options.length, 0);
	assert.equal(opCount, allOps.length);
	for (const p of v2Props.filter((x) => x.name === 'operation')) {
		for (const o of p.options) {
			assert.ok(o.action && /^[A-Z][a-z]/.test(o.action), `action of ${o.value}`);
			assert.ok(o.description, `description of ${o.value}`);
			assert.equal(o.routing.send.preSend[0], transport.prepareRequest);
			assert.equal(o.routing.output.postReceive[0], transport.processResponse);
		}
	}
});

test('a parameter name always has the same type, so switching operations keeps values consistent', () => {
	const seen = new Map();
	for (const p of v2Props) {
		const prev = seen.get(p.name);
		if (prev) assert.equal(p.type, prev, `parameter '${p.name}'`);
		else seen.set(p.name, p.type);
	}
});

test('boolean descriptions start with Whether and every field has a description', () => {
	for (const op of allOps) {
		for (const field of fieldsOf(op)) {
			assert.ok(field.description, `${op.resource}.${op.value}.${field.name}`);
			if (field.type === 'boolean' || field.type === 'flag') assert.match(field.description, /^Whether /, `${op.resource}.${op.value}.${field.name}`);
		}
	}
});

test('deleting operations never wipe more than one record silently', () => {
	for (const op of allOps.filter((o) => o.kind === 'delete')) {
		const ids = op.fields.filter((f) => f.required);
		assert.ok(ids.length > 0, `${op.resource}.${op.value} needs a required identifier or range`);
	}
	assert.ok(findOperation('workingTime', 'delete').fields.find((f) => f.apiName === 'id').required, 'working time delete needs an ID');
});

// ---------- request building ----------

function ctx(params, extra = {}) {
	return {
		getNodeParameter(name, fallback) { return Object.hasOwn(params, name) ? params[name] : fallback; },
		getTimezone() { return extra.timeZone ?? 'Europe/Berlin'; },
		getNode() { return { name: 'eTermin', type: 'n8n-nodes-etermin.etermin', typeVersion: 2, position: [0, 0], parameters: {} }; },
		getItemIndex() { return 0; },
		helpers: { httpRequestWithAuthentication: extra.http ?? (async () => { throw new Error('no network in tests'); }) },
	};
}
const send = (params, extra) => transport.prepareRequest.call(ctx(params, extra), { headers: { Accept: 'application/json' } });
const form = (req) => Object.fromEntries(new URLSearchParams(req.body));

test('create appointment sends a form body with local times, IDs and switches', async () => {
	const req = await send({
		resource: 'appointment', operation: 'create', calendar: { mode: 'list', value: '233641' },
		start: '2026-11-02T10:00:00', end: '2026-11-02T11:00:00',
		customer: { firstName: 'Nathan', lastName: 'Smith', email: 'nathan@example.com' },
		checkAvailability: false, additionalFields: { services: ['694600', '694601'], sendEmail: true, calendarLinking: -1, capacity: 2 },
	});
	assert.equal(req.method, 'POST');
	assert.equal(req.url, '/appointment');
	assert.equal(req.headers['Content-Type'], 'application/x-www-form-urlencoded');
	assert.deepEqual(req.qs, {});
	// checkAvailability is off -> checkexist is left out (measured: checkexist=0 would still block). sendemail stays a value (=1).
	assert.deepEqual(form(req), {
		calendarid: '233641', start: '2026-11-02 10:00', end: '2026-11-02 11:00', firstname: 'Nathan', lastname: 'Smith',
		email: 'nathan@example.com', services: '694600,694601', sendemail: '1', calselid: '-1', capacity: '2',
	});
	assert.equal(req.ignoreHttpStatusErrors, true);
	assert.equal(req.disableFollowRedirect, true);
});

test('times with an offset are converted into the workflow time zone; impossible times are refused', async () => {
	const base = { resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' } };
	const req = await send({ ...base, start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T10:30:00+01:00' });
	assert.equal(form(req).start, '2026-11-02 10:00'); // 09:00 UTC = 10:00 Berlin (winter time)
	assert.equal(form(req).end, '2026-11-02 10:30');
	const summer = await send({ ...base, start: '2026-07-01T08:00:00Z', end: '2026-07-01T09:00:00Z' });
	assert.equal(form(summer).start, '2026-07-01 10:00'); // summer time
	for (const [start, end] of [['2026-02-30T10:00', '2026-02-30T11:00'], ['2026-11-02T24:00', '2026-11-02T25:00'], ['tomorrow', '2026-11-02T10:00'],
		['2026-11-02T11:00', '2026-11-02T10:00'], ['2026-11-02T10:00', '2026-11-02T10:00']]) {
		await assert.rejects(() => send({ ...base, start, end }), undefined, `${start} → ${end}`);
	}
});

test('reading sends query parameters, never a body', async () => {
	const req = await send({ resource: 'appointment', operation: 'getAll', startDate: '2026-11-01', endDate: '2026-11-30', filters: { calendars: ['1', '2'], waitingList: true } });
	assert.equal(req.method, 'GET');
	assert.equal(req.body, undefined);
	assert.deepEqual(req.qs, { start: '2026-11-01', end: '2026-12-01', calendarid: '1,2', wl: '1' }); // end + 1 day: eTermin's end is exclusive
});

test('appointment list needs a date range unless filtering by customer or reservation list', async () => {
	await assert.rejects(() => send({ resource: 'appointment', operation: 'getAll' }), /Start Date/);
	await assert.rejects(() => send({ resource: 'appointment', operation: 'getAll', startDate: '2026-11-30', endDate: '2026-11-01' }), /must not be before/);
	assert.deepEqual((await send({ resource: 'appointment', operation: 'getAll', filters: { contactId: '17' } })).qs, { cid: '17' });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'getAll', filters: { reservationList: true } })).qs, { pbl: '1' });
});

test('update looks up the external ID from the numeric appointment ID', async () => {
	const calls = [];
	const http = async (credential, options) => {
		calls.push({ credential, url: options.url, qs: options.qs });
		return { statusCode: 200, headers: {}, body: [{ ID: 42, ExternalID: 'ext-abc' }] };
	};
	const req = await send({ resource: 'appointment', operation: 'update', appointment: '42', updateFields: { location: 'Room 2' } }, { http });
	assert.deepEqual(calls, [{ credential: 'eterminApi', url: '/appointment', qs: { appid: '42' } }]);
	assert.deepEqual(form(req), { id: 'ext-abc', location: 'Room 2' });
	await assert.rejects(() => send({ resource: 'appointment', operation: 'update', appointment: '42', updateFields: {} }, { http }), /at least one field/);
	const missing = async () => ({ statusCode: 200, headers: {}, body: [] });
	await assert.rejects(() => send({ resource: 'appointment', operation: 'update', appointment: '9', updateFields: { location: 'x' } }, { http: missing }), /no appointment with the ID 9/);
});

test('delete uses the numeric ID, and the external ID only when eTermin needs it (email or sync)', async () => {
	const http = async () => ({ statusCode: 200, headers: {}, body: [{ ID: 42, ExternalID: 'ext-abc' }] });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'delete', appointment: '42', options: {} }, { http })).qs, { appid: '42' });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'delete', appointment: '42', options: { sendEmail: true } }, { http })).qs, { id: 'ext-abc', sendemail: '1' });
});

test('IDs, emails, dates and line breaks are validated before any request', async () => {
	for (const value of ['0', '-1', '1.5', 'abc', '1&calendarid=2', ' ']) {
		await assert.rejects(() => send({ resource: 'calendar', operation: 'get', calendar: { mode: 'id', value } }), undefined, value);
	}
	await assert.rejects(() => send({ resource: 'contact', operation: 'getAll', filters: { email: 'not-an-email' } }), /valid email/);
	await assert.rejects(() => send({ resource: 'timeSlot', operation: 'getAll', slotDate: '2027-02-29' }), /real date/);
	await assert.rejects(() => send({ resource: 'contact', operation: 'create', contactFields: { lastName: 'A\r\nB' } }), /line breaks/);
	await assert.rejects(() => send({ resource: 'contact', operation: 'create', contactFields: {} }), /Email' or 'Last Name/);
});

test('translations become language-coded parameters', async () => {
	const req = await send({
		resource: 'service', operation: 'create', serviceGroup: { mode: 'id', value: '5' }, serviceName: 'Beratung', duration: 45,
		additionalFields: { names: { entries: [{ language: 'EN', text: 'Consultation' }, { language: 'fr', text: 'Conseil' }] }, price: 12.5, enabled: true },
	});
	assert.deepEqual(form(req), { servicegroupid: '5', servicede: 'Beratung', timeslotminutes: '45', serviceen: 'Consultation', servicefr: 'Conseil', price: '12.5', enabled: 'true' });
	await assert.rejects(() => send({ resource: 'service', operation: 'create', serviceGroup: { mode: 'id', value: '5' }, serviceName: 'x', duration: 1,
		additionalFields: { names: { entries: [{ language: 'english', text: 'x' }] } } }), /two-letter/);
});

test('working times use weekdays and 24-hour times; ranges must be in order', async () => {
	const req = await send({ resource: 'workingTime', operation: 'create', calendar: { mode: 'id', value: '7' }, weekdays: ['2', '3', '6'], startTime: '9:00', endTime: '17:30' });
	assert.deepEqual(form(req), { calendarid: '7', weekday: '2,3,6', start: '09:00', end: '17:30' });
	await assert.rejects(() => send({ resource: 'workingTime', operation: 'create', calendar: { mode: 'id', value: '7' }, weekdays: ['2'], startTime: '18:00', endTime: '09:00' }), /after/);
	await assert.rejects(() => send({ resource: 'workingTime', operation: 'create', calendar: { mode: 'id', value: '7' }, weekdays: ['2'], startTime: '25:00', endTime: '26:00' }), /time/);
});

test('switched-off filters are left out when reading or deleting, but sent when writing', async () => {
	assert.deepEqual((await send({ resource: 'appointment', operation: 'getAll', startDate: '2026-11-01', endDate: '2026-11-02', filters: { waitingList: false, basicOnly: true } })).qs,
		{ start: '2026-11-01', end: '2026-11-03', limited: '1' });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'delete', appointment: '5', options: { sendEmail: false } })).qs, { appid: '5' });
	assert.equal(form(await send({ resource: 'service', operation: 'update', service: { mode: 'id', value: '3' }, updateFields: { enabled: false } })).enabled, 'false');
	assert.deepEqual((await send({ resource: 'workingTime', operation: 'getAllCalendars' })).qs, { all: 'true' });
});

test('time slot search ahead needs its switch', async () => {
	await assert.rejects(() => send({ resource: 'timeSlot', operation: 'getAll', slotDate: '2026-11-02', filters: { searchUntil: '2026-11-09' } }), /Search Ahead/);
	const req = await send({ resource: 'timeSlot', operation: 'getAll', slotDate: '2026-11-02', filters: { searchAhead: true, searchUntil: '2026-11-09', services: ['694600'] } });
	assert.deepEqual(req.qs, { date: '2026-11-02', rangesearch: '1', end: '2026-11-09', serviceid: '694600' });
});

test('the end date the user enters is included (eTermin treats it as exclusive)', async () => {
	assert.equal(transport.nextDay('2026-11-30'), '2026-12-01');
	assert.equal(transport.nextDay('2028-02-28'), '2028-02-29');
	assert.equal(transport.nextDay('2026-12-31'), '2027-01-01');
	assert.deepEqual((await send({ resource: 'appointment', operation: 'deleteMany', rangeStart: '2027-01-15', rangeEnd: '2027-01-15' })).qs, { start: '2027-01-15', end: '2027-01-16' });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'getDeleted', deletedFrom: '2026-10-22', deletedUntil: '2026-10-22', filters: {} })).qs, { start: '2026-10-22', end: '2026-10-23' });
	assert.deepEqual((await send({ resource: 'appointment', operation: 'getDeleted', filters: { externalId: 'abc' } })).qs, { id: 'abc' });
});

test('voucher updates look up the internal number and do not send the code (measured eTermin behaviour)', async () => {
	const http = async (credential, options) => ({ statusCode: 200, headers: {}, body: [{ id: 'OTHER', iid: 1 }, { id: 'SPRING', iid: 1764598 }] });
	const req = await send({ resource: 'voucher', operation: 'update', voucherCode: 'SPRING', updateFields: { voucherDescription: 'x' } }, { http });
	assert.deepEqual(form(req), { iid: '1764598', description: 'x' });
	await assert.rejects(() => send({ resource: 'voucher', operation: 'update', voucherCode: 'NOPE', updateFields: { voucherDescription: 'x' } }, { http }), /no voucher with the code 'NOPE'/);
});

test('removing a service from a calendar sends the calendar too', async () => {
	const req = await send({ resource: 'calendar', operation: 'removeService', calendar: { mode: 'id', value: '7' }, assignmentId: '99' });
	assert.deepEqual(req.qs, { calendarid: '7', id: '99' });
});

// ---------- responses ----------

function respond(params, response, items = [{ json: {} }]) {
	return transport.processResponse.call(ctx(params), items, { headers: {}, ...response });
}
const listParams = { resource: 'calendar', operation: 'getAll', returnAll: true, output: 'raw' };

test('XML errors, 420 and other failures become clear messages', async () => {
	await assert.rejects(() => respond(listParams, { statusCode: 400, body: '<response><status>400</status><statusmsg>Calendarid parameter is missing!</statusmsg></response>' }),
		/eTermin: Calendarid parameter is missing!/);
	await assert.rejects(() => respond(listParams, { statusCode: 420, body: '' }), /refused to change data/);
	await assert.rejects(() => respond(listParams, { statusCode: 401, body: '' }), /did not accept the API keys/);
	await assert.rejects(() => respond(listParams, { statusCode: 500, body: 'oops' }), /status 500/);
	// boundary: exactly 400 without any message must still fail (not look like an empty success)
	await assert.rejects(() => respond(listParams, { statusCode: 400, body: '' }), /status 400/);
	await assert.rejects(() => respond({ resource: 'contact', operation: 'create' }, { statusCode: 200, body: { Status: 400 } }), /reported status 400/);
	assert.equal((await respond({ resource: 'contact', operation: 'create' }, { statusCode: 200, body: { Status: 399 } }))[0].json.success, true);
	await assert.rejects(() => respond({ resource: 'contact', operation: 'create' }, { statusCode: 200, body: { Status: 409, StatusMsg: 'Contact exists' } }), /Contact exists/);
	await assert.rejects(() => respond(listParams, { statusCode: 200, body: '<response><status>404</status><statusmsg>Not found</statusmsg></response>' }), /Not found/);
	await assert.rejects(() => respond(listParams, { statusCode: 200, body: 'unexpected text' }), /unexpected answer/);
	await assert.rejects(() => respond(listParams, { statusCode: 200, body: [1, 2] }), /unexpected answer/);
});

test('empty answers are an empty list, and a missing single record is an error', async () => {
	assert.deepEqual(await respond(listParams, { statusCode: 200, body: '' }), []);
	assert.deepEqual(await respond(listParams, { statusCode: 200, body: '[]' }), []);
	await assert.rejects(() => respond({ resource: 'calendar', operation: 'get', output: 'raw' }, { statusCode: 200, body: [] }), /no matching record/);
});

test('writes confirm success, deletes return deleted: true (UX guideline)', async () => {
	assert.deepEqual((await respond({ resource: 'appointment', operation: 'delete' }, { statusCode: 200, body: '' }))[0].json, { deleted: true });
	assert.deepEqual((await respond({ resource: 'contact', operation: 'create' }, { statusCode: 200, body: { cid: 7 } }))[0].json, { success: true, cid: 7 });
	assert.deepEqual((await respond({ resource: 'contact', operation: 'create' }, { statusCode: 200, body: '' }))[0].json, { success: true });
	assert.deepEqual((await respond({ resource: 'voucher', operation: 'create' }, { statusCode: 200, body: '"OK"' }))[0].json, { success: true, message: 'OK' });
	// measured answer of POST /voucher (22.10.2026): the new record's ID must reach the workflow
	assert.deepEqual((await respond({ resource: 'voucher', operation: 'create' }, { statusCode: 200,
		body: '<response><id>QA-FORM-1</id><status>200</status><statusmsg>Voucher created successfully!</statusmsg><request></request></response>' }))[0].json,
		{ success: true, id: 'QA-FORM-1', status: 200, message: 'Voucher created successfully!' });
});

test('creating a calendar sets the name right afterwards, because eTermin ignores it when creating', async () => {
	const calls = [];
	const c = ctx({ resource: 'calendar', operation: 'create', newCalendarName: 'Room 2', additionalFields: { maxCapacity: 3 } }, {
		http: async (credential, options) => { calls.push({ method: options.method, url: options.url, body: Object.fromEntries(new URLSearchParams(options.body)) }); return { statusCode: 200, headers: {}, body: '<response><id></id><status>200</status><statusmsg>1 records updated!</statusmsg></response>' }; },
	});
	const out = await transport.processResponse.call(c, [{ json: {} }], { statusCode: 200, headers: {}, body: '<response><id>233714</id><status>200</status><statusmsg>Calendar created successfully!</statusmsg></response>' });
	assert.deepEqual(calls, [{ method: 'PUT', url: '/calendar', body: { calendarname: 'Room 2', maxcapacity: '3', id: '233714' } }]);
	assert.equal(out[0].json.id, '233714');
	assert.equal(out[0].json.settingsApplied, true);
});

test('after booking, the workflow gets the numeric ID (for update/delete), the external ID and the reference code', async () => {
	const calls = [];
	const c = ctx({ resource: 'appointment', operation: 'create' }, {
		http: async (credential, options) => { calls.push(options.qs); return { statusCode: 200, headers: {}, body: [{ ID: 160162754, ExternalID: 'ab764604-23d4-46e7-869a-0930ddeb409f' }] }; },
	});
	const body = '<response><id>ab764604-23d4-46e7-869a-0930ddeb409f</id><status>200</status><statusmsg>Appointment created successfully!</statusmsg>AB764604</response>';
	const out = await transport.processResponse.call(c, [{ json: {} }], { statusCode: 200, headers: {}, body });
	assert.deepEqual(calls, [{ id: 'ab764604-23d4-46e7-869a-0930ddeb409f' }]);
	assert.deepEqual(out[0].json, { success: true, status: 200, message: 'Appointment created successfully!', referenceCode: 'AB764604',
		externalId: 'ab764604-23d4-46e7-869a-0930ddeb409f', ID: 160162754 });
	// the booking succeeded even if the lookup fails: no error, just no numeric ID
	const failing = ctx({ resource: 'appointment', operation: 'create' }, { http: async () => { throw new Error('network'); } });
	const out2 = await transport.processResponse.call(failing, [{ json: {} }], { statusCode: 200, headers: {}, body });
	assert.equal(out2[0].json.success, true);
	assert.equal(out2[0].json.ID, undefined);
});

test('simplified, selected and raw output; limit; ID always kept', async () => {
	const rows = [{ CalendarID: 1, CalendarName: 'A', Enabled: true, Secret: 'x', TimeSlotMinutes: 15 }, { CalendarID: 2, CalendarName: 'B', Enabled: false, Secret: 'y' }];
	const simple = await respond({ ...listParams, output: 'simplified' }, { statusCode: 200, body: rows });
	assert.deepEqual(simple.map((i) => i.json), [{ CalendarID: 1, CalendarName: 'A', Enabled: true, TimeSlotMinutes: 15 }, { CalendarID: 2, CalendarName: 'B', Enabled: false }]);
	const selected = await respond({ ...listParams, output: 'selected', fieldsToInclude: ['CalendarName'] }, { statusCode: 200, body: rows });
	assert.deepEqual(selected.map((i) => i.json), [{ CalendarID: 1, CalendarName: 'A' }, { CalendarID: 2, CalendarName: 'B' }]);
	const limited = await respond({ ...listParams, returnAll: false, limit: 1 }, { statusCode: 200, body: rows });
	assert.deepEqual(limited.map((i) => i.json), [rows[0]]);
	assert.equal(limited[0].pairedItem.item, 0);
});

test('UTC fields stay in UTC, also from expressions with a time zone', async () => {
	const base = { resource: 'externalAppointment', operation: 'create', externalId: 'X', calendar: { mode: 'id', value: '1' }, summary: 's', syncDescription: 'd', additionalFields: {} };
	const req = await send({ ...base, syncStart: '2026-11-04T09:00', syncEnd: '2026-11-04T09:30', syncStartUtc: '2026-11-04T08:00:00.000Z', syncEndUtc: '2026-11-04T09:30:00+01:00' });
	assert.equal(form(req).startutc, '2026-11-04 08:00');
	assert.equal(form(req).endutc, '2026-11-04 08:30');
	assert.equal(form(req).start, '2026-11-04 09:00');
});

test('changes are never cut, and the token is delivered even without changes', async () => {
	const many = Array.from({ length: 120 }, (_, i) => ({ SyncStatus: 'U', ID: i }));
	const out = await respond({ resource: 'externalAppointment', operation: 'getChanges', returnAll: false, limit: 50 }, { statusCode: 200, headers: { synctoken: '9' }, body: many });
	assert.equal(out.length, 120);
	const none = await respond({ resource: 'externalAppointment', operation: 'getChanges' }, { statusCode: 200, headers: { synctoken: '9' }, body: '' });
	assert.deepEqual(none.map((i) => i.json), [{ syncToken: '9', changes: 0 }]);
});

test('errors do not carry eTermin raw answers (they can contain customer data)', async () => {
	try {
		await respond(listParams, { statusCode: 400, body: '<response><status>400</status><statusmsg>Email max@example.com invalid</statusmsg><request>lastname=Mustermann</request></response>' });
		assert.fail('should throw');
	} catch (e) {
		assert.match(e.message, /Email max@example.com invalid/); // eTermin's short message stays (it explains the problem)
		assert.equal(JSON.stringify(e).includes('Mustermann'), false);
	}
});

test('sync changes carry the next sync token from the response header', async () => {
	const out = await respond({ resource: 'externalAppointment', operation: 'getChanges', returnAll: true },
		{ statusCode: 200, headers: { synctoken: '815' }, body: [{ SyncStatus: 'I', ID: 1 }] });
	assert.deepEqual(out[0].json, { SyncStatus: 'I', ID: 1, syncToken: '815' });
});

// ---------- credential ----------

test('the credential allows exactly the endpoints and methods the node uses', async () => {
	const cred = new EterminApi();
	const keys = { apiKey: 'p', privateKey: 's' };
	const used = new Set(allOps.map((op) => `${op.method} ${op.path}`));
	for (const key of used) {
		const [method, url] = key.split(' ');
		await cred.authenticate(keys, { baseURL: 'https://www.etermin.net/api', url, method });
	}
	for (const [method, url] of [['POST', '/rating'], ['PUT', '/timeslots'], ['DELETE', '/company'], ['GET', '/admin'], ['PATCH', '/appointment']]) {
		await assert.rejects(() => cred.authenticate(keys, { baseURL: 'https://www.etermin.net/api', url, method }), undefined, `${method} ${url}`);
	}
});

// ---------- review round 2 ----------

function ctxTz(params, zone, extra = {}) {
	const c = ctx(params, extra);
	c.getCredentials = async () => ({ apiKey: 'p', privateKey: 's', timeZone: zone });
	return c;
}
const sendTz = (params, zone, extra) => transport.prepareRequest.call(ctxTz(params, zone, extra), { headers: {} });

test('local wall time converts to UTC across daylight saving time', () => {
	assert.equal(transport.wallTimeToUtc('2026-11-04 09:00', 'Europe/Berlin'), '2026-11-04 08:00');
	assert.equal(transport.wallTimeToUtc('2026-07-01 09:00', 'Europe/Berlin'), '2026-07-01 07:00');
	assert.equal(transport.wallTimeToUtc('2026-03-29 03:30', 'Europe/Berlin'), '2026-03-29 01:30'); // day DST starts
	assert.equal(transport.wallTimeToUtc('2026-10-25 01:30', 'Europe/Berlin'), '2026-10-24 23:30'); // day DST ends
	assert.equal(transport.wallTimeToUtc('2026-11-04 09:00', 'America/New_York'), '2026-11-04 14:00');
});

test('empty UTC fields are calculated from start/end in the account time zone', async () => {
	const base = { resource: 'externalAppointment', operation: 'create', externalId: 'X', calendar: { mode: 'id', value: '1' }, summary: 's', syncDescription: 'd', additionalFields: {} };
	const req = await sendTz({ ...base, syncStart: '2026-11-04T09:00', syncEnd: '2026-11-04T09:30' }, 'Europe/Berlin');
	assert.deepEqual([form(req).startutc, form(req).endutc], ['2026-11-04 08:00', '2026-11-04 08:30']);
	const explicit = await sendTz({ ...base, syncStart: '2026-11-04T09:00', syncEnd: '2026-11-04T09:30', syncStartUtc: '2026-11-04T05:00', syncEndUtc: '2026-11-04T05:30' }, 'Europe/Berlin');
	assert.equal(form(explicit).startutc, '2026-11-04 05:00');
});

test('the account time zone from the credential decides how times with an offset are converted', async () => {
	const base = { resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' } };
	const ny = await sendTz({ ...base, start: '2026-11-02T15:00:00Z', end: '2026-11-02T16:00:00Z' }, 'America/New_York');
	assert.equal(form(ny).start, '2026-11-02 10:00');
	const empty = await sendTz({ ...base, start: '2026-11-02T15:00:00Z', end: '2026-11-02T16:00:00Z' }, '');
	assert.equal(form(empty).start, '2026-11-02 16:00'); // falls back to the workflow time zone (Europe/Berlin in these tests)
	await assert.rejects(() => sendTz({ ...base, start: '2026-11-02T15:00', end: '2026-11-02T16:00' }, 'Mars/Olympus'), /not a known time zone/);
});

test('Delete Many refuses more than 31 days at once', async () => {
	await assert.rejects(() => send({ resource: 'appointment', operation: 'deleteMany', rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }), /at most 31 days/);
	// boundary: 31 days including both ends is allowed, 32 is not
	assert.deepEqual((await send({ resource: 'appointment', operation: 'deleteMany', rangeStart: '2026-01-01', rangeEnd: '2026-01-31' })).qs, { start: '2026-01-01', end: '2026-02-01' });
	await assert.rejects(() => send({ resource: 'appointment', operation: 'deleteMany', rangeStart: '2026-01-01', rangeEnd: '2026-02-01' }), /at most 31 days/);
});

test('a failing follow-up after creating a calendar is reported, not thrown (no duplicate on retry)', async () => {
	const c = ctx({ resource: 'calendar', operation: 'create', newCalendarName: 'Room 2', additionalFields: {} }, {
		http: async () => ({ statusCode: 500, headers: {}, body: '' }),
	});
	const out = await transport.processResponse.call(c, [{ json: {} }], { statusCode: 200, headers: {}, body: '<response><id>233714</id><status>200</status><statusmsg>Calendar created successfully!</statusmsg></response>' });
	assert.equal(out[0].json.id, '233714');
	assert.equal(out[0].json.settingsApplied, false);
	assert.match(out[0].json.hint, /Use 'Update'/);
});

test('booking checks availability by default, and a taken time explains what to do', async () => {
	const prop = description.properties.find((x) => x.name === 'checkAvailability' && JSON.stringify(x.displayOptions).includes('"create"'));
	assert.equal(prop.default, true);
	const req = await send({ resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' }, start: '2026-11-10T10:00', end: '2026-11-10T11:00', checkAvailability: true });
	assert.equal(form(req).checkexist, '1');
	// off -> left out entirely, because checkexist=0 would still block (measured 22.10.2026)
	const off = await send({ resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' }, start: '2026-11-10T10:00', end: '2026-11-10T11:00', checkAvailability: false });
	assert.equal('checkexist' in form(off), false);
	// measured answer when the time is taken (22.10.2026)
	await assert.rejects(() => respond({ resource: 'appointment', operation: 'create' }, { statusCode: 409,
		body: '<response><status>409</status><statusmsg>Time span already blocked! 160166346</statusmsg><request></request></response>' }),
		(e) => /Time span already blocked/.test(e.message) && /Time Slot/.test(e.description));
});

// ---------- review round 3 ----------

test('deleting an unknown record is an error, not a false confirmation (measured eTermin answer)', async () => {
	const zero = '<response><id></id><status>200</status><statusmsg>0 record(s) deleted</statusmsg></response>';
	const one = '<response><id></id><status>200</status><statusmsg>1 record(s) deleted</statusmsg></response>';
	await assert.rejects(() => respond({ resource: 'appointment', operation: 'delete' }, { statusCode: 200, body: zero }), /deleted nothing/);
	// second spelling, measured on DELETE /calendarservice
	await assert.rejects(() => respond({ resource: 'calendar', operation: 'removeService' }, { statusCode: 200,
		body: '<response><id></id><status>200</status><statusmsg>0 records deleted!</statusmsg></response>' }), /deleted nothing/);
	assert.deepEqual((await respond({ resource: 'absence', operation: 'delete' }, { statusCode: 200,
		body: '<response><id></id><status>200</status><statusmsg>1 records deleted!</statusmsg></response>' }))[0].json, { deleted: true });
	assert.deepEqual((await respond({ resource: 'appointment', operation: 'delete' }, { statusCode: 200, body: one }))[0].json, { deleted: true });
	assert.deepEqual((await respond({ resource: 'appointment', operation: 'deleteMany' }, { statusCode: 200, body: zero }))[0].json, { deleted: true, count: 0 });
	assert.deepEqual((await respond({ resource: 'calendar', operation: 'delete' }, { statusCode: 200, body: '<response><id>7</id><status>200</status><statusmsg>Calendar deleted</statusmsg></response>' }))[0].json, { deleted: true });
});

test('ID lookups only trust the row that matches', async () => {
	const http = async () => ({ statusCode: 200, headers: {}, body: [{ ID: 1, ExternalID: 'wrong' }, { ID: 42, ExternalID: 'ext-42' }] });
	assert.equal(form(await send({ resource: 'appointment', operation: 'update', appointment: '42', updateFields: { location: 'x' } }, { http })).id, 'ext-42');
	const onlyOther = async () => ({ statusCode: 200, headers: {}, body: [{ ID: 1, ExternalID: 'wrong' }] });
	await assert.rejects(() => send({ resource: 'appointment', operation: 'update', appointment: '42', updateFields: { location: 'x' } }, { http: onlyOther }), /no appointment with the ID 42/);
});

test('updating a service group does not move it unless a position is given', async () => {
	const req = await send({ resource: 'serviceGroup', operation: 'update', serviceGroup: { mode: 'id', value: '5' }, updateFields: { groupName: 'New' } });
	assert.deepEqual(form(req), { servicegroupid: '5', servicegroupde: 'New' });
	await assert.rejects(() => send({ resource: 'serviceGroup', operation: 'update', serviceGroup: { mode: 'id', value: '5' }, updateFields: {} }), /at least one field/);
});

// ---------- review round 4 ----------

test('deleting a calendar, service or service group checks it is in the account first (eTermin answers "deleted" without revealing whether anything was removed)', async () => {
	const empty = async () => ({ statusCode: 200, headers: {}, body: [] });
	await assert.rejects(() => send({ resource: 'calendar', operation: 'delete', calendar: { mode: 'id', value: '999999999' } }, { http: empty }), /no calendar with the ID 999999999 in your account/);
	await assert.rejects(() => send({ resource: 'service', operation: 'delete', service: { mode: 'id', value: '1' } }, { http: empty }), /no service with the ID 1 in your account/);
	await assert.rejects(() => send({ resource: 'serviceGroup', operation: 'delete', serviceGroup: { mode: 'id', value: '1' } }, { http: empty }), /no service group with the ID 1 in your account/);
	// in the account -> the existence read runs, then the delete request is built
	const calls = [];
	const http = async (c, o) => { calls.push({ url: o.url, qs: o.qs }); return { statusCode: 200, headers: {}, body: [{ CalendarID: 7, CalendarName: 'ours' }] }; };
	const req = await send({ resource: 'calendar', operation: 'delete', calendar: { mode: 'id', value: '7' } }, { http });
	assert.deepEqual(calls, [{ url: '/calendar', qs: { calendarid: '7' } }]);
	assert.equal(req.method, 'DELETE');
	assert.deepEqual(req.qs, { id: '7' });
	// a read that returns other rows but not the asked ID is still refused (no trust in the first row)
	const other = async () => ({ statusCode: 200, headers: {}, body: [{ ServiceID: 694600 }] });
	await assert.rejects(() => send({ resource: 'service', operation: 'delete', service: { mode: 'id', value: '7' } }, { http: other }), /no service with the ID 7 in your account/);
});

// ---------- review round 5 ----------

test('an SMS switch is left out when off and sent only when on (it may cost credits)', async () => {
	const on = await send({ resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' }, start: '2026-11-10T10:00', end: '2026-11-10T11:00', additionalFields: { sendSms: true } });
	assert.equal(form(on).sms, '1');
	const off = await send({ resource: 'appointment', operation: 'create', calendar: { mode: 'id', value: '1' }, start: '2026-11-10T10:00', end: '2026-11-10T11:00', additionalFields: { sendSms: false } });
	assert.equal('sms' in form(off), false);
});

test('the account-scoped delete check accepts either spelling of the service group ID', async () => {
	const sg = async () => ({ statusCode: 200, headers: {}, body: [{ ServiceGroupID: 9, ServiceGroupDE: 'ours' }] });
	const r = await send({ resource: 'serviceGroup', operation: 'delete', serviceGroup: { mode: 'id', value: '9' } }, { http: sg });
	assert.equal(r.method, 'DELETE');
	assert.deepEqual(r.qs, { servicegroupid: '9' });
});

test('a picker surfaces an eTermin XML error instead of an empty list', async () => {
	const methods = require('../dist/nodes/Etermin/v2/methods.js');
	const ctxOf = (body) => ({ getNode: () => ({ name: 'picker', type: 'n8n-nodes-etermin.etermin', typeVersion: 2 }), helpers: { httpRequestWithAuthentication: async () => body } });
	await assert.rejects(() => methods.listSearch.searchCalendars.call(ctxOf('<response><status>420</status><statusmsg>No write permission</statusmsg></response>')), /eTermin: No write permission/);
	const ok = await methods.listSearch.searchCalendars.call(ctxOf([{ CalendarID: 7, CalendarName: 'Room' }]));
	assert.deepEqual(ok.results, [{ name: 'Room', value: '7' }]);
});
