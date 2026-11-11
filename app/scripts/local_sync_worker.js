// This temporary Worker can only read the production binding and write the local one.
// It listens on loopback and requires a random token generated for each sync.
export default {
  async fetch(request, env) {
    if (typeof env.SYNC_TOKEN !== 'string' || !env.SYNC_TOKEN ||
        request.headers.get('Authorization') !== `Bearer ${env.SYNC_TOKEN}`) {
      return new Response('Unauthorized', {status: 401});
    }
    if (request.method === 'GET') return Response.json({ready: true});
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
    const {key} = await request.json();
    if (typeof key !== 'string' || !key || key.length > 1024) {
      return Response.json({error: 'Invalid object key'}, {status: 400});
    }
    const object = await env.PRODUCTION.get(key);
    if (!object) return Response.json({error: 'Object missing'}, {status: 404});
    await env.LOCAL.put(key, object.body, {
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata
    });
    const local = await env.LOCAL.head(key);
    if (!local || local.size !== object.size ||
        local.httpMetadata?.contentType !== object.httpMetadata?.contentType) {
      return Response.json({error: 'Local object verification failed'}, {status: 502});
    }
    return Response.json({size: local.size});
  }
};
