import { createHmac, randomBytes } from 'node:crypto';
import type { IAuthenticate, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class EterminApi implements ICredentialType {
	name = 'eterminApi';
	displayName = 'eTermin API';
	icon = { light: 'file:../nodes/Etermin/etermin.svg', dark: 'file:../nodes/Etermin/etermin.dark.svg' } as const;
	documentationUrl = 'https://www.etermin.net/online-terminplaner-api';
	properties: INodeProperties[] = [
		{ displayName: 'Public Key', name: 'apiKey', type: 'string', typeOptions: { password: true }, required: true, default: '' },
		{ displayName: 'Private Key', name: 'privateKey', type: 'string', typeOptions: { password: true }, required: true, default: '' },
	];
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const { apiKey, privateKey } = credentials;
		if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) ||
			typeof privateKey !== 'string' || !privateKey.trim()) {
			throw new Error('Enter both eTermin API keys in the credential settings');
		}
		if (requestOptions.baseURL !== 'https://www.etermin.net/api' ||
			!['/calendar', '/service', '/timeslots'].includes(requestOptions.url) ||
			(requestOptions.method !== undefined && requestOptions.method !== 'GET')) {
			throw new Error('This credential only supports the documented eTermin read endpoints');
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
