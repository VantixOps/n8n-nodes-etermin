import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';
import { findOperation, type FieldSpec, type OperationSpec } from './spec';

type Ctx = IExecuteSingleFunctions;

// ---------- value conversion (shared with the tests through the compiled module) ----------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ZONED_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;
const TIME = /^(\d{1,2}):(\d{2})$/;

function realDate(y: string, m: string, d: string): boolean {
	const iso = `${y}-${m}-${d}`;
	const parsed = new Date(`${iso}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}

/** yyyy-mm-dd, checked against the real calendar. */
export function toApiDate(value: unknown, label: string): string {
	const text = typeof value === 'string' ? value.trim().slice(0, 10) : '';
	const m = DATE.exec(text);
	if (!m || !realDate(m[1], m[2], m[3])) throw new Error(`Enter a real date as YYYY-MM-DD in '${label}'`);
	return text;
}

/**
 * eTermin expects local wall-clock time "yyyy-mm-dd HH:MM" in the account time zone.
 * Values without an offset are used exactly as entered. Values with an offset (for example from $now)
 * are converted into the workflow time zone, which should match the eTermin account time zone.
 */
export function toApiDateTime(value: unknown, label: string, timeZone: string): string {
	const text = typeof value === 'string' ? value.trim() : '';
	const local = LOCAL_DATE_TIME.exec(text);
	if (local) {
		const [, y, mo, d, h, mi] = local;
		if (!realDate(y, mo, d) || Number(h) > 23 || Number(mi) > 59) throw new Error(`Enter a real date and time in '${label}'`);
		return `${y}-${mo}-${d} ${h}:${mi}`;
	}
	const zoned = ZONED_DATE_TIME.exec(text);
	if (zoned && realDate(zoned[1], zoned[2], zoned[3])) {
		const instant = new Date(text.replace(' ', 'T'));
		if (!Number.isNaN(instant.getTime())) {
			const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
				timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
			}).formatToParts(instant).map((p) => [p.type, p.value]));
			return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
		}
	}
	throw new Error(`Enter a date and time such as 2026-11-02 14:30 in '${label}'`);
}

/** The day after a yyyy-mm-dd date (calendar-correct, also across months and leap years). */
export function nextDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** Offset of a time zone at an instant, in milliseconds (positive east of UTC). */
function zoneOffset(instant: number, timeZone: string): number {
	const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
		timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
	}).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant / 1000) * 1000;
}

/** Local wall time "yyyy-mm-dd HH:MM" in a time zone, converted to the same moment in UTC (same format). */
export function wallTimeToUtc(wall: string, timeZone: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(wall);
	if (!m) throw new Error(`Cannot convert '${wall}' to UTC`);
	const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
	let utc = guess - zoneOffset(guess, timeZone);
	utc = guess - zoneOffset(utc, timeZone); // second pass handles daylight-saving changes
	return new Date(utc).toISOString().slice(0, 16).replace('T', ' ');
}

/** The account time zone from the credential (IANA name), otherwise the workflow time zone. */
export async function accountTimeZone(ctx: Ctx): Promise<string> {
	let zone = '';
	try {
		const credentials = await ctx.getCredentials('eterminApi');
		zone = String(credentials?.timeZone ?? '').trim();
	} catch {
		zone = '';
	}
	if (!zone) return ctx.getTimezone();
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
	} catch {
		throw new NodeOperationError(ctx.getNode(), `'${zone}' is not a known time zone`, {
			description: "Enter a time zone such as Europe/Berlin in the 'Account Time Zone' field of the eTermin credential.",
		});
	}
	return zone;
}

/** HH:MM (24 h). */
export function toApiTime(value: unknown, label: string): string {
	const text = typeof value === 'string' ? value.trim() : '';
	const m = TIME.exec(text);
	if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Enter a time such as 09:30 in '${label}'`);
	return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function toPositiveId(value: unknown, label: string): string {
	const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
	if (!/^[1-9]\d{0,17}$/.test(text)) throw new Error(`Enter a positive whole number in '${label}'`);
	return text;
}

function toIdList(value: unknown, label: string): string {
	const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value];
	const ids = list.map((v) => String(v ?? '').trim()).filter(Boolean);
	if (ids.length === 0) throw new Error(`Choose at least one entry in '${label}'`);
	return ids.map((id) => toPositiveId(id, label)).join(',');
}

function toNumber(value: unknown, label: string, integer: boolean): string {
	const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
	if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) throw new Error(`Enter ${integer ? 'a whole number' : 'a number'} in '${label}'`);
	return String(n);
}

/** Converts one node parameter into the string eTermin expects. Returns undefined to omit the field. */
export function encodeValue(field: FieldSpec, raw: unknown, timeZone: string): string | undefined {
	let value = raw;
	if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as IDataObject)) {
		value = (value as IDataObject).value; // resource locator
	}
	if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
		if (field.required) throw new Error(`Enter a value in '${field.label}'`);
		return undefined;
	}
	switch (field.type) {
		case 'boolean': return value === true || value === 'true' ? 'true' : 'false';
		case 'flag': return value === true || value === 'true' || value === 1 || value === '1' ? '1' : '0';
		case 'integer': return toNumber(value, field.label, true);
		case 'number': return toNumber(value, field.label, false);
		case 'options': return String(value);
		case 'date': return toApiDate(value, field.label);
		case 'dateTime': return toApiDateTime(value, field.label, timeZone);
		case 'dateTimeUtc': return toApiDateTime(value, field.label, 'UTC');
		case 'time': return toApiTime(value, field.label);
		case 'id': case 'calendar': case 'service': case 'serviceGroup': case 'contact': return toPositiveId(value, field.label);
		case 'idList': case 'calendars': case 'services': case 'serviceGroups': case 'weekdays': return toIdList(value, field.label);
		case 'email': {
			const text = String(value).trim();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`Enter a valid email address in '${field.label}'`);
			return text;
		}
		default: {
			const text = String(value);
			if (/[\r\n]/.test(text) && !field.multiline) throw new Error(`Remove line breaks from '${field.label}'`);
			return text;
		}
	}
}

// ---------- request ----------

function operationOf(ctx: Ctx): OperationSpec {
	const resource = ctx.getNodeParameter('resource') as string;
	const operation = ctx.getNodeParameter('operation') as string;
	const spec = findOperation(resource, operation);
	if (!spec) throw new NodeOperationError(ctx.getNode(), `The operation '${operation}' is not available for '${resource}'`);
	return spec;
}

/** Collects all fields of the operation (top-level and inside collections) into eTermin's parameter names. */
export function collectParameters(ctx: Ctx, spec: OperationSpec, timeZone: string): Record<string, string> {
	const out: Record<string, string> = {};
	// When reading or deleting, a switched-off filter is left out: eTermin reacts to the mere presence of some
	// parameters (measured 22.10.2026: smsonly=0 behaves like smsonly=1). When writing, "off" must be sent to switch a setting off.
	const omitOff = spec.method === 'GET' || spec.method === 'DELETE';
	const put = (field: FieldSpec, raw: unknown) => {
		const isOn = raw === true || raw === 'true' || raw === 1 || raw === '1';
		// A read/delete filter and a presence switch (field.omitWhenOff, e.g. checkexist) are left out when off,
		// because eTermin reacts to the mere presence of the parameter (measured 22.10.2026). A real setting
		// (type 'boolean', or a value switch such as sendemail=0 — measured to suppress the email) is still sent.
		if (!isOn && ((omitOff && (field.type === 'flag' || field.type === 'boolean')) || field.omitWhenOff)) return;
		if (field.translations) {
			for (const entry of ((raw as IDataObject)?.entries as IDataObject[] | undefined) ?? []) {
				const language = String(entry.language ?? '').trim().toLowerCase();
				if (!/^[a-z]{2}$/.test(language)) throw new Error(`Enter a two-letter language code such as en in '${field.label}'`);
				if (String(entry.text ?? '') !== '') out[`${field.translations}${language}`] = String(entry.text);
			}
			return;
		}
		const encoded = encodeValue(field, raw, timeZone);
		if (encoded !== undefined) out[field.apiName] = encoded;
	};
	for (const field of spec.fields) {
		put(field, ctx.getNodeParameter(field.name, field.type === 'boolean' || field.type === 'flag' ? undefined : ''));
	}
	for (const group of spec.collections ?? []) {
		const values = (ctx.getNodeParameter(group.name, {}) as IDataObject) ?? {};
		for (const field of group.fields) {
			if (Object.hasOwn(values, field.name)) put(field, values[field.name]);
		}
	}
	for (const [key, value] of Object.entries(spec.fixed ?? {})) out[key] = value;
	return out;
}

/** Looks up an appointment's external ID from its numeric ID (one extra read request). */
async function externalIdOf(ctx: Ctx, appid: string): Promise<string> {
	const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'eterminApi', {
		method: 'GET', baseURL: 'https://www.etermin.net/api', url: '/appointment', qs: { appid },
		headers: { Accept: 'application/json' }, disableFollowRedirect: true, timeout: 30000,
		ignoreHttpStatusErrors: true, returnFullResponse: true,
	})) as IN8nHttpFullResponse;
	const body = interpretResponse(ctx, response);
	// Only trust the row that really has this ID (never just the first row of a list).
	const rows = Array.isArray(body) ? (body as IDataObject[]) : body && typeof body === 'object' ? [body as IDataObject] : [];
	const row = rows.find((r) => String(r.ID) === String(appid));
	const external = row ? row.ExternalID : undefined;
	if (typeof external !== 'string' || external.trim() === '') {
		throw new NodeOperationError(ctx.getNode(), `eTermin has no appointment with the ID ${appid}`, {
			description: "Check the ID in 'Appointment'. Use the field 'ID' from 'Get Many' or 'Get'.", itemIndex: ctx.getItemIndex(),
		});
	}
	return external;
}

/** Refuses a delete when the ID is not in the account. Reads are account-scoped (measured 22.10.2026), so an
 *  empty read means the record is not ours and must not be deleted (some delete endpoints confirm success anyway). */
async function ensureExists(ctx: Ctx, check: NonNullable<OperationSpec['existsCheck']>, id: string): Promise<void> {
	const found = interpretResponse(ctx, (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'eterminApi', {
		method: 'GET', baseURL: 'https://www.etermin.net/api', url: check.getPath, qs: { [check.getParam]: id },
		headers: { Accept: 'application/json' }, disableFollowRedirect: true, timeout: 30000,
		ignoreHttpStatusErrors: true, returnFullResponse: true,
	})) as IN8nHttpFullResponse);
	const rows = Array.isArray(found) ? (found as IDataObject[]) : found && typeof found === 'object' ? [found as IDataObject] : [];
	const idKeys = Array.isArray(check.idKey) ? check.idKey : [check.idKey];
	if (!rows.some((r) => idKeys.some((k) => r[k] !== undefined && String(r[k]) === String(id)))) {
		fail(ctx, 404, `eTermin has no ${check.label} with the ID ${id} in your account`,
			'Deleting is refused because your account has no such record. Check the ID you entered.');
	}
}

export async function prepareRequest(this: Ctx, request: IHttpRequestOptions): Promise<IHttpRequestOptions> {
	const spec = operationOf(this);
	let parameters: Record<string, string>;
	const timeZone = await accountTimeZone(this);
	try {
		parameters = collectParameters(this, spec, timeZone);
		for (const [local, utc] of spec.deriveUtc ?? []) {
			if (parameters[local] && !parameters[utc]) parameters[utc] = wallTimeToUtc(parameters[local], timeZone);
		}
		spec.check?.(parameters);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: this.getItemIndex() });
	}
	for (const key of spec.inclusiveEnd ?? []) {
		if (parameters[key]) parameters[key] = nextDay(parameters[key]);
	}
	if (spec.resolve === 'voucherIid') {
		const code = parameters.id;
		const vouchers = interpretResponse(this, (await this.helpers.httpRequestWithAuthentication.call(this, 'eterminApi', {
			method: 'GET', baseURL: 'https://www.etermin.net/api', url: '/voucher', headers: { Accept: 'application/json' },
			disableFollowRedirect: true, timeout: 30000, ignoreHttpStatusErrors: true, returnFullResponse: true,
		})) as IN8nHttpFullResponse);
		const match = Array.isArray(vouchers) ? (vouchers as IDataObject[]).find((v) => String(v.id) === code) : undefined;
		if (!match || match.iid === undefined) {
			throw new NodeOperationError(this.getNode(), `eTermin has no voucher with the code '${code}'`, {
				description: "Check 'Voucher Code'. 'Get Many' lists all vouchers.", itemIndex: this.getItemIndex(),
			});
		}
		delete parameters.id; // sending id together with iid makes eTermin fail (measured 22.10.2026)
		parameters.iid = String(match.iid);
	}
	if (spec.resolve === 'externalIdAlways') {
		parameters.id = await externalIdOf(this, parameters.id);
	} else if (spec.resolve === 'externalIdWhenNotifying' && (parameters.sendemail === '1' || parameters.sync === '1')) {
		parameters.id = await externalIdOf(this, parameters.appid);
		delete parameters.appid;
	}
	if (spec.existsCheck) {
		await ensureExists(this, spec.existsCheck, parameters[spec.existsCheck.idParam]);
	}
	const base: IHttpRequestOptions = {
		...request,
		method: spec.method,
		url: spec.path,
		disableFollowRedirect: true,
		timeout: 30000,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	};
	if (spec.method === 'GET' || spec.method === 'DELETE') return { ...base, qs: parameters, body: undefined };
	return {
		...base,
		qs: {},
		body: new URLSearchParams(parameters).toString(),
		headers: { ...(request.headers ?? {}), 'Content-Type': 'application/x-www-form-urlencoded' },
	};
}

// ---------- response ----------

function readXmlMessage(text: string): string | undefined {
	const m = /<statusmsg>([\s\S]*?)<\/statusmsg>/i.exec(text);
	return m ? m[1].trim() : undefined;
}

function parseBody(body: unknown): unknown {
	if (typeof body !== 'string') return body;
	const text = body.trim();
	if (text === '') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/** Raises an n8n error. eTermin's raw answer is not attached: it can contain customer names or emails that would end up in execution logs. */
function fail(ctx: Ctx, statusCode: number, message: string, description: string): never {
	throw new NodeApiError(ctx.getNode(), { statusCode } as unknown as JsonObject, {
		message, description, httpCode: String(statusCode), itemIndex: ctx.getItemIndex(),
	});
}

/** Turns eTermin's mixed answers (JSON, XML errors, empty text, status inside a 200) into clear n8n results or errors. */
export function interpretResponse(ctx: Ctx, response: IN8nHttpFullResponse): unknown {
	const status = response.statusCode;
	const body = parseBody(response.body);
	const xmlMessage = typeof body === 'string' ? readXmlMessage(body) : undefined;
	if (status === 401 || status === 403) {
		fail(ctx, status, 'eTermin did not accept the API keys', "Check the public and private key in the 'eTermin API' credential. The keys are shown in eTermin under API Schnittstellen (API interfaces) → API & Web-Push.");
	}
	if (status === 420) {
		fail(ctx, status, 'eTermin refused to change data with these API keys', 'The private key in the credential is probably a read-only key. Use the private key with write access from eTermin under API Schnittstellen (API interfaces) → API & Web-Push.');
	}
	if (status === 409) {
		fail(ctx, status, xmlMessage ? `eTermin: ${xmlMessage}` : 'eTermin: the time is no longer free',
			"The time is already taken. Pick a free time from 'Time Slot → Get Many', or switch off 'Check Availability' to book anyway.");
	}
	if (status === 429) {
		fail(ctx, status, 'eTermin received too many requests', "Wait a moment, or process fewer items at once using the node's 'Settings' → batching.");
	}
	if (status >= 400) {
		fail(ctx, status, xmlMessage ? `eTermin: ${xmlMessage}` : `eTermin answered with status ${status}`,
			status === 404 ? 'The record was not found. Check the ID you entered.' : 'Check the values you entered. The message above comes directly from eTermin.');
	}
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		const inner = Number((body as IDataObject).Status ?? (body as IDataObject).status);
		if (Number.isFinite(inner) && inner >= 400) {
			const msg = String((body as IDataObject).StatusMsg ?? (body as IDataObject).statusmsg ?? '');
			fail(ctx, inner, msg ? `eTermin: ${msg}` : `eTermin reported status ${inner}`, 'Check the values you entered. The message above comes directly from eTermin.');
		}
	}
	if (xmlMessage !== undefined) {
		// Success answers are XML too (measured 22.10.2026), e.g.
		// <response><id>QA-1</id><status>200</status><statusmsg>Voucher created successfully!</statusmsg></response>
		const text = String(body);
		const inner = Number(/<status>(\d+)<\/status>/i.exec(text)?.[1] ?? 200);
		if (inner >= 400) fail(ctx, inner, `eTermin: ${xmlMessage}`, 'Check the values you entered. The message above comes directly from eTermin.');
		const result: IDataObject = {};
		for (const [, tag, value] of text.matchAll(/<([a-z][\w]*)>([^<]*)<\/\1>/gi)) {
			const key = tag.toLowerCase() === 'statusmsg' ? 'message' : tag;
			if (tag.toLowerCase() !== 'request') result[key] = value.trim();
		}
		const stray = text.replace(/<([a-z][\w]*)>[^<]*<\/\1>/gi, '').replace(/<\/?[a-z][\w]*\s*\/?>/gi, '').trim();
		if (stray) result.referenceCode = stray; // e.g. "AB764604" after creating an appointment
		result.status = inner;
		return result;
	}
	return body;
}

function pick(row: IDataObject, keys: string[]): IDataObject {
	return Object.fromEntries(keys.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

export async function processResponse(this: Ctx, items: INodeExecutionData[], response: IN8nHttpFullResponse): Promise<INodeExecutionData[]> {
	const spec = operationOf(this);
	const body = interpretResponse(this, response);
	const pairedItem = { item: this.getItemIndex() };
	const base = items[0] ?? { json: {} };

	if (spec.kind === 'delete') {
		// eTermin answers deletes of unknown records with status 200 and "0 record(s) deleted" or "0 records deleted!"
		// (measured 22.10.2026). Some endpoints always answer with a fixed text; those cannot be checked.
		const message = body && typeof body === 'object' ? String((body as IDataObject).message ?? '') : '';
		const count = /^(\d+) records?(?:\(s\))? deleted/i.exec(message);
		if (spec.reportCount) return [{ ...base, json: { deleted: true, count: count ? Number(count[1]) : null }, pairedItem }];
		if (count && Number(count[1]) === 0) fail(this, 404, 'eTermin deleted nothing', 'No record with this ID exists (any more). Check the ID you entered.');
		return [{ ...base, json: { deleted: true }, pairedItem }];
	}
	if (spec.kind === 'write' && spec.followUpUpdate && body && typeof body === 'object' && (body as IDataObject).id) {
		// The record already exists at this point: a failing follow-up must not look like a failed create
		// (a retry would create a duplicate), so it is reported in the output instead.
		try {
			const parameters = collectParameters(this, spec, await accountTimeZone(this));
			interpretResponse(this, (await this.helpers.httpRequestWithAuthentication.call(this, 'eterminApi', {
				method: 'PUT', baseURL: 'https://www.etermin.net/api', url: spec.path,
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ ...parameters, id: String((body as IDataObject).id) }).toString(),
				disableFollowRedirect: true, timeout: 30000, ignoreHttpStatusErrors: true, returnFullResponse: true,
			})) as IN8nHttpFullResponse);
			(body as IDataObject).settingsApplied = true;
		} catch (error) {
			(body as IDataObject).settingsApplied = false;
			(body as IDataObject).hint = `Created, but the settings could not be applied: ${(error as Error).message}. Use 'Update' with the returned id.`;
		}
	}
	if (spec.kind === 'write' && spec.lookupNumericId && body && typeof body === 'object' && (body as IDataObject).id) {
		// eTermin answers a new appointment with its external ID; Get, Update and Delete use the numeric ID.
		const result = body as IDataObject;
		result.externalId = result.id;
		delete result.id;
		try {
			const found = interpretResponse(this, (await this.helpers.httpRequestWithAuthentication.call(this, 'eterminApi', {
				method: 'GET', baseURL: 'https://www.etermin.net/api', url: '/appointment', qs: { id: String(result.externalId) },
				headers: { Accept: 'application/json' }, disableFollowRedirect: true, timeout: 30000,
				ignoreHttpStatusErrors: true, returnFullResponse: true,
			})) as IN8nHttpFullResponse);
			const row = Array.isArray(found) ? (found as IDataObject[]).find((r) => String(r.ExternalID) === String(result.externalId)) : undefined;
			if (row && row.ID !== undefined) result.ID = row.ID;
		} catch {
			// the booking itself succeeded; the numeric ID can still be looked up with 'Get by External ID'
		}
	}
	if (spec.kind === 'write') {
		const json: IDataObject = body === undefined ? { success: true }
			: Array.isArray(body) ? { success: true, data: body as IDataObject[] }
				: typeof body === 'object' ? { success: true, ...(body as IDataObject) }
					: { success: true, message: String(body) };
		return [{ ...base, json, pairedItem }];
	}

	let rows: IDataObject[];
	if (body === undefined) rows = [];
	else if (Array.isArray(body)) rows = body as IDataObject[];
	else if (typeof body === 'object') rows = [body as IDataObject];
	else fail(this, 502, 'eTermin returned an unexpected answer', 'Check API access and the selected resource. If this keeps happening, report it with the node version.');
	if (rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
		fail(this, 502, 'eTermin returned an unexpected answer', 'Check API access and the selected resource.');
	}

	if (spec.headerToField && rows.length === 0) {
		// No changes: still hand the (unchanged) sync token to the workflow so it can be stored.
		const value = response.headers?.[spec.headerToField.header] as string | undefined;
		return value === undefined ? [] : [{ ...base, json: { [spec.headerToField.field]: value, changes: 0 }, pairedItem }];
	}

	if (spec.kind === 'get' && rows.length === 0) {
		fail(this, 404, 'eTermin found no matching record', 'Check the ID you entered.');
	}

	if (spec.limit !== false && spec.kind === 'list') {
		const returnAll = this.getNodeParameter('returnAll', true) as boolean;
		if (!returnAll) {
			const limit = this.getNodeParameter('limit', 50) as number;
			if (!Number.isInteger(limit) || limit < 1) throw new NodeOperationError(this.getNode(), "Set 'Limit' to a whole number of at least 1", { itemIndex: this.getItemIndex() });
			rows = rows.slice(0, limit);
		}
	}

	let output = 'raw';
	if (spec.simplified) output = this.getNodeParameter('output', 'simplified') as string;
	const idKeys = spec.idKeys ?? [];
	const project = (row: IDataObject): IDataObject => {
		if (output === 'simplified') return pick(row, [...new Set([...idKeys, ...(spec.simplified ?? [])])]);
		if (output === 'selected') {
			const chosen = this.getNodeParameter('fieldsToInclude', []) as string[];
			return pick(row, [...new Set([...idKeys, ...chosen])]);
		}
		return { ...row };
	};
	const header = spec.headerToField;
	const headerValue = header ? (response.headers?.[header.header] as string | undefined) : undefined;
	return rows.map((row) => {
		const json = project(row);
		if (header && headerValue !== undefined) json[header.field] = headerValue;
		return { ...base, json, pairedItem };
	});
}
