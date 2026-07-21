// Harfiyen worker girisi: REST + WS yonlendirme, origin allowlist.

export { GameRoom } from './room';

// Karistirilabilir karakterler (I, O, Q, X, W, 0, 1) alfabede yok.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const CODE_LEN = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);
const MAX_CODE_TRIES = 5;
const RATE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const WS_AUTH_PROTOCOL_PREFIX = 'harfiyen.auth.';

function clientRateKey(request: Request): string {
  // Normal istemciyi kalici ama yetki vermeyen cihaz anahtariyla sinirla. WS'de
  // oda secret'i yalniz rate-limit anahtari olur; URL'ye ya da loga yazilmaz.
  const clientId = request.headers.get('X-Harfiyen-Client')?.trim() ?? '';
  if (RATE_TOKEN_RE.test(clientId)) return `client:${clientId}`;

  const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map((p) => p.trim()) ?? [];
  const auth = protocols.find((p) => p.startsWith(WS_AUTH_PROTOCOL_PREFIX));
  const secret = auth?.slice(WS_AUTH_PROTOCOL_PREFIX.length) ?? '';
  if (RATE_TOKEN_RE.test(secret)) return `ws:${secret}`;

  // Eski/bozuk istemciler icin son kapı; normal trafikte ortak mobil IP'ler bu
  // kola dusmez. `local` Wrangler geliştirmesinde deterministiktir.
  return `network:${request.headers.get('CF-Connecting-IP')?.trim() || 'local'}`;
}

function tooManyRequests(): Response {
  return Response.json(
    { error: 'cok_fazla_istek', retryAfter: 60 },
    { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
  );
}

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin: string | null, requestUrl: URL, allowed: readonly string[]): boolean {
  return origin === null || origin === requestUrl.origin || allowed.includes(origin);
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function roomStub(env: Env, code: string): DurableObjectStub {
  return env.ROOM.get(env.ROOM.idFromName(code));
}

function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res;
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers });
}

function preflight(request: Request, origin: string | null): Response {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') ?? 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(null, { status: 204, headers });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/health') {
    return request.method === 'GET'
      ? Response.json({ ok: true })
      : new Response('yontem uygun degil', { status: 405 });
  }

  if (path === '/api/rooms') {
    if (request.method !== 'POST') return new Response('yontem uygun degil', { status: 405 });
    const creationLimit = await env.ROOM_CREATE_LIMITER.limit({ key: clientRateKey(request) });
    if (!creationLimit.success) return tooManyRequests();
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      const code = generateCode();
      const res = await roomStub(env, code).fetch(`https://do/reserve?code=${code}`, { method: 'POST' });
      if (res.ok) return Response.json({ code });
      // 409: kod zaten aktif bir odada, yeni kod dene
    }
    return Response.json({ error: 'oda kodu uretilemedi' }, { status: 503 });
  }

  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch) {
    if (request.method !== 'GET') return new Response('yontem uygun degil', { status: 405 });
    const lookupLimit = await env.ROOM_LOOKUP_LIMITER.limit({ key: clientRateKey(request) });
    if (!lookupLimit.success) return tooManyRequests();
    const code = roomMatch[1].toUpperCase();
    if (!CODE_RE.test(code)) return Response.json({ exists: false, joinable: false });
    return roomStub(env, code).fetch('https://do/status');
  }

  return new Response('bulunamadi', { status: 404 });
}

async function handleWs(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  // Once upgrade ve origin dogrulanir; WS CORS'a tabi degildir, guvenlik siniri burasi.
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('websocket upgrade gerekli', { status: 426 });
  }
  if (!isAllowedOrigin(origin, url, allowed)) {
    return new Response('izin verilmeyen origin', { status: 403 });
  }
  const lookupLimit = await env.ROOM_LOOKUP_LIMITER.limit({ key: clientRateKey(request) });
  if (!lookupLimit.success) return tooManyRequests();
  const match = url.pathname.match(/^\/ws\/([^/]+)$/);
  const code = match ? match[1].toUpperCase() : '';
  if (!CODE_RE.test(code)) {
    return new Response('gecersiz oda kodu', { status: 404 });
  }
  return roomStub(env, code).fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = allowedOrigins(env);

    if (url.pathname.startsWith('/api/')) {
      if (!isAllowedOrigin(origin, url, allowed)) {
        return new Response('izin verilmeyen origin', { status: 403 });
      }
      if (request.method === 'OPTIONS') return preflight(request, origin);
      return withCors(await handleApi(request, env, url), origin);
    }

    if (url.pathname.startsWith('/ws/')) {
      return handleWs(request, env, url, origin, allowed);
    }

    // API/WS disindaki her sey statik site (Workers assets)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
