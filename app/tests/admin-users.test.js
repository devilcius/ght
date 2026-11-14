import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usersApi} from '../src/admin-users.js';

const path = '/api/admin/users/user-1';
const request = method => new Request('https://example.com' + path, {method});
function envWith(user) {
  return {ADMIN_EMAIL:'owner@example.com',DB:{prepare() { return {bind() { return {first:async()=>user,run:async()=>{throw Error('must not change protected user');}}; }}; }}};
}
test('users cannot remove or deactivate themselves or the configured owner', async () => {
  for (const [actor,user] of [
    [{email:'editor@example.com'}, {id:'user-1',email:'EDITOR@example.com',active:1}],
    [{email:'editor@example.com'}, {id:'user-1',email:'owner@example.com',active:1}]
  ]) {
    for (const method of ['DELETE','PATCH']) assert.equal((await usersApi(request(method),envWith(user),path,actor)).status,403);
  }
});
