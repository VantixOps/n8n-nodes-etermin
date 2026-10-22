import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { propertiesV1 } from './v1/properties';
import { propertiesV2 } from './v2/properties';
import { listSearch, loadOptions } from './v2/methods';

export class Etermin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'eTermin', name: 'etermin',
		icon: { light: 'file:etermin.svg', dark: 'file:etermin.dark.svg' },
		group: ['transform'], version: [1, 2], defaultVersion: 2,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Book and manage appointments, contacts, calendars and services in eTermin',
		defaults: { name: 'eTermin' }, usableAsTool: true,
		inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'eterminApi', required: true }],
		requestDefaults: { baseURL: 'https://www.etermin.net/api', headers: { Accept: 'application/json' } },
		properties: [...propertiesV1, ...propertiesV2],
	};

	methods = { listSearch, loadOptions };
}
