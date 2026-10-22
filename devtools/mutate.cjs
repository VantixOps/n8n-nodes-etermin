// Mutation probe: plants one small bug at a time in the compiled code and checks that the test suite fails.
// Usage: npm run build && node devtools/mutate.cjs   (restores every file afterwards)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const T = 'dist/nodes/Etermin/v2/transport.js';
const TR = 'dist/nodes/EterminTrigger/EterminTrigger.node.js';
const C = 'dist/credentials/EterminApi.credentials.js';
const MUTANTS = [
	[T, "parameters[key] = nextDay(parameters[key])", 'parameters[key] = parameters[key]', 'end date not made inclusive'],
	[T, 'd.setUTCDate(d.getUTCDate() + 1)', 'd.setUTCDate(d.getUTCDate() + 2)', 'next day off by one'],
	[T, "return value === true || value === 'true' ? 'true' : 'false';", "return 'true';", 'boolean always true'],
	[T, "? '1' : '0'", "? '0' : '1'", 'flag inverted'],
	[T, "const omitOff = spec.method === 'GET' || spec.method === 'DELETE';", 'const omitOff = false;', 'off filters sent when reading'],
	[T, 'if (status === 420)', 'if (status === 421)', '420 not explained'],
	[T, 'if (status >= 400) {', 'if (status > 400) {', 'status 400 accepted'],
	[T, 'if (Number.isFinite(inner) && inner >= 400)', 'if (Number.isFinite(inner) && inner > 400)', 'in-body status 400 accepted'],
	[T, "        delete parameters.id;\n", "\n", 'voucher id sent with iid'],
	[T, "parameters.iid = String(match.iid);", "parameters.iid = String(match.id);", 'wrong voucher number'],
	[T, "json: { deleted: true }, pairedItem", "json: {}, pairedItem", 'delete output'],
	[T, 'if (spec.kind === \'get\' && rows.length === 0) {', 'if (false) {', 'missing record silent'],
	[T, 'rows = rows.slice(0, limit);', 'rows = rows.slice(0, limit + 1);', 'limit off by one'],
	[T, "if (output === 'simplified')\n            return pick(row,", "if (output === 'simplified')\n            return (row, ", 'simplify ignored'],
	[T, 'return pick(row, [...new Set([...idKeys, ...chosen])]);', 'return pick(row, chosen);', 'ID dropped from selection'],
	[T, "result.referenceCode = stray;", ';', 'reference code lost'],
	[T, "parameters.id = await externalIdOf(this, parameters.id);", '', 'external ID not looked up'],
	[T, "if (!/^[1-9]\\d{0,17}$/.test(text))", 'if (!/^\\d+$/.test(text))', 'zero ID accepted'],
	[T, "!realDate(y, mo, d) || Number(h) > 23", "Number(h) > 23", 'impossible date accepted'],
	[T, "    if (spec.method === 'GET' || spec.method === 'DELETE')\n        return", "    if (spec.method === 'GET')\n        return", 'delete sends a body'],
	[T, "'Content-Type': 'application/x-www-form-urlencoded'", "'Content-Type': 'application/json'", 'wrong content type'],
	[T, "json[header.field] = headerValue;", ';', 'sync token lost'],
	[TR, "if (state.syncToken === undefined && !isManual) {", 'if (false) {', 'first poll replays history'],
	[TR, "        if (!isManual)\n            state.syncToken = nextToken;", "        state.syncToken = nextToken;", 'manual run moves position'],
	[TR, "const STATUS_TO_EVENT = { I: 'created', U: 'modified', D: 'deleted' };", "const STATUS_TO_EVENT = { I: 'created', U: 'created', D: 'deleted' };", 'modified mapped wrong'],
	[TR, '.filter(({ event }) => events.includes(event))', '', 'event filter ignored'],
	[C, "!ALLOWED[requestOptions.url].includes(method)", 'false', 'method not restricted'],
	[C, "requestOptions.baseURL !== 'https://www.etermin.net/api'", 'false', 'base URL not restricted'],
	[T, "toApiDateTime(value, field.label, 'UTC')", 'toApiDateTime(value, field.label, timeZone)', 'UTC fields converted to local time'],
	[T, "changes: 0 }", "changes: 0, x: 1 }", 'empty change list shape'],
	['dist/nodes/Etermin/v2/resources/misc.js', 'limit: false, headerToField', 'headerToField', 'change list cut by limit'],
	[TR, 'rows = rows.slice(-MANUAL_SAMPLE);', ';', 'test run lists whole history'],
	[T, 'utc = guess - zoneOffset(utc, timeZone);', ';', 'no daylight-saving second pass'],
	[T, 'parameters[utc] = wallTimeToUtc(parameters[local], timeZone);', ';', 'UTC not derived'],
	[T, 'if (status === 409) {', 'if (status === 4090) {', 'taken time without hint'],
	[T, 'result.ID = row.ID;', ';', 'numeric ID not returned after booking'],
	[T, "if (!zone)\n        return ctx.getTimezone();", "return ctx.getTimezone();", 'account time zone ignored'],
	['dist/nodes/Etermin/v2/resources/appointment.js', '/ 86400000 > 30)', '/ 86400000 > 3000)', 'no 31-day guard'],
	[TR, "(isManual ? '0' : '1')", "'1'", 'test run shows no sample'],
	[T, ' || field.omitWhenOff))', '))', 'presence switch (checkexist) sent as 0 when off'],
	[T, '!rows.some((r) => idKeys.some((k) => r[k] !== undefined && String(r[k]) === String(id)))', 'false', 'delete not checked against the account'],
	['dist/nodes/Etermin/v2/methods.js', 'throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), message', 'void (message', 'picker hides XML error'],
	[TR, 'if (!isManual && rows.length > 0 && (headerToken === undefined', 'if (false && rows.length > 0 && (headerToken === undefined', 'missing sync position ignored'],
];

function runTests() {
	const r = spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.cjs')).map((f) => path.join('tests', f))], { cwd: root, encoding: 'utf8' });
	return r.status === 0;
}

if (!runTests()) { console.error('Baseline tests fail – fix them first.'); process.exit(2); }
const survivors = [];
let applied = 0;
for (const [file, from, to, label] of MUTANTS) {
	const full = path.join(root, file);
	const original = fs.readFileSync(full, 'utf8');
	if (!original.includes(from)) { survivors.push(`NOT APPLIED (pattern missing): ${label}`); continue; }
	fs.writeFileSync(full, original.replace(from, to));
	applied++;
	try {
		if (runTests()) survivors.push(`SURVIVED: ${label}`);
	} finally {
		fs.writeFileSync(full, original);
	}
}
console.log(`${applied}/${MUTANTS.length} mutants applied, ${survivors.length} problems`);
for (const s of survivors) console.log(' - ' + s);
if (!runTests()) { console.error('Restore check failed'); process.exit(3); }
process.exit(survivors.length ? 1 : 0);
