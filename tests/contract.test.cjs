const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { EterminApi } = require('../dist/credentials/EterminApi.credentials.js');
const { Etermin } = require('../dist/nodes/Etermin/Etermin.node.js');
const api = new EterminApi();
const description = new Etermin().description;
const fakeCredentials = { apiKey: 'synthetic-public', privateKey: 'synthetic-private' };
const req = () => ({ method: 'GET', baseURL: 'https://www.etermin.net/api', url: '/calendar' });

test('auth signs each request with a fresh salt and never transmits the private key', async () => {
  assert.equal(typeof api.authenticate, 'function');
  const a = await api.authenticate(fakeCredentials, req());
  const b = await api.authenticate(fakeCredentials, req());
  assert.notEqual(a.headers.salt, b.headers.salt);
  assert.match(a.headers.salt, /^[a-f0-9]{32}$/);
  assert.equal(a.headers.signature, createHmac('sha256', fakeCredentials.privateKey).update(a.headers.salt).digest('base64'));
  assert.equal(a.headers.publickey, fakeCredentials.apiKey);
  assert.equal(a.disableFollowRedirect, true);
  assert.equal(JSON.stringify(a).includes(fakeCredentials.privateKey), false);
  assert.equal(a.timeout, 30000);
});

test('auth rejects missing credentials, non-service targets and path escapes', async () => {
  for (const creds of [{}, {apiKey:'x'}, {privateKey:'x'}, {...fakeCredentials,apiKey:'x\r\ninjected: true'}]) {
    await assert.rejects(() => api.authenticate(creds, req()));
  }
  for (const url of ['https://example.com/api/calendar', '//example.com/calendar', '/contact', '/calendar/../contact']) {
    await assert.rejects(() => api.authenticate(fakeCredentials, {...req(),url}));
  }
  await assert.rejects(() => api.authenticate(fakeCredentials, {...req(),baseURL:'http://www.etermin.net/api'}));
});

function context(parameters,itemIndex=0) {
  return { getItemIndex() { return itemIndex; }, getNodeParameter(name, fallback) { return Object.hasOwn(parameters,name) ? parameters[name] : fallback; }, getNode() { return {name:'Synthetic test',type:'n8n-nodes-etermin.etermin',typeVersion:1,position:[0,0],parameters:{}}; } };
}
function operation(resource) {
  const property = description.properties.find(p => p.name==='operation' && p.displayOptions.show.resource.includes(resource));
  assert.ok(property, `Missing resource ${resource}`);
  return property.options.find(o=>o.value==='getMany').routing;
}
test('only documented read endpoints are exposed', () => {
  for (const [resource,path] of [['calendar','/calendar'],['service','/service'],['timeSlot','/timeslots']]) {
    assert.equal(operation(resource).request.method,'GET');
    assert.equal(operation(resource).request.url,path);
  }
  assert.equal(description.requestDefaults.baseURL,'https://www.etermin.net/api');
  assert.equal(description.usableAsTool,true);
});
test('slot request preserves calendar, service and date and rejects impossible dates', async () => {
  const pre = operation('timeSlot').send.preSend[0];
  const params = {resource:'timeSlot',date:'2028-02-29',calendarId:'42',serviceId:'7'};
  const out = await pre.call(context(params),{url:'/timeslots'});
  assert.deepEqual(out.qs,{date:'2028-02-29',calendarid:42,serviceid:'7'});
  for (const date of ['2027-02-29','2026-04-31','2026-1-01','','garbage']) {
    await assert.rejects(() => pre.call(context({...params,date}),{url:'/timeslots'}));
  }
  for (const calendarId of ['-1','0','x','1.5','1&token=x']) {
    await assert.rejects(() => pre.call(context({...params,calendarId}),{url:'/timeslots'}));
  }
});
test('response validates shape, simplifies values, preserves links, and supports raw/limit/empty', async () => {
  const post = operation('calendar').output.postReceive[0];
  const params = {resource:'calendar',output:'simplified',returnAll:true,limit:50};
  const row = {CalendarID:42,CalendarName:'Synthetic calendar',Enabled:true,EMail:'synthetic@example.invalid',DescriptionDE:'extra'};
  const items = [{json:row,pairedItem:{item:3}},{json:{...row,CalendarID:43},pairedItem:{item:3}}];
  const original = JSON.stringify(items);
  const output = await post.call(context(params,3),items,{body:items.map(i=>i.json)});
  assert.deepEqual(output[0].json,{CalendarID:42,CalendarName:'Synthetic calendar',Enabled:true});
  assert.deepEqual(output[0].pairedItem,{item:3});
  assert.equal(output.length,2);
  assert.equal(JSON.stringify(items),original);
  const raw = await post.call(context({...params,output:'raw',returnAll:false,limit:1}),items,{body:items.map(i=>i.json)});
  assert.equal(raw.length,1);assert.equal(raw[0].json.EMail,'synthetic@example.invalid');
  const selected = await post.call(context({...params,output:'selected',fields:'Enabled'}),items,{body:items.map(i=>i.json)});
  assert.deepEqual(selected[0].json,{CalendarID:42,Enabled:true});
  assert.deepEqual(await post.call(context(params),[],{body:[]}),[]);
  for (const body of [{error:'not an array'},null,'', [null],[{wrong:'shape'}]]) {
    await assert.rejects(() => post.call(context(params),[],{body}));
  }
  await assert.rejects(() => post.call(context({...params,returnAll:false,limit:0}),items,{body:items.map(i=>i.json)}));
});

test('credentials are hidden and package has no runtime dependencies', () => {
  assert.equal(api.properties.length,2);
  for (const p of api.properties) { assert.equal(p.typeOptions.password,true);assert.equal(p.required,true); }
  const pkg=require('../package.json');
  assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  assert.equal(pkg.license,'MIT');assert.equal(pkg.private,false);
});

test('real n8n routing expands the API array into one item per calendar', async () => {
  const { RoutingNode } = require('n8n-core');
  const router = new RoutingNode({},new Etermin());
  const routing = operation('calendar');
  const data = {postReceive:[{actions:routing.output.postReceive,data:{parameterValue:'getMany'}}]};
  const body = [{CalendarID:42,CalendarName:'First',Enabled:true},{CalendarID:43,CalendarName:'Second',Enabled:false}];
  const result = await router.postProcessResponseData(context({resource:'calendar',output:'simplified',returnAll:true}),{body},data,0,0);
  assert.deepEqual(result.map(i=>i.json),body);
});

test('real routing sends signed service and slot queries through a synthetic HTTP service', async () => {
  const { RoutingNode } = require('n8n-core');
  const { createServer } = require('node:http');
  const received = [];
  const server = createServer((request,response) => {
    const signature=createHmac('sha256',fakeCredentials.privateKey).update(request.headers.salt).digest('base64');
    if(request.headers.signature!==signature || request.headers.publickey!==fakeCredentials.apiKey) { response.writeHead(401).end();return; }
    received.push(request.url);
    response.setHeader('content-type','application/json');
    response.end(JSON.stringify(request.url.startsWith('/service') ? (new URL(request.url,'http://localhost').searchParams.has('languageid') ? [{ServiceID:7,Service:'Synthetic service',Enabled:true}] : [{ServiceID:7,ServiceEN:'Synthetic service',Enabled:true}]) : [{calendarid:42,start:'2028-02-29T10:00:00',end:'2028-02-29T10:30:00'}]));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for(const resource of ['service','timeSlot']) {
      const route=operation(resource);
      const router=new RoutingNode({node:{}},new Etermin());
      const ctx=context({resource,calendarId:'42',serviceId:'7',date:'2028-02-29',output:'simplified',returnAll:true});
      ctx.helpers={httpRequestWithAuthentication:async function(type,options) {
        assert.equal(type,'eterminApi');
        const signed=await api.authenticate(fakeCredentials,options);
        const localUrl=new URL(`http://127.0.0.1:${server.address().port}${signed.url}`);
        for(const [key,value] of Object.entries(signed.qs))localUrl.searchParams.set(key,String(value));
        const response=await fetch(localUrl,{method:signed.method,headers:signed.headers,redirect:'error'});
        if(!response.ok)throw new Error(`Synthetic HTTP ${response.status}`);
        return {body:await response.json(),statusCode:response.status,headers:{}};
      }};
      const requestData={options:{...description.requestDefaults,...route.request},preSend:route.send.preSend,postReceive:[{actions:route.output.postReceive,data:{parameterValue:'getMany'}}]};
      const output=await router.makeRequest(requestData,ctx,0,0,'eterminApi');
      assert.equal(output.length,1);assert.equal(output[0].json[resource==='service'?'ServiceID':'calendarid'],resource==='service'?7:42);if(resource==='service')assert.equal(output[0].json.Service,'Synthetic service');
    }
    assert.equal(received[0],'/service?id=7&languageid=EN');
    assert.equal(received[1],'/timeslots?calendarid=42&serviceid=7&date=2028-02-29');
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('real routing keeps results linked to the correct input when result counts differ', async () => {
  const { RoutingNode }=require('n8n-core');
  const router=new RoutingNode({},new Etermin());
  const data={postReceive:[{actions:operation('calendar').output.postReceive,data:{parameterValue:'getMany'}}]};
  const params={resource:'calendar',output:'simplified',returnAll:true};
  const row=id=>({CalendarID:id,CalendarName:`Synthetic ${id}`,Enabled:true});
  for(const [responses,expected] of [[ [[],[row(50),row(51)]], [1,1] ], [ [[row(40),row(41)],[row(50)]], [0,0,1] ]]) {
    const merged=[];
    for(let inputIndex=0;inputIndex<responses.length;inputIndex++) {
      merged.push(...await router.postProcessResponseData(context(params,inputIndex),{body:responses[inputIndex]},data,inputIndex,0));
    }
    assert.deepEqual(merged.map(item=>item.pairedItem?.item),expected);
  }
});

test('service language is explicit so provider names survive simplified output', async () => {
 const pre=operation('service').send.preSend[0];
 assert.equal((await pre.call(context({resource:'service'}),{url:'/service'})).qs.languageid,'EN');
 assert.equal((await pre.call(context({resource:'service',languageId:'de'}),{url:'/service'})).qs.languageid,'DE');
 for(const languageId of ['', 'DE&x=1','English']) await assert.rejects(()=>pre.call(context({resource:'service',languageId}),{url:'/service'}));
});
