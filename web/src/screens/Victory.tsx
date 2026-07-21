import { useEffect, useRef, useState } from 'react';
import { AYNI_ANDA_SOYLE_ROUNDS, BENI_YAKALA_ROUNDS, BOM_LIVES, EMOJI_SIFRE_PALETTE, EMOJI_SIFRE_ROUNDS, KIM_DAHA_MUHTEMEL_ROUNDS, KIRMIZI_YESIL_ROUNDS, KOR_SIRALAMA_ITEMS, RANDEVU_RULETI_ROUNDS, TELEPATI_QUESTIONS, ZINCIR_LIVES } from '@harfiyen/shared';
import type { PlayerPublic, RandevuCategory, RoomSnapshot } from '@harfiyen/shared';
import { meOf, oppOf, playerIndex, useStore } from '../store';
import { leaveRoom, send } from '../net/ws';
import { Avatar } from '../ui/avatars';
import { IconEmojiCode, IconFlagRadar, IconHeartSolid, IconLikely, IconRanking, IconRoulette, IconSameWord, IconShare, IconTruthLie } from '../ui/icons';
import { MODE_META } from '../ui/modes';
import { Hearts, MedalDots, PLAYER_CSS, WinWash } from '../ui/parts';
import { staggerIn } from '../fx/anim';
import { heartRain, paletteFor, rain } from '../fx/confetti';
import { haptics } from '../fx/haptics';
import { up } from '../hooks';
import { clearIkiDogruBirYalanDraft } from '../drafts/ikiDogruBirYalanDraft';
import { PUBLIC_URL } from '../config';

const GAME_URL = PUBLIC_URL;

// kupa: sun dolgulu, ink konturlu buyuk SVG
function Trophy({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label="Kupa">
      <g stroke="var(--ink)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
        <path
          d="M28 14 h40 v22 a20 20 0 0 1-40 0 z"
          fill="var(--sun)"
        />
        <path
          d="M28 20 H16 a2 2 0 0 0-2 2 c0 10 6.5 16.5 14.5 18 M68 20 h12 a2 2 0 0 1 2 2 c0 10-6.5 16.5-14.5 18"
          fill="none"
        />
        <path d="M44 55 h8 v12 h-8 z" fill="var(--sun)" />
        <path d="M34 78 a14 8 0 0 1 28 0 z" fill="var(--sun)" />
        <path d="M30 67 h36 v11 h-36 z" fill="var(--grape)" />
      </g>
      {/* kupanin yuzu */}
      <circle cx={42} cy={30} r={2.6} fill="var(--ink)" />
      <circle cx={54} cy={30} r={2.6} fill="var(--ink)" />
      <path
        d="M42 37 Q48 42.5 54 37"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}

// mac skoru moda gore: sayi raund kazanimi, digerleri puan
function finalScoreOf(snap: RoomSnapshot, p: PlayerPublic): number {
  if (snap.mode === 'sayi') return snap.sayi?.roundWins[p.id] ?? p.score;
  return p.score;
}

// zincir/bom: skorun yerine kalan can gosterilir
function livesOf(snap: RoomSnapshot, p: PlayerPublic): number | null {
  if (snap.mode === 'zincir') return snap.zincir?.lives[p.id] ?? ZINCIR_LIVES;
  if (snap.mode === 'bom') return snap.bom?.lives[p.id] ?? BOM_LIVES;
  return null;
}

// oyuncu sutunu: buyuk sayi + moda ozel gosterge (madalya/kalp)
function PlayerScore({ snap, p, idx }: { snap: RoomSnapshot; p: PlayerPublic; idx: 0 | 1 }) {
  const lives = livesOf(snap, p);
  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar
        index={p.avatar}
        color={PLAYER_CSS[idx].main}
        size={56}
        className={p.connected ? '' : 'grayed'}
      />
      <p className="font-display text-sm font-bold">{p.nick}</p>
      {lives !== null ? (
        <Hearts lives={lives} size={20} max={snap.mode === 'bom' ? BOM_LIVES : ZINCIR_LIVES} />
      ) : (
        <p className="font-display text-4xl font-extrabold" style={{ color: PLAYER_CSS[idx].dark }}>
          {finalScoreOf(snap, p)}
        </p>
      )}
      {snap.mode === 'sayi' && <MedalDots wins={snap.sayi?.roundWins[p.id] ?? 0} size={16} />}
    </div>
  );
}

// telepati: ortak uyum yuzdesi ve maci bulunmayan ko-op sonucu
function isKoopTelepati(snap: RoomSnapshot): boolean {
  return snap.mode === 'telepati' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopKorSiralama(snap: RoomSnapshot): boolean {
  return snap.mode === 'kor_siralama' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopBeniYakala(snap: RoomSnapshot): boolean {
  return snap.mode === 'beni_yakala' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopRandevuRuleti(snap: RoomSnapshot): boolean {
  return snap.mode === 'randevu_ruleti' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopEmojiSifre(snap: RoomSnapshot): boolean {
  return snap.mode === 'emoji_sifre' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopKirmiziYesil(snap: RoomSnapshot): boolean {
  return snap.mode === 'kirmizi_yesil' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopKimDahaMuhtemel(snap: RoomSnapshot): boolean {
  return snap.mode === 'kim_daha_muhtemel' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopIkiDogruBirYalan(snap: RoomSnapshot): boolean {
  return snap.mode === 'iki_dogru_bir_yalan' && snap.winner === null && snap.phase === 'match_end';
}

function isKoopAyniAndaSoyle(snap: RoomSnapshot): boolean {
  return snap.mode === 'ayni_anda_soyle' && snap.winner === null && snap.phase === 'match_end';
}

// cifte kalple %100'u asabilir; asla kirpilmaz ('%110 uyum!' daha tatli)
function telepatiPct(snap: RoomSnapshot): number {
  const matches = snap.telepati?.matches ?? meOf(snap)?.score ?? 0;
  return Math.round((matches / TELEPATI_QUESTIONS) * 100);
}

function korSiralamaPct(snap: RoomSnapshot): number {
  return snap.korSiralama?.compatibility ?? 0;
}

function beniYakalaPct(snap: RoomSnapshot): number {
  const reads = Object.values(snap.beniYakala?.reads ?? {});
  return Math.round((Math.max(0, ...reads) / BENI_YAKALA_ROUNDS) * 100);
}

function randevuRuletiPct(snap: RoomSnapshot): number {
  return Math.round(((snap.randevuRuleti?.matches ?? 0) / RANDEVU_RULETI_ROUNDS) * 100);
}

function emojiSifrePct(snap: RoomSnapshot): number {
  return Math.round(((snap.emojiSifre?.correctCount ?? 0) / EMOJI_SIFRE_ROUNDS) * 100);
}

function kirmiziYesilPct(snap: RoomSnapshot): number {
  const game = snap.kirmiziYesil;
  if (!game) return 0;
  // match_end eventi final snapshot'tan hemen once gelebilir. O kisa aralikta
  // sunucunun kullandigi jointRounds paydasini yerelde de aynen koru.
  return game.compatibility
    ?? (game.jointRounds === 0 ? 0 : Math.round((game.matches / game.jointRounds) * 100));
}

function kimDahaMuhtemelPct(snap: RoomSnapshot): number {
  const game = snap.kimDahaMuhtemel;
  if (!game) return 0;
  return game.agreementPct
    ?? (game.jointRounds === 0 ? 0 : Math.round((game.agreements / game.jointRounds) * 100));
}

function ikiDogruBirYalanPct(snap: RoomSnapshot): number {
  const game = snap.ikiDogruBirYalan;
  if (!game) return 0;
  return game.catchRate
    ?? (game.attemptedCount === 0 ? 0 : Math.round((game.caughtCount / game.attemptedCount) * 100));
}

function ayniAndaSoylePct(snap: RoomSnapshot): number {
  const game = snap.ayniAndaSoyle;
  if (!game) return 0;
  return game.matchRate
    ?? (game.jointRounds === 0 ? 0 : Math.round((game.matches / game.jointRounds) * 100));
}

function ayniAndaSoyleResult(jointRounds: number, matchRate: number): { title: string; subtitle: string } {
  if (jointRounds < 3) {
    return { title: 'Tur yarım kaldı', subtitle: 'Sağlam bir frekans özeti için en az üç ortak cevap gerekiyordu.' };
  }
  if (matchRate >= 80) {
    return { title: 'Tek zihin, iki telefon', subtitle: 'Cevaplarınız neredeyse her kategoride aynı yere indi.' };
  }
  if (matchRate >= 60) {
    return { title: 'Aynı frekanstasınız', subtitle: 'Gecenin çoğunda aynı cevabı yakaladınız.' };
  }
  if (matchRate >= 40) {
    return { title: 'Birkaç kelime uzakta', subtitle: 'Ortak cevaplar var; sürprizler de yerini koruyor.' };
  }
  return { title: 'İki ayrı evren', subtitle: 'Farklı cevaplar, konuşacak daha çok şey demek.' };
}

function ikiDogruBirYalanResult(
  caughtCount: number,
  attemptedCount: number,
  availableRounds: number,
): { title: string; subtitle: string } {
  if (availableRounds < 2 || attemptedCount < 2) {
    return { title: 'Tur yarım kaldı', subtitle: 'Gece özeti için iki paket ve iki tahmin de tamamlanmalıydı.' };
  }
  if (caughtCount >= 2) {
    return { title: 'Yalan dedektifleri', subtitle: 'İki gizli yalan da gözünüzden kaçmadı.' };
  }
  if (caughtCount === 1) {
    return { title: 'Biri yakalandı', subtitle: 'Bir yalan bulundu, biri poker yüzüne takıldı.' };
  }
  return { title: 'Poker yüzleri kazandı', subtitle: 'Bu gece iki yalan da sırrını korudu.' };
}

function kirmiziYesilResult(jointRounds: number, pct: number): { title: string; subtitle: string } {
  if (jointRounds < 4) {
    return { title: 'Radar yarım kaldı', subtitle: 'Sağlam bir sonuç için birkaç ortak seçim daha gerekiyordu.' };
  }
  if (pct >= 88) {
    return { title: 'Bayrak telepatisi', subtitle: 'Neredeyse her durumda aynı renge baktınız.' };
  }
  if (pct >= 63) {
    return { title: 'Aynı frekanstasınız', subtitle: 'Renkleriniz çoğunlukla aynı yöne dönüyor.' };
  }
  if (pct >= 38) {
    return { title: 'Tatlı gri alan', subtitle: 'Konuşacak güzel başlıklar çıktı.' };
  }
  return { title: 'Farklı renk, aynı takım', subtitle: 'Aynı durumlara kendi renginizden bakıyorsunuz.' };
}

function kimDahaMuhtemelResult(jointRounds: number, pct: number): { title: string; subtitle: string } {
  if (jointRounds < 4) {
    return { title: 'Tur yarım kaldı', subtitle: 'Sağlam bir özet için birkaç ortak işaret daha gerekiyordu.' };
  }
  if (pct >= 88) {
    return { title: 'Parmak telepatisi', subtitle: 'Neredeyse her soruda aynı hedefi gösterdiniz.' };
  }
  if (pct >= 63) {
    return { title: 'Çoğunlukla aynı yön', subtitle: 'Spot ışıklarınız sık sık buluştu.' };
  }
  if (pct >= 38) {
    return { title: 'Tatlı bir denge', subtitle: 'Hem ortak hem ayrı rolleriniz var.' };
  }
  return { title: 'Farklı rol, aynı takım', subtitle: 'Sorulara kendi pencerenizden baktınız.' };
}

function randevuCategoryLabel(category: RandevuCategory): string {
  if (category === 'yemek') return 'Yemek';
  if (category === 'etkinlik') return 'Etkinlik';
  return 'Tatlı';
}

function uyumTitle(pct: number): string {
  if (pct >= 90) return 'Ruh ikizisiniz!';
  if (pct >= 70) return 'Kalpler aynı atıyor';
  if (pct >= 50) return 'Fena değil, gelişiyorsunuz';
  return 'Zıt kutuplar çeker derler...';
}

function RankingResult({
  player,
  idx,
  ranking,
  mine,
}: {
  player: PlayerPublic;
  idx: 0 | 1;
  ranking: readonly string[];
  mine: boolean;
}) {
  return (
    <div className="card-candy flex min-w-0 flex-1 flex-col gap-2 p-3!" style={{ background: PLAYER_CSS[idx].soft }}>
      <div className="flex min-w-0 items-center gap-2">
        <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={34} />
        <p className="font-display min-w-0 truncate text-[13px] font-extrabold">{mine ? 'Sen' : player.nick}</p>
      </div>
      <ol className="flex flex-col gap-1.5 text-left">
        {ranking.map((item, index) => (
          <li key={`${item}-${index}`} className="ranking-result-item">
            <span>{index + 1}</span>
            <p>{item}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// paylasim skoru: zincir/bom kalan can, sayi raund, digerleri puan
function scorelineOf(snap: RoomSnapshot): string {
  const me = meOf(snap);
  const opp = oppOf(snap);
  if (!me || !opp) return '';
  const mine = livesOf(snap, me) ?? finalScoreOf(snap, me);
  const theirs = livesOf(snap, opp) ?? finalScoreOf(snap, opp);
  return `${mine}-${theirs}`;
}

// Paylas: moda ozel PNG varsa iPhone share sheet'e dosya olarak verir; destek
// yoksa gorseli indirir ve metni panoya kopyalar. Diger modlar metinle devam eder.
function ShareButton({
  text,
  title = 'Harfiyen Sonucu',
  makeFile,
}: {
  text: string;
  title?: string;
  makeFile?: () => Promise<File>;
}) {
  const [status, setStatus] = useState<
    'copied' | 'downloaded' | 'downloaded_copied' | 'error' | null
  >(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    let file: File | null = null;
    if (makeFile) {
      try {
        file = await makeFile();
      } catch {
        // Gorsel uretilmezse metin paylasimina geri dusulur.
      }
    }

    try {
      if (
        file &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ title, text, files: [file] });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Dosyali share sheet hata verirse metin veya indirme fallback'ine gec.
        }
      }
      // Dosya paylasimi desteklenmese bile sistemin metin share sheet'ini dene.
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Sistem paylasimi basarisizsa indirme/pano fallback'i devam eder.
        }
      }

      let downloaded = false;
      if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        downloaded = true;
      }
      try {
        await navigator.clipboard.writeText(text);
        setStatus(downloaded ? 'downloaded_copied' : 'copied');
      } catch {
        // Gorsel zaten indirildiyse pano izni hatasi basarili indirmeyi bozmaz.
        setStatus(downloaded ? 'downloaded' : 'error');
      }
      window.setTimeout(() => setStatus(null), 2400);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" className="btn-candy btn-block" disabled={busy} onClick={() => void share()}>
        <IconShare />
        {busy ? 'Hazırlanıyor...' : makeFile ? 'Story görselini paylaş' : 'Paylaş'}
      </button>
      {status && (
        <span className="chip chip-ok" role="status">
          {status === 'downloaded_copied'
            ? 'Görsel indirildi, metin kopyalandı!'
            : status === 'downloaded'
              ? 'Görsel indirildi!'
            : status === 'copied'
              ? 'Kopyalandı!'
              : 'Paylaşım hazırlanamadı'}
        </span>
      )}
    </div>
  );
}

// StrictMode cift calismasina karsi: her mac sonu kutlamasi bir kez
let celebratedSeq = -1;

export default function Victory() {
  const snapshot = useStore((s) => s.snapshot);
  const rematchWants = useStore((s) => s.rematchWants);
  const matchEndSeq = useStore((s) => s.matchEndSeq);
  const oppConnected = useStore((s) => s.oppConnected);
  const connected = useStore((s) => s.conn === 'open');
  const finalWord = useStore((s) => s.finalWord);
  const wordInfos = useStore((s) => s.wordInfos);
  const root = useRef<HTMLDivElement>(null);

  const winner = snapshot?.winner
    ? snapshot.players.find((p) => p.id === snapshot.winner)
    : undefined;
  const iWon = !!snapshot && snapshot.winner === snapshot.you;

  useEffect(() => {
    staggerIn(root.current);
  }, []);

  useEffect(() => {
    // matchEndSeq 0 ise mac sonu mesaji bu oturumda gelmedi (sayfa yenileme) — kutlama yok
    if (!snapshot || matchEndSeq === 0 || matchEndSeq === celebratedSeq) return;
    // ko-op modlar: kazanan yok, yuksek uyumda kalp yagmuru
    if (
      isKoopTelepati(snapshot) ||
      isKoopKorSiralama(snapshot) ||
      isKoopBeniYakala(snapshot) ||
      isKoopRandevuRuleti(snapshot) ||
      isKoopEmojiSifre(snapshot) ||
      isKoopKirmiziYesil(snapshot) ||
      isKoopKimDahaMuhtemel(snapshot) ||
      isKoopIkiDogruBirYalan(snapshot) ||
      isKoopAyniAndaSoyle(snapshot)
    ) {
      celebratedSeq = matchEndSeq;
      if (isKoopAyniAndaSoyle(snapshot) && (snapshot.ayniAndaSoyle?.jointRounds ?? 0) < 3) {
        if ((snapshot.ayniAndaSoyle?.jointRounds ?? 0) > 0) haptics.tick();
        return;
      }
      if (isKoopIkiDogruBirYalan(snapshot)) {
        const fullTruthLieResult = (
          (snapshot.ikiDogruBirYalan?.availableRounds ?? 0) >= 2
          && (snapshot.ikiDogruBirYalan?.attemptedCount ?? 0) >= 2
        );
        if (!fullTruthLieResult) {
          if ((snapshot.ikiDogruBirYalan?.availableRounds ?? 0) > 0) haptics.tick();
          return;
        }
      }
      haptics.victory();
      const pct = isKoopTelepati(snapshot)
        ? telepatiPct(snapshot)
        : isKoopKorSiralama(snapshot)
          ? korSiralamaPct(snapshot)
          : isKoopBeniYakala(snapshot)
            ? beniYakalaPct(snapshot)
            : isKoopRandevuRuleti(snapshot)
              ? randevuRuletiPct(snapshot)
              : isKoopEmojiSifre(snapshot)
                ? emojiSifrePct(snapshot)
                : isKoopKirmiziYesil(snapshot)
                  ? kirmiziYesilPct(snapshot)
                  : isKoopKimDahaMuhtemel(snapshot)
                    ? kimDahaMuhtemelPct(snapshot)
                    : isKoopIkiDogruBirYalan(snapshot)
                      ? ikiDogruBirYalanPct(snapshot)
                      : ayniAndaSoylePct(snapshot);
      const enoughFlagRounds = !isKoopKirmiziYesil(snapshot)
        || (snapshot.kirmiziYesil?.jointRounds ?? 0) >= 4;
      const enoughLikelyRounds = !isKoopKimDahaMuhtemel(snapshot)
        || (snapshot.kimDahaMuhtemel?.jointRounds ?? 0) >= 4;
      const enoughTruthLieRounds = !isKoopIkiDogruBirYalan(snapshot)
        || (
          (snapshot.ikiDogruBirYalan?.availableRounds ?? 0) >= 2
          && (snapshot.ikiDogruBirYalan?.attemptedCount ?? 0) >= 2
        );
      const enoughSameWordRounds = !isKoopAyniAndaSoyle(snapshot)
        || (snapshot.ayniAndaSoyle?.jointRounds ?? 0) >= 3;
      if (pct >= 70 && enoughFlagRounds && enoughLikelyRounds && enoughTruthLieRounds && enoughSameWordRounds) heartRain();
      return;
    }
    if (!winner) return;
    celebratedSeq = matchEndSeq;
    haptics.victory();
    rain(paletteFor(playerIndex(snapshot, winner.id)));
  }, [snapshot, winner, matchEndSeq]);

  if (!snapshot) return null;

  const me = meOf(snapshot);
  const opp = oppOf(snapshot);
  const myIdx = me ? playerIndex(snapshot, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const mineWant = rematchWants.includes(snapshot.you);
  const oppWants = !!opp && rematchWants.includes(opp.id);

  // paylasim metni: kazanan/kaybeden perspektifi; telepati ortak uyum yuzdesi
  const shareMsg = isKoopTelepati(snapshot)
    ? `Telepati testinde uyumumuz %${telepatiPct(snapshot)} çıktı! Siz de deneyin: ${GAME_URL}`
    : isKoopKorSiralama(snapshot)
      ? `Kör Sıralama'da listelerimiz %${korSiralamaPct(snapshot)} uydu! Siz de geleceği görmeden sıralayın: ${GAME_URL}`
      : isKoopBeniYakala(snapshot) && me && opp
        ? `Beni Yakala'da ${opp.nick} kalbimi ${snapshot.beniYakala?.reads[opp.id] ?? 0}/${BENI_YAKALA_ROUNDS} okudu! Siz de deneyin: ${GAME_URL}`
      : isKoopRandevuRuleti(snapshot)
        ? `Randevu Ruleti planımız hazır: ${snapshot.randevuRuleti?.plan.map((item) => item.label).join(' → ') ?? 'sürpriz randevu'} · ${snapshot.randevuRuleti?.matches ?? 0}/${RANDEVU_RULETI_ROUNDS} aynı seçim! Siz de deneyin: ${GAME_URL}`
      : isKoopEmojiSifre(snapshot)
        ? `Emoji Şifre'de ${snapshot.emojiSifre?.correctCount ?? 0}/${EMOJI_SIFRE_ROUNDS} ortak şifre çözdük! Siz de üç emojiyle anlatın: ${GAME_URL}`
      : isKoopKirmiziYesil(snapshot)
        ? `Kırmızı mı Yeşil mi? oyununda ${snapshot.kirmiziYesil?.matches ?? 0}/${KIRMIZI_YESIL_ROUNDS} aynı rengi seçtik! Siz de ilişki radarınızı açın: ${GAME_URL}`
      : isKoopKimDahaMuhtemel(snapshot)
        ? `Kim Daha Muhtemel? oyununda ${snapshot.kimDahaMuhtemel?.agreements ?? 0}/${KIM_DAHA_MUHTEMEL_ROUNDS} kez aynı hedefi gösterdik! Siz de deneyin: ${GAME_URL}`
      : isKoopAyniAndaSoyle(snapshot)
        ? `Aynı Anda Söyle'de ${snapshot.ayniAndaSoyle?.matches ?? 0}/${AYNI_ANDA_SOYLE_ROUNDS} ortak cevap yakaladık! Siz de deneyin: ${GAME_URL}`
      : isKoopIkiDogruBirYalan(snapshot)
        ? `İki Doğru Bir Yalan'da ${snapshot.ikiDogruBirYalan?.caughtCount ?? 0}/${snapshot.ikiDogruBirYalan?.availableRounds ?? 0} gizli yalanı yakaladık! Siz de deneyin: ${GAME_URL}`
      : iWon && opp
      ? `Harfiyen'de ${opp.nick}'i ${scorelineOf(snapshot)} yendim! Sen de oyna: ${GAME_URL}`
      : `Harfiyen'de kıl payı kaybettim, rövanş şart! Sen de oyna: ${GAME_URL}`;

  const kor = snapshot.korSiralama;
  const makeKorShareFile =
    isKoopKorSiralama(snapshot) && me && opp && kor?.finalRankings
      ? async () => {
          const { createKorShareCard } = await import('../share/korSiralamaCard');
          return createKorShareCard({
            topic: kor.topic,
            pct: kor.compatibility ?? 0,
            exactMatches: kor.exactMatches,
            url: GAME_URL,
            playerA: { name: me.nick, ranking: kor.finalRankings?.[me.id] ?? [] },
            playerB: { name: opp.nick, ranking: kor.finalRankings?.[opp.id] ?? [] },
          });
        }
      : undefined;

  const beni = snapshot.beniYakala;
  const makeBeniShareFile =
    isKoopBeniYakala(snapshot) && me && opp && beni
      ? async () => {
          const { createBeniYakalaShareCard } = await import('../share/beniYakalaCard');
          return createBeniYakalaShareCard({
            myName: me.nick,
            partnerName: opp.nick,
            myReads: beni.reads[me.id] ?? 0,
            partnerReads: beni.reads[opp.id] ?? 0,
            url: GAME_URL,
          });
        }
      : undefined;
  const randevu = snapshot.randevuRuleti;
  const makeRandevuShareFile =
    isKoopRandevuRuleti(snapshot) && me && opp && randevu
      ? async () => {
          const { createRandevuRuletiShareCard } = await import('../share/randevuRuletiCard');
          return createRandevuRuletiShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            exactMatches: randevu.matches,
            plan: randevu.plan.map((item) => ({
              category: randevuCategoryLabel(item.category),
              choice: item.label,
            })),
            url: GAME_URL,
          });
        }
      : undefined;
  const emoji = snapshot.emojiSifre;
  const makeEmojiShareFile =
    isKoopEmojiSifre(snapshot) && me && opp && emoji
      ? async () => {
          const { createEmojiSifreShareCard } = await import('../share/emojiSifreCard');
          return createEmojiSifreShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            correct: emoji.correctCount,
            // Yalnız açılmış history aktarılır; aktif hedef/kod Story API'sine giremez.
            revealedRounds: emoji.history.map((round) => ({
              target: round.target,
              emojis: round.code.map((index) => EMOJI_SIFRE_PALETTE[index]) as [string, string, string],
              status: round.codeFallback && round.guess !== null && round.guess === round.correctChoice
                ? 'assisted'
                : round.correct
                  ? 'solved'
                  : 'miss',
            })),
            url: GAME_URL,
          });
        }
      : undefined;
  const flags = snapshot.kirmiziYesil;
  const featuredFlagPrompt = flags
    ? [...flags.history].reverse().find((round) => round.match)?.prompt
      ?? flags.history.at(-1)?.prompt
      ?? 'Bu davranış sende hangi rengi yakıyor?'
    : 'Bu davranış sende hangi rengi yakıyor?';
  const makeFlagsShareFile =
    isKoopKirmiziYesil(snapshot) && me && opp && flags
      ? async () => {
          const { createKirmiziYesilShareCard } = await import('../share/kirmiziYesilCard');
          return createKirmiziYesilShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            matches: flags.matches,
            redMatches: flags.redMatches,
            dependsMatches: flags.dependsMatches,
            greenMatches: flags.greenMatches,
            jointRounds: flags.jointRounds,
            splitRounds: flags.splitRounds,
            missedRounds: flags.missedRounds,
            compatibility: flags.compatibility ?? kirmiziYesilPct(snapshot),
            // Yalniz tamamlanip acilmis history'den tek guvenli prompt aktarilir.
            featuredPrompt: featuredFlagPrompt,
            url: GAME_URL,
          });
        }
      : undefined;
  const likely = snapshot.kimDahaMuhtemel;
  const featuredLikelyPrompt = likely
    ? [...likely.history].reverse().find((round) => (
        round.resolution !== 'solo' && round.resolution !== 'skipped'
      ))?.prompt
      ?? 'Sence hanginiz bunu yapmaya daha yatkın?'
    : 'Sence hanginiz bunu yapmaya daha yatkın?';
  const makeLikelyShareFile =
    isKoopKimDahaMuhtemel(snapshot) && me && opp && likely
      ? async () => {
          const { createKimDahaMuhtemelShareCard } = await import('../share/kimDahaMuhtemelCard');
          return createKimDahaMuhtemelShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            agreements: likely.agreements,
            samePersonAgreements: likely.samePersonAgreements,
            bothAgreements: likely.bothAgreements,
            jointRounds: likely.jointRounds,
            splitRounds: likely.splitRounds,
            missedRounds: likely.missedRounds,
            agreementPct: likely.agreementPct ?? kimDahaMuhtemelPct(snapshot),
            // Yalnız açılmış ortak turdan soru aktarılır; hedefler Story API'sine giremez.
            featuredPrompt: featuredLikelyPrompt,
            url: GAME_URL,
          });
        }
      : undefined;
  const sameWord = snapshot.ayniAndaSoyle;
  const makeSameWordShareFile =
    isKoopAyniAndaSoyle(snapshot) && me && opp && sameWord && sameWord.jointRounds > 0
      ? async () => {
          const { createAyniAndaSoyleShareCard } = await import('../share/ayniAndaSoyleCard');
          return createAyniAndaSoyleShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            matches: sameWord.matches,
            jointRounds: sameWord.jointRounds,
            splitRounds: sameWord.differentRounds,
            missedRounds: sameWord.missedRounds,
            compatibility: sameWord.matchRate ?? ayniAndaSoylePct(snapshot),
            url: GAME_URL,
          });
        }
      : undefined;
  const truthLie = snapshot.ikiDogruBirYalan;
  const makeTruthLieShareFile =
    isKoopIkiDogruBirYalan(snapshot) && me && opp && truthLie && truthLie.availableRounds > 0
      ? async () => {
          const { createIkiDogruBirYalanShareCard } = await import('../share/ikiDogruBirYalanCard');
          return createIkiDogruBirYalanShareCard({
            playerA: me.nick,
            playerB: opp.nick,
            caughtCount: truthLie.caughtCount,
            wrongCount: truthLie.wrongCount,
            skippedCount: truthLie.skippedCount,
            attemptedCount: truthLie.attemptedCount,
            availableRounds: truthLie.availableRounds,
            catchRate: truthLie.catchRate ?? ikiDogruBirYalanPct(snapshot),
            url: GAME_URL,
          });
        }
      : undefined;
  const shareTitle = isKoopAyniAndaSoyle(snapshot)
    ? 'Aynı Anda Söyle Sonucu'
    : isKoopIkiDogruBirYalan(snapshot)
    ? 'İki Doğru Bir Yalan Sonucu'
    : isKoopKimDahaMuhtemel(snapshot)
    ? 'Kim Daha Muhtemel? Sonucu'
    : isKoopKirmiziYesil(snapshot)
    ? 'Kırmızı mı Yeşil mi? Sonucu'
    : isKoopEmojiSifre(snapshot)
    ? 'Emoji Şifre Sonucu'
    : isKoopRandevuRuleti(snapshot)
    ? 'Randevu Ruleti Sonucu'
    : isKoopBeniYakala(snapshot)
      ? 'Beni Yakala Sonucu'
    : isKoopKorSiralama(snapshot)
      ? 'Kör Sıralama Sonucu'
      : 'Harfiyen Sonucu';

  // rovans/paylas/yeni oda + durum rozetleri: iki varyantta da ayni
  const footer = (
    <>
      {oppWants && !mineWant && (
        <div className="chip chip-sun" role="status">
          Rakip rövanş istiyor!
        </div>
      )}
      {!oppConnected && (
        <div className="chip chip-soft" role="status">
          Rakip ayrıldı
        </div>
      )}

      <div data-pop className="flex w-full flex-col gap-3">
        <button
          type="button"
          className="btn-candy btn-mint btn-lg btn-block"
          disabled={mineWant || !connected}
          onClick={() => {
            if (isKoopIkiDogruBirYalan(snapshot)) {
              clearIkiDogruBirYalanDraft(snapshot.code, snapshot.you);
            }
            send({ t: 'rematch' });
          }}
        >
          {!connected ? 'Bağlanılıyor…' : mineWant ? `Rövanş istendi (${rematchWants.length}/2)` : 'Rövanş'}
        </button>
        {/* ikincil aksiyon: rovansin altinda */}
        {!(
          (isKoopIkiDogruBirYalan(snapshot) && (truthLie?.availableRounds ?? 0) === 0)
          || (isKoopAyniAndaSoyle(snapshot) && (sameWord?.jointRounds ?? 0) === 0)
        ) && (
          <ShareButton
            text={shareMsg}
            title={shareTitle}
            makeFile={makeSameWordShareFile ?? makeTruthLieShareFile ?? makeLikelyShareFile ?? makeFlagsShareFile ?? makeEmojiShareFile ?? makeRandevuShareFile ?? makeBeniShareFile ?? makeKorShareFile}
          />
        )}
        <button type="button" className="btn-candy btn-block" onClick={() => leaveRoom()}>
          Yeni oda
        </button>
      </div>
    </>
  );

  // ---- ko-op telepati: kazanan yok, ortak uyum sonucu ----
  if (isKoopTelepati(snapshot)) {
    const matches = snapshot.telepati?.matches ?? me?.score ?? 0;
    const pct = telepatiPct(snapshot);
    return (
      <div ref={root} className="flex w-full flex-col items-center gap-5 pt-8 pb-6 text-center">
        {/* pembe yikamasi: bu modda renk taraf degil sevgi belirtir */}
        <WinWash mine={false} />

        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={64} />}
          <span className="inline-flex" style={{ color: 'var(--p1)' }} aria-hidden="true">
            <IconHeartSolid size={34} />
          </span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={64}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <h1 data-pop className="font-display text-4xl font-extrabold">
          Uyum Sonucu
        </h1>

        <div data-pop className="chip chip-soft">
          {MODE_META.telepati.name}
          {opp ? ` — ${me?.nick ?? ''} + ${opp.nick}` : ''}
        </div>

        <div data-pop className="card-candy w-full text-center">
          <p className="uyum-pct" aria-label={`Yüzde ${pct} uyum`}>
            %{pct}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold" style={{ color: 'var(--p1-dark)' }}>
            {uyumTitle(pct)}
          </p>
          <p className="mt-3 flex items-center justify-center">
            <span className="chip chip-p1 font-display text-base">
              <IconHeartSolid size={15} style={{ color: 'var(--p1-dark)' }} />
              {matches} uyum · {TELEPATI_QUESTIONS} soru
            </span>
          </p>
        </div>

        {footer}
      </div>
    );
  }

  // ---- ko-op kor siralama: iki tam liste + ortak uyum ----
  if (isKoopKorSiralama(snapshot)) {
    const k = snapshot.korSiralama;
    const pct = korSiralamaPct(snapshot);
    const myRanking = me ? (k?.finalRankings?.[me.id] ?? []) : [];
    const oppRanking = opp ? (k?.finalRankings?.[opp.id] ?? []) : [];
    return (
      <div ref={root} className="flex w-full flex-col items-center gap-5 pt-8 pb-6 text-center">
        <WinWash mine={false} />

        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="inline-flex" style={{ color: 'var(--grape)' }} aria-hidden="true">
            <IconRanking size={38} />
          </span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <h1 data-pop className="font-display text-4xl font-extrabold">
          Listeler Açıldı!
        </h1>
        <div data-pop className="chip chip-soft">
          {MODE_META.kor_siralama.name} · {k?.topic ?? 'Sürpriz konu'}
        </div>

        <div data-pop className="card-candy w-full text-center">
          <p className="uyum-pct" aria-label={`Yüzde ${pct} sıralama uyumu`}>
            %{pct}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold" style={{ color: 'var(--p1-dark)' }}>
            {uyumTitle(pct)}
          </p>
          <p className="mt-3 flex items-center justify-center">
            <span className="chip chip-p1 font-display text-sm">
              <IconHeartSolid size={14} style={{ color: 'var(--p1-dark)' }} />
              {k?.exactMatches ?? 0}/{KOR_SIRALAMA_ITEMS} tam sıra
            </span>
          </p>
        </div>

        <div data-pop className="flex w-full items-stretch gap-2">
          {me && <RankingResult player={me} idx={myIdx} ranking={myRanking} mine />}
          {opp && <RankingResult player={opp} idx={oppIdx} ranking={oppRanking} mine={false} />}
        </div>

        <p data-pop className="text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
          1 favori · 5 en sona
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op Ayni Anda Soyle: yalniz toplu metrik; ham cevaplar finalde yok ----
  if (isKoopAyniAndaSoyle(snapshot)) {
    const game = snapshot.ayniAndaSoyle;
    const matches = game?.matches ?? 0;
    const jointRounds = game?.jointRounds ?? 0;
    const differentRounds = game?.differentRounds ?? 0;
    const missedRounds = game?.missedRounds ?? 0;
    const matchRate = ayniAndaSoylePct(snapshot);
    const incomplete = jointRounds < 3;
    const result = ayniAndaSoyleResult(jointRounds, matchRate);
    return (
      <div ref={root} className="same-word-shell same-word-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="same-word-final-icon" aria-hidden="true"><IconSameWord size={40} /></span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="same-word-final-kicker">CEVAPLAR KAPANDI</p>
          <div className="same-word-final-names">
            {MODE_META.ayni_anda_soyle.name}
            {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
          </div>
        </div>

        <div
          data-pop
          className="same-word-final-score"
          role="status"
          aria-label={incomplete
            ? `${AYNI_ANDA_SOYLE_ROUNDS} turdan ${jointRounds} tanesi birlikte cevaplandı; tur yarım kaldı`
            : `${AYNI_ANDA_SOYLE_ROUNDS} turdan ${matches} ortak cevap; yüzde ${matchRate} aynı frekans`}
        >
          <h1><strong>{matches}/{AYNI_ANDA_SOYLE_ROUNDS}</strong><span>ORTAK CEVAP</span></h1>
          <small>{incomplete ? `${jointRounds}/${AYNI_ANDA_SOYLE_ROUNDS} ortak tur tamamlandı` : `%${matchRate} aynı frekans`}</small>
        </div>

        <div data-pop className="same-word-final-copy">
          <h2>{result.title}</h2>
          <p>{result.subtitle}</p>
        </div>

        <div data-pop className="same-word-final-stats" aria-label="Ortak cevap özeti">
          <div className="same-word-final-stat match">
            <strong>{matches}</strong>
            <span>EŞLEŞTİ</span>
          </div>
          <div className="same-word-final-stat split">
            <strong>{differentRounds}</strong>
            <span>FARKLI</span>
          </div>
          <div className="same-word-final-stat missed">
            <strong>{missedRounds}</strong>
            <span>KAÇAN TUR</span>
          </div>
        </div>

        <div data-pop className="same-word-final-summary">
          <span>{jointRounds}/{AYNI_ANDA_SOYLE_ROUNDS} birlikte cevaplandı</span>
          <span>{matches} eşleşme · {differentRounds} farklı</span>
        </div>

        <p data-pop className="same-word-story-privacy">
          Story'de yalnız ortak skor paylaşılır; yazdığınız cevaplar gösterilmez.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op Iki Dogru Bir Yalan: yalnız toplu skor; ham iddialar finalde yok ----
  if (isKoopIkiDogruBirYalan(snapshot)) {
    const game = snapshot.ikiDogruBirYalan;
    const caughtCount = game?.caughtCount ?? 0;
    const wrongCount = game?.wrongCount ?? 0;
    const skippedCount = game?.skippedCount ?? 0;
    const attemptedCount = game?.attemptedCount ?? 0;
    const availableRounds = game?.availableRounds ?? 0;
    const catchRate = ikiDogruBirYalanPct(snapshot);
    const incomplete = availableRounds < 2 || attemptedCount < 2;
    const result = ikiDogruBirYalanResult(caughtCount, attemptedCount, availableRounds);
    return (
      <div ref={root} className="truth-lie-shell truth-lie-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="truth-lie-final-icon" aria-hidden="true"><IconTruthLie size={40} /></span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="truth-lie-final-kicker">KARTLAR KAPANDI</p>
          <div className="truth-lie-final-names">
            {MODE_META.iki_dogru_bir_yalan.name}
            {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
          </div>
        </div>

        <div
          data-pop
          className="truth-lie-final-score"
          role="status"
          aria-label={incomplete
            ? `${availableRounds} paketin ${attemptedCount} tanesinde tahmin tamamlandı; tur yarım kaldı`
            : `${availableRounds} yalandan ${caughtCount} tanesi yakalandı; yüzde ${catchRate} yakalama oranı`}
        >
          <h1><strong>{caughtCount}/{availableRounds}</strong><span>YALAN YAKALANDI</span></h1>
          <small>{incomplete ? `${attemptedCount}/${availableRounds} tahmin tamamlandı` : `%${catchRate} yakalama oranı`}</small>
        </div>

        <div data-pop className="truth-lie-final-copy">
          <h2>{result.title}</h2>
          <p>{result.subtitle}</p>
        </div>

        <div data-pop className="truth-lie-final-stats" aria-label="Ortak yalan avı özeti">
          <div className="truth-lie-final-stat caught">
            <strong>{caughtCount}</strong>
            <span>YAKALANDI</span>
          </div>
          <div className="truth-lie-final-stat wrong">
            <strong>{wrongCount}</strong>
            <span>KAÇTI</span>
          </div>
          <div className="truth-lie-final-stat skipped">
            <strong>{skippedCount}</strong>
            <span>PAS GEÇİLDİ</span>
          </div>
        </div>

        <div data-pop className="truth-lie-final-summary">
          <span>{attemptedCount}/{availableRounds} tahmin tamamlandı</span>
          <span>{caughtCount} doğru · {wrongCount} yanlış</span>
        </div>

        <p data-pop className="truth-lie-story-privacy">
          Story'de yalnız ortak skor paylaşılır; ham iddialarınız gösterilmez.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op Kim Daha Muhtemel?: anonim ortak metrikler, bireysel hedef yok ----
  if (isKoopKimDahaMuhtemel(snapshot)) {
    const game = snapshot.kimDahaMuhtemel;
    const agreements = game?.agreements ?? 0;
    const pct = kimDahaMuhtemelPct(snapshot);
    const jointRounds = game?.jointRounds ?? 0;
    const resultIncomplete = jointRounds < 4;
    const result = kimDahaMuhtemelResult(jointRounds, pct);
    return (
      <div ref={root} className="likely-shell likely-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="likely-final-icon" aria-hidden="true"><IconLikely size={39} /></span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="likely-final-kicker">SPOT IŞIKLARI KAPANDI</p>
          <div className="likely-final-names">
            {MODE_META.kim_daha_muhtemel.name}
            {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
          </div>
        </div>

        <div
          data-pop
          className="likely-final-score"
          role="status"
          aria-label={resultIncomplete
            ? `${KIM_DAHA_MUHTEMEL_ROUNDS} üzerinden ${agreements} aynı hedef, yeterli ortak oy yok`
            : `${KIM_DAHA_MUHTEMEL_ROUNDS} üzerinden ${agreements} aynı hedef, yüzde ${pct} aynı yön`}
        >
          <h1><strong>{agreements}/{KIM_DAHA_MUHTEMEL_ROUNDS}</strong><span>AYNI HEDEF</span></h1>
          <small>{resultIncomplete ? 'Yeterli ortak oy yok' : `%${pct} aynı yön`}</small>
        </div>

        <div data-pop className="likely-result-copy">
          <h2>{result.title}</h2>
          <p>{result.subtitle}</p>
        </div>

        <div data-pop className="likely-final-stats" aria-label="Anonim ortak işaret özeti">
          <div className="likely-final-stat person">
            <strong>{game?.samePersonAgreements ?? 0}</strong>
            <span>AYNI KİŞİ</span>
          </div>
          <div className="likely-final-stat both">
            <strong>{game?.bothAgreements ?? 0}</strong>
            <span>İKİNİZ DE</span>
          </div>
          <div className="likely-final-stat split">
            <strong>{game?.splitRounds ?? 0}</strong>
            <span>AYRI YÖN</span>
          </div>
        </div>

        <div data-pop className="likely-final-summary">
          <span>{jointRounds}/{KIM_DAHA_MUHTEMEL_ROUNDS} birlikte cevaplandı</span>
          <span>{game?.missedRounds ?? 0} kaçan tur</span>
        </div>

        <p data-pop className="likely-trust-note">Doğru cevap yok; eğlencelik bir tahmin.</p>
        <p data-pop className="likely-story-privacy">
          Story'de ortak özet paylaşılır; bireysel işaretleriniz gösterilmez.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op Kirmizi mi Yesil mi?: toplu radar, bireysel oy yok ----
  if (isKoopKirmiziYesil(snapshot)) {
    const game = snapshot.kirmiziYesil;
    const matches = game?.matches ?? 0;
    const pct = kirmiziYesilPct(snapshot);
    const jointRounds = game?.jointRounds ?? 0;
    const radarIncomplete = jointRounds < 4;
    const result = kirmiziYesilResult(jointRounds, pct);
    return (
      <div ref={root} className="flag-shell flag-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="flag-final-icon" aria-hidden="true"><IconFlagRadar size={39} /></span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="flag-final-kicker">İLİŞKİ RADARI TAMAMLANDI</p>
          <div className="flag-final-names">
            {MODE_META.kirmizi_yesil.name}
            {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
          </div>
        </div>

        <div data-pop className="flag-final-score" role="status" aria-label={radarIncomplete ? `${KIRMIZI_YESIL_ROUNDS} üzerinden ${matches} aynı renk, yeterli ortak oy yok` : `${KIRMIZI_YESIL_ROUNDS} üzerinden ${matches} aynı renk, yüzde ${pct} uyum`}>
          <h1><strong>{matches}/{KIRMIZI_YESIL_ROUNDS}</strong><span>AYNI RENK</span></h1>
          <small>{radarIncomplete ? 'Yeterli ortak oy yok' : `%${pct} uyum`}</small>
        </div>

        <div data-pop className="flag-result-copy">
          <h2>{result.title}</h2>
          <p>{result.subtitle}</p>
        </div>

        <div data-pop className="flag-final-stats" aria-label="Ortak renklerin dağılımı">
          <div className="flag-final-stat red">
            <strong>{game?.redMatches ?? 0}</strong>
            <span>ORTAK KIRMIZI</span>
          </div>
          <div className="flag-final-stat depends">
            <strong>{game?.dependsMatches ?? 0}</strong>
            <span>DURUMA BAĞLI</span>
          </div>
          <div className="flag-final-stat green">
            <strong>{game?.greenMatches ?? 0}</strong>
            <span>ORTAK YEŞİL</span>
          </div>
        </div>

        <div data-pop className="flag-final-summary">
          <span>{jointRounds}/{KIRMIZI_YESIL_ROUNDS} birlikte cevaplandı</span>
          <span>{game?.splitRounds ?? 0} farklı bakış</span>
          <span>{game?.missedRounds ?? 0} kaçan tur</span>
        </div>

        <p data-pop className="flag-trust-note">Doğru cevap yok; bu yalnızca sizin bakış açınız.</p>
        <p data-pop className="flag-story-privacy">
          Story'de yalnız isimler, toplamlar ve açılmış tek bir senaryo yer alır; bireysel renkleriniz gösterilmez.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op emoji sifre: yalniz acilmis dort turun ortak sonucu ----
  if (isKoopEmojiSifre(snapshot)) {
    const e = snapshot.emojiSifre;
    const score = e?.correctCount ?? 0;
    const history = e?.history ?? [];
    const resultTitle = score === 4
      ? 'Aynı dili konuşuyorsunuz!'
      : score >= 2
        ? 'Mesaj alındı!'
        : 'Şifre biraz karıştı…';
    return (
      <div ref={root} className="emoji-shell emoji-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="emoji-final-icon" aria-hidden="true"><IconEmojiCode size={39} /></span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="emoji-final-kicker">Dört mesaj da açıldı</p>
          <h1 className="font-display text-[34px] leading-none font-extrabold">{resultTitle}</h1>
        </div>
        <div data-pop className="emoji-final-names">
          {MODE_META.emoji_sifre.name}
          {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
        </div>

        <div data-pop className="emoji-final-score" role="status" aria-label={`Dört üzerinden ${score} ortak şifre`}>
          <strong>{score}/{EMOJI_SIFRE_ROUNDS}</strong>
          <span>ortak şifre</span>
        </div>

        <ol data-pop className="emoji-final-history" aria-label="Açılmış emoji şifreleri">
          {Array.from({ length: EMOJI_SIFRE_ROUNDS }, (_, index) => {
            const round = history[index];
            const assisted = !!round?.codeFallback && round.guess !== null && round.guess === round.correctChoice;
            return (
              <li key={round?.round ?? index} className={round?.correct ? 'correct' : assisted ? 'assisted' : 'wrong'}>
                <span>{round?.correct ? '✓' : assisted ? '✦' : '×'}</span>
                <div>
                  <small>{round ? round.code.map((value) => EMOJI_SIFRE_PALETTE[value]).join(' ') : '❔ ❔ ❔'}</small>
                  <strong>{round?.target ?? 'Sürpriz kelime'}</strong>
                </div>
                <i>{assisted ? 'İPUCU' : index + 1}</i>
              </li>
            );
          })}
        </ol>

        <p data-pop className="emoji-story-privacy">
          Story'de yalnız isimler, ortak skor ve açılmış emoji kodları yer alır. Gizli aktif seçim paylaşılmaz.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op randevu ruleti: uc parcalik ortak plan ----
  if (isKoopRandevuRuleti(snapshot)) {
    const r = snapshot.randevuRuleti;
    const plan = Array.from({ length: RANDEVU_RULETI_ROUNDS }, (_, index) =>
      r?.plan[index] ?? {
        category: (['yemek', 'etkinlik', 'tatli'] as RandevuCategory[])[index],
        choice: -1,
        label: 'Sürpriz seçim',
      },
    );
    return (
      <div ref={root} className="roulette-shell roulette-victory flex w-full flex-col items-center gap-4 pt-5 pb-6 text-center">
        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={58} />}
          <span className="roulette-final-icon" aria-hidden="true">
            <IconRoulette size={38} />
          </span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={58}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <div data-pop>
          <p className="roulette-kicker">Kozmik karar tamamlandı</p>
          <h1 className="font-display text-[35px] leading-none font-extrabold">Randevunuz Hazır!</h1>
        </div>
        <div data-pop className="roulette-chip roulette-chip-cyan">
          {MODE_META.randevu_ruleti.name}
          {opp ? ` · ${me?.nick ?? ''} + ${opp.nick}` : ''}
        </div>

        <div data-pop className="roulette-final-score" role="status" aria-label={`${r?.matches ?? 0} turda aynı seçim`}>
          <IconHeartSolid size={23} />
          <strong>{r?.matches ?? 0}/{RANDEVU_RULETI_ROUNDS}</strong>
          <span>aynı seçim</span>
        </div>

        <ol data-pop className="roulette-final-plan" aria-label="Üç parçalı randevu planınız">
          {plan.map((item, index) => (
            <li key={`${item.category}-${index}`}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <small>{randevuCategoryLabel(item.category)}</small>
                <strong>{item.label}</strong>
              </div>
              <i aria-hidden="true">{index === 0 ? '✦' : index === 1 ? '◉' : '★'}</i>
            </li>
          ))}
        </ol>

        <p data-pop className="roulette-privacy">
          Story görselinde yalnızca isimler, ortak plan ve uyum özeti yer alır; gizli ham seçimleriniz paylaşılmaz.
        </p>
        {footer}
      </div>
    );
  }

  // ---- ko-op beni yakala: iki yonlu kalp okuma skoru ----
  if (isKoopBeniYakala(snapshot)) {
    const b = snapshot.beniYakala;
    const myReads = me ? (b?.reads[me.id] ?? 0) : 0;
    const partnerReads = opp ? (b?.reads[opp.id] ?? 0) : 0;
    return (
      <div ref={root} className="flex w-full flex-col items-center gap-5 pt-8 pb-6 text-center">
        <WinWash mine={false} />

        <div data-pop className="flex items-center gap-3">
          {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={62} />}
          <span className="inline-flex" style={{ color: 'var(--p1)' }} aria-hidden="true">
            <IconHeartSolid size={38} />
          </span>
          {opp && (
            <Avatar
              index={opp.avatar}
              color={PLAYER_CSS[oppIdx].main}
              size={62}
              className={opp.connected ? '' : 'grayed'}
            />
          )}
        </div>

        <h1 data-pop className="font-display text-4xl leading-tight font-extrabold">
          Kalp Okuma Sonucu
        </h1>
        <div data-pop className="chip chip-soft">
          {MODE_META.beni_yakala.name}
          {opp ? ` — ${me?.nick ?? ''} + ${opp.nick}` : ''}
        </div>

        <div data-pop className="beni-final-card card-candy w-full text-center">
          <p className="text-[13px] font-extrabold tracking-wide uppercase" style={{ color: 'var(--p1-dark)' }}>
            {opp?.nick ?? 'Partnerin'}
          </p>
          <p className="mt-1 font-display text-[30px] leading-tight font-extrabold">Kalbimi</p>
          <p className="beni-final-score" aria-label={`Beş üzerinden ${partnerReads}`}>
            {partnerReads}/{BENI_YAKALA_ROUNDS}
          </p>
          <p className="font-display text-[30px] leading-tight font-extrabold">okudun!</p>
          <p className="mt-4 flex justify-center">
            <span className="chip chip-p2 font-display text-sm">
              Ben de seninkini {myReads}/{BENI_YAKALA_ROUNDS} okudum
            </span>
          </p>
        </div>

        <div data-pop className="flex flex-wrap justify-center gap-2">
          <span className="chip chip-p1">
            <IconHeartSolid size={14} /> {b?.mutualReads ?? 0} turda karşılıklı bildiniz
          </span>
          <span className="chip chip-sun">{b?.exactMatches ?? 0} aynı cevap</span>
        </div>

        <p data-pop className="text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
          Story görselinde yalnızca isimler ve toplam skorlar yer alır; özel cevaplarınız paylaşılmaz.
        </p>
        {footer}
      </div>
    );
  }

  return (
    <div ref={root} className="flex w-full flex-col items-center gap-5 pt-8 pb-6 text-center">
      {/* kazanan renk yikamasi: ben -> mavi, rakip -> toz pembe */}
      {snapshot.winner && <WinWash mine={iWon} />}
      <div data-pop>
        <Trophy />
      </div>
      <h1 data-pop className="font-display text-4xl font-extrabold">
        {iWon ? 'Kazandın!' : winner ? `${winner.nick} kazandı` : 'Maç bitti'}
      </h1>

      <div data-pop className="chip chip-soft">
        {MODE_META[snapshot.mode].name}
      </div>

      <div data-pop className="card-candy flex w-full items-center justify-around gap-3">
        {me && <PlayerScore snap={snapshot} p={me} idx={myIdx} />}
        <span className="font-display text-xl font-extrabold" style={{ color: 'var(--ink-soft)' }}>
          -
        </span>
        {opp && <PlayerScore snap={snapshot} p={opp} idx={oppIdx} />}
      </div>

      {/* maci bitiren kelime + TDK anlami */}
      {finalWord && winner && (
        <div data-pop className="card-candy w-full p-4! text-center">
          <p className="text-[13px] font-bold" style={{ color: 'var(--ink-soft)' }}>
            {iWon ? 'maçı bitiren kelimen' : `${winner.nick} bu kelimeyle bitirdi`}
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold" style={{ color: 'var(--ok)' }}>
            {up(finalWord)}
          </p>
          <p className="mt-2 text-[14px] font-bold" style={{ color: 'var(--ink-soft)' }}>
            {wordInfos[finalWord] ?? 'TDK anlamı geliyor...'}
          </p>
        </div>
      )}

      {footer}
    </div>
  );
}
