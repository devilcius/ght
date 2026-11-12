import {renderStudio} from '../page-views.js';
import {escapeHtml as e} from '../domain.js';
import {siteContent} from '../content-repository.js';
import {paragraphs} from '../components.js';
import {siteImageUrl} from '../site-images.js';

export async function studioPage(env, origin, indexable) {
  const content = await siteContent(env);
  const team = [1,2,3,4].map(i => {
    const slot = `team_${i}`, name = content[`${slot}_name`];
    const alt = content[`${slot}_image_key`] ? `Retrato de ${name}` : '';
    return `<article class="team-member"><img class="team-member-image" src="${e(siteImageUrl(content, slot))}" alt="${e(alt)}" loading="lazy" decoding="async"><div class="team-member-body"><h3>${e(name)}</h3><div class="team-member-bio">${paragraphs(content[`${slot}_bio`])}</div></div></article>`;
  }).join('');
  return renderStudio({team, content, studioImage: siteImageUrl(content, 'studio'), origin, indexable});
}
