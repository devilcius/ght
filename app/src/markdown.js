import MarkdownIt from 'markdown-it';

// HTML is disabled and markdown-it rejects unsafe URL schemes by default.
const markdown = new MarkdownIt({html:false, breaks:true, linkify:false});

export function renderMarkdown(text) {
  return markdown.render(text || '');
}

export function markdownText(text) {
  return markdown.parse(text || '', {}).map(token => {
    if (token.type === 'inline') return markdown.renderer.renderInlineAsText(token.children || [], markdown.options, {});
    if (token.type === 'fence' || token.type === 'code_block') return token.content;
    return '';
  }).filter(Boolean).join(' ');
}
