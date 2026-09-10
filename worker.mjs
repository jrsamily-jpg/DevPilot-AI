const json = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return json(404, { error: 'Private runtime required', demo: true });
    }

    if (!env.ASSETS?.fetch) {
      return new Response('DevPilot assets are unavailable.', { status: 503 });
    }

    const response = await env.ASSETS.fetch(request);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-cache');
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
