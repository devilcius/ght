import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminApi} from '../src/admin-api.js';
import {projectApi} from '../src/project-api.js';

test('admin API rejects unauthorized requests before accessing storage', async () => {
  const response = await adminApi(new Request('https://example.test/api/admin/projects'), {}, '/api/admin/projects');
  assert.equal(response.status, 401);
});

test('changing a project category clears its old category order', async () => {
  let update;
  const project = {id:'p1', category:'Previous', display_order:4, category_display_order:2};
  const db = {prepare(sql) { return {bind(...values) { return {
    async first() { assert.match(sql, /SELECT \* FROM projects/); return project; },
    async run() { update = {sql, values}; }
  }; }}; }};
  const body = {title:'Casa', slug:'casa', category:'New', published:false};
  const request = new Request('http://localhost/api/admin/projects/p1', {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  const response = await projectApi(request, {DB:db}, '/api/admin/projects/p1');
  assert.equal(response.status, 200);
  assert.match(update.sql, /UPDATE projects SET/);
  assert.deepEqual(update.values.slice(-3), [4, null, 'p1']);
});
