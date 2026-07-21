import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useStore } from './store';
import { connect, hasReconnectSecret } from './net/ws';

// davet linki: #/oda/KOD -> katilma akisini onden doldur
// hem ilk yuklemede hem de ayni sekmede hash degistiginde (ikinci davet linki) calismali
function applyInviteHash() {
  const m = /^#\/oda\/([A-Za-z0-9]+)/.exec(location.hash);
  if (!m) return;
  const code = m[1].toUpperCase();
  const state = useStore.getState();

  // Tam sayfa yenilemede mevcut oyuncuyu tekrar form doldurtmadan odaya al.
  // Yeni bir davet linkinde secret yoktur; normal katilma formu gosterilir.
  if (state.screen === 'home' && state.nick.trim() && hasReconnectSecret(code)) {
    state.enterRoom(code);
    connect(code);
    return;
  }
  if (state.roomCode !== code) state.prefillJoin(code);
}
applyInviteHash();
window.addEventListener('hashchange', applyInviteHash);


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
