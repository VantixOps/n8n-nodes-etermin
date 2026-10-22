import { NodeOperationError } from 'n8n-workflow';
import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult, INodePropertyOptions } from 'n8n-workflow';

async function read(ctx: ILoadOptionsFunctions, url: string, qs: IDataObject = {}): Promise<IDataObject[]> {
	const body = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'eterminApi', {
		method: 'GET', baseURL: 'https://www.etermin.net/api', url, qs, headers: { Accept: 'application/json' },
		disableFollowRedirect: true, timeout: 30000,
	});
	// eTermin can answer with an XML error (e.g. a read-only or wrong key) instead of JSON. Show that as a clear
	// message rather than an empty list that looks like "no entries".
	let parsed: unknown = body;
	if (typeof body === 'string') {
		const text = body.trim();
		if (text === '') return [];
		try {
			parsed = JSON.parse(text);
		} catch {
			const message = /<statusmsg>([\s\S]*?)<\/statusmsg>/i.exec(text)?.[1]?.trim();
			throw new NodeOperationError(ctx.getNode(), message ? `eTermin: ${message}` : 'eTermin returned an unexpected answer. Check the API keys in the credential.');
		}
	}
	return Array.isArray(parsed) ? (parsed as IDataObject[]) : [];
}

const calendars = async (ctx: ILoadOptionsFunctions) => (await read(ctx, '/calendar'))
	.map((c) => ({ name: String(c.CalendarName ?? c.CalendarID), value: String(c.CalendarID) }));
const services = async (ctx: ILoadOptionsFunctions) => (await read(ctx, '/service', { languageid: 'EN' }))
	.map((s) => ({ name: String(s.Service ?? s.ServiceID), value: String(s.ServiceID) }));
const serviceGroups = async (ctx: ILoadOptionsFunctions) => (await read(ctx, '/servicegroup', { languageid: 'EN' }))
	.map((g) => ({ name: String(g.ServiceGroup ?? g.ServiceGroupEN ?? g.ServiceGroupDE ?? g.ServicegroupID), value: String(g.ServicegroupID ?? g.ServiceGroupID) }));

/** Contacts can be many: an email search is done by eTermin, other searches filter the list; at most 100 results. */
async function contacts(ctx: ILoadOptionsFunctions, filter?: string): Promise<INodePropertyOptions[]> {
	const term = (filter ?? '').trim();
	const rows = await read(ctx, '/contact', term.includes('@') ? { email: term } : {});
	return rows.map((c) => {
		const name = [c.FirstName, c.LastName].filter((x) => typeof x === 'string' && x.trim()).join(' ');
		const label = [name, c.Email].filter((x) => typeof x === 'string' && x.trim()).join(' – ');
		return { name: label || `Contact ${String(c.cid)}`, value: String(c.cid) };
	});
}

function search(all: INodePropertyOptions[], filter?: string): INodeListSearchResult {
	const term = (filter ?? '').toLowerCase();
	const results = all.filter((o) => !term || o.name.toLowerCase().includes(term) || String(o.value) === term)
		.sort((a, b) => a.name.localeCompare(b.name));
	return { results };
}

export const listSearch = {
	async searchCalendars(this: ILoadOptionsFunctions, filter?: string) { return search(await calendars(this), filter); },
	async searchServices(this: ILoadOptionsFunctions, filter?: string) { return search(await services(this), filter); },
	async searchServiceGroups(this: ILoadOptionsFunctions, filter?: string) { return search(await serviceGroups(this), filter); },
	async searchContacts(this: ILoadOptionsFunctions, filter?: string) {
		const found = search(await contacts(this, filter), filter && filter.includes('@') ? undefined : filter);
		return { results: found.results.slice(0, 100) };
	},
};

export const loadOptions = {
	async getCalendars(this: ILoadOptionsFunctions) { return (await calendars(this)).sort((a, b) => a.name.localeCompare(b.name)); },
	async getServices(this: ILoadOptionsFunctions) { return (await services(this)).sort((a, b) => a.name.localeCompare(b.name)); },
	async getServiceGroups(this: ILoadOptionsFunctions) { return (await serviceGroups(this)).sort((a, b) => a.name.localeCompare(b.name)); },
};
