import { NodeOperationError, type IDataObject, type IExecuteSingleFunctions, type IHttpRequestOptions, type IN8nHttpFullResponse, type INodeExecutionData } from 'n8n-workflow';

const fields: Record<string, string[]> = {
	calendar: ['CalendarID', 'CalendarName', 'Enabled'],
	service: ['ServiceID', 'ServiceGroupID', 'Service', 'Info', 'TimeSlotMinutes', 'Price', 'Currency', 'Enabled'],
	timeSlot: ['start', 'end', 'calendarid', 'calendarname', 'available', 'cap', 'capmax', 'wl'],
};
function positiveId(value: unknown, label: string): number | undefined {
	if (value === '' || value === undefined) return undefined;
	if ((typeof value !== 'string' && typeof value !== 'number') || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
		throw new Error(`Enter a positive integer in '${label}'`);
	}
	return Number(value);
}

export async function prepareRequest(this: IExecuteSingleFunctions, request: IHttpRequestOptions): Promise<IHttpRequestOptions> {
	const resource = this.getNodeParameter('resource') as string;
	const qs: IDataObject = {};
	try {
		if (!Object.hasOwn(fields, resource)) throw new Error('Choose a supported resource');
		if (resource === 'calendar' || resource === 'timeSlot') {
			const id = positiveId(this.getNodeParameter('calendarId', ''), 'Calendar ID');
			if (id !== undefined) qs.calendarid = id;
		}
		if (resource === 'service' || resource === 'timeSlot') {
			const id = positiveId(this.getNodeParameter('serviceId', ''), 'Service ID');
			if (id !== undefined) qs[resource === 'service' ? 'id' : 'serviceid'] = resource === 'service' ? id : String(id);
		}
		if (resource === 'service') {
			const language = this.getNodeParameter('languageId', 'EN');
			if (typeof language !== 'string' || !/^[a-z]{2}$/i.test(language)) throw new Error("Enter a two-letter code such as EN or DE in 'Language Code'");
			qs.languageid = language.toUpperCase();
		}
		if (resource === 'timeSlot') {
			const date = this.getNodeParameter('date');
			if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
				throw new Error("Enter a real calendar date as YYYY-MM-DD in 'Date'");
			}
			qs.date = date;
		}
		return { ...request, qs, disableFollowRedirect: true, timeout: 30000 };
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error);
	}
}

export async function processResponse(this: IExecuteSingleFunctions, items: INodeExecutionData[], response: IN8nHttpFullResponse): Promise<INodeExecutionData[]> {
	const resource = this.getNodeParameter('resource') as string;
	const requiredId = resource === 'calendar' ? 'CalendarID' : resource === 'service' ? 'ServiceID' : 'calendarid';
	if (!Object.hasOwn(fields, resource) || !Array.isArray(response.body) || response.body.some((row: unknown) =>
		row === null || typeof row !== 'object' || Array.isArray(row) || !Object.hasOwn(row, requiredId))) {
		throw new NodeOperationError(this.getNode(), 'eTermin returned an unexpected response. Check API access and the selected resource.');
	}
	const output = this.getNodeParameter('output', 'simplified') as string;
	if (!['simplified', 'raw', 'selected'].includes(output)) {
		throw new NodeOperationError(this.getNode(), "Choose a supported 'Output' mode");
	}
	const selected = output === 'selected' ? String(this.getNodeParameter('fields', '')).split(',').map((field) => field.trim()).filter(Boolean) : fields[resource];
	const keys = [...new Set([requiredId, ...selected])];
	const returnAll = this.getNodeParameter('returnAll', true) as boolean;
	const rows = response.body as IDataObject[];
	const limit = returnAll ? rows.length : this.getNodeParameter('limit', 50) as number;
	if (!returnAll && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
		throw new NodeOperationError(this.getNode(), "Set 'Limit' to an integer between 1 and 10000");
	}
	return rows.slice(0, limit).map((row, index) => ({
		...(items.length === rows.length ? items[index] : items[0]),
		pairedItem: { item: this.getItemIndex() },
		json: output !== 'raw' ? Object.fromEntries(keys.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])) : { ...row },
	}));
}
