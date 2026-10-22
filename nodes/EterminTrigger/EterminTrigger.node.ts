import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
	type JsonObject,
} from 'n8n-workflow';

/**
 * Polls eTermin's change feed (GET /appointmentsync). Measured 22.10.2026 in a test account:
 * a new appointment arrives as SyncStatus "I", a change as "U", a deletion as "D". The response header "synctoken" is the
 * position to ask from next time. Asking with an older position still returns exactly the changes since then, so several
 * workflows can poll independently. Position 1 returns no history (only the current position); position 0 returns the
 * whole history.
 */
const STATUS_TO_EVENT: Record<string, string> = { I: 'created', U: 'modified', D: 'deleted' };
const MANUAL_SAMPLE = 5;
const SIMPLIFIED = ['ID', 'ExternalID', 'StartDateTime', 'EndDateTime', 'CalendarID', 'FirstName', 'LastName', 'Email', 'Phone', 'SelectedAnswers'];

export function toItems(rows: IDataObject[], events: string[], simplify: boolean): INodeExecutionData[] {
	return rows
		.map((row) => ({ event: STATUS_TO_EVENT[String(row.SyncStatus ?? '').toUpperCase()] ?? 'unknown', row }))
		.filter(({ event }) => events.includes(event))
		.map(({ event, row }) => ({
			json: simplify
				? { event, ...Object.fromEntries(SIMPLIFIED.filter((k) => Object.hasOwn(row, k)).map((k) => [k, row[k]])) }
				: { event, ...row },
		}));
}

export class EterminTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'eTermin Trigger',
		name: 'eterminTrigger',
		icon: { light: 'file:../Etermin/etermin.svg', dark: 'file:../Etermin/etermin.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when appointments are created, changed or deleted in eTermin',
		defaults: { name: 'eTermin Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'eterminApi', required: true }],
		properties: [
			{
				displayName: "Checks eTermin for changes at the interval below. No setup in eTermin is needed. To test, create or change an appointment in eTermin and click 'Fetch Test Event'.",
				name: 'notice', type: 'notice', default: '',
			},
			{
				displayName: 'Events', name: 'events', type: 'multiOptions', required: true, default: ['created', 'modified', 'deleted'],
				description: 'Appointment changes that start the workflow',
				options: [
					{ name: 'Appointment Created', value: 'created' },
					{ name: 'Appointment Deleted', value: 'deleted' },
					{ name: 'Appointment Modified', value: 'modified' },
				],
			},
			{
				displayName: 'Simplify', name: 'simplify', type: 'boolean', default: true,
				description: 'Whether to return a simplified version of the response instead of the raw data',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const state = this.getWorkflowStaticData('node') as { syncToken?: string };
		const isManual = this.getMode() === 'manual';
		// First activation: ask with 1 (no history, just the current position). A test run without a stored
		// position asks with 0 (whole history) and shows only the newest few changes.
		const token = state.syncToken ?? (isManual ? '0' : '1');
		const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'eterminApi', {
			method: 'GET', baseURL: 'https://www.etermin.net/api', url: '/appointmentsync', qs: { synctoken: token },
			headers: { Accept: 'application/json' }, disableFollowRedirect: true, timeout: 30000,
			ignoreHttpStatusErrors: true, returnFullResponse: true,
		})) as IN8nHttpFullResponse;

		if (response.statusCode >= 400) {
			const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? '');
			const message = /<statusmsg>([\s\S]*?)<\/statusmsg>/i.exec(text)?.[1]?.trim();
			// eTermin's raw answer is not attached: it can contain customer data that would end up in execution logs.
			throw new NodeApiError(this.getNode(), { statusCode: response.statusCode } as unknown as JsonObject, {
				message: message ? `eTermin: ${message}` : `eTermin answered with status ${response.statusCode}`,
				description: response.statusCode === 401 || response.statusCode === 403
					? "Check the keys in the 'eTermin API' credential."
					: 'Check the eTermin API access of your account.',
				httpCode: String(response.statusCode),
			});
		}
		let raw: unknown = response.body ?? [];
		if (typeof raw === 'string') {
			try {
				raw = raw.trim() === '' ? [] : JSON.parse(raw);
			} catch {
				throw new NodeApiError(this.getNode(), { statusCode: response.statusCode } as unknown as JsonObject, {
					message: 'eTermin returned an unexpected answer',
					description: 'Check the eTermin API access of your account. If this keeps happening, report it with the node version.',
				});
			}
		}
		let rows = (Array.isArray(raw) ? raw : []) as IDataObject[];
		// The new position comes in the 'synctoken' header. If changes arrive without it, the position cannot move and
		// the same changes would be delivered again on the next poll (measured: eTermin sends the header with changes).
		const headerToken = response.headers?.synctoken;
		// Only in normal polling: a manual test run stores no position, so it cannot deliver anything twice.
		if (!isManual && rows.length > 0 && (headerToken === undefined || String(headerToken) === '')) {
			throw new NodeApiError(this.getNode(), { statusCode: response.statusCode } as unknown as JsonObject, {
				message: 'eTermin returned changes without a new sync position',
				description: 'Stopping to avoid delivering the same changes again. If this keeps happening, report it with the node version.',
			});
		}
		const nextToken = String(headerToken ?? token);
		// A test run without a stored position would otherwise list every change ever made; show the newest few.
		if (isManual && state.syncToken === undefined) rows = rows.slice(-MANUAL_SAMPLE);

		// First activation: only remember where we are, do not replay older changes.
		if (state.syncToken === undefined && !isManual) {
			state.syncToken = nextToken;
			return null;
		}
		const items = toItems(rows, this.getNodeParameter('events', []) as string[], this.getNodeParameter('simplify', true) as boolean);
		if (!isManual) state.syncToken = nextToken;
		return items.length > 0 ? [items] : null;
	}
}
