import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import {
  AYNI_ANDA_SOYLE_ANSWER_MS,
  AYNI_ANDA_SOYLE_MAX_ANSWER_LENGTH,
  AYNI_ANDA_SOYLE_ROUNDS,
  normalizeAyniAndaSoyleAnswer,
} from '@harfiyen/shared';
import type {
  AyniAndaSoyleCategory,
  AyniAndaSoyleResolution,
  PlayerPublic,
  RoomSnapshot,
} from '@harfiyen/shared';
import { popIn, staggerIn } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { haptics } from '../../fx/haptics';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconSameWord } from '../../ui/icons';
import { PLAYER_CSS, TimerBar, WaitingDots } from '../../ui/parts';

const CATEGORY_LABEL: Record<AyniAndaSoyleCategory, string> = {
  yemek: 'Yemek',
  icecek: 'İçecek',
  tatli: 'Tatlı',
  sehir: 'Şehir',
  film_dizi: 'Film & dizi',
  hayvan: 'Hayvan',
  renk: 'Renk',
  tatil: 'Tatil',
  sarki: 'Şarkı',
  super_guc: 'Süper güç',
  aktivite: 'Aktivite',
  gece_atistirmasi: 'Gece atıştırması',
};

const REVEAL_EFFECT_PREFIX = 'harfiyen:ayni-anda-soyle:reveal:v1:';

function readRevealEffect(code: string): string | null {
  try {
    return sessionStorage.getItem(`${REVEAL_EFFECT_PREFIX}${code.toUpperCase()}`);
  } catch {
    return null;
  }
}

function writeRevealEffect(code: string, value: string | null): void {
  try {
    const key = `${REVEAL_EFFECT_PREFIX}${code.toUpperCase()}`;
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Depolama kapaliysa oyun efekt tekrari korumasi olmadan devam eder.
  }
}

function usePhaseHeadingFocus(ref: RefObject<HTMLHeadingElement | null>, identity: string | number) {
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(id);
  }, [identity, ref]);
}

function secondsLeft(milliseconds: number): number {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

function SameWordProgress({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ayniAndaSoyle;
  if (!game) return null;
  return (
    <ol className="same-word-progress" aria-label={`${AYNI_ANDA_SOYLE_ROUNDS} turun ${game.round}. turu`}>
      {Array.from({ length: AYNI_ANDA_SOYLE_ROUNDS }, (_, index) => {
        const round = index + 1;
        const currentReveal = snap.phase === 'ayni_anda_soyle_reveal' && round === game.round
          ? game.reveal
          : null;
        const className = currentReveal?.match
          ? 'match'
          : round === game.round
            ? 'active'
            : round < game.round
              ? 'done'
              : '';
        const label = currentReveal
          ? `${round}. tur ${currentReveal.match ? 'eşleşti' : 'açıldı'}`
          : round === game.round
            ? `${round}. tur aktif`
            : round < game.round
              ? `${round}. tur tamamlandı`
              : `${round}. tur bekliyor`;
        return (
          <li key={round} className={className} aria-label={label}>
            <span aria-hidden="true">{currentReveal?.match ? '✓' : round}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SameWordHeader({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ayniAndaSoyle;
  if (!game) return null;
  return (
    <>
      <SameWordProgress snap={snap} />
      <div className="same-word-heading">
        <span className="same-word-mode-icon" aria-hidden="true"><IconSameWord size={26} /></span>
        <div>
          <p>3 · 2 · 1 · SÖYLE</p>
          <h2>Aynı Anda Söyle</h2>
        </div>
        <span className="same-word-round-pill">{game.round}/{AYNI_ANDA_SOYLE_ROUNDS}</span>
      </div>
    </>
  );
}

export function AyniAndaSoyleAnswer({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ayniAndaSoyle;
  const connected = useStore((state) => state.conn === 'open');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [answer, setAnswer] = useState(() => game?.myAnswer ?? '');
  const [sending, setSending] = useState(false);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;
  const round = game?.round ?? snap.round;

  usePhaseHeadingFocus(titleRef, `answer-${round}`);

  useEffect(() => {
    staggerIn(root.current);
    setAnswer(game?.myAnswer ?? '');
    setSending(false);
    writeRevealEffect(snap.code, null);
  }, [round, snap.code]);

  useEffect(() => {
    if (game?.myLocked || expired || !connected) setSending(false);
  }, [connected, expired, game?.myLocked]);

  useEffect(() => {
    if (!sending || game?.myLocked) return;
    const id = window.setTimeout(() => setSending(false), 2200);
    return () => window.clearTimeout(id);
  }, [game?.myLocked, sending]);

  if (!game) return null;
  const me = meOf(snap);
  const opp = oppOf(snap);
  const normalized = normalizeAyniAndaSoyleAnswer(answer);
  const locallyLocked = game.myLocked || sending;
  const disabled = locallyLocked || expired || !connected || normalized === null;

  function updateAnswer(raw: string) {
    const singleLine = raw.replace(/[\r\n\t]+/g, ' ');
    setAnswer([...singleLine].slice(0, AYNI_ANDA_SOYLE_MAX_ANSWER_LENGTH).join(''));
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (disabled || !normalized) return;
    setSending(true);
    haptics.tick();
    send({ t: 'ayni_anda_soyle_answer', answer: normalized, round });
  }

  return (
    <section ref={root} className="same-word-panel" aria-labelledby="same-word-answer-title">
      <SameWordHeader snap={snap} />

      <article data-pop className="same-word-prompt-card">
        <div className="same-word-prompt-topline">
          <span className="same-word-category">
            {game.category ? CATEGORY_LABEL[game.category] : 'Sürpriz kategori'}
          </span>
          <time aria-label={`${secondsLeft(rem)} saniye kaldı`}>{secondsLeft(rem)} sn</time>
        </div>
        <h3 ref={titleRef} tabIndex={-1} id="same-word-answer-title">
          {game.prompt ?? 'Aklınıza aynı anda ne geliyor?'}
        </h3>
        <p>Aklına ilk gelen tek kısa cevabı yaz.</p>
      </article>

      <div data-pop><TimerBar deadline={snap.deadline} total={AYNI_ANDA_SOYLE_ANSWER_MS} /></div>

      {locallyLocked ? (
        <article data-pop className="same-word-locked-card" role="status">
          <span className="same-word-envelope" aria-hidden="true"><IconSameWord size={29} /></span>
          <h3>{sending ? 'Cevabın kilitleniyor…' : 'Cevabın gizlice kilitlendi'}</h3>
          <p>
            {game.opponentLocked
              ? 'İki cevap da hazır; birazdan birlikte açılıyor.'
              : `${opp?.nick ?? 'Partnerin'} cevabını yazıyor.`}
          </p>
          {!game.opponentLocked && <WaitingDots />}
        </article>
      ) : (
        <form data-pop className="same-word-answer-form" onSubmit={submitAnswer}>
          <label className="same-word-answer-label" htmlFor="same-word-answer">Gizli cevabın</label>
          <div className="same-word-input-wrap">
            <input
              id="same-word-answer"
              value={answer}
              type="text"
              inputMode="text"
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoComplete="off"
              spellCheck
              aria-describedby="same-word-answer-help same-word-answer-count"
              placeholder="Örn. pizza"
              onChange={(event) => updateAnswer(event.target.value)}
            />
            <span id="same-word-answer-count" className="same-word-input-count">
              {[...answer].length}/{AYNI_ANDA_SOYLE_MAX_ANSWER_LENGTH}
            </span>
          </div>
          <p
            id="same-word-answer-help"
            className={`same-word-answer-help ${normalized ? 'ready' : ''}`}
          >
            {normalized ? 'Hazır: gönderince cevabın değiştirilemez.' : 'Boş olmayan tek satırlık kısa bir cevap yaz.'}
          </p>
          <button type="submit" className="btn-candy btn-block same-word-submit" disabled={disabled}>
            {!connected ? 'Bağlantı bekleniyor…' : expired ? 'Süre doldu' : 'Cevabımı gizlice kilitle'}
          </button>
        </form>
      )}

      <div data-pop className="same-word-lock-row" aria-live="polite">
        <span className={`same-word-status-chip ${game.myLocked ? 'done' : expired ? 'warn' : ''}`}>
          {me?.nick ?? 'Sen'}: {game.myLocked ? 'hazır ✓' : expired ? 'süre doldu' : sending ? 'kilitleniyor' : 'yazıyor'}
        </span>
        <span className={`same-word-status-chip ${game.opponentLocked ? 'done' : ''}`}>
          {opp?.nick ?? 'Partnerin'}: {game.opponentLocked ? 'hazır ✓' : 'yazıyor'}
        </span>
      </div>
      <p className="same-word-privacy-note">Partnerin, cevaplar birlikte açılana kadar yalnız hazır olduğunu görür.</p>
    </section>
  );
}

const REVEAL_COPY: Record<AyniAndaSoyleResolution, { kicker: string; title: string; body: string }> = {
  match: {
    kicker: 'AYNI CEVAP +1',
    title: 'Aynı frekans!',
    body: 'İkiniz de aynı cevabı aynı anda yakaladınız.',
  },
  different: {
    kicker: 'İKİ AYRI CEVAP',
    title: 'Tatlı bir ayrım',
    body: 'Aynı sorudan iki farklı cevap çıktı; konuşmalık hazır.',
  },
  solo: {
    kicker: 'BİR CEVAP EKSİK',
    title: 'Kelime havada kaldı',
    body: 'Biriniz süreyi kaçırdı; bu tur eşleşme sayılmadı.',
  },
  skipped: {
    kicker: 'BU TUR SESSİZ',
    title: 'İkiniz de pas geçtiniz',
    body: 'Cevap gelmedi; sıradaki kategoriye geçiliyor.',
  },
};

function PlayerAnswerCard({
  player,
  idx,
  answer,
  mine,
}: {
  player: PlayerPublic;
  idx: 0 | 1;
  answer: string | null | undefined;
  mine: boolean;
}) {
  return (
    <article
      className={`same-word-player-answer ${mine ? 'mine' : 'partner'} ${answer ? '' : 'missed'}`}
      aria-label={`${mine ? 'Sen' : player.nick}: ${answer ?? 'cevap yok'}`}
    >
      <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={39} />
      <span>{mine ? 'Sen' : player.nick}</span>
      <strong>{answer ?? 'Süre doldu'}</strong>
    </article>
  );
}

export function AyniAndaSoyleReveal({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ayniAndaSoyle;
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const reveal = game?.reveal;
  const identity = reveal ? `${reveal.round}:${reveal.resolution}` : `loading-${game?.round ?? 0}`;

  usePhaseHeadingFocus(titleRef, identity);

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    popIn(titleRef.current, 0.1);
    const effectIdentity = `${reveal.round}:${reveal.resolution}`;
    if (readRevealEffect(snap.code) === effectIdentity) return;
    writeRevealEffect(snap.code, effectIdentity);
    if (reveal.match) {
      haptics.accept();
      heartBurst();
    } else if (reveal.resolution === 'different') {
      haptics.tick();
    }
  }, [reveal?.round, reveal?.resolution, snap.code]);

  if (!game) return null;
  if (!reveal) {
    return (
      <section className="same-word-panel same-word-loading" role="status">
        <IconSameWord size={60} />
        <h2>Cevaplar açılıyor…</h2>
        <p>İki gizli kelime şimdi karşılaştırılıyor.</p>
      </section>
    );
  }

  const copy = REVEAL_COPY[reveal.resolution];
  const myAnswer = me ? reveal.answers[me.id] : null;
  const oppAnswer = opp ? reveal.answers[opp.id] : null;

  return (
    <section
      ref={root}
      className={`same-word-panel same-word-reveal ${reveal.match ? 'match' : reveal.resolution}`}
      aria-labelledby="same-word-reveal-title"
    >
      <SameWordHeader snap={snap} />

      <article data-pop className="same-word-reveal-prompt">
        <span>{CATEGORY_LABEL[reveal.category]}</span>
        <p>{reveal.prompt}</p>
      </article>

      <div data-pop className="same-word-reveal-title" role="status" aria-live="assertive">
        <span>{copy.kicker}</span>
        <h2 ref={titleRef} tabIndex={-1} id="same-word-reveal-title">{copy.title}</h2>
        <p>{copy.body}</p>
      </div>

      <div data-pop className="same-word-answer-pair">
        {me && <PlayerAnswerCard player={me} idx={myIdx} answer={myAnswer} mine />}
        <span className="same-word-pair-link" aria-hidden="true">{reveal.match ? '♥' : '↔'}</span>
        {opp && <PlayerAnswerCard player={opp} idx={oppIdx} answer={oppAnswer} mine={false} />}
      </div>

      <div data-pop className={`same-word-score-pulse ${reveal.match ? 'matched' : ''}`}>
        <strong>{game.matches}/{AYNI_ANDA_SOYLE_ROUNDS}</strong>
        <span>ortak cevap</span>
      </div>
      <p className="same-word-privacy-note">Bu cevaplar yalnız bu tur açılır; maç sonunda saklanmaz.</p>
    </section>
  );
}
