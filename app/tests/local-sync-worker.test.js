import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../scripts/local_sync_worker.js';

const request = (token, key) => new Request('http://localhost/', {
  method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({key})
});

test('copies an object using only a production read and verifies the local copy', async () => {
  const writes = [];
  const env = {
    SYNC_TOKEN:'secret',
    PRODUCTION:{async get(key) { assert.equal(key,'photo'); return {body:'image',size:5,httpMetadata:{contentType:'image/webp'},customMetadata:{}}; }},
    LOCAL:{async put(...args) { writes.push(args); }, async head() {return {size:5,httpMetadata:{contentType:'image/webp'}};}}
  };
  assert.equal((await worker.fetch(request('wrong','photo'),env)).status,401);
  assert.equal(writes.length,0);
  assert.equal((await worker.fetch(request('secret','photo'),env)).status,200);
  assert.equal(writes[0][0],'photo');
  assert.equal(writes[0][2].httpMetadata.contentType,'image/webp');
});

test('reports missing and improperly copied objects', async () => {
  const env={SYNC_TOKEN:'secret',PRODUCTION:{get:async()=>null},LOCAL:{put:async()=>{},head:async()=>({size:0})}};
  assert.equal((await worker.fetch(request('secret','missing'),env)).status,404);
  env.PRODUCTION.get=async()=>({body:'image',size:5,httpMetadata:{contentType:'image/webp'}});
  assert.equal((await worker.fetch(request('secret','photo'),env)).status,502);
});
