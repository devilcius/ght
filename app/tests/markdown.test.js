import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown, markdownText} from '../src/markdown.js';

test('renders property Markdown and produces readable metadata', () => {
  const text = 'Un **piso luminoso**\n\n- Terraza\n- [Plano](https://example.com)';
  const html = renderMarkdown(text);
  assert.match(html, /<strong>piso luminoso<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(markdownText(text), /\*\*|\]\(/);
});

test('does not render embedded HTML or dangerous links', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[click](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>|href="javascript:/i);
  assert.match(html, /&lt;script&gt;/);
});
