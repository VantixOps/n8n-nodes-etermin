// Tests for the polling eTermin Trigger. Responses mirror what eTermin returned in the test account on 22.10.2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EterminTrigger, toItems } = require('../dist/nodes/EterminTrigger/EterminTrigger.node.js');

const trigger = new EterminTrigger();
const rows = [
	{ SyncStatus: 'I', ID: 1, ExternalID: 'a', LastName: 'New', StartDateTime: '2026-11-05T10:00:00', Notes: 'x' },
	{ SyncStatus: 'U', ID: 2, ExternalID: 'b', LastName: 'Changed' },
	{ SyncStatus: 'D', ID: 3, ExternalID: 'c', LastName: '' },
];

function poller({ token, mode = 'trigger', events = ['created', 'modified', 'deleted'], simplify = true, response }) {
	const staticData = token === undefined ? {} : { syncToken: token };
	const calls = [];
	return {
		staticData, calls,
		ctx: {
			getWorkflowStaticData: () => staticData,
			getMode: () => mode,
			getNodeParameter: (name) => ({ events, simplify })[name],
			getNode: () => ({ name: 'eTermin Trigger', type: 'n8n-nodes-etermin.eterminTrigger', typeVersion: 1, position: [0, 0], parameters: {} }),
			helpers: { httpRequestWithAuthentication: async (credential, options) => { calls.push({ credential, url: options.url, qs: options.qs }); return response; } },
		},
	};
}

test('maps eTermin sync status to created / modified / deleted and filters by event', () => {
	assert.deepEqual(toItems(rows, ['created', 'modified', 'deleted'], true).map((i) => i.json.event), ['created', 'modified', 'deleted']);
	assert.deepEqual(toItems(rows, ['deleted'], true).map((i) => i.json.ID), [3]);
	assert.deepEqual(toItems(rows, ['created'], true)[0].json, { event: 'created', ID: 1, ExternalID: 'a', StartDateTime: '2026-11-05T10:00:00', LastName: 'New' });
	assert.equal(toItems(rows, ['created'], false)[0].json.Notes, 'x');
	assert.deepEqual(toItems([{ SyncStatus: 'X', ID: 9 }], ['created', 'modified', 'deleted'], true), []);
});

test('first activation remembers the current position and does not replay old changes', async () => {
	const p = poller({ response: { statusCode: 200, headers: { synctoken: '7' }, body: rows } });
	assert.equal(await trigger.poll.call(p.ctx), null);
	assert.equal(p.staticData.syncToken, '7');
	assert.deepEqual(p.calls, [{ credential: 'eterminApi', url: '/appointmentsync', qs: { synctoken: '1' } }]);
});

test('later polls emit new changes and move the position forward', async () => {
	const p = poller({ token: '7', response: { statusCode: 200, headers: { synctoken: '9' }, body: rows.slice(0, 2) } });
	const out = await trigger.poll.call(p.ctx);
	assert.deepEqual(out[0].map((i) => i.json.event), ['created', 'modified']);
	assert.equal(p.staticData.syncToken, '9');
	assert.deepEqual(p.calls[0].qs, { synctoken: '7' });
});

test('no changes: nothing is emitted and the position stays (eTermin answers with an empty body)', async () => {
	const p = poller({ token: '9', response: { statusCode: 200, headers: { synctoken: '9' }, body: '' } });
	assert.equal(await trigger.poll.call(p.ctx), null);
	assert.equal(p.staticData.syncToken, '9');
});

test('changes that are filtered out still move the position, so they are not delivered later', async () => {
	const p = poller({ token: '9', events: ['deleted'], response: { statusCode: 200, headers: { synctoken: '10' }, body: [rows[0]] } });
	assert.equal(await trigger.poll.call(p.ctx), null);
	assert.equal(p.staticData.syncToken, '10');
});

test('manual test runs show events but do not move the stored position', async () => {
	const p = poller({ token: '5', mode: 'manual', response: { statusCode: 200, headers: { synctoken: '6' }, body: [rows[1]] } });
	const out = await trigger.poll.call(p.ctx);
	assert.equal(out[0][0].json.event, 'modified');
	assert.equal(p.staticData.syncToken, '5');
});

test('eTermin errors become clear messages and do not move the position', async () => {
	const p = poller({ token: '5', response: { statusCode: 401, headers: {}, body: '' } });
	await assert.rejects(() => trigger.poll.call(p.ctx), /status 401/);
	assert.equal(p.staticData.syncToken, '5');
	const q = poller({ token: '5', response: { statusCode: 400, headers: {}, body: '<response><status>400</status><statusmsg>Parameter synctoken is missing!</statusmsg></response>' } });
	await assert.rejects(() => trigger.poll.call(q.ctx), /eTermin: Parameter synctoken is missing!/);
});

test('a first test run shows only the newest changes, and odd answers become clear errors', async () => {
	const many = Array.from({ length: 12 }, (_, i) => ({ SyncStatus: 'I', ID: i + 1 }));
	const p = poller({ mode: 'manual', response: { statusCode: 200, headers: { synctoken: '40' }, body: many } });
	const out = await trigger.poll.call(p.ctx);
	assert.deepEqual(p.calls[0].qs, { synctoken: '0' }); // 0 = whole history (measured), then cut to the newest five
	assert.deepEqual(out[0].map((i) => i.json.ID), [8, 9, 10, 11, 12]);
	assert.equal(p.staticData.syncToken, undefined);
	const q = poller({ token: '3', response: { statusCode: 200, headers: {}, body: '<html>maintenance</html>' } });
	await assert.rejects(() => trigger.poll.call(q.ctx), /unexpected answer/);
	assert.equal(q.staticData.syncToken, '3');
});

test('trigger errors do not carry eTermin raw answers', async () => {
	const p = poller({ token: '5', response: { statusCode: 400, headers: {}, body: '<response><status>400</status><statusmsg>bad</statusmsg><request>lastname=Mustermann</request></response>' } });
	try {
		await trigger.poll.call(p.ctx);
		assert.fail('should throw');
	} catch (e) {
		assert.match(e.message, /eTermin: bad/);
		assert.equal(JSON.stringify(e).includes('Mustermann'), false);
	}
});

test('changes without a new sync position are refused, so they are not delivered twice', async () => {
	const p = poller({ token: '7', response: { statusCode: 200, headers: {}, body: rows.slice(0, 2) } });
	await assert.rejects(() => trigger.poll.call(p.ctx), /without a new sync position/);
	assert.equal(p.staticData.syncToken, '7'); // position unchanged
	// an empty poll without the header is fine (no changes to lose)
	const q = poller({ token: '7', response: { statusCode: 200, headers: {}, body: '' } });
	assert.equal(await trigger.poll.call(q.ctx), null);
	assert.equal(q.staticData.syncToken, '7');
});

test('a manual test run is not refused when the sync header is missing (it stores no position)', async () => {
	const p = poller({ mode: 'manual', response: { statusCode: 200, headers: {}, body: [rows[1]] } });
	const out = await trigger.poll.call(p.ctx);
	assert.equal(out[0][0].json.event, 'modified');
});
