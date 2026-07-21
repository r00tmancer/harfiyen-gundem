import { useEffect, useRef, useState } from 'react';
import type { EmojiSifreReveal as EmojiReveal, PlayerPublic, RoomSnapshot } from '@harfiyen/shared';
import {
  EMOJI_SIFRE_CODE_COUNT,
  EMOJI_SIFRE_CODE_MS,
  EMOJI_SIFRE_GUESS_MS,
  EMOJI_SIFRE_PALETTE,
  EMOJI_SIFRE_ROUNDS,
} from '@harfiyen/shared';
import { staggerIn, wobble } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconCheck, IconEmojiCode } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';

const EMOJI_NAMES = [
  'kahkahaya boğulan yüz',
  'kalpli yüz',
  'uyuyan yüz',
  'sus işareti yapan yüz',
  'kırmızı kalp',
  'ateş',
  'parti konfeti topu',
  'hilal',
  'yıldız',
  'pizza',
  'kahve',
  'sinema klaketi',
  'oyun kumandası',
  'roket',
  'ev',
  'dalga',
  'kedi',
  'hediye',
  'telefon',
  'yağmur bulutu',
  'araba',
  'dondurma',
  'müzik notası',
  'dans eden kadın',
] as const;

function Progress({ round }: { round: number }) {
  return (
    <ol className="emoji-progress" aria-label={`Dört turun ${round}. turu`}>
      {Array.from({ length: EMOJI_SIFRE_ROUNDS }, (_, index) => (
        <li key={index} className={index + 1 < round ? 'done' : index + 1 === round ? 'active' : ''}>
          <span>{index + 1 < round ? '✓' : index + 1}</span>
          <strong>{index + 1}</strong>
        </li>
      ))}
    </ol>
  );
}

function TypingBubble({ name, text }: { name: string; text: string }) {
  return (
    <div className="emoji-wait-card" role="status">
      <div className="emoji-chat-bubble emoji-chat-incoming">
        <span className="emoji-typing" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <p><strong>{name}</strong> {text}</p>
      <span>Bu ekranda gizli kelime veya seçenek gösterilmez.</span>
    </div>
  );
}

function CodeSlots({ code, locked = false }: { code: readonly number[]; locked?: boolean }) {
  return (
    <div className={`emoji-code-slots ${locked ? 'locked' : ''}`} aria-label={`Üç emojilik kod: ${code.length} emoji seçildi`}>
      {Array.from({ length: EMOJI_SIFRE_CODE_COUNT }, (_, index) => {
        const value = code[index];
        return (
          <span key={index} className={value === undefined ? 'empty' : 'filled'}>
            {value === undefined ? <i aria-hidden="true">{index + 1}</i> : EMOJI_SIFRE_PALETTE[value]}
          </span>
        );
      })}
    </div>
  );
}

function Header({ round, title, kicker }: { round: number; title: string; kicker: string }) {
  return (
    <>
      <Progress round={round} />
      <div className="emoji-heading">
        <span className="emoji-mode-icon" aria-hidden="true"><IconEmojiCode size={25} /></span>
        <div>
          <p>{kicker}</p>
          <h2>{title}</h2>
        </div>
      </div>
    </>
  );
}

export function EmojiSifreEncode({ snap }: { snap: RoomSnapshot }) {
  const game = snap.emojiSifre;
  const root = useRef<HTMLElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [draft, setDraft] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  useEffect(() => {
    staggerIn(root.current);
  }, [game?.round]);

  // Tur/rol değişimi ve reconnect snapshot'ı: yalnız sunucunun sahibine geri verdiği kodu kullan.
  useEffect(() => {
    setDraft(game?.role === 'encoder' && game.code ? [...game.code] : []);
    setSending(false);
  }, [game?.round, game?.role, snap.phase]);

  useEffect(() => {
    if (game?.codeLocked || !connected) setSending(false);
    if (expired && !game?.codeLocked) {
      setDraft([]);
      setSending(false);
    }
  }, [connected, expired, game?.codeLocked]);

  if (!game) return null;
  const opp = oppOf(snap);
  const encoder = snap.players.find((player) => player.id === game.encoder);
  const decoder = snap.players.find((player) => player.id === game.decoder);

  if (game.role !== 'encoder') {
    return (
      <section ref={root} className="emoji-panel flex flex-col gap-4">
        <Header round={game.round} kicker="Şimdi o anlatıyor" title="Şifre hazırlanıyor…" />
        <TypingBubble name={encoder?.nick ?? opp?.nick ?? 'Partnerin'} text="sana üç emojilik bir mesaj yazıyor." />
        <p className="emoji-night-note">Sesi açmana gerek yok — ekran değişince tahmin sırası sana gelecek.</p>
      </section>
    );
  }

  const locked = game.codeLocked;
  const round = game.round;
  const target = game.target ?? 'Gizli kelime';
  const visibleCode = game.code ? [...game.code] : draft;
  const controlsDisabled = !connected || expired || locked || sending;

  function addEmoji(index: number) {
    if (controlsDisabled) return;
    setDraft((current) => current.length >= EMOJI_SIFRE_CODE_COUNT ? current : [...current, index]);
  }

  function removeLast() {
    if (controlsDisabled) return;
    setDraft((current) => current.slice(0, -1));
  }

  function clear() {
    if (controlsDisabled) return;
    setDraft([]);
  }

  function lockCode() {
    if (controlsDisabled || draft.length !== EMOJI_SIFRE_CODE_COUNT) return;
    const emojis = draft as [number, number, number];
    setSending(true);
    send({ t: 'emoji_sifre_code', emojis, round });
  }

  return (
    <section ref={root} className="emoji-panel flex flex-col gap-3" aria-labelledby="emoji-encode-title">
      <Header round={game.round} kicker="Sen anlatıyorsun" title="3 emojiyle şifrele" />

      <div data-pop className="emoji-target-chat">
        <div className="emoji-target-avatar" aria-hidden="true"><IconEmojiCode size={20} /></div>
        <div className="emoji-chat-bubble emoji-chat-incoming">
          <small>GİZLİ KELİMEN</small>
          <strong id="emoji-encode-title">{target}</strong>
          <span>{decoder?.nick ?? opp?.nick ?? 'Partnerin'} bunu tahmin edecek</span>
        </div>
        <time aria-live="polite">{Math.ceil(rem / 1000)} sn</time>
      </div>
      <div data-pop><TimerBar deadline={snap.deadline} total={EMOJI_SIFRE_CODE_MS} /></div>

      <div data-pop className="emoji-composer">
        <CodeSlots code={visibleCode} locked={locked || sending} />
        <div className="emoji-composer-tools">
          <button type="button" disabled={controlsDisabled || draft.length === 0} onClick={removeLast} aria-label="Son emojiyi geri al">⌫ <span>Geri al</span></button>
          <button type="button" disabled={controlsDisabled || draft.length === 0} onClick={clear}>Temizle</button>
        </div>
      </div>

      <fieldset data-pop className="m-0 border-0 p-0">
        <legend className="sr-only">Koduna eklenecek emoji</legend>
        <div className="emoji-palette">
          {EMOJI_SIFRE_PALETTE.map((emoji, index) => {
            const count = draft.filter((value) => value === index).length;
            return (
              <button
                key={`${index}-${emoji}`}
                type="button"
                disabled={controlsDisabled}
                aria-label={`${EMOJI_NAMES[index] ?? 'emoji'} ekle${count ? `, kodda ${count} tane var` : ''}`}
                onClick={() => addEmoji(index)}
              >
                <span>{emoji}</span>
                {count > 0 && <i aria-hidden="true">×{count}</i>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        data-pop
        type="button"
        className="emoji-send-button"
        disabled={controlsDisabled || draft.length !== EMOJI_SIFRE_CODE_COUNT}
        onClick={lockCode}
      >
        <IconCheck size={20} />
        {!connected
          ? 'Bağlanılıyor…'
          : expired && !locked
            ? 'Süre doldu — sonuç bekleniyor'
            : locked || sending
              ? 'Şifre gizlice kilitlendi'
              : draft.length === EMOJI_SIFRE_CODE_COUNT
                ? 'Şifreyi kilitle'
                : `${EMOJI_SIFRE_CODE_COUNT - draft.length} emoji daha seç`}
      </button>
      <p className="emoji-night-note">Aynı emojiyi tekrar kullanabilirsin. Kodun tahmin aşamasına kadar gizli kalır.</p>
    </section>
  );
}

export function EmojiSifreGuess({ snap }: { snap: RoomSnapshot }) {
  const game = snap.emojiSifre;
  const root = useRef<HTMLElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [sending, setSending] = useState<number | null>(null);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  useEffect(() => {
    staggerIn(root.current);
    setSending(null);
  }, [game?.round, snap.phase]);

  useEffect(() => {
    if (game?.guessLocked || expired || !connected) setSending(null);
  }, [connected, expired, game?.guessLocked]);

  if (!game) return null;
  const encoder = snap.players.find((player) => player.id === game.encoder);
  const decoder = snap.players.find((player) => player.id === game.decoder);
  const code = game.code ?? [];

  if (game.role !== 'decoder') {
    return (
      <section ref={root} className="emoji-panel flex flex-col gap-4">
        <Header round={game.round} kicker="Kodun gönderildi" title="Şimdi o çözüyor…" />
        <div className="emoji-wait-code">
          <CodeSlots code={code} locked />
          <div className="emoji-chat-bubble emoji-chat-outgoing">
            <small>ANLATTIĞIN KELİME</small>
            <strong>{game.target ?? 'Gizli kelime'}</strong>
          </div>
        </div>
        <TypingBubble name={decoder?.nick ?? 'Partnerin'} text="cevap seçeneklerini düşünüyor." />
        {game.guessLocked && <span className="emoji-status-chip">Cevabını kilitledi · açılıyor</span>}
      </section>
    );
  }

  const options = game.options;
  const round = game.round;
  const locked = game.guessLocked;
  const visibleGuess = game.myGuess ?? sending;
  const disabled = !connected || expired || locked || sending !== null;

  function guess(choice: number) {
    if (disabled || !options) return;
    setSending(choice);
    send({ t: 'emoji_sifre_guess', choice, round });
  }

  return (
    <section ref={root} className="emoji-panel flex flex-col gap-3.5" aria-labelledby="emoji-guess-title">
      <Header round={game.round} kicker={`${encoder?.nick ?? 'Partnerin'} yazdı`} title="Emoji şifresini çöz" />
      <div data-pop className="emoji-guess-message">
        <div className="emoji-chat-bubble emoji-chat-incoming">
          <CodeSlots code={code} locked />
          <span>Sence ne anlatıyor?</span>
        </div>
        <time aria-live="polite">{Math.ceil(rem / 1000)} sn</time>
      </div>
      <div data-pop><TimerBar deadline={snap.deadline} total={EMOJI_SIFRE_GUESS_MS} /></div>

      <fieldset data-pop className="m-0 border-0 p-0">
        <legend id="emoji-guess-title" className="sr-only">Dört cevap seçeneğinden birini seç</legend>
        <div className="emoji-answer-grid">
          {(options ?? ['Gizli', 'Gizli', 'Gizli', 'Gizli']).map((option, index) => (
            <button
              key={`${index}-${option}`}
              type="button"
              className={visibleGuess === index ? 'selected' : ''}
              disabled={disabled || !options}
              aria-pressed={visibleGuess === index}
              onClick={() => guess(index)}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              <strong>{option}</strong>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="min-h-10 text-center">
        {!connected ? (
          <span className="emoji-status-chip">Bağlantı bekleniyor — seçenekler kapalı</span>
        ) : expired && !locked ? (
          <span className="emoji-status-chip warn">Süre doldu — sonuç bekleniyor</span>
        ) : locked || sending !== null ? (
          <span className="emoji-status-chip"><IconCheck size={15} /> Cevabın kilitlendi</span>
        ) : (
          <span className="emoji-night-note">Bir cevaba dokunduğunda anında kilitlenir.</span>
        )}
      </div>
    </section>
  );
}

function RevealPlayers({ snap, reveal }: { snap: RoomSnapshot; reveal: EmojiReveal }) {
  const encoder = snap.players.find((player) => player.id === reveal.encoder);
  const decoder = snap.players.find((player) => player.id === reveal.decoder);
  return (
    <div className="emoji-reveal-people">
      {encoder && <RevealPerson player={encoder} snap={snap} label="kodladı" selfLabel="kodladın" />}
      <span aria-hidden="true"><IconEmojiCode size={22} /></span>
      {decoder && <RevealPerson player={decoder} snap={snap} label="çözdü" selfLabel="çözdün" />}
    </div>
  );
}

function RevealPerson({ player, snap, label, selfLabel }: { player: PlayerPublic; snap: RoomSnapshot; label: string; selfLabel: string }) {
  const idx = playerIndex(snap, player.id);
  return (
    <div>
      <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={36} />
      <span>{player.id === snap.you ? `Sen ${selfLabel}` : `${player.nick} ${label}`}</span>
    </div>
  );
}

export function EmojiSifreReveal({ snap }: { snap: RoomSnapshot }) {
  const game = snap.emojiSifre;
  const reveal = game?.reveal;
  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    const solved = reveal.guess !== null && reveal.guess === reveal.correctChoice;
    if (solved && !reveal.codeFallback) heartBurst();
    else if (!solved) wobble(title.current);
  }, [reveal]);

  if (!game) return null;
  if (!reveal) {
    return (
      <section className="emoji-panel emoji-loading" role="status">
        <IconEmojiCode size={58} />
        <h2>Mesaj açılıyor…</h2>
        <span className="emoji-typing" aria-hidden="true"><i /><i /><i /></span>
      </section>
    );
  }

  const guessed = reveal.guess === null ? null : reveal.options[reveal.guess];
  const answer = reveal.options[reveal.correctChoice];
  const answeredCorrectly = reveal.guess !== null && reveal.guess === reveal.correctChoice;
  const shared = answeredCorrectly && !reveal.codeFallback;
  const resultTitle = reveal.codeFallback
    ? answeredCorrectly ? 'İPUCUYLA ÇÖZÜLDÜ!' : 'EVREN YARDIM ETTİ'
    : reveal.guess === null
      ? 'SÜRE DOLDU'
      : reveal.correct
        ? 'ŞİFRE ÇÖZÜLDÜ!'
        : 'ÇOK YAKLAŞTIN!';

  return (
    <section ref={root} className="emoji-panel emoji-reveal flex flex-col items-center gap-3.5 text-center" aria-labelledby="emoji-reveal-title">
      <Progress round={reveal.round} />
      <RevealPlayers snap={snap} reveal={reveal} />
      <div data-pop className={`emoji-result-badge ${shared ? 'correct' : reveal.codeFallback && answeredCorrectly ? 'assisted' : 'wrong'}`}>
        {reveal.codeFallback
          ? answeredCorrectly ? '✦ DOĞRU · PUANA EKLENMEDİ' : '✦ OTOMATİK KOD'
          : reveal.correct ? '✓ ORTAK ŞİFRE' : reveal.guess === null ? '… CEVAP YOK' : '× FARKLI MESAJ'}
      </div>
      <h2 ref={title} id="emoji-reveal-title" data-pop>{resultTitle}</h2>

      <div data-pop className="emoji-reveal-chat">
        <div className="emoji-chat-bubble emoji-chat-incoming">
          <CodeSlots code={reveal.code} locked />
        </div>
        <div className="emoji-chat-bubble emoji-chat-outgoing">
          <small>DOĞRU CEVAP</small>
          <strong>{reveal.target}</strong>
        </div>
      </div>

      <div data-pop className="emoji-reveal-answer">
        <span>{reveal.guess === null ? 'Cevap seçilmedi' : 'Tahmin'}</span>
        <strong>{guessed ?? 'Süre doldu'}</strong>
        {!answeredCorrectly && <small>Doğrusu: {answer}</small>}
      </div>

      {reveal.codeFallback && (
        <p className="emoji-fallback-note">
          Kodlama süresi dolduğu için emojileri oyun seçti. Tahmin doğru olsa bile bu tur ortak skora yazılmaz.
        </p>
      )}
      <p data-pop className="emoji-round-score"><strong>{game.correctCount}/{EMOJI_SIFRE_ROUNDS}</strong> ortak şifre</p>
    </section>
  );
}
