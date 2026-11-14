const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
const json = part => JSON.parse(new TextDecoder().decode(decode(part)));

export async function getAdmin(request, env) {
  const url = new URL(request.url);
  if (env.LOCAL_DEVELOPMENT === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return {email:'local@localhost', owner:true};
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUDIENCE || !env.ADMIN_EMAIL) return false;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = json(parts[0]), claims = json(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)) return false;
    if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(env.ACCESS_AUDIENCE) || typeof claims.email !== 'string' || !claims.email.trim()) return false;
    const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) return false;
    const email = claims.email.trim().toLowerCase();
    if (email === env.ADMIN_EMAIL.trim().toLowerCase()) return {email, owner:true};
    const user = await env.DB.prepare('SELECT id FROM admin_users WHERE email=? COLLATE NOCASE AND active=1').bind(email).first();
    return user ? {id:user.id, email, owner:false} : false;
  } catch { return false; }
}

export async function isAdmin(request, env) { return Boolean(await getAdmin(request, env)); }
