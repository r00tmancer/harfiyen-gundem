import { useEffect, useRef, useState } from 'react';
import {
  KIRMIZI_YESIL_ROUNDS,
  KIRMIZI_YESIL_VOTE_MS,
} from '@harfiyen/shared';
import type {
  KirmiziYesilCategory,
  KirmiziYesilChoice,
  KirmiziYesilResolution,
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
import { IconFlagRadar } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';

const CATEGORY_LABEL: Record<KirmiziYesilCategory, string> = {
  mesajlasma: 'Mesajlaşma',
  plan_zaman: 'Plan & zaman',
  ev_halleri: 'Ev halleri',
  jestler: 'Jestler',
  sosyal_hayat: 'Sosyal hayat',
  iletisim: 'İletişim',
  para: 'Para',
  komik_huylar: 'Komik huylar',
};

const CHOICE_ORDER: KirmiziYesilChoice[] = ['red', 'depends', 'green'];
const CHOICE_META: Record<
  KirmiziYesilChoice,
  { label: string; short: string; hint: string; symbol: string }
> = {
  red: { label: 'Kırmızı bayrak', short: 'Kırmızı', hint: 'Bana göre olmaz', symbol: '⚑' },
  depends: { label: 'Duruma bağlı', short: 'Bağlı', hint: 'Bağlam önemli', symbol: '◐' },
  green: { label: 'Yeşil bayrak', short: 'Yeşil', hint: 'Bana göre iyi', symbol: '♥' },
};

function resolutionClass(resolution: KirmiziYesilResolution): string {
  if (resolution === 'red_together') return 'red';
  if (resolution === 'depends_together') return 'depends';
  if (resolution === 'green_together') return 'green';
  if (resolution === 'split') return 'split';
  return 'missed';
}

function RadarProgress({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kirmiziYesil;
  if (!game) return null;
  return (
    <ol className="flag-progress" aria-label={`${KIRMIZI_YESIL_ROUNDS} turun ${game.round}. turu`}>
      {Array.from({ length: KIRMIZI_YESIL_ROUNDS }, (_, index) => {
        const round = index + 1;
        const revealed = game.history.find((entry) => entry.round === round);
        const state = revealed
          ? resolutionClass(revealed.resolution)
          : round === game.round
            ? 'active'
            : round < game.round
              ? 'missed'
              : '';
        return (
          <li key={round} className={state} aria-label={revealed ? `${round}. tur açıldı` : `${round}. tur`}>
            <span aria-hidden="true">{revealed?.match ? '✓' : round}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RadarHeader({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kirmiziYesil;
  if (!game) return null;
  return (
    <>
      <RadarProgress snap={snap} />
      <div className="flag-heading">
        <span className="flag-mode-icon" aria-hidden="true"><IconFlagRadar size={25} /></span>
        <div>
          <p>İLİŞKİ RADARI</p>
          <h2>Kırmızı mı Yeşil mi?</h2>
        </div>
        <span className="flag-round-pill">{game.round}/{KIRMIZI_YESIL_ROUNDS}</span>
      </div>
    </>
  );
}

function OpponentLockedBadge({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    popIn(ref.current);
  }, []);
  return (
    <span ref={ref} className="flag-status-chip opponent" role="status">
      {name} seçti <span aria-hidden="true">✓</span>
    </span>
  );
}

export function KirmiziYesilVote({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kirmiziYesil;
  const root = useRef<HTMLElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [sending, setSending] = useState<KirmiziYesilChoice | null>(null);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  useEffect(() => {
    staggerIn(root.current);
    setSending(null);
  }, [game?.round]);

  useEffect(() => {
    if (game?.myLocked || expired || !connected) setSending(null);
  }, [connected, expired, game?.myLocked]);

  if (!game) return null;
  const opp = oppOf(snap);
  const round = game.round;
  const visibleChoice = game.myChoice ?? sending;
  const locked = game.myLocked;
  const disabled = !connected || expired || locked || sending !== null;

  function choose(choice: KirmiziYesilChoice) {
    if (disabled) return;
    setSending(choice);
    haptics.tick();
    send({ t: 'kirmizi_yesil_vote', choice, round });
  }

  return (
    <section ref={root} className="flag-panel flex flex-col gap-3" aria-labelledby="flag-prompt-title">
      <RadarHeader snap={snap} />

      <article data-pop className="flag-prompt-card">
        <div className="flag-prompt-topline">
          <span>{CATEGORY_LABEL[game.category]}</span>
          <time aria-live="polite">{Math.ceil(rem / 1000)} sn</time>
        </div>
        <h3 id="flag-prompt-title">{game.prompt}</h3>
        <p>Bu davranış sende hangi rengi yakıyor?</p>
      </article>

      <div data-pop><TimerBar deadline={snap.deadline} total={KIRMIZI_YESIL_VOTE_MS} /></div>

      <fieldset data-pop className="m-0 border-0 p-0">
        <legend className="sr-only">Bu davranış için gizli rengini seç</legend>
        <div className="flag-choice-grid">
          {CHOICE_ORDER.map((choice) => {
            const meta = CHOICE_META[choice];
            const selected = visibleChoice === choice;
            return (
              <button
                key={choice}
                type="button"
                className={`flag-choice ${choice} ${selected ? 'selected' : ''}`}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`${meta.label} seç — ${meta.hint}`}
                onClick={() => choose(choice)}
              >
                <span className="flag-choice-symbol" aria-hidden="true">{meta.symbol}</span>
                <strong>{meta.short}</strong>
                <small>{meta.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flag-lock-row" aria-live="polite">
        {!connected ? (
          <span className="flag-status-chip warn">Bağlantın geri gelince seçebilirsin</span>
        ) : expired && !locked ? (
          <span className="flag-status-chip warn">Süre doldu · sonuç bekleniyor</span>
        ) : locked || sending !== null ? (
          <span className="flag-status-chip mine">Seçimin gizlice kilitlendi</span>
        ) : (
          <span className="flag-status-chip neutral">İlk dokunuşun kilitlenir</span>
        )}
        {game.opponentLocked && <OpponentLockedBadge name={opp?.nick ?? 'Partnerin'} />}
      </div>

      <p className="flag-trust-note">Doğru cevap yok; bu yalnızca sizin bakış açınız.</p>
    </section>
  );
}

function revealedChoice(choice: KirmiziYesilChoice | null | undefined) {
  if (!choice) return { label: 'Süre doldu', symbol: '—', className: 'missed' };
  const meta = CHOICE_META[choice];
  return { label: meta.label, symbol: meta.symbol, className: choice };
}

function PlayerVoteCard({
  player,
  idx,
  choice,
  mine,
}: {
  player: PlayerPublic;
  idx: 0 | 1;
  choice: KirmiziYesilChoice | null | undefined;
  mine: boolean;
}) {
  const vote = revealedChoice(choice);
  return (
    <article className={`flag-player-vote ${vote.className}`} aria-label={`${mine ? 'Sen' : player.nick}: ${vote.label}`}>
      <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={38} />
      <span>{mine ? 'Sen' : player.nick}</span>
      <b aria-hidden="true">{vote.symbol}</b>
      <strong>{vote.label}</strong>
    </article>
  );
}

const REVEAL_COPY: Record<KirmiziYesilResolution, { kicker: string; title: string; body: string }> = {
  red_together: {
    kicker: 'AYNI RENK +1',
    title: 'Ortak sınır!',
    body: 'İkiniz de burada kırmızı bayrak kaldırdınız.',
  },
  depends_together: {
    kicker: 'AYNI RENK +1',
    title: 'Bağlam önemli!',
    body: 'İkiniz de cevabı duruma bırakmayı seçtiniz.',
  },
  green_together: {
    kicker: 'AYNI RENK +1',
    title: 'Yeşil ışık!',
    body: 'Bu davranış ikinizin de içini rahatlattı.',
  },
  split: {
    kicker: 'GRİ ALAN',
    title: 'Tatlı bir ayrım',
    body: 'Aynı duruma farklı yerlerden baktınız; konuşmalık çıktı.',
  },
  solo: {
    kicker: 'BİR GÖRÜŞ EKSİK',
    title: 'Bir renk havada kaldı',
    body: 'Biriniz süreyi kaçırdı; bu tur puansız.',
  },
  skipped: {
    kicker: 'BU TUR PAS',
    title: 'Radar sessiz kaldı',
    body: 'İkinizin de süresi doldu; sıradaki senaryoya geçiliyor.',
  },
};

export function KirmiziYesilReveal({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kirmiziYesil;
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const reveal = game?.reveal;

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    popIn(titleRef.current, 0.1);
    if (reveal.match) {
      haptics.accept();
      heartBurst();
    } else {
      haptics.tick();
    }
  }, [reveal?.round]);

  if (!game) return null;
  if (!reveal) {
    return (
      <section className="flag-panel flag-loading" role="status">
        <IconFlagRadar size={58} />
        <h2>Renkler açılıyor…</h2>
        <p>İki gizli seçim karşılaştırılıyor.</p>
      </section>
    );
  }

  const copy = REVEAL_COPY[reveal.resolution];
  const myVote = me ? reveal.votes[me.id] : null;
  const oppVote = opp ? reveal.votes[opp.id] : null;

  return (
    <section ref={root} className={`flag-panel flag-reveal ${resolutionClass(reveal.resolution)}`} aria-labelledby="flag-reveal-title">
      <RadarHeader snap={snap} />

      <article data-pop className="flag-reveal-prompt">
        <span>{CATEGORY_LABEL[reveal.category]}</span>
        <p>{reveal.prompt}</p>
      </article>

      <div data-pop className="flag-reveal-title" role="status" aria-live="assertive">
        <span>{copy.kicker}</span>
        <h2 ref={titleRef} id="flag-reveal-title">{copy.title}</h2>
        <p>{copy.body}</p>
      </div>

      <div data-pop className="flag-vote-pair">
        {me && <PlayerVoteCard player={me} idx={myIdx} choice={myVote} mine />}
        <span className="flag-pair-link" aria-hidden="true">{reveal.match ? '♥' : '↔'}</span>
        {opp && <PlayerVoteCard player={opp} idx={oppIdx} choice={oppVote} mine={false} />}
      </div>

      <div data-pop className={`flag-score-pulse ${reveal.match ? 'matched' : ''}`}>
        <strong>{game.matches}/{KIRMIZI_YESIL_ROUNDS}</strong>
        <span>aynı renk</span>
      </div>
      <p className="flag-trust-note">Doğru cevap yok; bu yalnızca sizin bakış açınız.</p>
    </section>
  );
}
