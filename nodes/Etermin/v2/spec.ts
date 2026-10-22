/**
 * One table describes every eTermin operation. The node's UI, the request and the tests are all derived from it,
 * so a field can never exist in the UI but be missing from the request (or the other way round).
 */
export type FieldType =
	| 'string' | 'email' | 'integer' | 'number'
	| 'boolean' // sent as true / false
	| 'flag' // sent as 1 / 0 (eTermin documents these switches as "1 = yes, 0 = no")
	| 'options' | 'date' | 'dateTime' | 'dateTimeUtc' | 'time'
	| 'id' | 'idList'
	| 'calendar' | 'calendars' | 'service' | 'services' | 'serviceGroup' | 'serviceGroups' | 'contact'
	| 'weekdays';

export interface FieldSpec {
	/** n8n parameter name (camelCase, unique per meaning across the node) */
	name: string;
	/** eTermin parameter name */
	apiName: string;
	label: string;
	type: FieldType;
	description: string;
	required?: boolean;
	default?: string | number | boolean;
	options?: Array<{ name: string; value: string | number; description?: string }>;
	placeholder?: string;
	multiline?: boolean;
	/** For texts that eTermin stores per language: parameter prefix, e.g. "service" → servicede, serviceen … */
	translations?: string;
	/**
	 * Switch that eTermin reads by presence, not by value: sending it as 0 still turns it on
	 * (measured 22.10.2026: checkexist=0 blocks a double booking exactly like checkexist=1; only leaving it
	 * out books). Such a switch is left out when it is off, on every method, so "off" really means off.
	 */
	omitWhenOff?: boolean;
}

export interface CollectionSpec {
	name: string;
	label: string;
	fields: FieldSpec[];
}

export interface OperationSpec {
	resource: string;
	value: string;
	name: string;
	action: string;
	description: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	path: string;
	kind: 'list' | 'get' | 'write' | 'delete';
	fields: FieldSpec[];
	collections?: CollectionSpec[];
	/** Fixed parameters sent with every request of this operation */
	fixed?: Record<string, string>;
	/** Extra validation across fields; throw an Error with a helpful message */
	check?: (parameters: Record<string, string>) => void;
	/** Fields of the simplified output (max. 10, most useful first). Undefined = raw output only. */
	simplified?: string[];
	/** Fields offered in 'Selected Fields' */
	selectable?: string[];
	/** Identifier fields that are always kept in simplified / selected output */
	idKeys?: string[];
	/** false = no Return All / Limit */
	limit?: false;
	/**
	 * Appointment ID handling. eTermin reads appointments by numeric ID ('appid') but updates them by external ID ('id'),
	 * and deletions with email or sync also need the external ID. The node looks it up so users only handle one ID.
	 */
	resolve?: 'externalIdAlways' | 'externalIdWhenNotifying' | 'voucherIid';
	/**
	 * Date parameters whose end eTermin treats as exclusive (measured 22.10.2026: start=end=2026-11-03 finds nothing).
	 * The node adds one day so that the date the user enters is included.
	 */
	inclusiveEnd?: string[];
	/** eTermin ignores these fields when creating (measured: POST /calendar ignores the name); the node sets them right after creating. */
	followUpUpdate?: boolean;
	/** Pairs of [local time parameter, UTC parameter]: an empty UTC parameter is derived from the local one */
	deriveUtc?: Array<[string, string]>;
	/** Delete of several records: return how many were deleted instead of failing on 0 */
	reportCount?: boolean;
	/** After creating an appointment, look up its numeric ID (eTermin only returns the external ID) */
	lookupNumericId?: boolean;
	/** Copies a response header into every output item, e.g. eTermin's next sync token */
	headerToField?: { header: string; field: string };
	/**
	 * Delete endpoints whose answer does not reveal whether a record was removed
	 * (measured 22.10.2026: DELETE /calendar, /service, /servicegroup answer "deleted" even for an ID this
	 * account does not have). Before deleting, the node reads the record by ID (reads are account-scoped) and
	 * refuses when it is not found, so a wrong or made-up ID is never sent to the delete.
	 */
	existsCheck?: { getPath: string; getParam: string; idParam: string; idKey: string | string[]; label: string };
}

export interface ResourceSpec {
	value: string;
	name: string;
	description: string;
	operations: OperationSpec[];
}

const registry = new Map<string, OperationSpec>();
export const resources: ResourceSpec[] = [];

export function register(resource: ResourceSpec): void {
	resources.push(resource);
	for (const op of resource.operations) registry.set(`${op.resource}:${op.value}`, op);
}

export function findOperation(resource: string, operation: string): OperationSpec | undefined {
	return registry.get(`${resource}:${operation}`);
}

// ---------- reusable fields ----------

export const f = {
	text: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'string', description, ...extra }),
	int: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'integer', description, ...extra }),
	num: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'number', description, ...extra }),
	bool: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'boolean', description, default: false, ...extra }),
	flag: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'flag', description, default: false, ...extra }),
	pick: (name: string, apiName: string, label: string, description: string, options: FieldSpec['options'], extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'options', description, options, default: options?.[0]?.value, ...extra }),
	date: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'date', description, placeholder: 'e.g. 2026-11-02', ...extra }),
	dateTime: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'dateTime', description, ...extra }),
	dateTimeUtc: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'dateTimeUtc', description, ...extra }),
	time: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'time', description, placeholder: 'e.g. 09:00', ...extra }),
	id: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'id', description, placeholder: 'e.g. 12345', ...extra }),
	email: (name: string, apiName: string, label: string, description: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name, apiName, label, type: 'email', description, placeholder: 'e.g. nathan@example.com', ...extra }),
	calendar: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'calendar', apiName, label: 'Calendar', type: 'calendar', description: 'The eTermin calendar (employee or resource)', ...extra }),
	calendars: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'calendars', apiName, label: 'Calendars', type: 'calendars', description: 'One or more calendars', ...extra }),
	service: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'service', apiName, label: 'Service', type: 'service', description: 'The bookable service', ...extra }),
	services: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'services', apiName, label: 'Services', type: 'services', description: 'One or more bookable services', ...extra }),
	serviceGroup: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'serviceGroup', apiName, label: 'Service Group', type: 'serviceGroup', description: 'The service group', ...extra }),
	serviceGroups: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'serviceGroups', apiName, label: 'Service Groups', type: 'serviceGroups', description: 'One or more service groups', ...extra }),
	weekdays: (apiName: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
		({ name: 'weekdays', apiName, label: 'Weekdays', type: 'weekdays', description: 'Days of the week', ...extra }),
};

export const required = (field: FieldSpec): FieldSpec => ({ ...field, required: true });

/** The 20 free "additional" fields eTermin offers on appointments and contacts. */
export const additionalFields = (target: string): FieldSpec[] => Array.from({ length: 20 }, (_, i) =>
	f.text(`additional${i + 1}`, `additional${i + 1}`, `Additional Field ${i + 1}`, `Value of additional ${target} field ${i + 1}, as configured in your eTermin account`));
