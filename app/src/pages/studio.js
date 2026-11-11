import {renderStudio} from '../page-views.js';
import {escapeHtml as e} from '../domain.js';
import {siteContent} from '../content-repository.js';
import {paragraphs} from '../components.js';

export async function studioPage(env, origin, indexable) {
  const content = await siteContent(env);
  const team = [1,2,3,4].map(i => `<article class="team-member"><h3>${e(content[`team_${i}_name`])}</h3><div>${paragraphs(content[`team_${i}_bio`])}</div></article>`).join('');
  return renderStudio({team, content, origin, indexable});
}
