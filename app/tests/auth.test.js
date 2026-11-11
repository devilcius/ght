import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {isAdmin} from '../src/auth.js';

globalThis.crypto ??= webcrypto;
const env = {ACCESS_TEAM_DOMAIN:'team.cloudflareaccess.com', ACCESS_AUDIENCE:'audience', ADMIN_EMAIL:'admin@example.com'};
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const keys = await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey = {...await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key',alg:'RS256'};
const defaults = {iss:'https://team.cloudflareaccess.com',aud:['audience'],email:'ADMIN@example.com',exp:now+300};
async function token(claims={}, header={}) {
  const input = `${encode({alg:'RS256',kid:'test-key',...header})}.${encode({...defaults,...claims})}`;
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}
const request = value => new Request('https://example.com/admin',{headers:value?{'cf-access-jwt-assertion':value}:{}});

test('accepts a correctly signed Access JWT for the configured administrator', async t => {
  t.mock.method(globalThis,'fetch',async url => {
    assert.equal(url,'https://team.cloudflareaccess.com/cdn-cgi/access/certs');
    return Response.json({keys:[publicKey]});
  });
  assert.equal(await isAdmin(request(await token()),env),true);
  assert.equal(await isAdmin(request(await token({aud:'audience'})),env),true);
});

test('rejects authentication when signing keys cannot be fetched', async t => {
  t.mock.method(globalThis,'fetch',async () => {throw new Error('network unavailable');});
  assert.equal(await isAdmin(request(await token()),env),false);
});

test('rejects invalid claims, missing tokens and modified signatures', async t => {
  t.mock.method(globalThis,'fetch',async () => Response.json({keys:[publicKey]}));
  for (const claims of [
    {iss:'https://other.cloudflareaccess.com'}, {aud:['wrong']}, {email:'other@example.com'},
    {exp:now-1}, {nbf:now+300}, {exp:'invalid'}
  ]) assert.equal(await isAdmin(request(await token(claims)),env),false);
  assert.equal(await isAdmin(request(await token({}, {alg:'HS256'})),env),false);
  assert.equal(await isAdmin(request(await token({}, {kid:'unknown'})),env),false);
  const signed = await token();
  const parts = signed.split('.');
  parts[1] = encode({...defaults,email:'other@example.com'});
  assert.equal(await isAdmin(request(parts.join('.')),env),false);
  // Preserve valid claims but alter signature bytes.
  parts[1] = signed.split('.')[1];
  const signature = Buffer.from(parts[2],'base64url'); signature[0] ^= 1;
  parts[2] = signature.toString('base64url');
  assert.equal(await isAdmin(request(parts.join('.')),env),false);
  assert.equal(await isAdmin(request('not-a-jwt'),env),false);
  assert.equal(await isAdmin(request(),env),false);
  assert.equal(await isAdmin(request(await token()),{}),false);
});

test('local bypass is restricted to loopback hostnames', async () => {
  assert.equal(await isAdmin(new Request('http://localhost:8787/admin'),{LOCAL_DEVELOPMENT:'true'}),true);
  assert.equal(await isAdmin(new Request('https://example.com/admin'),{LOCAL_DEVELOPMENT:'true'}),false);
});
