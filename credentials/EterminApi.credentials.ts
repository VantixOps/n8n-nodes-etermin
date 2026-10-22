import { createHmac, randomBytes } from 'node:crypto';
import type { IAuthenticate, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

const CRUD = ['GET', 'POST', 'PUT', 'DELETE'];
/** Every endpoint and method documented in the eTermin API (plus GET /company, measured on 22.10.2026). */
const ALLOWED: Record<string, string[]> = {
	'/anchortime': CRUD, '/anchortimedate': CRUD, '/appointment': CRUD, '/appointmentdeleted': ['GET'], '/appointmentsync': CRUD,
	'/bookingpagelogs': ['GET'], '/calendar': CRUD, '/calendarreturntime': CRUD, '/calendarservice': ['GET', 'POST', 'DELETE'],
	'/calendarsnonworkingtimes': CRUD, '/company': ['GET'], '/contact': CRUD, '/contactfrequency': ['GET', 'POST'], '/contactservice': ['GET', 'POST'],
	'/messagelogs': ['GET'], '/rating': ['GET'], '/service': CRUD, '/servicecalendar': ['GET'], '/servicegroup': CRUD, '/surveyresults': ['GET'],
	'/timeslots': ['GET'], '/usermapping': CRUD, '/voucher': CRUD, '/workingtimes': CRUD, '/workingtimesdate': CRUD,
};

export class EterminApi implements ICredentialType {
	name = 'eterminApi';
	displayName = 'eTermin API';
	icon = { light: 'file:../nodes/Etermin/etermin.svg', dark: 'file:../nodes/Etermin/etermin.dark.svg' } as const;
	documentationUrl = 'https://github.com/VantixOps/n8n-nodes-etermin#credentials';
	properties: INodeProperties[] = [
		{ displayName: 'Public Key', name: 'apiKey', type: 'string', typeOptions: { password: true }, required: true, default: '' },
		{ displayName: 'Private Key', name: 'privateKey', type: 'string', typeOptions: { password: true }, required: true, default: '' },
		{
			displayName: 'Account Time Zone', name: 'timeZone', type: 'string', default: '', placeholder: 'e.g. Europe/Berlin',
			description: "Time zone of your eTermin account (eTermin shows 'W. Europe Standard Time' for Europe/Berlin). Used to convert times that carry a time zone. Leave empty to use the workflow's time zone.",
		},
	];
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const { apiKey, privateKey } = credentials;
		if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) ||
			typeof privateKey !== 'string' || !privateKey.trim()) {
			throw new Error('Enter both eTermin API keys in the credential settings');
		}
		const method = requestOptions.method ?? 'GET';
		if (requestOptions.baseURL !== 'https://www.etermin.net/api' || !Object.hasOwn(ALLOWED, requestOptions.url) ||
			!ALLOWED[requestOptions.url].includes(method)) {
			throw new Error('This credential only supports the documented eTermin API endpoints');
		}
		// Fail closed on the request shape: the node only ever sends a urlencoded string body or a `qs` object.
		// Anything else (Buffer, FormData, stream, JSON body, or the form/formData/uri options) is refused, so the
		// parameter check below cannot be bypassed with a body it would not parse.
		const ro = requestOptions as unknown as Record<string, unknown>;
		const isPlainObject = (v: unknown): v is Record<string, unknown> =>
			typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
		if (ro.form !== undefined || ro.formData !== undefined || ro.uri !== undefined ||
			(requestOptions.qs !== undefined && !isPlainObject(requestOptions.qs)) ||
			(requestOptions.body !== undefined && typeof requestOptions.body !== 'string' && !isPlainObject(requestOptions.body))) {
			throw new Error('This credential only accepts the eTermin requests built by the node');
		}
		// Defence in depth: the node never sends these, and they are the only parameters that could run code or set a
		// login secret on the eTermin account. Reject them even if a request is crafted outside the node.
		const names = new Set<string>();
		if (isPlainObject(requestOptions.qs)) {
			for (const k of Object.keys(requestOptions.qs)) names.add(k.trim().toLowerCase());
		}
		if (typeof requestOptions.body === 'string') {
			for (const k of new URLSearchParams(requestOptions.body).keys()) names.add(k.trim().toLowerCase());
		} else if (isPlainObject(requestOptions.body)) {
			for (const k of Object.keys(requestOptions.body)) names.add(k.trim().toLowerCase());
		}
		if (names.has('jscode') || names.has('password')) {
			throw new Error('This credential does not allow custom booking-page scripts or passwords in eTermin requests');
		}
		const salt = randomBytes(16).toString('hex');
		return {
			...requestOptions,
			headers: { ...requestOptions.headers, publickey: apiKey, salt,
				signature: createHmac('sha256', privateKey).update(salt).digest('base64') },
			disableFollowRedirect: true,
			timeout: 30000,
		};
	};
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://www.etermin.net/api', url: '/calendar', method: 'GET' },
	};
}
