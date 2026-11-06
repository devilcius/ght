import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentKeys,validateSiteContent} from '../src/site-content.js';
const content = Object.fromEntries(contentKeys.map(key => [key,'']));
content.contact_email = 'contact@example.com';
content.contact_phone = '+34 91 574 96 97';
test('accepts contact and studio fields', () => assert.equal(validateSiteContent({...content,studio_intro:' Texto '}).studio_intro,'Texto'));
test('rejects invalid contact links and missing fields', () => {
  assert.throws(()=>validateSiteContent({...content,contact_email:'bad@example.com?subject=x'}));
  assert.throws(()=>validateSiteContent({...content,contact_phone:'javascript:alert(1)'}));
  const incomplete={...content}; delete incomplete.studio_intro;
  assert.throws(()=>validateSiteContent(incomplete));
});
