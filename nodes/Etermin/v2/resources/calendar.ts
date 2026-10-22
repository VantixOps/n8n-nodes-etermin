import { f, register, required, type FieldSpec } from '../spec';

const calendarSettings: FieldSpec[] = [
	f.text('calendarName', 'calendarname', 'Calendar Name', 'Name of the calendar, used for all languages'),
	f.pick('descriptionDisplay', 'descriptiondisplaytype', 'Description Display', 'Where the description appears on the booking page', [
		{ name: 'Not Shown', value: 0 }, { name: 'Below Calendar Name', value: 1 }, { name: 'As Tooltip', value: 2 },
	]),
	f.bool('enableCapacity', 'enablecapacity', 'Enable Capacity', 'Whether several appointments can be booked at the same time'),
	f.int('maxCapacity', 'maxcapacity', 'Maximum Capacity', 'Maximum number of appointments at the same time'),
	f.bool('differentLocation', 'differentlocation', 'Different Location', 'Whether this calendar has its own address'),
	f.text('locationName', 'name', 'Location Name', 'Company name at the different location'),
	f.text('street', 'street', 'Street', 'Street of the location'),
	f.text('zip', 'zip', 'ZIP Code', 'ZIP code of the location'),
	f.text('city', 'city', 'City', 'City of the location'),
	f.text('country', 'country', 'Country', 'Country of the location'),
	f.text('telephone', 'telephone', 'Telephone', 'Telephone number of the location'),
	f.text('mobilePhone', 'mobilephone', 'Mobile Phone', 'Mobile phone number of the location'),
	f.email('locationEmail', 'emaillocation', 'Location Email', 'Email address of the location'),
	f.text('web', 'web', 'Website', 'Website of the location', { placeholder: 'e.g. https://example.com' }),
	f.bool('withinOpeningHours', 'completeappointmentwithinopeninghours', 'Complete Within Opening Hours', 'Whether idle or follow-up times must lie within the available times'),
	f.bool('smsNotification', 'smsnotification', 'SMS Notification', 'Whether the employee gets an SMS for new bookings (may cost SMS credits)'),
	f.text('smsPhone', 'smsphonenumber', 'SMS Phone Number', 'Phone number for SMS notifications'),
	f.num('smsHours', 'smstimespanhours', 'SMS Threshold (Hours)', 'Only send an SMS for appointments within this many hours'),
	f.pick('calendarType', 'calendartype', 'Calendar Type', 'Main calendar or sub calendar', [
		{ name: 'Main Calendar', value: 'false' }, { name: 'Sub Calendar', value: 'true' },
	]),
	f.bool('limitDuration', 'limittoduration', 'Limit Appointment Duration', "Whether only appointments up to 'Maximum Duration' are accepted"),
	f.num('maxDuration', 'maxduration', 'Maximum Duration (Minutes)', 'Longest appointment this calendar accepts'),
	f.bool('waitingNumber', 'waitingnr', 'Waiting Number', 'Whether a waiting number is calculated'),
	f.text('waitingPrefix', 'wnprefix', 'Waiting Number Prefix', 'Prefix of the waiting number'),
	f.num('waitingStart', 'wnstartnr', 'Waiting Number Start', 'First waiting number'),
	{ ...f.text('descriptions', 'description', 'Descriptions', 'Description of the calendar per language'), translations: 'description' },
];

const absenceFields: FieldSpec[] = [
	f.text('reason', 'reason', 'Reason', 'Reason or note for the absence'),
	f.bool('dynamic', 'nwtype', 'Dynamic Absence', 'Whether the absence is dynamic'),
	f.int('dynamicDays', 'dynamicdays', 'Dynamic Start (Days)', "Number of days until the dynamic absence begins ('Dynamic Absence' must be on)"),
];

const weekdayOptions = [
	{ name: 'Sunday', value: 1 }, { name: 'Monday', value: 2 }, { name: 'Tuesday', value: 3 }, { name: 'Wednesday', value: 4 },
	{ name: 'Thursday', value: 5 }, { name: 'Friday', value: 6 }, { name: 'Saturday', value: 7 },
];
const weekday = (name: string, apiName: string): FieldSpec => f.pick(name, apiName, 'Weekday', 'Day of the week', weekdayOptions);

const workingTimeFields: FieldSpec[] = [
	f.pick('enabled', 'enable', 'Status', 'Whether the working time is already considered', [{ name: 'Active', value: 1 }, { name: 'Inactive', value: 0 }]),
	f.pick('slotType', 'slottype', 'Valid For', 'Which bookings may use this working time', [
		{ name: 'Online and Internal Bookings', value: 0 }, { name: 'Internal Bookings Only', value: 1 },
	]),
	f.services('validwithserviceid', { description: 'Only these services can be booked in this working time' }),
	f.pick('servicesExclusive', 'allserviceidsrequired', 'Service Restriction', "How 'Services' is applied", [
		{ name: 'All Services of the Calendar', value: 0 }, { name: 'Only the Selected Services', value: 1 },
	]),
	f.int('maxAppointments', 'nrapps', 'Maximum Appointments', 'Number of appointments bookable in this working time (-1 = unlimited)'),
	f.pick('weekType', 'weektype', 'Repeat', 'In which weeks the working time applies', [
		{ name: 'Every Week', value: 0 }, { name: 'Odd Weeks', value: 1 }, { name: 'Even Weeks', value: 2 },
		{ name: 'First Occurrence in Month', value: 3 }, { name: 'Second Occurrence in Month', value: 4 }, { name: 'Third Occurrence in Month', value: 5 },
	]),
	f.int('locationId', 'locationid', 'Location ID', 'Location of this working time, if locations are used'),
	f.int('periodId', 'calendarintervalid', 'Period ID', 'Period of this working time, if periods are used'),
];

const specialTimeFields: FieldSpec[] = [
	f.text('reason', 'reason', 'Reason', 'Internal note for this working time'),
	f.pick('slotType', 'slottype', 'Valid For', 'Which bookings may use this working time', [
		{ name: 'Online and Internal Bookings', value: 0 }, { name: 'Internal Bookings Only', value: 1 },
	]),
	f.int('maxAppointments', 'nrapps', 'Maximum Appointments', 'Number of appointments bookable in this working time (-1 = unlimited)'),
	f.bool('replaceDay', 'overwriteday', 'Replace Regular Hours', 'Whether the regular working time of this day is disabled'),
	f.services('serviceids', { description: 'Only these services can be booked in this working time' }),
	f.pick('servicesExclusive', 'allserviceidsrequired', 'Service Restriction', "How 'Services' is applied", [
		{ name: 'All Services of the Calendar', value: 0 }, { name: 'Only the Selected Services', value: 1 },
	]),
	f.int('locationId', 'locationid', 'Location ID', 'Location of this working time, if locations are used'),
	f.bool('oneOff', 'oneoff', 'Private Link Only', "Whether this time can only be booked through a special link (needs exactly one service)"),
	f.text('oneOffCode', 'oneoffcode', 'Private Link Code', "Code of the special link when 'Private Link Only' is on"),
	f.bool('waitingList', 'waitinglist', 'Fill From Waiting List', 'Whether this time is filled with appointments from the waiting list'),
];

const range = (p: Record<string, string>, a: string, b: string, la: string, lb: string) => {
	if (p[a] && p[b] && p[a] >= p[b]) throw new Error(`'${lb}' must be after '${la}'`);
};

register({
	value: 'calendar',
	name: 'Calendar',
	description: 'Calendars stand for employees, rooms or other resources',
	operations: [
		{
			resource: 'calendar', value: 'create', name: 'Create', action: 'Create calendar',
			description: 'Add a new calendar (employee or resource)', method: 'POST', path: '/calendar', kind: 'write', followUpUpdate: true,
			fields: [required(f.text('newCalendarName', 'calendarname', 'Calendar Name', 'Name of the new calendar'))],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: calendarSettings.filter((x) => x.apiName !== 'calendarname') }],
		},
		{
			resource: 'calendar', value: 'get', name: 'Get', action: 'Get calendar',
			description: 'Retrieve a calendar', method: 'GET', path: '/calendar', kind: 'get', limit: false,
			fields: [required(f.calendar('calendarid'))],
			simplified: ['CalendarID', 'CalendarName', 'Enabled', 'TimeSlotMinutes', 'Description'], idKeys: ['CalendarID'],
			selectable: ['CalendarID', 'CalendarName', 'Enabled', 'TimeSlotMinutes', 'Description', 'DescriptionDE', 'DescriptionEN'],
		},
		{
			resource: 'calendar', value: 'getAll', name: 'Get Many', action: 'Get many calendars',
			description: 'Retrieve all calendars of the account', method: 'GET', path: '/calendar', kind: 'list', fields: [],
			simplified: ['CalendarID', 'CalendarName', 'Enabled', 'TimeSlotMinutes', 'Description'], idKeys: ['CalendarID'],
			selectable: ['CalendarID', 'CalendarName', 'Enabled', 'TimeSlotMinutes', 'Description', 'DescriptionDE', 'DescriptionEN'],
		},
		{
			resource: 'calendar', value: 'update', name: 'Update', action: 'Update calendar',
			description: 'Change the settings of a calendar', method: 'PUT', path: '/calendar', kind: 'write',
			fields: [required(f.calendar('id'))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: calendarSettings }],
			check: (p) => { if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'"); },
		},
		{
			resource: 'calendar', value: 'delete', name: 'Delete', action: 'Delete calendar',
			description: 'Delete a calendar permanently', method: 'DELETE', path: '/calendar', kind: 'delete',
			fields: [required(f.calendar('id'))],
			existsCheck: { getPath: '/calendar', getParam: 'calendarid', idParam: 'id', idKey: 'CalendarID', label: 'calendar' },
		},
		{
			resource: 'calendar', value: 'getServices', name: 'Get Services', action: 'Get services of calendar',
			description: 'List the services assigned to a calendar', method: 'GET', path: '/calendarservice', kind: 'list',
			fields: [required(f.calendar('calendarid'))],
		},
		{
			resource: 'calendar', value: 'addService', name: 'Add Service', action: 'Add service to calendar',
			description: 'Allow a service to be booked in a calendar', method: 'POST', path: '/calendarservice', kind: 'write',
			fields: [required(f.calendar('calendarid')), required(f.service('serviceid'))],
		},
		{
			resource: 'calendar', value: 'removeService', name: 'Remove Service', action: 'Remove service from calendar',
			description: "Remove a service assignment from a calendar (use the assignment ID from 'Get Services')", method: 'DELETE', path: '/calendarservice', kind: 'delete',
			// eTermin also needs the calendar here, although its API description lists only the assignment ID (measured 22.10.2026).
			fields: [required(f.calendar('calendarid')), required(f.id('assignmentId', 'id', 'Assignment ID', "ID of the calendar–service assignment (from 'Get Services')"))],
		},
	],
});

register({
	value: 'absence',
	name: 'Absence',
	description: 'Absences of a calendar, in which it cannot be booked',
	operations: [
		{
			resource: 'absence', value: 'create', name: 'Create', action: 'Create absence',
			description: 'Block a calendar for a period', method: 'POST', path: '/calendarsnonworkingtimes', kind: 'write',
			fields: [
				required(f.calendar('appcalendarid')),
				required(f.dateTime('absenceStart', 'startdate', 'Start', 'Start of the absence')),
				required(f.dateTime('absenceEnd', 'enddate', 'End', 'End of the absence')),
			],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: [
				...absenceFields,
				f.int('dynamicDuration', 'dynamicdaysduration', 'Dynamic Duration (Days)', "How many days a dynamic absence lasts ('Dynamic Absence' must be on)"),
			] }],
			check: (p) => range(p, 'startdate', 'enddate', 'Start', 'End'),
		},
		{
			resource: 'absence', value: 'getAll', name: 'Get Many', action: 'Get many absences',
			description: 'Retrieve the absences of a calendar', method: 'GET', path: '/calendarsnonworkingtimes', kind: 'list',
			fields: [required(f.calendar('calendarid'))],
		},
		{
			resource: 'absence', value: 'update', name: 'Update', action: 'Update absence',
			description: 'Change an absence', method: 'PUT', path: '/calendarsnonworkingtimes', kind: 'write',
			fields: [required(f.id('absenceId', 'id', 'Absence ID', "ID of the absence (field 'id' from 'Get Many')"))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: [
				f.calendar('appcalendarid'),
				f.dateTime('absenceStart', 'startdate', 'Start', 'New start of the absence'),
				f.dateTime('absenceEnd', 'enddate', 'End', 'New end of the absence'),
				...absenceFields,
			] }],
			check: (p) => {
				if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'");
				range(p, 'startdate', 'enddate', 'Start', 'End');
			},
		},
		{
			resource: 'absence', value: 'delete', name: 'Delete', action: 'Delete absence',
			description: 'Delete an absence permanently', method: 'DELETE', path: '/calendarsnonworkingtimes', kind: 'delete',
			fields: [required(f.id('absenceId', 'id', 'Absence ID', "ID of the absence (field 'id' from 'Get Many')"))],
		},
	],
});

register({
	value: 'workingTime',
	name: 'Working Time',
	description: 'Regular weekly hours in which a calendar can be booked',
	operations: [
		{
			resource: 'workingTime', value: 'create', name: 'Create', action: 'Create working time',
			description: 'Add weekly working hours to a calendar', method: 'POST', path: '/workingtimes', kind: 'write',
			fields: [
				required(f.calendar('calendarid')),
				required(f.weekdays('weekday', { description: 'Days of the week the working time applies to' })),
				required(f.time('startTime', 'start', 'Start Time', 'Start of the working time (24-hour clock)')),
				required(f.time('endTime', 'end', 'End Time', 'End of the working time (24-hour clock)')),
			],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: workingTimeFields }],
			check: (p) => range(p, 'start', 'end', 'Start Time', 'End Time'),
		},
		{
			resource: 'workingTime', value: 'getAll', name: 'Get Many', action: 'Get many working times',
			description: 'Retrieve the weekly working hours of a calendar', method: 'GET', path: '/workingtimes', kind: 'list',
			fields: [required(f.calendar('calendarid'))],
			collections: [{ name: 'options', label: 'Options', fields: [f.flag('withNames', 'join', 'With Names', 'Whether eTermin returns names instead of numbers')] }],
			simplified: ['ID', 'WeekDay', 'StartTime', 'EndTime', 'Enabled', 'SlotType', 'ServiceIDs', 'WeekType'], idKeys: ['ID'],
			selectable: ['ID', 'StartTime', 'EndTime', 'WeekDayIdx', 'WeekDay', 'CalendarIntervalID', 'ValidWithServiceID', 'SlotType', 'AllServiceIDsRequired', 'ServiceIDs', 'WeekType', 'LocationID', 'Enabled'],
		},
		{
			resource: 'workingTime', value: 'getAllCalendars', name: 'Get Many for All Calendars', action: 'Get working times of all calendars',
			description: 'Retrieve the weekly working hours of every calendar', method: 'GET', path: '/workingtimes', kind: 'list',
			// 'join' is not offered here: eTermin answers all + join with a database error (measured 22.10.2026).
			fields: [], fixed: { all: 'true' },
		},
		{
			resource: 'workingTime', value: 'update', name: 'Update', action: 'Update working time',
			description: 'Change weekly working hours', method: 'PUT', path: '/workingtimes', kind: 'write',
			fields: [required(f.id('workingTimeId', 'id', 'Working Time ID', "ID of the working time (field 'ID' from 'Get Many')"))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: [
				f.calendar('calendarid'),
				f.weekdays('weekday', { description: 'Days of the week the working time applies to' }),
				f.time('startTime', 'start', 'Start Time', 'Start of the working time (24-hour clock)'),
				f.time('endTime', 'end', 'End Time', 'End of the working time (24-hour clock)'),
				...workingTimeFields,
			] }],
			check: (p) => {
				if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'");
				range(p, 'start', 'end', 'Start Time', 'End Time');
			},
		},
		{
			resource: 'workingTime', value: 'delete', name: 'Delete', action: 'Delete working time',
			description: 'Delete one weekly working time permanently', method: 'DELETE', path: '/workingtimes', kind: 'delete',
			fields: [required(f.calendar('calendarid')), required(f.id('workingTimeId', 'id', 'Working Time ID', "ID of the working time (field 'ID' from 'Get Many')"))],
		},
	],
});

register({
	value: 'specialWorkingTime',
	name: 'Special Working Time',
	description: 'Working hours for a specific date',
	operations: [
		{
			resource: 'specialWorkingTime', value: 'create', name: 'Create', action: 'Create special working time',
			description: 'Add working hours for a specific date', method: 'POST', path: '/workingtimesdate', kind: 'write',
			fields: [
				required(f.calendar('calendarid')),
				required(f.dateTime('specialStart', 'start', 'Start', 'Start date and time')),
				required(f.dateTime('specialEnd', 'end', 'End', 'End date and time')),
			],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: specialTimeFields }],
			check: (p) => range(p, 'start', 'end', 'Start', 'End'),
		},
		{
			resource: 'specialWorkingTime', value: 'getAll', name: 'Get Many', action: 'Get many special working times',
			description: 'Retrieve the date-specific working hours of a calendar', method: 'GET', path: '/workingtimesdate', kind: 'list',
			fields: [required(f.calendar('calendarid'))],
			collections: [{ name: 'filters', label: 'Filters', fields: [
				f.date('fromDate', 'start', 'From', 'First day to include'),
				f.date('untilDate', 'end', 'Until', "Last day to include (needs 'From')"),
				f.flag('withNames', 'join', 'With Names', 'Whether eTermin returns names instead of numbers'),
			] }],
			check: (p) => {
				if (p.end && !p.start) throw new Error("'Until' needs 'From'");
				if (p.start && p.end && p.start > p.end) throw new Error("'Until' must not be before 'From'");
			},
			simplified: ['ID', 'CalendarID', 'StartDate', 'EndDate', 'Reason', 'NrApps', 'SlotType', 'OverwriteDay', 'ServiceIDs', 'LocationName'], idKeys: ['ID'],
		},
		{
			resource: 'specialWorkingTime', value: 'update', name: 'Update', action: 'Update special working time',
			description: 'Change date-specific working hours', method: 'PUT', path: '/workingtimesdate', kind: 'write',
			fields: [
				required(f.id('specialWorkingTimeId', 'id', 'Special Working Time ID', "ID of the entry (field 'ID' from 'Get Many')")),
				required(f.calendar('calendarid')),
				required(f.dateTime('specialStart', 'start', 'Start', 'Start date and time')),
				required(f.dateTime('specialEnd', 'end', 'End', 'End date and time')),
			],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: specialTimeFields }],
			check: (p) => range(p, 'start', 'end', 'Start', 'End'),
		},
		{
			resource: 'specialWorkingTime', value: 'delete', name: 'Delete', action: 'Delete special working time',
			description: 'Delete one date-specific working time permanently', method: 'DELETE', path: '/workingtimesdate', kind: 'delete',
			fields: [required(f.id('specialWorkingTimeId', 'id', 'Special Working Time ID', "ID of the entry (field 'ID' from 'Get Many')"))],
		},
	],
});

register({
	value: 'anchorTime',
	name: 'Anchor Time',
	description: 'Anchor times of a calendar, as set up in eTermin under working times',
	operations: [
		{
			resource: 'anchorTime', value: 'create', name: 'Create', action: 'Create anchor time',
			description: 'Add a weekly anchor time', method: 'POST', path: '/anchortime', kind: 'write',
			fields: [
				required(f.calendar('calendarid')),
				required(weekday('anchorWeekday', 'weekday')),
				required(f.time('anchorTime', 'starttime', 'Time', 'Time of the anchor (24-hour clock)')),
				required(f.bool('ignoreOnceBooked', 'ignoreonceappbooked', 'Ignore Once Booked', 'Whether the anchor time is ignored once an appointment is booked that day')),
			],
		},
		{
			resource: 'anchorTime', value: 'createForDate', name: 'Create for Date', action: 'Create anchor time for date',
			description: 'Add an anchor time on one specific date', method: 'POST', path: '/anchortimedate', kind: 'write',
			fields: [
				required(f.calendar('calendarid')),
				required(f.dateTime('anchorDateTime', 'startdate', 'Date and Time', 'Date and time of the anchor')),
				required(f.bool('ignoreOnceBooked', 'ignoreonceappbooked', 'Ignore Once Booked', 'Whether the anchor time is ignored once an appointment is booked that day')),
			],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: [f.text('reason', 'reason', 'Reason', 'Why this anchor time was created')] }],
		},
		{
			resource: 'anchorTime', value: 'getAll', name: 'Get Many', action: 'Get many anchor times',
			description: 'Retrieve the weekly anchor times', method: 'GET', path: '/anchortime', kind: 'list', fields: [],
			collections: [{ name: 'filters', label: 'Filters', fields: [f.calendar('calendarid', { description: 'Only anchor times of this calendar' })] }],
		},
		{
			resource: 'anchorTime', value: 'getAllForDate', name: 'Get Many for Dates', action: 'Get many anchor times for dates',
			description: 'Retrieve the date-specific anchor times', method: 'GET', path: '/anchortimedate', kind: 'list', fields: [],
			collections: [{ name: 'filters', label: 'Filters', fields: [f.calendar('calendarid', { description: 'Only anchor times of this calendar' })] }],
		},
		{
			resource: 'anchorTime', value: 'update', name: 'Update', action: 'Update anchor time',
			description: 'Change a weekly anchor time', method: 'PUT', path: '/anchortime', kind: 'write',
			fields: [required(f.id('anchorTimeId', 'id', 'Anchor Time ID', "ID of the anchor time (field 'id' from 'Get Many')"))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: [
				f.calendar('calendarid'),
				weekday('anchorWeekday', 'weekday'),
				f.time('anchorTime', 'starttime', 'Time', 'Time of the anchor (24-hour clock)'),
				f.bool('ignoreOnceBooked', 'ignoreonceappbooked', 'Ignore Once Booked', 'Whether the anchor time is ignored once an appointment is booked that day'),
			] }],
			check: (p) => { if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'"); },
		},
		{
			resource: 'anchorTime', value: 'updateForDate', name: 'Update for Date', action: 'Update anchor time for date',
			description: 'Change a date-specific anchor time', method: 'PUT', path: '/anchortimedate', kind: 'write',
			fields: [
				required(f.id('anchorTimeId', 'id', 'Anchor Time ID', "ID of the anchor time (field 'id' from 'Get Many for Dates')")),
				required(f.calendar('calendarid')),
				required(f.dateTime('anchorDateTime', 'startdate', 'Date and Time', 'Date and time of the anchor')),
				required(f.bool('ignoreOnceBooked', 'ignoreonceappbooked', 'Ignore Once Booked', 'Whether the anchor time is ignored once an appointment is booked that day')),
			],
			collections: [{ name: 'additionalFields', label: 'Additional Fields', fields: [f.text('reason', 'reason', 'Reason', 'Why this anchor time was created')] }],
		},
		{
			resource: 'anchorTime', value: 'delete', name: 'Delete', action: 'Delete anchor time',
			description: 'Delete a weekly anchor time permanently', method: 'DELETE', path: '/anchortime', kind: 'delete',
			fields: [required(f.id('anchorTimeId', 'id', 'Anchor Time ID', "ID of the anchor time (field 'id' from 'Get Many')"))],
		},
		{
			resource: 'anchorTime', value: 'deleteForDate', name: 'Delete for Date', action: 'Delete anchor time for date',
			description: 'Delete a date-specific anchor time permanently', method: 'DELETE', path: '/anchortimedate', kind: 'delete',
			fields: [required(f.id('anchorTimeId', 'id', 'Anchor Time ID', "ID of the anchor time (field 'id' from 'Get Many for Dates')"))],
		},
	],
});

register({
	value: 'returnTime',
	name: 'Return Time',
	description: 'Return times of a calendar, as set up in eTermin under working times',
	operations: [
		{
			resource: 'returnTime', value: 'create', name: 'Create', action: 'Create return time',
			description: 'Add a weekly return time', method: 'POST', path: '/calendarreturntime', kind: 'write',
			fields: [
				required(f.calendar('calendarid')),
				required(weekday('returnWeekday', 'weekdayidx')),
				required(f.time('returnStart', 'starttime', 'Start Time', 'Start of the return time (24-hour clock)')),
				required(f.time('returnEnd', 'endtime', 'End Time', 'End of the return time (24-hour clock)')),
				required(f.bool('nextDay', 'newday', 'Ends Next Day', 'Whether the return time ends after midnight')),
			],
		},
		{
			resource: 'returnTime', value: 'getAll', name: 'Get Many', action: 'Get many return times',
			description: 'Retrieve the return times of a calendar', method: 'GET', path: '/calendarreturntime', kind: 'list',
			fields: [required(f.calendar('calendarid'))],
		},
		{
			resource: 'returnTime', value: 'update', name: 'Update', action: 'Update return time',
			description: 'Change a return time', method: 'PUT', path: '/calendarreturntime', kind: 'write',
			fields: [required(f.id('returnTimeId', 'id', 'Return Time ID', "ID of the return time (field 'id' from 'Get Many')"))],
			collections: [{ name: 'updateFields', label: 'Update Fields', fields: [
				f.calendar('calendarid'),
				weekday('returnWeekday', 'weekdayidx'),
				f.time('returnStart', 'starttime', 'Start Time', 'Start of the return time (24-hour clock)'),
				f.time('returnEnd', 'endtime', 'End Time', 'End of the return time (24-hour clock)'),
				f.bool('nextDay', 'newday', 'Ends Next Day', 'Whether the return time ends after midnight'),
			] }],
			check: (p) => { if (Object.keys(p).length <= 1) throw new Error("Choose at least one field under 'Update Fields'"); },
		},
		{
			resource: 'returnTime', value: 'delete', name: 'Delete', action: 'Delete return time',
			description: 'Delete a return time permanently', method: 'DELETE', path: '/calendarreturntime', kind: 'delete',
			fields: [required(f.id('returnTimeId', 'id', 'Return Time ID', "ID of the return time (field 'id' from 'Get Many')"))],
		},
	],
});
