import { additionalFields, f, register, required, type FieldSpec } from '../spec';

const contactId = (extra: Partial<FieldSpec> = {}): FieldSpec =>
	required({ name: 'contact', apiName: 'cid', label: 'Contact', type: 'contact', description: "The contact in eTermin; search by name or email, or enter its ID (field 'cid')", ...extra });

const details: FieldSpec[] = [
	f.text('salutation', 'salutation', 'Salutation', 'Salutation of the contact'),
	f.text('title', 'title', 'Title', 'Title of the contact, for example Dr.'),
	f.text('firstName', 'firstname', 'First Name', 'First name of the contact', { placeholder: 'e.g. Nathan' }),
	f.text('lastName', 'lastname', 'Last Name', 'Last name of the contact', { placeholder: 'e.g. Smith' }),
	f.email('email', 'email', 'Email', 'Email address of the contact'),
	f.text('phone', 'phone', 'Phone', 'Phone number of the contact'),
	f.date('birthday', 'birthday', 'Birthday', 'Date of birth of the contact'),
	f.text('company', 'company', 'Company', 'Company of the contact (the field must exist in your eTermin account)'),
	f.text('street', 'street', 'Street', 'Street of the contact'),
	f.text('zip', 'zip', 'ZIP Code', 'ZIP code of the contact'),
	f.text('city', 'city', 'City', 'City of the contact'),
	f.text('state', 'state', 'State', 'State or region of the contact'),
	f.text('country', 'country', 'Country', 'Country of the contact'),
	f.text('customerNumber', 'customernumber', 'Customer Number', 'Your customer number for this contact'),
	f.text('loginId', 'loginid', 'Login ID', 'Login name for the booking page, if customer login is used'),
	f.flag('newsletter', 'newsletter', 'Newsletter', 'Whether the contact receives the newsletter'),
	...additionalFields('contact'),
];

const simplified = ['cid', 'ExternalID', 'FirstName', 'LastName', 'Email', 'Phone', 'Company', 'CustomerNumber', 'LastAppointmentDate', 'Tags'];
const selectable = ['cid', 'ExternalID', 'CreationDate', 'Title', 'Salutation', 'FirstName', 'LastName', 'Email', 'Phone', 'Birthday', 'Company', 'Street',
	'ZIP', 'City', 'State', 'Country', 'CustomerNumber', 'Notes', 'LoginID', 'Activated', 'Language', 'LastAppointmentDate', 'Newsletter',
	'LimitedServices', 'Tags', ...Array.from({ length: 20 }, (_, i) => `Additional${i + 1}`)];

register({
	value: 'contact',
	name: 'Contact',
	description: 'Manage the customers in the eTermin CRM',
	operations: [
		{
			resource: 'contact', value: 'create', name: 'Create', action: 'Create contact',
			description: 'Add a new contact to the eTermin CRM', method: 'POST', path: '/contact', kind: 'write',
			fields: [],
			collections: [{
				name: 'contactFields', label: 'Contact Fields', fields: [
					...details,
					f.flag('updateIfExists', 'updatewhenexistsgdt', 'Update If Exists', 'Whether an existing contact with the same email (or name and birthday) is updated instead of creating a duplicate'),
				],
			}],
			check: (p) => {
				if (!p.email && !p.lastname) throw new Error("Enter at least 'Email' or 'Last Name' under 'Contact Fields'");
			},
		},
		{
			resource: 'contact', value: 'get', name: 'Get', action: 'Get contact',
			description: 'Retrieve a contact by ID', method: 'GET', path: '/contact', kind: 'get',
			fields: [contactId()], limit: false, simplified, selectable, idKeys: ['cid'],
		},
		{
			resource: 'contact', value: 'getAll', name: 'Get Many', action: 'Get many contacts',
			description: 'Retrieve contacts, optionally by email or creation date', method: 'GET', path: '/contact', kind: 'list',
			fields: [],
			collections: [{
				name: 'filters', label: 'Filters', fields: [
					f.email('email', 'email', 'Email', 'Only contacts with this email address'),
					f.text('externalId', 'id', 'External ID', "Only the contact with this external ID (field 'ExternalID')"),
					f.date('createdOn', 'creationdate', 'Created On', 'Only contacts created on this day'),
					f.date('createdSince', 'creationdateall', 'Created Since', 'Only contacts created on or after this day'),
				],
			}],
			check: (p) => { if (p.creationdate && p.creationdateall) throw new Error("Use either 'Created On' or 'Created Since', not both"); },
			simplified, selectable, idKeys: ['cid'],
		},
		{
			resource: 'contact', value: 'update', name: 'Update', action: 'Update contact',
			description: 'Change the details of a contact', method: 'PUT', path: '/contact', kind: 'write',
			fields: [contactId()],
			collections: [{
				name: 'updateFields', label: 'Update Fields', fields: [
					...details,
					f.text('tags', 'tags', 'Tags', 'Tags of the contact, separated by commas'),
					f.flag('limitedServices', 'limitedservices', 'Limit Bookable Services', "Whether the contact may only book the service groups set with 'Set Permissions' (needs customer login on the booking page)"),
				],
			}],
			check: (p) => { if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'"); },
		},
		{
			resource: 'contact', value: 'delete', name: 'Delete', action: 'Delete contact',
			description: 'Delete a contact permanently', method: 'DELETE', path: '/contact', kind: 'delete',
			fields: [contactId()],
		},
		{
			resource: 'contact', value: 'setBookingLimit', name: 'Set Booking Limit', action: 'Set booking limit of contact',
			description: 'Limit how many appointments a contact can book per week, month, quarter or year (needs customer login on the booking page)',
			method: 'POST', path: '/contactfrequency', kind: 'write',
			fields: [
				contactId(),
				required(f.bool('limited', 'limited', 'Limit Active', 'Whether the limit applies', { default: true })),
				required(f.int('frequency', 'frequency', 'Appointments Allowed', 'How many appointments the contact can book in the period', { default: 1 })),
				required(f.pick('period', 'frequencytype', 'Period', 'Period the limit refers to', [
					{ name: 'Week', value: 0 }, { name: 'Month', value: 1 }, { name: 'Quarter', value: 2 }, { name: 'Year', value: 3 },
				])),
			],
		},
		{
			resource: 'contact', value: 'getBookingLimit', name: 'Get Booking Limit', action: 'Get booking limit of contact',
			description: 'Retrieve the booking limit of a contact', method: 'GET', path: '/contactfrequency', kind: 'list', limit: false,
			fields: [contactId()],
		},
		{
			resource: 'contact', value: 'setPermissions', name: 'Set Permissions', action: 'Set permissions of contact',
			description: 'Allow a contact to book only certain service groups (needs customer login on the booking page)',
			method: 'POST', path: '/contactservice', kind: 'write',
			fields: [contactId(), required(f.serviceGroups('sgid', { description: 'Service groups the contact may book' }))],
		},
		{
			resource: 'contact', value: 'getPermissions', name: 'Get Permissions', action: 'Get permissions of contact',
			description: 'Retrieve the service groups a contact may book', method: 'GET', path: '/contactservice', kind: 'list', limit: false,
			fields: [contactId()],
		},
	],
});
