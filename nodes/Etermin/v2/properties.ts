import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { resources, type FieldSpec, type OperationSpec, type ResourceSpec } from './spec';
import { prepareRequest, processResponse } from './transport';
import './resources/appointment';
import './resources/contact';
import './resources/calendar';
import './resources/service';
import './resources/misc';

const V2 = { '@version': [{ _cnd: { gte: 2 } }] };

const weekdayOptions = [
	{ name: 'Sunday', value: '1' }, { name: 'Monday', value: '2' }, { name: 'Tuesday', value: '3' }, { name: 'Wednesday', value: '4' },
	{ name: 'Thursday', value: '5' }, { name: 'Friday', value: '6' }, { name: 'Saturday', value: '7' },
];

const locator = (field: FieldSpec, searchListMethod: string, label: string): Partial<INodeProperties> => ({
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	modes: [
		{ displayName: 'From List', name: 'list', type: 'list', placeholder: `Select a ${label}...`, typeOptions: { searchListMethod, searchable: true } },
		{
			displayName: 'By ID', name: 'id', type: 'string', placeholder: 'e.g. 12345',
			validation: [{ type: 'regex', properties: { regex: '^[1-9][0-9]*$', errorMessage: 'Enter a positive whole number' } }],
		},
	],
});

const multi = (loadOptionsMethod: string): Partial<INodeProperties> => ({ type: 'multiOptions', default: [], typeOptions: { loadOptionsMethod } });

/** Converts one field of the table into an n8n parameter. */
export function toProperty(field: FieldSpec, inCollection: boolean): INodeProperties {
	const base = {
		displayName: field.label,
		name: field.name,
		description: field.description,
		...(field.placeholder ? { placeholder: field.placeholder } : {}),
		...(field.required && !inCollection ? { required: true } : {}),
	};
	if (field.translations) {
		return {
			...base, type: 'fixedCollection', default: {}, placeholder: 'Add Language', typeOptions: { multipleValues: true },
			options: [{
				displayName: 'Entries', name: 'entries', values: [
					{ displayName: 'Language Code', name: 'language', type: 'string', default: '', placeholder: 'e.g. en', description: 'Two-letter language code' },
					{ displayName: 'Text', name: 'text', type: 'string', default: '', description: 'Text in this language' },
				],
			}],
		} as INodeProperties;
	}
	switch (field.type) {
		case 'boolean': case 'flag': return { ...base, type: 'boolean', default: (field.default as boolean) ?? false } as INodeProperties;
		case 'integer': return { ...base, type: 'number', typeOptions: { numberPrecision: 0 }, default: (field.default as number) ?? 0 } as INodeProperties;
		case 'number': return { ...base, type: 'number', default: (field.default as number) ?? 0 } as INodeProperties;
		case 'options': return {
			...base, type: 'options', default: field.default ?? '',
			options: (field.options ?? []).map((o) => ({ name: o.name, value: o.value, ...(o.description ? { description: o.description } : {}) })) as INodePropertyOptions[],
		} as INodeProperties;
		case 'dateTime': case 'dateTimeUtc': return { ...base, type: 'dateTime', default: '' } as INodeProperties;
		case 'calendar': return { ...base, ...locator(field, 'searchCalendars', 'calendar') } as INodeProperties;
		case 'service': return { ...base, ...locator(field, 'searchServices', 'service') } as INodeProperties;
		case 'serviceGroup': return { ...base, ...locator(field, 'searchServiceGroups', 'service group') } as INodeProperties;
		case 'contact': return { ...base, ...locator(field, 'searchContacts', 'contact') } as INodeProperties;
		case 'calendars': return { ...base, ...multi('getCalendars'), description: `${field.description}. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.` } as INodeProperties;
		case 'services': return { ...base, ...multi('getServices'), description: `${field.description}. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.` } as INodeProperties;
		case 'serviceGroups': return { ...base, ...multi('getServiceGroups'), description: `${field.description}. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.` } as INodeProperties;
		case 'weekdays': return { ...base, type: 'multiOptions', default: [], options: weekdayOptions } as INodeProperties;
		default: return { ...base, type: 'string', default: (field.default as string) ?? '', ...(field.multiline ? { typeOptions: { rows: 4 } } : {}) } as INodeProperties;
	}
}

const byName = (a: { displayName: string }, b: { displayName: string }) => a.displayName.localeCompare(b.displayName);

function operationProperties(op: OperationSpec): INodeProperties[] {
	const show = { ...V2, resource: [op.resource], operation: [op.value] };
	const props: INodeProperties[] = op.fields.map((field) => ({ ...toProperty(field, false), displayOptions: { show } }));
	for (const group of op.collections ?? []) {
		props.push({
			displayName: group.label, name: group.name, type: 'collection', placeholder: 'Add Field', default: {},
			displayOptions: { show },
			options: group.fields.map((field) => toProperty(field, true)).sort(byName),
		});
	}
	if (op.kind === 'list' && op.limit !== false) {
		props.push(
			{ displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, description: 'Whether to return all results or only up to a given limit', displayOptions: { show } },
			{ displayName: 'Limit', name: 'limit', type: 'number', default: 50, typeOptions: { minValue: 1 }, description: 'Max number of results to return', displayOptions: { show: { ...show, returnAll: [false] } } },
		);
	}
	if (op.simplified) {
		const selectable = [...new Set([...(op.idKeys ?? []), ...op.simplified, ...(op.selectable ?? [])])];
		props.push(
			{
				displayName: 'Output', name: 'output', type: 'options', default: 'simplified', displayOptions: { show },
				options: [
					{ name: 'Simplified', value: 'simplified', description: `Return up to ${op.simplified.length} essential fields` },
					{ name: 'Raw', value: 'raw', description: 'Return all fields eTermin provides' },
					{ name: 'Selected Fields', value: 'selected', description: 'Return the fields you choose, plus the ID' },
				],
			},
			{
				displayName: 'Fields', name: 'fieldsToInclude', type: 'multiOptions', default: [], displayOptions: { show: { ...show, output: ['selected'] } },
				description: 'Fields to return in addition to the ID',
				options: selectable.map((key) => ({ name: key, value: key })).sort((a, b) => a.name.localeCompare(b.name)),
			},
		);
	}
	return props;
}

/** 'Get Many' where a resource has it, otherwise its first operation. */
const defaultOperation = (r: ResourceSpec): string => r.operations.find((o) => o.value === 'getAll')?.value ?? r.operations[0].value;

export const propertiesV2: INodeProperties[] = [
	{
		displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, default: 'appointment', displayOptions: { show: V2 },
		options: resources.map((r) => ({ name: r.name, value: r.value, description: r.description })).sort((a, b) => a.name.localeCompare(b.name)),
	},
	...resources.map((r): INodeProperties => ({
		displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
		displayOptions: { show: { ...V2, resource: [r.value] } },
		default: defaultOperation(r),
		options: r.operations.map((op) => ({
			name: op.name, value: op.value, description: op.description, action: op.action,
			routing: {
				request: { method: op.method, url: op.path },
				send: { preSend: [prepareRequest] },
				output: { postReceive: [processResponse] },
			},
		})).sort((a, b) => a.name.localeCompare(b.name)),
	})),
	...resources.flatMap((r) => r.operations.flatMap(operationProperties)),
];
