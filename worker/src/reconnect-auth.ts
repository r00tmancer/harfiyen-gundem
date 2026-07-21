export const WS_APP_PROTOCOL = 'harfiyen.v2';
export const WS_AUTH_PROTOCOL_PREFIX = 'harfiyen.auth.';

const SECRET_RE = /^[A-Za-z0-9_-]{22}$/; // 16 byte, padding'siz base64url
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const HASH_DOMAIN = 'harfiyen:reconnect:v2:';

export type ReconnectProtocolResult =
  | { ok: true; secret: string }
  | {
      ok: false;
      reason: 'missing' | 'duplicate' | 'invalid_auth' | 'unexpected_protocol';
    };

// Istemci tam olarak uygulama protokolunu ve tek bir kimlik protokolunu sunar.
// Secret URL'ye ya da mesaj govdesine girmez; sunucu cevapta yalniz uygulama
// protokolunu secer.
export function parseReconnectProtocols(header: string | null): ReconnectProtocolResult {
  if (!header) return { ok: false, reason: 'missing' };

  const protocols = header
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);
  const appProtocols = protocols.filter((protocol) => protocol === WS_APP_PROTOCOL);
  const authProtocols = protocols.filter((protocol) => protocol.startsWith(WS_AUTH_PROTOCOL_PREFIX));

  if (appProtocols.length !== 1 || authProtocols.length !== 1) {
    return {
      ok: false,
      reason: appProtocols.length > 1 || authProtocols.length > 1 ? 'duplicate' : 'missing',
    };
  }
  if (protocols.length !== 2) return { ok: false, reason: 'unexpected_protocol' };

  const secret = authProtocols[0].slice(WS_AUTH_PROTOCOL_PREFIX.length);
  return SECRET_RE.test(secret) ? { ok: true, secret } : { ok: false, reason: 'invalid_auth' };
}

function bytesToHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!SHA256_HEX_RE.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function hashReconnectSecret(secret: string): Promise<string> {
  if (!SECRET_RE.test(secret)) throw new Error('invalid reconnect secret');
  const input = new TextEncoder().encode(`${HASH_DOMAIN}${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

async function reconnectHashesEqual(candidate: string, stored: string): Promise<boolean> {
  const candidateBytes = hexToBytes(candidate);
  const storedBytes = hexToBytes(stored);
  if (!candidateBytes || !storedBytes) return false;

  // Workers runtime sabit-zamanli karsilastirma sunar. Node tabanli saf birim
  // testlerinde bu uzanti olmayabildigi icin ayni uzunlukta XOR fallback'i var.
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(candidateBytes, storedBytes);
  }

  let difference = 0;
  for (let i = 0; i < candidateBytes.length; i += 1) {
    difference |= candidateBytes[i] ^ storedBytes[i];
  }
  return difference === 0;
}

export type ReconnectPlayer = { id: string; reconnectHash: string };

export type JoinResolution<T extends ReconnectPlayer> =
  | { kind: 'reconnect'; player: T }
  | { kind: 'new' }
  | { kind: 'full' };

export async function resolvePlayerJoin<T extends ReconnectPlayer>(
  players: readonly T[],
  reconnectHash: string,
  maxPlayers = 2,
): Promise<JoinResolution<T>> {
  for (const player of players) {
    if (await reconnectHashesEqual(reconnectHash, player.reconnectHash)) {
      return { kind: 'reconnect', player };
    }
  }
  return players.length >= maxPlayers ? { kind: 'full' } : { kind: 'new' };
}

export function createPublicPlayerId(
  players: readonly Pick<ReconnectPlayer, 'id'>[],
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomUUID();
    if (!players.some((player) => player.id === id)) return id;
  }
  throw new Error('benzersiz oyuncu kimligi uretilemedi');
}
