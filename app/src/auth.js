const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
const json = part => JSON.parse(new TextDecoder().decode(decode(part)));

export async function isAdmin(request, env) {
  const url = new URL(request.url);
  if (env.LOCAL_DEVELOPMENT === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUDIENCE || !env.ADMIN_EMAIL) return false;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = json(parts[0]), claims = json(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)) return false;
    if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(env.ACCESS_AUDIENCE) || claims.email?.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return false;
    const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
