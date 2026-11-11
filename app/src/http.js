export const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
export const html = (body, status = 200) => new Response(body, {status, headers:{'Content-Type':'text/html; charset=utf-8'}});
