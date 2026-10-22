import { f, register, required, type FieldSpec } from '../spec';

register({
	value: 'timeSlot',
	name: 'Time Slot',
	description: 'Free times customers can book',
	operations: [{
		resource: 'timeSlot', value: 'getAll', name: 'Get Many', action: 'Get many time slots',
		description: 'Find free time slots on a day or the next day with free slots', method: 'GET', path: '/timeslots', kind: 'list',
		fields: [required(f.date('slotDate', 'date', 'Date', 'Day to check for free slots'))],
		collections: [{
			name: 'filters', label: 'Filters', fields: [
				f.calendar('calendarid', { description: 'Only slots of this calendar; empty = all calendars' }),
				f.services('serviceid', { description: 'Services to book; needed if your account restricts calendars or working times to services' }),
				f.flag('searchAhead', 'rangesearch', 'Search Ahead', "Whether eTermin searches forward from 'Date' until it finds a day with free slots"),
				f.date('searchUntil', 'end', 'Search Until', "Last day for 'Search Ahead'"),
				f.int('capacity', 'capacity', 'Capacity', 'Capacity to search for, if capacities are used'),
				f.int('slotDuration', 'duration', 'Duration (Minutes)', 'Use a different duration than the service duration'),
				f.pick('cluster', 'cluster', 'Cluster', 'Whether clustering is used', [{ name: 'Account Default', value: '' }, { name: 'On', value: 1 }, { name: 'Off', value: 0 }]),
			],
		}],
		check: (p) => {
			if (p.end && p.rangesearch !== '1') throw new Error("'Search Until' only works with 'Search Ahead'");
			if (p.end && p.end < p.date) throw new Error("'Search Until' must not be before 'Date'");
		},
		simplified: ['start', 'end', 'calendarid', 'calendarname', 'available', 'cap', 'capmax', 'wl'],
		selectable: ['start', 'end', 'calendarid', 'calendarname', 'idandtimeslot', 'available', 'f', 'wl', 'wlstart', 'wlend', 'ecap', 'cap', 'capmax', 'adw', 'ads', 'hv'],
		idKeys: ['calendarid'],
	}],
});

const voucherFields: FieldSpec[] = [
	f.text('voucherDescription', 'description', 'Description', 'Description of the voucher'),
	f.num('valueInclVat', 'priceinclvat', 'Value Including VAT', 'Value of the voucher including VAT'),
	f.num('originalValue', 'priceoriginal', 'Original Value', "Usually the same as 'Value Including VAT'; matters for contingents"),
	f.bool('isPercentage', 'ispercentage', 'Value Is Percentage', 'Whether the value is a percentage'),
	f.int('contingentMax', 'contingentmax', 'Contingent', 'How many times the voucher can be used in total'),
	f.int('contingentUsed', 'contingentcounter', 'Contingent Used', 'How many times it has been used (usually 0 for a new voucher)'),
	f.date('validFrom', 'validfrom', 'Valid From', 'First day the voucher is valid'),
	f.date('validUntil', 'validuntil', 'Valid Until', 'Last day the voucher is valid'),
	f.calendars('calendarsassigned', { description: 'Calendars the voucher is valid for' }),
	f.services('servicesassigned', { description: 'Services the voucher is valid for' }),
	f.email('customerEmail', 'customeremail', 'Customer Email', 'Email of the customer the voucher belongs to'),
	f.bool('sendReminder', 'sendreminder', 'Send Reminder', 'Whether a reminder is sent when the contingent is used up'),
	f.bool('oncePerEmail', 'onetimevalidperemail', 'Limit per Email', "Whether each email address can use it only 'Uses per Email' times"),
	f.int('usesPerEmail', 'validxtimes', 'Uses per Email', "How often each email address can use it ('Limit per Email' must be on)"),
];
const voucherCheck = (p: Record<string, string>) => {
	if (p.validfrom && p.validuntil && p.validfrom > p.validuntil) throw new Error("'Valid Until' must not be before 'Valid From'");
};
const voucherCode = () => required(f.text('voucherCode', 'id', 'Voucher Code', 'Code of the voucher', { placeholder: 'e.g. SPRING25' }));

register({
	value: 'voucher',
	name: 'Voucher',
	description: 'Vouchers and contingents customers can redeem',
	operations: [
		{
			resource: 'voucher', value: 'create', name: 'Create', action: 'Create voucher',
			description: 'Add a new voucher', method: 'POST', path: '/voucher', kind: 'write',
			fields: [voucherCode()], collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: voucherFields }], check: voucherCheck,
		},
		{
			resource: 'voucher', value: 'getAll', name: 'Get Many', action: 'Get many vouchers',
			description: 'Retrieve all vouchers', method: 'GET', path: '/voucher', kind: 'list', fields: [],
			simplified: ['id', 'Description', 'PriceInclVAT', 'Currency', 'ContingentMax', 'ContingentCounter', 'ValidFrom', 'ValidUntil', 'CustomerEMail'], idKeys: ['id'],
		},
		{
			resource: 'voucher', value: 'update', name: 'Update', action: 'Update voucher',
			description: 'Change a voucher', method: 'PUT', path: '/voucher', kind: 'write',
			// eTermin updates vouchers only by their internal number 'iid' (measured 22.10.2026); the node looks it up from the code.
			fields: [voucherCode()], resolve: 'voucherIid', collections: [{ name: 'updateFields', label: 'Update Fields', fields: voucherFields }],
			check: (p) => {
				if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'");
				voucherCheck(p);
			},
		},
		{
			resource: 'voucher', value: 'delete', name: 'Delete', action: 'Delete voucher',
			description: 'Delete a voucher permanently', method: 'DELETE', path: '/voucher', kind: 'delete', fields: [voucherCode()],
		},
	],
});

register({
	value: 'rating',
	name: 'Rating',
	description: 'Ratings received from customers',
	operations: [{
		resource: 'rating', value: 'getAll', name: 'Get Many', action: 'Get many ratings',
		description: 'Retrieve all customer ratings', method: 'GET', path: '/rating', kind: 'list', fields: [],
		simplified: ['ID', 'Rating', 'CustomerFeedback', 'RatingDate', 'CalendarName', 'ServiceID', 'AppointmentExternalID', 'Publish', 'Reply'], idKeys: ['ID'],
	}],
});

register({
	value: 'surveyResult',
	name: 'Survey Result',
	description: 'Answers customers gave in surveys',
	operations: [{
		resource: 'surveyResult', value: 'getAll', name: 'Get Many', action: 'Get many survey results',
		description: 'Retrieve survey answers, by day or appointment', method: 'GET', path: '/surveyresults', kind: 'list', fields: [],
		collections: [{ name: 'filters', label: 'Filters', fields: [
			f.date('surveyDate', 'date', 'Date', 'Only results created on this day'),
			f.id('appointmentId', 'appid', 'Appointment ID', "Only results of this appointment (numeric 'ID', not the external ID)"),
		] }],
	}],
});

register({
	value: 'messageLog',
	name: 'Message Log',
	description: 'Emails and SMS that eTermin sent (last 30 days or less, depending on privacy settings)',
	operations: [
		{
			resource: 'messageLog', value: 'getAll', name: 'Get Many', action: 'Get many message logs',
			description: 'Retrieve sent emails and SMS, optionally for one appointment', method: 'GET', path: '/messagelogs', kind: 'list', fields: [],
			collections: [{ name: 'filters', label: 'Filters', fields: [
				f.id('appointmentId', 'appid', 'Appointment ID', "Only messages about this appointment (numeric 'ID', not the external ID)"),
			] }],
			simplified: ['id', 'receiver', 'subject', 'status', 'datesent', 'msgtype', 'nrsms'], idKeys: ['id'],
		},
		{
			resource: 'messageLog', value: 'get', name: 'Get', action: 'Get message log',
			description: 'Retrieve one sent message including its text', method: 'GET', path: '/messagelogs', kind: 'get', limit: false,
			fields: [required(f.id('messageId', 'id', 'Message ID', "ID of the message (field 'id' from 'Get Many')"))],
		},
		{
			resource: 'messageLog', value: 'getSmsCount', name: 'Get SMS Count', action: 'Get SMS count',
			description: 'Retrieve how many SMS were sent this month and last month', method: 'GET', path: '/messagelogs', kind: 'list', limit: false,
			fields: [], fixed: { smsonly: '1' },
		},
	],
});

register({
	value: 'bookingPageLog',
	name: 'Booking Page Log',
	description: 'Requests to your booking page (last 30 days)',
	operations: [{
		resource: 'bookingPageLog', value: 'getAll', name: 'Get Many', action: 'Get many booking page logs',
		description: 'Retrieve requests to your booking page since a day', method: 'GET', path: '/bookingpagelogs', kind: 'list',
		fields: [required(f.date('logsFrom', 'datefrom', 'From', 'First day to include (at most 30 days back)'))],
		collections: [{ name: 'options', label: 'Options', fields: [f.flag('summaryOnly', 'summaryonly', 'Summary Only', 'Whether only a summary is returned instead of every request')] }],
	}],
});

register({
	value: 'company',
	name: 'Company',
	description: 'Company profile of the eTermin account',
	operations: [{
		resource: 'company', value: 'get', name: 'Get', action: 'Get company',
		description: 'Retrieve the company profile, including time zone, language and currency', method: 'GET', path: '/company', kind: 'get', limit: false,
		fields: [],
		simplified: ['ID', 'CompanyName', 'Street', 'ZIP', 'City', 'Country', 'Email', 'Web', 'TimeZone', 'Currency'], idKeys: ['ID'],
	}],
});

const numberSearchFields: FieldSpec[] = [
	f.pick('matchType', 'valuetype', 'Match Type', 'How the number is matched', [
		{ name: 'Equals', value: 0 }, { name: 'From – To', value: 1 }, { name: 'Last Two Digits', value: 2 }, { name: 'Last Three Digits', value: 3 },
		{ name: 'Last Digit', value: 5 }, { name: 'First Digit', value: 6 }, { name: 'First Two Digits', value: 7 }, { name: 'First Three Digits', value: 8 },
	]),
	f.int('matchValue', 'value', 'Value', "Number to match (for 'Last … Digits' only those digits)"),
	f.int('valueFrom', 'valuefrom', 'From', "First number of the range (Match Type 'From – To')"),
	f.int('valueTo', 'valueto', 'To', "Last number of the range (Match Type 'From – To')"),
	f.calendars('calendarid', { description: 'Calendars for this number (empty = all)' }),
	f.serviceGroups('servicegroupid', { description: 'Service groups for this number (empty = all)' }),
];

register({
	value: 'numberSearch',
	name: 'Number Search Rule',
	description: "Rules of the booking page's number search",
	operations: [
		{
			resource: 'numberSearch', value: 'create', name: 'Create', action: 'Create number search rule',
			description: 'Add a number search rule', method: 'POST', path: '/usermapping', kind: 'write',
			fields: [], collections: [{ name: 'ruleFields', label: 'Rule Fields', fields: numberSearchFields }],
		},
		{
			resource: 'numberSearch', value: 'getAll', name: 'Get Many', action: 'Get many number search rules',
			description: 'Retrieve number search rules, or test which calendars and groups a number leads to', method: 'GET', path: '/usermapping', kind: 'list', fields: [],
			collections: [{ name: 'filters', label: 'Filters', fields: [f.int('searchValue', 'searchvalue', 'Test Number', 'Number to check against the rules')] }],
		},
		{
			resource: 'numberSearch', value: 'update', name: 'Update', action: 'Update number search rule',
			description: 'Change a number search rule', method: 'PUT', path: '/usermapping', kind: 'write',
			fields: [required(f.id('ruleId', 'id', 'Rule ID', "ID of the rule (field 'id' from 'Get Many')"))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: numberSearchFields }],
		},
		{
			resource: 'numberSearch', value: 'delete', name: 'Delete', action: 'Delete number search rule',
			description: 'Delete a number search rule permanently', method: 'DELETE', path: '/usermapping', kind: 'delete',
			fields: [required(f.id('ruleId', 'id', 'Rule ID', "ID of the rule (field 'id' from 'Get Many')"))],
		},
	],
});

const syncFields: FieldSpec[] = [
	required(f.text('externalId', 'appointmentid', 'External ID', 'ID of the appointment in your external system')),
	required(f.calendar('calendarid')),
	required(f.dateTime('syncStart', 'start', 'Start', 'Start in local time')),
	required(f.dateTime('syncEnd', 'end', 'End', 'End in local time')),
	f.dateTimeUtc('syncStartUtc', 'startutc', 'Start (UTC)', "Start in UTC. Leave empty to calculate it from 'Start' and the account time zone."),
	f.dateTimeUtc('syncEndUtc', 'endutc', 'End (UTC)', "End in UTC. Leave empty to calculate it from 'End' and the account time zone."),
	required(f.text('summary', 'summary', 'Title', 'Title (subject) of the appointment')),
	required(f.text('syncDescription', 'description', 'Description', 'Body text of the appointment', { multiline: true })),
];
const syncOptional: FieldSpec[] = [
	f.email('email', 'email', 'Email', 'Email address'),
	f.text('location', 'location', 'Location', 'Location'),
	f.text('recurrenceRule', 'recurrencerule', 'Recurrence Rule', 'Recurrence rule'),
	f.text('recurrenceParentId', 'recurrenceparentid', 'Recurrence Parent ID', 'ID of the parent recurring appointment'),
	f.text('sequence', 'sequence', 'Sequence', 'Sequence of the recurring appointment; empty if not recurring'),
];

register({
	value: 'externalAppointment',
	name: 'External Appointment',
	description: 'Sync appointments between eTermin and an external system',
	operations: [
		{
			resource: 'externalAppointment', value: 'create', name: 'Create', action: 'Create external appointment',
			description: 'Add an appointment from your external system', method: 'POST', path: '/appointmentsync', kind: 'write',
			deriveUtc: [['start', 'startutc'], ['end', 'endutc']],
			fields: syncFields,
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: [
				...syncOptional,
				f.flag('sendEmail', 'sendemail', 'Send Confirmation Email', "Whether eTermin sends a confirmation email to 'Email'"),
			] }],
			check: (p) => { if (p.start >= p.end) throw new Error("'End' must be after 'Start'"); },
		},
		{
			resource: 'externalAppointment', value: 'update', name: 'Update', action: 'Update external appointment',
			description: 'Change an appointment from your external system', method: 'PUT', path: '/appointmentsync', kind: 'write',
			deriveUtc: [['start', 'startutc'], ['end', 'endutc']],
			fields: syncFields,
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: syncOptional }],
			check: (p) => { if (p.start >= p.end) throw new Error("'End' must be after 'Start'"); },
		},
		{
			resource: 'externalAppointment', value: 'delete', name: 'Delete', action: 'Delete external appointment',
			description: 'Delete an appointment from your external system permanently', method: 'DELETE', path: '/appointmentsync', kind: 'delete',
			fields: [required(f.text('externalId', 'appointmentid', 'External ID', 'ID of the appointment in your external system'))],
		},
		{
			resource: 'externalAppointment', value: 'getChanges', name: 'Get Changes', action: 'Get changed appointments',
			description: 'Retrieve appointments added, changed or deleted in eTermin since the last sync token', method: 'GET', path: '/appointmentsync', kind: 'list',
			fields: [required(f.int('syncToken', 'synctoken', 'Sync Token', "Use 1 the first time, then the 'syncToken' from the previous result", { default: 1 }))],
			// Never cut: every change carries the next token, so a limit would silently skip changes.
			limit: false, headerToField: { header: 'synctoken', field: 'syncToken' },
		},
	],
});
