import { NodeConnectionTypes, type INodeType, type INodeTypeDescription, type INodeProperties } from 'n8n-workflow';
import { prepareRequest, processResponse } from './routing';

const operations: INodeProperties[] = [
	['calendar', 'Calendar', '/calendar'],
	['service', 'Service', '/service'],
	['timeSlot', 'Time Slot', '/timeslots'],
].map(([resource, label, url]) => ({
	displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
	displayOptions: { show: { resource: [resource] } }, default: 'getMany',
	options: [{ name: 'Get Many', value: 'getMany', description: `Retrieve available ${label.toLowerCase()} records`,
		action: `Get ${label.toLowerCase()} records`,
		routing: { request: { method: 'GET', url }, send: { preSend: [prepareRequest] }, output: { postReceive: [processResponse] } },
	}],
}));

export class Etermin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'eTermin', name: 'etermin',
		icon: { light: 'file:etermin.svg', dark: 'file:etermin.dark.svg' },
		group: ['transform'], version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read calendars, services and available time slots from eTermin',
		defaults: { name: 'eTermin' }, usableAsTool: true,
		inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'eterminApi', required: true }],
		requestDefaults: { baseURL: 'https://www.etermin.net/api', headers: { Accept: 'application/json' } },
		properties: [
			{ displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, default: 'calendar', options: [
				{ name: 'Calendar', value: 'calendar' }, { name: 'Service', value: 'service' }, { name: 'Time Slot', value: 'timeSlot' },
			] },
			...operations,
			{ displayName: 'Calendar ID', name: 'calendarId', type: 'string', default: '', placeholder: 'e.g. 42', description: 'Limit results to one calendar; leave empty for all calendars', displayOptions: { show: { resource: ['calendar', 'timeSlot'] } } },
			{ displayName: 'Service ID', name: 'serviceId', type: 'string', default: '', placeholder: 'e.g. 7', description: 'Limit results to one service; required for slots restricted to a service in your account', displayOptions: { show: { resource: ['service', 'timeSlot'] } } },
			{ displayName: 'Language Code', name: 'languageId', type: 'string', default: 'EN', placeholder: 'e.g. EN or DE', description: 'Two-letter language code for service names and descriptions, as configured in eTermin', displayOptions: { show: { resource: ['service'] } } },
			{ displayName: 'Date', name: 'date', type: 'string', required: true, default: '', placeholder: 'e.g. 2026-10-20', description: 'Calendar date in YYYY-MM-DD format, interpreted by eTermin account settings', displayOptions: { show: { resource: ['timeSlot'] } } },
			{ displayName: 'Return All', name: 'returnAll', type: 'boolean', default: true, description: 'Whether to return all results or only up to a given limit' },
			{ displayName: 'Limit', name: 'limit', type: 'number', default: 50, typeOptions: { minValue: 1, maxValue: 10000 }, description: 'Max number of results to return', displayOptions: { show: { returnAll: [false] } } },
			{ displayName: 'Output', name: 'output', type: 'options', default: 'simplified', options: [
				{ name: 'Simplified', value: 'simplified', description: 'Return the essential fields' },
				{ name: 'Raw', value: 'raw', description: 'Return all fields provided by eTermin' },
				{ name: 'Selected Fields', value: 'selected', description: 'Return selected fields and the record identifier' },
			] },
			{ displayName: 'Fields', name: 'fields', type: 'string', default: '', placeholder: 'e.g. CalendarName,Enabled', description: 'Comma-separated response field names; the resource identifier is always included', displayOptions: { show: { output: ['selected'] } } },
		],
	};
}
