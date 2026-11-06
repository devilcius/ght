import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleContact, validateContact} from '../src/contact.js';
const payload = {name:'María García',email:'maria@example.com',message:'Me gustaría hablar sobre un proyecto.',consent:true,website:''};
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
  const env={RESEND_API_KEY:'test-key',CONTACT_FROM_EMAIL:'GHT <send@example.com>',CONTACT_TO_EMAIL:'office@example.com'};
  const res=await handleContact(makeRequest('https://ght.example'),env,async (url,opts)=>{sent={url,opts,body:JSON.parse(opts.body)};return new Response('{}',{status:200});});
  assert.equal(res.status,200); assert.equal(sent.url,'https://api.resend.com/emails');
  assert.deepEqual(sent.body.to,['office@example.com']); assert.equal(sent.body.reply_to,payload.email); assert.match(sent.body.text,/Me gustaría hablar/);
});

test('provider failure reports an error without exposing provider response', async () => {
  const res=await handleContact(makeRequest('https://ght.example'),{RESEND_API_KEY:'test-key',CONTACT_FROM_EMAIL:'a@example.com',CONTACT_TO_EMAIL:'b@example.com'},async()=>new Response('secret provider error',{status:500}));
  assert.equal(res.status,502); assert.doesNotMatch(await res.text(),/secret provider error/);
});
