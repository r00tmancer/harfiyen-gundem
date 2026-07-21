import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import {
  IKI_DOGRU_BIR_YALAN_GUESS_MS,
  IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH,
  IKI_DOGRU_BIR_YALAN_SETUP_MS,
  normalizeIkiDogruBirYalanStatements,
} from '@harfiyen/shared';
import type {
  IkiDogruBirYalanStatements,
  PlayerPublic,
  RoomSnapshot,
} from '@harfiyen/shared';
import {
  clearIkiDogruBirYalanDraft,
  readIkiDogruBirYalanDraft,
  writeIkiDogruBirYalanDraft,
} from '../../drafts/ikiDogruBirYalanDraft';
import type { IkiDogruBirYalanLieIndex } from '../../drafts/ikiDogruBirYalanDraft';
import { popIn, staggerIn } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { haptics } from '../../fx/haptics';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconCheck, IconTruthLie } from '../../ui/icons';
import { PLAYER_CSS, TimerBar, WaitingDots } from '../../ui/parts';

const EMPTY_STATEMENTS: IkiDogruBirYalanStatements = ['', '', ''];
const REVEAL_EFFECT_PREFIX = 'harfiyen:iki-dogru-bir-yalan:reveal:v1:';

function revealEffectKey(code: string): string {
  return `${REVEAL_EFFECT_PREFIX}${code.toUpperCase()}`;
}

function readRevealEffect(code: string): string | null {
  try {
    return sessionStorage.getItem(revealEffectKey(code));
  } catch {
    return null;
  }
}

function writeRevealEffect(code: string, value: string | null): void {
  try {
    const key = revealEffectKey(code);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Efekt tekrarı koruması olmadan da oyun oynanabilir.
  }
}

function usePhaseHeadingFocus(ref: RefObject<HTMLHeadingElement | null>, identity: string | number) {
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(id);
  }, [identity, ref]);
}

function playerById(snap: RoomSnapshot, id: string | null): PlayerPublic | null {
  if (!id) return null;
  return snap.players.find((player) => player.id === id) ?? null;
}

function PlayerBadge({ snap, player, label }: { snap: RoomSnapshot; player: PlayerPublic | null; label: string }) {
  if (!player) return null;
  const index = playerIndex(snap, player.id);
  return (
    <div className="truth-lie-player-badge">
      <Avatar index={player.avatar} color={PLAYER_CSS[index].main} size={34} />
      <span><small>{label}</small><strong>{player.nick}</strong></span>
    </div>
  );
}

function ModeHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="truth-lie-heading">
      <span className="truth-lie-mode-icon" aria-hidden="true"><IconTruthLie size={27} /></span>
      <div>
        <p>{kicker}</p>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function secondsLeft(milliseconds: number): number {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

export function IkiDogruBirYalanSetup({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ikiDogruBirYalan;
  const connected = useStore((state) => state.conn === 'open');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [statements, setStatements] = useState<IkiDogruBirYalanStatements>(() => (
    readIkiDogruBirYalanDraft(snap.code, snap.you)?.statements ?? [...EMPTY_STATEMENTS]
  ));
  const [lieIndex, setLieIndex] = useState<IkiDogruBirYalanLieIndex | null>(() => (
    readIkiDogruBirYalanDraft(snap.code, snap.you)?.lieIndex ?? null
  ));
  const [sending, setSending] = useState(false);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  usePhaseHeadingFocus(titleRef, 'setup');

  useEffect(() => {
    staggerIn(root.current);
    writeRevealEffect(snap.code, null);
  }, [snap.code]);

  useEffect(() => {
    if (!game || game.mySubmitted) return;
    writeIkiDogruBirYalanDraft(snap.code, snap.you, { statements, lieIndex });
  }, [game, lieIndex, snap.code, snap.you, statements]);

  useEffect(() => {
    if (!game?.mySubmitted) return;
    clearIkiDogruBirYalanDraft(snap.code, snap.you);
    setSending(false);
  }, [game?.mySubmitted, snap.code, snap.you]);

  useEffect(() => {
    if (connected && !expired) return;
    setSending(false);
  }, [connected, expired]);

  useEffect(() => {
    if (!sending || game?.mySubmitted) return;
    const id = window.setTimeout(() => setSending(false), 2200);
    return () => window.clearTimeout(id);
  }, [game?.mySubmitted, sending]);

  if (!game) return null;
  const me = meOf(snap);
  const opp = oppOf(snap);
  const normalized = normalizeIkiDogruBirYalanStatements(statements);
  const complete = normalized !== null && lieIndex !== null;
  const submitted = game.mySubmitted;
  const disabled = submitted || sending || expired || !connected || !complete;
  const statementCount = statements.filter((statement) => statement.trim()).length;
  const duplicateCount = new Set(
    statements.filter((statement) => statement.trim()).map((statement) => statement.trim().toLocaleLowerCase('tr-TR')),
  ).size;
  const helper = statementCount < 3
    ? 'Üç kısa iddianı da yaz.'
    : duplicateCount < 3
      ? 'İddiaların birbirinden farklı olmalı.'
      : lieIndex === null
        ? 'Şimdi hangisinin yalan olduğunu işaretle.'
        : normalized === null
          ? 'İddialarında satır sonu veya desteklenmeyen karakter kullanma.'
          : 'Hazır: üç iddia ve bir gizli yalan.';

  function updateStatement(index: number, raw: string) {
    const singleLine = raw.replace(/[\r\n\t]+/g, ' ');
    const clipped = [...singleLine].slice(0, IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH).join('');
    setStatements((current) => {
      const next: IkiDogruBirYalanStatements = [...current];
      next[index] = clipped;
      return next;
    });
  }

  function handleEnter(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    inputRefs.current[index + 1]?.focus();
  }

  function submitPack(event: FormEvent) {
    event.preventDefault();
    if (disabled || !normalized || lieIndex === null) return;
    setSending(true);
    haptics.tick();
    send({ t: 'iki_dogru_bir_yalan_pack', statements: normalized, lieIndex });
  }

  return (
    <section ref={root} className="truth-lie-panel truth-lie-setup" aria-labelledby="truth-lie-setup-title">
      <ModeHeading kicker="İKİNİZ DE GİZLİCE HAZIRLAYIN" title="Üç iddia, tek yalan" />
      <div data-pop className="truth-lie-phase-line">
        <div>
          <h2 ref={titleRef} tabIndex={-1} id="truth-lie-setup-title">Paketini hazırla</h2>
          <p>Partnerin yalnız hazır olduğunu görecek.</p>
        </div>
        <time aria-label={`${secondsLeft(rem)} saniye kaldı`}>{secondsLeft(rem)} sn</time>
      </div>
      <div data-pop><TimerBar deadline={snap.deadline} total={IKI_DOGRU_BIR_YALAN_SETUP_MS} /></div>

      {submitted ? (
        <div data-pop className="truth-lie-submitted-card" role="status">
          <span aria-hidden="true"><IconCheck size={34} /></span>
          <h3>Paketin gizlice kilitlendi</h3>
          <p>{game.opponentSubmitted ? 'İkiniz de hazırsınız; ilk tahmin açılıyor.' : `${opp?.nick ?? 'Partnerin'} hazırlanıyor.`}</p>
          <div className="truth-lie-closed-pack" aria-hidden="true"><i>1</i><i>2</i><i>3</i></div>
          {!game.opponentSubmitted && <WaitingDots />}
        </div>
      ) : (
        <form data-pop className="truth-lie-form" onSubmit={submitPack}>
          <fieldset>
            <legend className="sr-only">Üç iddianı yaz ve yalan olanı seç</legend>
            {statements.map((statement, index) => {
              const inputId = `truth-lie-statement-${index}`;
              const countId = `${inputId}-count`;
              return (
                <article key={inputId} className={`truth-lie-editor ${lieIndex === index ? 'marked-lie' : ''}`}>
                  <div className="truth-lie-editor-top">
                    <label htmlFor={inputId}>{index + 1}. iddia</label>
                    <span id={countId}>{[...statement].length}/{IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH}</span>
                  </div>
                  <textarea
                    ref={(node) => { inputRefs.current[index] = node; }}
                    id={inputId}
                    value={statement}
                    maxLength={IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH}
                    rows={2}
                    enterKeyHint={index < 2 ? 'next' : 'done'}
                    autoCapitalize="sentences"
                    autoComplete="off"
                    spellCheck
                    aria-describedby={countId}
                    placeholder={index === 0 ? 'Örn. Bir kez sabaha kadar trende kaldım.' : 'Kısa ve inandırıcı bir iddia…'}
                    onChange={(event) => updateStatement(index, event.target.value)}
                    onKeyDown={(event) => handleEnter(event, index)}
                  />
                  <label className="truth-lie-radio">
                    <input
                      type="radio"
                      name="truth-lie-index"
                      value={index}
                      checked={lieIndex === index}
                      onChange={() => setLieIndex(index as IkiDogruBirYalanLieIndex)}
                    />
                    <span>Bu yalan</span>
                  </label>
                </article>
              );
            })}
          </fieldset>
          <p id="truth-lie-setup-help" className={`truth-lie-form-help ${complete ? 'ready' : ''}`}>{helper}</p>
          <button
            type="submit"
            className="btn-candy btn-block truth-lie-submit"
            disabled={disabled}
            aria-describedby="truth-lie-setup-help"
          >
            {!connected ? 'Bağlantı bekleniyor…' : expired ? 'Süre doldu' : sending ? 'Gizlice kilitleniyor…' : 'Paketimi gizlice kilitle'}
          </button>
        </form>
      )}

      <div data-pop className="truth-lie-submit-status" aria-live="polite">
        <span className={submitted ? 'done' : ''}>{me?.nick ?? 'Sen'}: {submitted ? 'hazır ✓' : expired ? 'süre doldu' : 'hazırlanıyor'}</span>
        <span className={game.opponentSubmitted ? 'done' : ''}>{opp?.nick ?? 'Partnerin'}: {game.opponentSubmitted ? 'hazır ✓' : 'hazırlanıyor'}</span>
      </div>
      <p className="truth-lie-privacy-note">Taslağın yalnız bu sekmede tutulur; gönderilene kadar partnerine görünmez.</p>
    </section>
  );
}

export function IkiDogruBirYalanGuess({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ikiDogruBirYalan;
  const connected = useStore((state) => state.conn === 'open');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [sending, setSending] = useState<number | null>(null);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;
  const round = game?.round ?? 0;

  usePhaseHeadingFocus(titleRef, `guess-${round}`);

  useEffect(() => {
    clearIkiDogruBirYalanDraft(snap.code, snap.you);
    staggerIn(root.current);
  }, [round, snap.code, snap.you]);

  useEffect(() => {
    if (game?.guessLocked || expired || !connected) setSending(null);
  }, [connected, expired, game?.guessLocked]);

  useEffect(() => {
    if (sending === null || game?.guessLocked) return;
    const id = window.setTimeout(() => setSending(null), 1800);
    return () => window.clearTimeout(id);
  }, [game?.guessLocked, sending]);

  if (!game) return null;
  const subject = playerById(snap, game.subjectId);
  const guesser = playerById(snap, game.guesserId);
  const isGuesser = snap.you === game.guesserId;
  const statements = game.statements;
  const guessRound = game.round;
  const visibleChoice = isGuesser ? (game.myGuess ?? sending) : null;
  const locked = isGuesser && game.guessLocked;
  const disabled = !isGuesser || locked || sending !== null || expired || !connected;

  function choose(index: number) {
    if (disabled) return;
    setSending(index);
    haptics.tick();
    send({ t: 'iki_dogru_bir_yalan_guess', choice: index, round: guessRound });
  }

  return (
    <section ref={root} className="truth-lie-panel truth-lie-guess" aria-labelledby="truth-lie-guess-title">
      <ModeHeading kicker={`PAKET ${game.round}/${game.availableRounds}`} title="Yalan hangisi?" />
      <div data-pop className="truth-lie-role-row">
        <PlayerBadge snap={snap} player={subject} label="İddiaların sahibi" />
        <span aria-hidden="true">→</span>
        <PlayerBadge snap={snap} player={guesser} label="Yalan avcısı" />
      </div>
      <div data-pop className="truth-lie-phase-line">
        <div>
          <h2 ref={titleRef} tabIndex={-1} id="truth-lie-guess-title">
            {isGuesser ? 'Gizli yalanı seç' : `${guesser?.nick ?? 'Partnerin'} düşünüyor`}
          </h2>
          <p>{isGuesser ? 'İlk seçimin kilitlenir; ipuçlarını iyi tart.' : 'Tahmini sonuç açılana kadar gizli kalacak.'}</p>
        </div>
        <time aria-label={`${secondsLeft(rem)} saniye kaldı`}>{secondsLeft(rem)} sn</time>
      </div>
      <div data-pop><TimerBar deadline={snap.deadline} total={IKI_DOGRU_BIR_YALAN_GUESS_MS} /></div>

      {!statements ? (
        <div className="truth-lie-loading" role="status">
          <IconTruthLie size={54} />
          <strong>Paket açılıyor…</strong>
        </div>
      ) : isGuesser ? (
        <fieldset data-pop className="truth-lie-guess-list">
          <legend className="sr-only">Yalan olduğunu düşündüğün iddiayı seç</legend>
          {statements.map((statement, index) => (
            <button
              key={index}
              type="button"
              className={`truth-lie-statement choice ${visibleChoice === index ? 'selected' : ''}`}
              disabled={disabled}
              aria-pressed={visibleChoice === index}
              onClick={() => choose(index)}
            >
              <span aria-hidden="true">{index + 1}</span>
              <strong>{statement}</strong>
              <small>{visibleChoice === index ? 'Yalan tahminin' : 'Bunu seç'}</small>
            </button>
          ))}
        </fieldset>
      ) : (
        <div data-pop className="truth-lie-subject-wait" role="status">
          <div className="truth-lie-neutral-list" aria-hidden="true">
            {statements.map((_, index) => <span key={index}>{index + 1}</span>)}
          </div>
          <IconTruthLie size={48} />
          <h3>Tahmin gizli tutuluyor</h3>
          <p>{guesser?.nick ?? 'Partnerin'} seçimini yaparken hiçbir işaret göremezsin.</p>
          <WaitingDots />
        </div>
      )}

      <div className="truth-lie-lock-row" aria-live="polite">
        {!connected ? 'Bağlantın geri gelince devam edebilirsin.'
          : expired && !locked ? 'Süre doldu; sonuç bekleniyor.'
          : isGuesser && (locked || sending !== null) ? 'Tahminin gizlice kilitlendi.'
          : isGuesser ? 'Bir iddiaya dokun; seçimin gizlice kilitlenecek.'
          : `${guesser?.nick ?? 'Partnerin'} gizlice seçiyor.`}
      </div>
      <p className="truth-lie-privacy-note">Yalan ve tahmin yalnız sonuç ekranında birlikte açılır.</p>
    </section>
  );
}

export function IkiDogruBirYalanReveal({ snap }: { snap: RoomSnapshot }) {
  const game = snap.ikiDogruBirYalan;
  const reveal = game?.reveal;
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const round = reveal?.round ?? game?.round ?? 0;

  usePhaseHeadingFocus(titleRef, `reveal-${round}`);

  useEffect(() => {
    clearIkiDogruBirYalanDraft(snap.code, snap.you);
    staggerIn(root.current);
    if (!reveal) return;
    const key = `${reveal.round}:${snap.deadline ?? 0}:${reveal.caught ? 'caught' : 'miss'}:${reveal.guessIndex ?? 'timeout'}`;
    if (readRevealEffect(snap.code) === key) return;
    writeRevealEffect(snap.code, key);
    popIn(resultRef.current, 0.08);
    if (reveal.caught) {
      haptics.accept();
      heartBurst();
    } else {
      haptics.tick();
    }
  }, [reveal?.caught, reveal?.guessIndex, reveal?.round, snap.code, snap.deadline, snap.you]);

  if (!game) return null;
  if (!reveal) {
    return (
      <section className="truth-lie-panel truth-lie-loading" role="status">
        <IconTruthLie size={58} />
        <h2>Yalan açılıyor…</h2>
        <p>Tahmin ve doğru kart aynı anda gösterilecek.</p>
      </section>
    );
  }

  const subject = playerById(snap, reveal.subjectId);
  const guesser = playerById(snap, reveal.guesserId);
  const timeout = reveal.guessIndex === null;
  const title = timeout
    ? 'Tahmin gelmedi'
    : reveal.caught
      ? snap.you === reveal.guesserId ? 'Yalanı yakaladın!' : `${guesser?.nick ?? 'Partnerin'} yalanı yakaladı!`
      : 'Bu kez yalan saklandı';
  const subtitle = timeout
    ? 'Süre doldu; bu paket pas geçildi.'
    : reveal.caught
      ? 'İpuçlarını okuyup gizli kartı buldunuz.'
      : 'Poker yüzü bu tur sırrını korudu.';

  return (
    <section ref={root} className={`truth-lie-panel truth-lie-reveal ${reveal.caught ? 'caught' : timeout ? 'skipped' : 'missed'}`} aria-labelledby="truth-lie-reveal-title">
      <ModeHeading kicker={`PAKET ${reveal.round}/${game.availableRounds}`} title="Kartlar açıldı" />
      <div data-pop className="truth-lie-role-row compact">
        <PlayerBadge snap={snap} player={subject} label="Paket" />
        <span aria-hidden="true">↔</span>
        <PlayerBadge snap={snap} player={guesser} label="Tahmin" />
      </div>

      <div ref={resultRef} data-pop className="truth-lie-result">
        <span className="sr-only" role="status" aria-live="assertive" aria-atomic="true">{title}. {subtitle}</span>
        <span>{timeout ? 'SÜRE DOLDU' : reveal.caught ? 'YALAN YAKALANDI +1' : 'POKER YÜZÜ'}</span>
        <h2 ref={titleRef} tabIndex={-1} id="truth-lie-reveal-title">{title}</h2>
        <p>{subtitle}</p>
      </div>

      <ol data-pop className="truth-lie-reveal-list" aria-label="Açılan üç iddia">
        {reveal.statements.map((statement, index) => {
          const isLie = index === reveal.lieIndex;
          const wasGuessed = index === reveal.guessIndex;
          return (
            <li
              key={index}
              className={`truth-lie-statement reveal ${isLie ? 'lie' : 'truth'} ${wasGuessed ? 'guessed' : ''}`}
              aria-label={`${index + 1}. iddia. ${isLie ? 'Yalan' : 'Doğru'}${wasGuessed ? '. Tahmin edilen' : ''}. ${statement}`}
            >
              <span aria-hidden="true">{index + 1}</span>
              <strong>{statement}</strong>
              <div>
                <small className={isLie ? 'lie-label' : 'truth-label'}>{isLie ? 'YALAN' : 'DOĞRU'}</small>
                {wasGuessed && <small className="guess-label">TAHMİN</small>}
              </div>
            </li>
          );
        })}
      </ol>

      <div data-pop className="truth-lie-score-pulse">
        <strong>{game.caughtCount}/{game.availableRounds}</strong>
        <span>yalan yakalandı</span>
      </div>
      <p className="truth-lie-privacy-note">Ham iddialar maç sonu Story görseline eklenmez.</p>
    </section>
  );
}
