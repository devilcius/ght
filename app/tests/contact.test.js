import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleContact, validateContact} from '../src/contact.js';
const payload = {name:'María García',email:'maria@example.com',message:'Me gustaría hablar sobre un proyecto.',consent:true,website:'',turnstileToken:'valid-token'};
const protection = {TURNSTILE_SITE_KEY:'site-key', TURNSTILE_SECRET_KEY:'secret-key', CONTACT_RATE_LIMITER:{limit:async()=>({success:true})}};
const verified = handler => async (url, options) => url.includes('/siteverify') ? Response.json({success:true,hostname:'ght.example',action:'contact'}) : handler(url, options);
const makeRequest = (host='http://127.0.0.1:8787',data=payload,extra={}) => new Request(host+'/api/contact',{method:'POST',headers:{'Origin':host,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});

test('validates contact fields and explicit consent', () => {
  assert.equal(validateContact({...payload,name:' María '}).name,'María');
  for (const invalid of [{...payload,name:'x'},{...payload,name:'A\nB'},{...payload,email:'a@example.com?x=y'},{...payload,message:'short'},{...payload,consent:false}]) assert.throws(()=>validateContact(invalid));
});

test('local submission is simulated and never calls delivery provider', async () => {
  let sent = false;
  const res = await handleContact(makeRequest(),{LOCAL_DEVELOPMENT:'true'},()=>{sent=true;throw new Error('must not send');});
  assert.equal(res.status,200); assert.equal((await res.json()).simulated,true); assert.equal(sent,false);
});

test('same-origin and server-side consent checks reject invalid requests', async () => {
  assert.equal((await handleContact(makeRequest('http://127.0.0.1:8787',payload,{Origin:'https://elsewhere.example'}),{LOCAL_DEVELOPMENT:'true'})).status,403);
  assert.equal((await handleContact(makeRequest('http://127.0.0.1:8787',{...payload,consent:false}),{LOCAL_DEVELOPMENT:'true'})).status,400);
  assert.equal((await handleContact(makeRequest('http://127.0.0.1:8787',payload,{'Content-Type':'text/plain'}),{LOCAL_DEVELOPMENT:'true'})).status,415);
});

test('live delivery is disabled when not configured and local bypass cannot apply to deployed hosts', async () => {
  const res = await handleContact(makeRequest('https://ght.example'),{LOCAL_DEVELOPMENT:'true'});
  assert.equal(res.status,503);
});

test('configured delivery sends the message and uses visitor as reply-to', async () => {
  let sent;
  const env={...protection,RESEND_API_KEY:'test-key',CONTACT_FROM_EMAIL:'GHT <send@example.com>',CONTACT_TO_EMAIL:'office@example.com'};
  const res=await handleContact(makeRequest('https://ght.example'),env,verified(async (url,opts)=>{sent={url,opts,body:JSON.parse(opts.body)};return new Response('{}',{status:200});}));
  assert.equal(res.status,200); assert.equal(sent.url,'https://api.resend.com/emails');
  assert.deepEqual(sent.body.to,['office@example.com']); assert.equal(sent.body.reply_to,payload.email); assert.match(sent.body.text,/Me gustaría hablar/);
  assert.match(sent.body.html,/Me gustaría hablar/); assert.match(sent.body.html,/GHT/); assert.doesNotMatch(sent.body.html,/Consulta sobre un inmueble/);
});

test('provider failure reports an error without exposing provider response', async () => {
  const res=await handleContact(makeRequest('https://ght.example'),{...protection,RESEND_API_KEY:'test-key',CONTACT_FROM_EMAIL:'a@example.com',CONTACT_TO_EMAIL:'b@example.com'},verified(async()=>new Response('secret provider error',{status:500})));
  assert.equal(res.status,502); assert.doesNotMatch(await res.text(),/secret provider error/);
});

test('email escapes visitor and property content and preserves message line breaks', async () => {
  let sent;
  const data = {...payload, name:'<img src=x>', message:'Primera línea\n<script>alert(1)</script>', propertySlug:'piso-madrid'};
  const env = {...protection, RESEND_API_KEY:'test-key', CONTACT_FROM_EMAIL:'send@example.com', CONTACT_TO_EMAIL:'office@example.com', DB:{prepare:()=>({bind:()=>({first:async()=>({title:'Piso <centro> & patio',slug:'piso-madrid'})})})}};
  const res = await handleContact(makeRequest('https://ght.example', data), env, verified(async (_url, opts) => {sent = JSON.parse(opts.body); return new Response('{}');}));
  assert.equal(res.status, 200);
  assert.match(sent.html, /&lt;img src=x&gt;/);
  assert.match(sent.html, /Primera línea<br>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(sent.html, /Piso &lt;centro&gt; &amp; patio/);
  assert.doesNotMatch(sent.html, /<script>|<img src=x>/);
  assert.match(sent.text, /Piso <centro> & patio/);
});

test('live requests require configured protection, a valid single-use token and matching hostname and action', async () => {
  let calls = [];
  const env = {...protection, RESEND_API_KEY:'test', CONTACT_FROM_EMAIL:'from@example.com', CONTACT_TO_EMAIL:'to@example.com'};
  const check = async (data, response) => {
    calls = [];
    return handleContact(makeRequest('https://ght.example', data), env, async (url, options) => {
      calls.push({url, options});
      return url.includes('/siteverify') ? Response.json(response) : Response.json({id:'sent'});
    });
  };
  assert.equal((await check({...payload,turnstileToken:''}, {})).status, 400);
  assert.equal(calls.length, 0);
  for (const response of [{success:false}, {success:true,hostname:'evil.example',action:'contact'}, {success:true,hostname:'ght.example',action:'other'}]) {
    assert.equal((await check(payload, response)).status, 400);
    assert.equal(calls.length, 1);
  }
  assert.equal((await check(payload, {success:true,hostname:'ght.example',action:'contact'})).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).response, 'valid-token');
  assert.equal((await handleContact(makeRequest('https://ght.example'), {...env, TURNSTILE_SECRET_KEY:''})).status, 503);
});

test('rate limit and verification failures cannot send email', async () => {
  let called = false;
  const env = {...protection, RESEND_API_KEY:'test', CONTACT_FROM_EMAIL:'from@example.com', CONTACT_TO_EMAIL:'to@example.com'};
  const limited = {...env, CONTACT_RATE_LIMITER:{limit:async()=>({success:false})}};
  assert.equal((await handleContact(makeRequest('https://ght.example'), limited, async()=>{called=true;})).status, 429);
  assert.equal(called, false);
  assert.equal((await handleContact(makeRequest('https://ght.example'), env, async()=>{throw Error('offline');})).status, 503);
});

test('local Turnstile test mode verifies dummy tokens without delivering email', async () => {
  let calls = 0;
  const env = {LOCAL_DEVELOPMENT:'true', LOCAL_TURNSTILE_TEST:'true'};
  const res = await handleContact(makeRequest(), env, async (url, options) => {
    calls++;
    assert.match(url, /siteverify/);
    assert.equal(JSON.parse(options.body).secret, '1x0000000000000000000000000000000AA');
    return Response.json({success:true,hostname:'example.com'});
  });
  assert.equal(res.status, 200); assert.equal((await res.json()).simulated, true); assert.equal(calls, 1);
  assert.equal((await handleContact(makeRequest('https://ght.example'), env)).status, 503);
});
