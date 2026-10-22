import { additionalFields, f, register, required, type FieldSpec } from '../spec';

const appointmentRef = (extra: Partial<FieldSpec> = {}): FieldSpec => ({
	name: 'appointment', apiName: 'appid', label: 'Appointment', type: 'id', required: true,
	description: "The appointment's numeric ID (field 'ID' in eTermin's output). The node looks up the external ID itself where eTermin needs it.",
	...extra,
});

const customer: FieldSpec[] = [
	f.text('salutation', 'salutation', 'Salutation', 'Salutation of the customer'),
	f.text('title', 'title', 'Title', 'Title of the customer, for example Dr.'),
	f.text('firstName', 'firstname', 'First Name', 'First name of the customer', { placeholder: 'e.g. Nathan' }),
	f.text('lastName', 'lastname', 'Last Name', 'Last name of the customer', { placeholder: 'e.g. Smith' }),
	f.email('email', 'email', 'Email', 'Email address of the customer; confirmations go here'),
	f.text('phone', 'phone', 'Phone', 'Phone number of the customer'),
	f.text('company', 'company', 'Company', 'Company of the customer (the field must exist in your eTermin account)'),
	f.text('street', 'street', 'Street', 'Street of the customer'),
	f.text('zip', 'zip', 'ZIP Code', 'ZIP code of the customer'),
	f.text('city', 'city', 'City', 'City of the customer'),
	f.text('customerNumber', 'customernumber', 'Customer Number', 'Your customer number for this person'),
	f.text('notes', 'notes', 'Notes', 'Notes on the appointment', { multiline: true }),
];

const shared: FieldSpec[] = [
	f.services('services', { description: 'Services booked with this appointment' }),
	f.text('servicesText', 'servicestext', 'Services Text', 'Names of the services as shown in emails'),
	f.text('servicesWithGroupsText', 'servicesinclsgtext', 'Services Text Including Groups', 'Names of the services including their service groups'),
	f.text('servicesAbbreviation', 'servicesabb', 'Services Abbreviation', 'Abbreviation of the services'),
	f.text('calendarName', 'calendarname', 'Calendar Name', 'Name of the calendar, used in notifications'),
	f.int('capacity', 'capacity', 'Capacity', 'Capacity this appointment uses, for example number of persons'),
	f.text('location', 'location', 'Location', 'Location of the appointment'),
	f.flag('sendEmail', 'sendemail', 'Send Confirmation Email', 'Whether eTermin sends a confirmation email to the customer'),
	f.flag('notifyProvider', 'notificationmsg', 'Notify Provider', 'Whether eTermin sends an information email to the appointment provider'),
	f.flag('syncExternal', 'sync', 'Sync With External Calendars', 'Whether the appointment is synchronized with connected external calendars'),
	f.int('reminderHours', 'appointmentreminderhours', 'First Reminder (Hours)', 'When the first reminder is sent, in hours before the appointment as a negative number, e.g. -24'),
	f.int('reminderHours2', 'appointmentreminderhours2', 'Second Reminder (Hours)', 'When the second reminder is sent, in hours before the appointment as a negative number'),
	f.int('cancelDeadline', 'canceldeadline', 'Cancellation Deadline (Minutes)', 'How many minutes before the start the customer can still cancel'),
	f.text('recurrenceRule', 'recurrencerule', 'Recurrence Rule', 'Recurrence rule in iCalendar format, e.g. DTSTART:20261126T083000Z DTEND:20261126T090000Z RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE;'),
	f.int('priceGross', 'pricegross', 'Price Gross (Cents)', 'Price including VAT in cents, e.g. 1850 for 18.50'),
	f.int('priceNet', 'pricenet', 'Price Net (Cents)', 'Price excluding VAT in cents, e.g. 1850 for 18.50'),
	f.int('vat', 'vat', 'VAT (Hundredths of a Percent)', 'VAT rate multiplied by 100, e.g. 1900 for 19%'),
];

const outputFields = ['ID', 'ExternalID', 'StartDateTime', 'EndDateTime', 'CalendarID', 'FirstName', 'LastName', 'Email', 'Phone', 'SelectedAnswers'];
const selectable = ['ID', 'ExternalID', 'StartDateTime', 'EndDateTime', 'StartDateTimeUTC', 'EndDateTimeUTC', 'CreationDate', 'CalendarID', 'Title',
	'LastName', 'FirstName', 'Email', 'Phone', 'Birthday', 'Notes', 'Salutation', 'Street', 'ZIP', 'Town', 'CustomerNumber', 'SelectedAnswers', 'Status',
	'BookingType', 'BookingLanguage', 'AppCapacity', 'LinkedAppID', 'RecurrenceRule', 'RecurrenceParentID', 'MultiAppID',
	...Array.from({ length: 20 }, (_, i) => `Additional${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `AttachmentLink${i + 1}`)];

register({
	value: 'appointment',
	name: 'Appointment',
	description: 'Book, change, cancel and look up appointments',
	operations: [
		{
			resource: 'appointment', value: 'create', name: 'Create', action: 'Create appointment',
			description: 'Book a new appointment in a calendar', method: 'POST', path: '/appointment', kind: 'write', lookupNumericId: true,
			fields: [
				required(f.calendar('calendarid')),
				required(f.dateTime('start', 'start', 'Start', 'Start of the appointment in the time zone of your eTermin account')),
				required(f.dateTime('end', 'end', 'End', 'End of the appointment in the time zone of your eTermin account')),
				// On by default: without it eTermin silently books the same time twice (measured 22.10.2026).
				// eTermin reads this switch by presence: checkexist=0 still blocks a taken time, only leaving it out books
				// (measured 22.10.2026). omitWhenOff makes "off" actually book.
				{ ...f.flag('checkAvailability', 'checkexist', 'Check Availability', 'Whether eTermin rejects the booking if the time is no longer free (recommended; may not work with capacities)', { default: true }), omitWhenOff: true },
			],
			collections: [
				{ name: 'customer', label: 'Customer', fields: [...customer, f.date('birthday', 'birthday', 'Birthday', 'Date of birth of the customer')] },
				{
					name: 'additionalFields', label: 'Additional Fields', fields: [
						...shared,
						f.flag('checkCapacity', 'capused', 'Check Capacity', 'Whether eTermin checks the capacity of the appointment'),
						f.int('maxCapacity', 'capmaxused', 'Maximum Capacity', 'Capacity that must not be exceeded'),
						f.pick('confirmation', 'manualconfirmed', 'Provider Confirmation', 'Whether the provider must confirm the appointment', [
							{ name: 'Confirmed Automatically', value: '' }, { name: 'Provider Must Confirm', value: 0 },
						]),
						f.flag('customerConfirms', 'confirmappointment', 'Customer Must Confirm', "Whether the customer must confirm the appointment (not together with 'Provider Must Confirm')"),
						f.int('confirmMinutes', 'confirmtime', 'Customer Confirmation Time (Minutes)', 'Minutes the customer has to confirm before the appointment is deleted'),
						f.text('language', 'language', 'Email Language', 'Language code for the emails, e.g. en or de', { placeholder: 'e.g. en' }),
						// Left out when off, never sent as 0: an SMS may cost credits, so "off" must not reach eTermin as a present switch.
						{ ...f.flag('sendSms', 'sms', 'Send Confirmation SMS', 'Whether eTermin sends a confirmation SMS to the phone number (may cost SMS credits)'), omitWhenOff: true },
						f.pick('calendarLinking', 'calselid', 'Calendar Linking', "Whether eTermin's calendar linking is applied (needs 'Services')", [
							{ name: 'Off', value: '' }, { name: 'On', value: -1 },
						]),
						f.text('bookingType', 'bookingtype', 'Booking Type', 'Information about how the appointment was booked'),
						f.text('bookingUrl', 'bookingurl', 'Booking URL', 'Address the appointment was booked from'),
						f.text('recurrenceParentId', 'recurrenceparentid', 'Recurrence Parent ID', 'ID of the parent recurring appointment'),
						f.flag('termsAccepted', 'agbaccepted', 'Terms Accepted', 'Whether the customer accepted the terms of service'),
						f.flag('privacyAccepted', 'dataprivacyaccepted', 'Privacy Terms Accepted', 'Whether the customer accepted the privacy terms'),
						f.flag('feedbackAccepted', 'feedbackpermissionaccepted', 'Feedback Email Allowed', 'Whether the customer may receive a feedback email'),
						f.flag('newsletter', 'newsletter', 'Newsletter Accepted', 'Whether the customer accepted the newsletter'),
						f.text('bookerInfo', 'bookerinfo', 'Booker Info', 'Information added to the notification for the provider'),
						f.flag('requireEmail', 'emailm', 'Require Email', 'Whether eTermin rejects the booking without an email address'),
						f.flag('requireLastName', 'lnm', 'Require Last Name', 'Whether eTermin rejects the booking without a last name'),
						f.flag('checkBlacklist', 'blacklist', 'Check Blacklist', "Whether eTermin rejects emails on the account's blacklist"),
						...additionalFields('appointment'),
					],
				},
			],
			check: (p) => { if (p.start >= p.end) throw new Error("'End' must be after 'Start'"); },
		},
		{
			resource: 'appointment', value: 'get', name: 'Get', action: 'Get appointment',
			description: 'Retrieve an appointment by its ID', method: 'GET', path: '/appointment', kind: 'get',
			fields: [appointmentRef()], limit: false, simplified: outputFields, selectable, idKeys: ['ID'],
		},
		{
			resource: 'appointment', value: 'getByExternalId', name: 'Get by External ID', action: 'Get appointment by external ID',
			description: "Retrieve an appointment by its external ID, e.g. the 'appointmentUID' from the eTermin Trigger", method: 'GET', path: '/appointment', kind: 'get',
			fields: [required(f.text('externalId', 'id', 'External ID', "The appointment's external ID (field 'ExternalID')"))],
			limit: false, simplified: outputFields, selectable, idKeys: ['ID'],
		},
		{
			resource: 'appointment', value: 'getAll', name: 'Get Many', action: 'Get many appointments',
			description: 'Retrieve appointments in a date range, for a customer or from the reservation list', method: 'GET', path: '/appointment', kind: 'list',
			fields: [
				f.date('startDate', 'start', 'Start Date', 'First day of the range (needed unless you filter by customer ID or use the reservation list)'),
				f.date('endDate', 'end', 'End Date', 'Last day of the range (included)'),
			],
			collections: [{
				name: 'filters', label: 'Filters', fields: [
					f.calendars('calendarid', { description: 'Only appointments in these calendars' }),
					f.flag('byCreationDate', 'bycreationdate', 'By Creation Date', 'Whether the date range refers to when appointments were created instead of when they take place'),
					f.id('contactId', 'cid', 'Contact ID', "Only appointments of this contact (the contact's 'cid'); no date range needed"),
					f.email('email', 'email', 'Email', 'Only appointments booked with this email address (needs a date range)'),
					f.flag('waitingList', 'wl', 'Waiting List Only', 'Whether to return only appointments on the waiting list (needs a date range)'),
					f.flag('reservationList', 'pbl', 'Reservation List Only', 'Whether to return only appointments on the reservation list; no date range needed'),
					f.pick('confirmation', 'manualconfirmed', 'Confirmation Status', 'Filter by confirmation status', [
						{ name: 'Any', value: '' }, { name: 'Unconfirmed Only', value: 0 },
					]),
					f.flag('noHolidays', 'noholidays', 'Exclude Holidays and Blocked Times', 'Whether to leave out holidays and blocked times'),
					f.flag('noHolidaysOnly', 'noholidays2', 'Exclude Holidays', 'Whether to leave out holidays but keep blocked times'),
					f.flag('basicOnly', 'limited', 'Basic Information Only', 'Whether eTermin returns less detail per appointment (faster for long lists)'),
				],
			}],
			inclusiveEnd: ['end'],
			check: (p) => {
				if (p.cid || p.pbl === '1') return;
				if (!p.start || !p.end) throw new Error("Enter 'Start Date' and 'End Date', or filter by 'Contact ID' or 'Reservation List Only'");
				if (p.start > p.end) throw new Error("'End Date' must not be before 'Start Date'");
			},
			simplified: outputFields, selectable, idKeys: ['ID'],
		},
		{
			resource: 'appointment', value: 'update', name: 'Update', action: 'Update appointment',
			description: 'Change time, calendar, customer details or settings of an appointment', method: 'PUT', path: '/appointment', kind: 'write',
			fields: [appointmentRef({ apiName: 'id' })], resolve: 'externalIdAlways',
			collections: [{
				name: 'updateFields', label: 'Update Fields', fields: [
					f.calendar('calendarid', { required: false }),
					f.dateTime('start', 'start', 'Start', 'New start in the time zone of your eTermin account'),
					f.dateTime('end', 'end', 'End', 'New end in the time zone of your eTermin account'),
					...customer,
					...shared,
					f.pick('confirmation', 'manualconfirmed', 'Provider Confirmation', 'Confirm the appointment or mark it as waiting for confirmation', [
						{ name: 'Unchanged', value: '' }, { name: 'Confirmed', value: 1 }, { name: 'Waiting for Confirmation', value: 0 },
					]),
					f.int('emailTemplate', 'msgtype', 'Email Template ID', "ID of the email template sent with 'Send Confirmation Email'"),
					{ ...f.flag('sendSmsUpdate', 'sendsms', 'Send SMS', 'Whether eTermin sends an SMS to the phone number (needs an SMS template; may cost SMS credits)'), omitWhenOff: true },
					f.int('smsTemplate', 'msgtypesms', 'SMS Template ID', 'ID of the SMS template'),
					f.int('linkedAppointment', 'linkedappidmanual', 'Linked Appointment ID', 'ID of an appointment to link with calendar linking'),
					...additionalFields('appointment'),
				],
			}],
			check: (p) => {
				if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'");
				if (p.start && p.end && p.start >= p.end) throw new Error("'End' must be after 'Start'");
			},
		},
		{
			resource: 'appointment', value: 'delete', name: 'Delete', action: 'Delete appointment',
			description: 'Cancel and delete an appointment permanently', method: 'DELETE', path: '/appointment', kind: 'delete',
			fields: [appointmentRef()], resolve: 'externalIdWhenNotifying',
			collections: [{
				name: 'options', label: 'Options', fields: [
					f.flag('sendEmail', 'sendemail', 'Send Cancellation Email', 'Whether eTermin emails the customer about the cancellation'),
					f.int('emailTemplate', 'msgtype', 'Email Template ID', 'ID of the email template to send'),
					f.flag('syncExternal', 'sync', 'Sync With External Calendars', 'Whether the deletion is synchronized with connected external calendars'),
				],
			}],
		},
		{
			resource: 'appointment', value: 'deleteMany', name: 'Delete Many', action: 'Delete appointments in date range',
			description: 'Delete all appointments of all calendars in a date range (at most 31 days) permanently', method: 'DELETE', path: '/appointment', kind: 'delete', reportCount: true,
			fields: [
				required(f.date('rangeStart', 'start', 'Start Date', 'First day of the range')),
				required(f.date('rangeEnd', 'end', 'End Date', 'Last day of the range (included)')),
			],
			inclusiveEnd: ['end'],
			check: (p) => {
				if (p.start > p.end) throw new Error("'End Date' must not be before 'Start Date'");
				// Guard against wiping a whole account by mistake (the node can be used by AI agents).
				// 31 days including start and end day (the node adds one day afterwards because eTermin's end is exclusive)
				if ((Date.parse(p.end) - Date.parse(p.start)) / 86400000 > 30) throw new Error('Delete at most 31 days at once; split longer ranges');
			},
		},
		{
			resource: 'appointment', value: 'getDeleted', name: 'Get Deleted', action: 'Get deleted appointments',
			description: 'Retrieve appointments that were deleted in a date range', method: 'GET', path: '/appointmentdeleted', kind: 'list',
			fields: [
				f.date('deletedFrom', 'start', 'Deleted From', "First day on which appointments were deleted (not needed with 'External ID')"),
				f.date('deletedUntil', 'end', 'Deleted Until', 'Last day on which appointments were deleted (included)'),
			],
			collections: [{ name: 'filters', label: 'Filters', fields: [
				f.text('externalId', 'id', 'External ID', 'Only this deleted appointment; the date range is then ignored'),
			] }],
			inclusiveEnd: ['end'],
			check: (p) => {
				if (p.id) return;
				if (!p.start || !p.end) throw new Error("Enter 'Deleted From' and 'Deleted Until', or an 'External ID' under 'Filters'");
				if (p.start > p.end) throw new Error("'Deleted Until' must not be before 'Deleted From'");
			},
			simplified: ['AppID', 'ExternalID', 'StartDateTime', 'EndDateTime', 'CalendarID', 'CalendarName', 'LastName', 'FirstName', 'Email', 'DeletedBy'],
			selectable: ['AppID', 'ExternalID', 'Reference', 'TimeStamp', 'CalendarID', 'CalendarName', 'StartDateTime', 'EndDateTime', 'StartDateTimeUTC', 'EndDateTimeUTC',
				'LastName', 'FirstName', 'Email', 'Phone', 'DeletedBy', 'ServicesText', 'Notes', 'CustomerNumber'],
			idKeys: ['AppID'],
		},
	],
});
