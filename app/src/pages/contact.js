import {renderContact} from '../page-views.js';
import {escapeHtml as e} from '../domain.js';
import {siteContent, propertyEnquiryBySlug} from '../content-repository.js';

export async function contactPage(env, url, origin, indexable) {
  const content = await siteContent(env);
  const propertySlug = url.searchParams.get('inmueble');
  const property = propertySlug ? await propertyEnquiryBySlug(env, propertySlug) : null;
  const enquiry = property ? `<div id="property-context"><p class="enquiry-context">Consulta sobre: <strong>${e(property.title)}</strong></p><input type="hidden" name="propertySlug" value="${e(property.slug)}"></div>` : '';
  const local = env.LOCAL_DEVELOPMENT === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const testTurnstile = local && env.LOCAL_TURNSTILE_TEST === 'true';
  return renderContact({content, enquiry, hasProperty: Boolean(property), origin, indexable, local: local && !testTurnstile, siteKey: testTurnstile ? '1x00000000000000000000AA' : env.TURNSTILE_SITE_KEY || ''});
}
