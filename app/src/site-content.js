export const contentKeys = ['studio_intro','team_1_name','team_1_bio','team_2_name','team_2_bio','team_3_name','team_3_bio','team_4_name','team_4_bio','contact_email','contact_phone','contact_address'];
export function validateSiteContent(input) {
  const result = {};
  for (const key of contentKeys) {
    if (typeof input[key] !== 'string') throw new Error('Falta un campo de contenido.');
    const value = input[key].trim();
    if (value.length > (key.endsWith('_bio') || key === 'studio_intro' ? 10000 : 250)) throw new Error('El contenido supera la longitud permitida.');
    result[key] = value;
  }
  if (!/^[A-Za-z0-9.!#$%&'*+/=_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(result.contact_email)) throw new Error('Introduce un correo electrónico válido.');
  if (!/^[+\d\s().-]+$/.test(result.contact_phone)) throw new Error('Introduce un teléfono válido.');
  return result;
}
