import {renderContact} from '../page-views.js';
import {escapeHtml as e} from '../domain.js';
import {siteContent, propertyEnquiryBySlug} from '../content-repository.js';

export async function contactPage(env, url, origin, indexable) {
  const content = await siteContent(env);
  const propertySlug = url.searchParams.get('inmueble');
  const property = propertySlug ? await propertyEnquiryBySlug(env, propertySlug) : null;
  const enquiry = property ? `<p class="enquiry-context">Consulta sobre: <strong>${e(property.title)}</strong></p><input type="hidden" name="propertySlug" value="${e(property.slug)}">` : '';
  return renderContact({content, enquiry, origin, indexable});
}
