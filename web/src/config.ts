// API tabani: Cloudflare Workers Assets dagitiminda ayni origin; yerelde Worker dev portu.
// GitHub Pages gibi ayri-origin dagitimlar VITE_API_URL vermelidir.
export const API_BASE: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : window.location.origin);

// Paylasim linki deploy ortaminda kendiliginden dogru origin/base'i kullanir;
// istenirse VITE_PUBLIC_URL ile tek bir canonical adres sabitlenebilir.
export const PUBLIC_URL: string = (
  import.meta.env.VITE_PUBLIC_URL ?? new URL(import.meta.env.BASE_URL, window.location.origin).href
).replace(/\/$/, '');

// http(s) -> ws(s) donusumuyle oda soketi adresi uretir.
export function wsUrl(code: string, params: Record<string, string>): string {
  const u = new URL(API_BASE);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = u.pathname.replace(/\/+$/, '');
  u.pathname = `${basePath}/ws/${encodeURIComponent(code)}`;
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
