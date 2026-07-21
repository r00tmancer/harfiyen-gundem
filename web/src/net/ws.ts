import type { ClientMsg, ServerMsg } from '@harfiyen/shared';
import { API_BASE, wsUrl } from '../config';
import { useStore } from '../store';

const RECONNECT_KEY_PREFIX = 'harfiyen:reconnect:v2:';
const CLIENT_RATE_KEY = 'harfiyen:client-rate:v1';
const CLIENT_RATE_HEADER = 'X-Harfiyen-Client';
const WS_APP_PROTOCOL = 'harfiyen.v2';
const WS_AUTH_PROTOCOL_PREFIX = 'harfiyen.auth.';
const SECRET_RE = /^[A-Za-z0-9_-]{22}$/;

function createReconnectSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Oda bazli secret ayni Safari/localStorage baglaminda tam sayfa yenilemesini ve
// iPhone uyku/uyandirma sonrasi yeniden baglanmayi guvenli tutar.
export function getReconnectSecret(code: string): string {
  const key = `${RECONNECT_KEY_PREFIX}${code.toUpperCase()}`;
  let secret = localStorage.getItem(key);
  if (!secret || !SECRET_RE.test(secret)) {
    secret = createReconnectSecret();
    localStorage.setItem(key, secret);
  }
  return secret;
}

function getClientRateId(): string {
  let id = localStorage.getItem(CLIENT_RATE_KEY);
  if (!id || !SECRET_RE.test(id)) {
    id = createReconnectSecret();
    localStorage.setItem(CLIENT_RATE_KEY, id);
  }
  return id;
}

function apiHeaders(): HeadersInit {
  return { [CLIENT_RATE_HEADER]: getClientRateId() };
}

let sock: WebSocket | null = null;
let currentCode: string | null = null;
let retry = 0;
let retryTimer: number | null = null;
let manualClose = false;

export function connect(code: string): void {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  currentCode = code;
  manualClose = false;
  retry = 0;
  openSocket();
}

function openSocket(): void {
  retryTimer = null;
  if (!currentCode) return;
  const st = useStore.getState();
  st.setConn(retry === 0 ? 'connecting' : 'reconnecting');

  const url = wsUrl(currentCode, {
    nick: st.nick,
    avatar: String(st.avatar),
  });
  const secret = getReconnectSecret(currentCode);
  const ws = new WebSocket(url, [WS_APP_PROTOCOL, `${WS_AUTH_PROTOCOL_PREFIX}${secret}`]);
  sock = ws;

  ws.onopen = () => {
    if (sock !== ws) return;
    if (ws.protocol !== WS_APP_PROTOCOL) {
      ws.close(1002, 'protocol');
      return;
    }
    retry = 0;
    useStore.getState().setConn('open');
  };

  ws.onmessage = (ev) => {
    if (sock !== ws) return;
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return;
    }
    if (msg.t === 'error' && (msg.code === 'room_full' || msg.code === 'not_found')) {
      // olmayan/dolu oda: tekrar deneme, ana ekrana don
      manualClose = true;
      currentCode = null;
      clearRoomHash();
    }
    useStore.getState().apply(msg);
  };

  ws.onclose = () => {
    if (sock !== ws) return;
    sock = null;
    if (manualClose) {
      useStore.getState().setConn('idle');
      return;
    }
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  // yalnizca oda ekranlari aktifken yeniden dene
  if (useStore.getState().screen === 'home') return;
  useStore.getState().setConn('reconnecting');
  const delay = Math.min(1000 * 2 ** retry, 10_000); // 1s -> 2s -> 4s -> ... max 10s
  retry += 1;
  retryTimer = window.setTimeout(openSocket, delay);
}

export function send(msg: ClientMsg): void {
  if (sock && sock.readyState === WebSocket.OPEN) {
    sock.send(JSON.stringify(msg));
  }
}

function clearRoomHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

// odayi bilerek terk et: soketi kapat, hash'i sil, ana ekrana don
export function leaveRoom(): void {
  manualClose = true;
  currentCode = null;
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (sock) {
    sock.close();
    sock = null;
  }
  clearRoomHash();
  useStore.getState().leaveToHome();
}

// ---- REST ----
export async function apiCreateRoom(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/rooms`, { method: 'POST', headers: apiHeaders() });
  if (!res.ok) throw new Error('create_failed');
  const data = (await res.json()) as { code: string };
  return data.code;
}

export async function apiCheckRoom(code: string): Promise<{ exists: boolean; joinable: boolean }> {
  const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(code)}`, { headers: apiHeaders() });
  if (!res.ok) throw new Error('check_failed');
  return (await res.json()) as { exists: boolean; joinable: boolean };
}
