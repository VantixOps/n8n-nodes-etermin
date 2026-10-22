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
