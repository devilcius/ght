import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject, escapeHtml} from '../src/domain.js';
test('validates projects and draft status', () => {
  assert.equal(validateProject({title:' Casa ',slug:'casa',published:false}).published,0);
  assert.throws(() => validateProject({title:'',slug:'casa'}));
  assert.throws(() => validateProject({title:'Casa',slug:'bad/slug'}));
});
test('escapes content rendered in HTML', () => assert.equal(escapeHtml('<script>"'), '&lt;script&gt;&quot;'));
