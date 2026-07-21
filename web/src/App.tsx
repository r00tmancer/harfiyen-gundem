import { useEffect } from 'react';
import { useStore } from './store';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import Victory from './screens/Victory';
import Reactions from './ui/Reactions';

function ConnToast() {
  const conn = useStore((s) => s.conn);
  const screen = useStore((s) => s.screen);
  if (screen === 'home' || conn !== 'reconnecting') return null;
  return (
    <div className="toast" role="status">
      Bağlantı koptu, yeniden deneniyor...
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const mode = useStore((s) => s.snapshot?.mode);
  const darkRandevu = mode === 'randevu_ruleti' && (screen === 'game' || screen === 'victory');
  const darkEmoji = mode === 'emoji_sifre' && (screen === 'game' || screen === 'victory');
  const darkFlags = mode === 'kirmizi_yesil' && (screen === 'game' || screen === 'victory');
  const darkMode = darkRandevu || darkEmoji || darkFlags;

  useEffect(() => {
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const statusBar = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
    theme?.setAttribute('content', darkFlags ? '#0A0E16' : darkEmoji ? '#0C0920' : darkRandevu ? '#09071A' : '#FFF6EC');
    statusBar?.setAttribute('content', darkMode ? 'black-translucent' : 'default');
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkEmoji, darkFlags, darkMode, darkRandevu]);

  return (
    <>
      <main className="app-shell mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4">
        {screen === 'home' && <Home />}
        {screen === 'lobby' && <Lobby />}
        {screen === 'game' && <Game />}
        {screen === 'victory' && <Victory />}
      </main>
      {/* sonuc ekraninda paylasim/rovans butonlarini kapatmamak icin tepki butonu gizlenir */}
      {screen !== 'home' && screen !== 'victory' && <Reactions />}
      <ConnToast />
    </>
  );
}
