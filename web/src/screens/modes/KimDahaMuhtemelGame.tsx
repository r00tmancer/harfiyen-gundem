import { useEffect, useRef, useState } from 'react';
import {
  KIM_DAHA_MUHTEMEL_ROUNDS,
  KIM_DAHA_MUHTEMEL_VOTE_MS,
} from '@harfiyen/shared';
import type { PlayerPublic, RoomSnapshot } from '@harfiyen/shared';
import { popIn, staggerIn } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { haptics } from '../../fx/haptics';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconLikely } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';

type LikelyChoice = 'self' | 'partner' | 'both';
type LikelyResolution = 'same_player' | 'both_together' | 'split' | 'solo' | 'skipped';
type LikelyTarget = { kind: 'player'; playerId: string } | { kind: 'both' };

// sessionStorage sayfa yenilemesinde kalir ama iki ayri sekmenin efektini birbirine
// karistirmaz. Yeni vote fazi anahtari temizler; rovansta efekt yeniden oynar.
const REVEAL_EFFECT_KEY = 'harfiyen:kim-daha-muhtemel:reveal:';

function readRevealEffect(code: string): string | null {
  try {
    return sessionStorage.getItem(`${REVEAL_EFFECT_KEY}${code}`);
  } catch {
    return null;
  }
}

function writeRevealEffect(code: string, value: string | null): void {
  try {
    const key = `${REVEAL_EFFECT_KEY}${code}`;
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Depolama engelliyse oyun akisi efekt korumasi olmadan devam eder.
  }
}

const CATEGORY_LABEL = {
  ilk_hamle: 'İlk hamle',
  plan_pusulasi: 'Plan pusulası',
  lezzet: 'Lezzet',
  kahkaha: 'Kahkaha',
  macera: 'Macera',
  ince_jest: 'İnce jest',
  sosyal_sahne: 'Sosyal sahne',
  gece_modu: 'Gece modu',
} as const;

const CHOICE_ORDER: LikelyChoice[] = ['self', 'both', 'partner'];

function resolutionClass(resolution: LikelyResolution): string {
  if (resolution === 'same_player') return 'same';
  if (resolution === 'both_together') return 'both';
  if (resolution === 'split') return 'split';
  return 'missed';
}

function LikelyProgress({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kimDahaMuhtemel;
  if (!game) return null;

  return (
    <ol
      className="likely-progress"
      aria-label={`${KIM_DAHA_MUHTEMEL_ROUNDS} turun ${game.round}. turu`}
    >
      {Array.from({ length: KIM_DAHA_MUHTEMEL_ROUNDS }, (_, index) => {
        const round = index + 1;
        const revealed = game.history.find((entry) => entry.round === round);
        const state = revealed
          ? resolutionClass(revealed.resolution)
          : round === game.round
            ? 'active'
            : round < game.round
              ? 'missed'
              : '';
        const result = revealed
          ? revealed.resolution === 'same_player'
            ? 'aynı kişi'
            : revealed.resolution === 'both_together'
              ? 'ikiniz de'
              : revealed.resolution === 'split'
                ? 'farklı kişiler'
                : 'cevap eksik'
          : round === game.round
            ? 'aktif'
            : 'bekliyor';
        return (
          <li key={round} className={state} aria-label={`${round}. tur, ${result}`}>
            <span aria-hidden="true">{revealed?.agreement ? '✓' : round}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LikelyHeader({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kimDahaMuhtemel;
  if (!game) return null;
  return (
    <>
      <LikelyProgress snap={snap} />
      <div className="likely-heading">
        <span className="likely-mode-icon" aria-hidden="true"><IconLikely size={25} /></span>
        <div>
          <p>SPOT IŞIKLARI AÇIK</p>
          <h2>Kim Daha Muhtemel?</h2>
        </div>
        <span className="likely-round-pill">{game.round}/{KIM_DAHA_MUHTEMEL_ROUNDS}</span>
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
    <span ref={ref} className="likely-status-chip opponent">
      {name} seçti <span aria-hidden="true">✓</span>
    </span>
  );
}

function BothAvatars({ snap, size = 34 }: { snap: RoomSnapshot; size?: number }) {
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  return (
    <span className="likely-duo" aria-hidden="true">
      {me && <Avatar index={me.avatar} color={PLAYER_CSS[myIdx].main} size={size} />}
      {opp && <Avatar index={opp.avatar} color={PLAYER_CSS[oppIdx].main} size={size} />}
    </span>
  );
}

function ChoiceVisual({ snap, choice }: { snap: RoomSnapshot; choice: LikelyChoice }) {
  const me = meOf(snap);
  const opp = oppOf(snap);
  if (choice === 'both') return <BothAvatars snap={snap} />;
  const player = choice === 'self' ? me : opp;
  if (!player) return <span className="likely-empty-avatar" aria-hidden="true" />;
  const idx = playerIndex(snap, player.id);
  return <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={44} />;
}

export function KimDahaMuhtemelVote({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kimDahaMuhtemel;
  const root = useRef<HTMLElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [sending, setSending] = useState<LikelyChoice | null>(null);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  useEffect(() => {
    staggerIn(root.current);
    setSending(null);
    writeRevealEffect(snap.code, null);
  }, [game?.round, snap.code]);

  useEffect(() => {
    if (game?.myLocked || expired || !connected) setSending(null);
  }, [connected, expired, game?.myLocked]);

  if (!game) return null;
  const me = meOf(snap);
  const opp = oppOf(snap);
  const round = game.round;
  const visibleChoice = game.myChoice ?? sending;
  const locked = game.myLocked;
  const disabled = !connected || expired || locked || sending !== null;
  const choiceMeta: Record<LikelyChoice, { label: string; hint: string; aria: string }> = {
    self: { label: 'Ben', hint: me?.nick ?? 'Sen', aria: 'Daha muhtemel kişi olarak kendini seç' },
    both: { label: 'İkimiz de', hint: 'Rolü paylaşırız', aria: 'Daha muhtemel olarak ikinizi de seç' },
    partner: {
      label: opp?.nick ?? 'Partnerim',
      hint: 'Bence o',
      aria: `Daha muhtemel kişi olarak ${opp?.nick ?? 'partnerini'} seç`,
    },
  };

  function choose(choice: LikelyChoice) {
    if (disabled) return;
    setSending(choice);
    haptics.tick();
    send({ t: 'kim_daha_muhtemel_vote', choice, round });
  }

  return (
    <section ref={root} className="likely-panel flex flex-col gap-3" aria-labelledby="likely-prompt-title">
      <LikelyHeader snap={snap} />

      <article data-pop className="likely-prompt-card">
        <div className="likely-prompt-topline">
          <span>{CATEGORY_LABEL[game.category]}</span>
          <time>{Math.ceil(rem / 1000)} sn</time>
        </div>
        <h3 id="likely-prompt-title">{game.prompt}</h3>
        <p>Sence hanginiz bunu yapmaya daha yatkın?</p>
      </article>

      <div data-pop><TimerBar deadline={snap.deadline} total={KIM_DAHA_MUHTEMEL_VOTE_MS} /></div>

      <fieldset data-pop className="m-0 border-0 p-0">
        <legend className="sr-only">Bu soru için gizli hedefini seç</legend>
        <div className="likely-choice-grid">
          {CHOICE_ORDER.map((choice) => {
            const meta = choiceMeta[choice];
            const selected = visibleChoice === choice;
            return (
              <button
                key={choice}
                type="button"
                className={`likely-choice ${choice} ${selected ? 'selected' : ''}`}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={meta.aria}
                onClick={() => choose(choice)}
              >
                <ChoiceVisual snap={snap} choice={choice} />
                <strong>{meta.label}</strong>
                <small>{meta.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="likely-lock-row" aria-live="polite">
        {!connected ? (
          <span className="likely-status-chip warn">Bağlantın geri gelince seçebilirsin</span>
        ) : expired && !locked ? (
          <span className="likely-status-chip warn">Süre doldu · sonuç bekleniyor</span>
        ) : locked || sending !== null ? (
          <span className="likely-status-chip mine">Seçimin gizlice kilitlendi</span>
        ) : (
          <span className="likely-status-chip neutral">İlk dokunuşun gizlice kilitlenir</span>
        )}
        {game.opponentLocked && <OpponentLockedBadge name={opp?.nick ?? 'Partnerin'} />}
      </div>

      <p className="likely-trust-note">Doğru cevap yok; eğlencelik bir tahmin.</p>
    </section>
  );
}

function targetPlayer(snap: RoomSnapshot, target: LikelyTarget | null | undefined): PlayerPublic | null {
  if (!target || target.kind !== 'player') return null;
  return snap.players.find((player) => player.id === target.playerId) ?? null;
}

function targetLabel(snap: RoomSnapshot, target: LikelyTarget | null | undefined): string {
  if (!target) return 'Süre doldu';
  if (target.kind === 'both') return 'İkiniz de';
  const player = targetPlayer(snap, target);
  if (!player) return 'Seçim yok';
  return player.id === snap.you ? 'Sen' : player.nick;
}

function TargetVisual({ snap, target }: { snap: RoomSnapshot; target: LikelyTarget | null | undefined }) {
  if (!target) return <span className="likely-target-missed" aria-hidden="true">—</span>;
  if (target.kind === 'both') return <BothAvatars snap={snap} size={31} />;
  const player = targetPlayer(snap, target);
  if (!player) return <span className="likely-target-missed" aria-hidden="true">—</span>;
  return <Avatar index={player.avatar} color={PLAYER_CSS[playerIndex(snap, player.id)].main} size={42} />;
}

function PlayerPointCard({
  snap,
  player,
  target,
  mine,
}: {
  snap: RoomSnapshot;
  player: PlayerPublic;
  target: LikelyTarget | null | undefined;
  mine: boolean;
}) {
  const idx = playerIndex(snap, player.id);
  const label = targetLabel(snap, target);
  return (
    <article className={`likely-player-point ${target ? '' : 'missed'}`} aria-label={`${mine ? 'Sen' : player.nick}: ${label}`}>
      <div className="likely-voter">
        <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={34} />
        <span>{mine ? 'Sen' : player.nick}</span>
      </div>
      <span className="likely-point-arrow" aria-hidden="true">↓</span>
      <div className="likely-target">
        <TargetVisual snap={snap} target={target} />
        <strong>{label}</strong>
      </div>
    </article>
  );
}

const REVEAL_COPY: Record<LikelyResolution, { kicker: string; title: string; body: string }> = {
  same_player: {
    kicker: 'AYNI HEDEF +1',
    title: 'Parmaklar aynı yöne!',
    body: 'İkiniz de aynı kişiyi spot ışığına aldınız.',
  },
  both_together: {
    kicker: 'İKİNİZ DE +1',
    title: 'Bu rol ortak!',
    body: 'İkiniz de bu kez “ikimiz de” dediniz.',
  },
  split: {
    kicker: 'TATLI AYRIM',
    title: 'Spotlar ayrıştı',
    body: 'Aynı soruda farklı kişileri düşündünüz.',
  },
  solo: {
    kicker: 'BİR İŞARET EKSİK',
    title: 'Bir parmak havada kaldı',
    body: 'Biriniz süreyi kaçırdı; bu tur ortak skora yazılmadı.',
  },
  skipped: {
    kicker: 'BU TUR PAS',
    title: 'Spotlar sönük kaldı',
    body: 'İkinizin de süresi doldu; sıradaki soruya geçiliyor.',
  },
};

export function KimDahaMuhtemelReveal({ snap }: { snap: RoomSnapshot }) {
  const game = snap.kimDahaMuhtemel;
  const reveal = game?.reveal;
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    const revealKey = `${reveal.round}:${game?.prompt ?? ''}:${reveal.resolution}`;
    if (readRevealEffect(snap.code) === revealKey) return;
    writeRevealEffect(snap.code, revealKey);
    popIn(titleRef.current, 0.1);
    if (reveal.agreement) {
      haptics.accept();
      heartBurst();
    } else {
      haptics.tick();
    }
  }, [game?.prompt, reveal?.resolution, reveal?.round, snap.code]);

  if (!game) return null;
  if (!reveal) {
    return (
      <section className="likely-panel likely-loading" role="status">
        <IconLikely size={58} />
        <h2>İşaretler açılıyor…</h2>
        <p>İki gizli seçim aynı hedefe çevriliyor.</p>
      </section>
    );
  }

  const copy = REVEAL_COPY[reveal.resolution];
  const myTarget = me ? reveal.targets[me.id] : null;
  const oppTarget = opp ? reveal.targets[opp.id] : null;

  return (
    <section
      ref={root}
      className={`likely-panel likely-reveal ${resolutionClass(reveal.resolution)}`}
      aria-labelledby="likely-reveal-title"
    >
      <LikelyHeader snap={snap} />

      <article data-pop className="likely-reveal-prompt">
        <span>{CATEGORY_LABEL[game.category]}</span>
        <p>{game.prompt}</p>
      </article>

      <div data-pop className="likely-reveal-title" role="status" aria-live="assertive">
        <span>{copy.kicker}</span>
        <h2 ref={titleRef} id="likely-reveal-title">{copy.title}</h2>
        <p>{copy.body}</p>
      </div>

      <div data-pop className="likely-point-pair">
        {me && <PlayerPointCard snap={snap} player={me} target={myTarget} mine />}
        <span className="likely-pair-link" aria-hidden="true">{reveal.agreement ? '★' : '↔'}</span>
        {opp && <PlayerPointCard snap={snap} player={opp} target={oppTarget} mine={false} />}
      </div>

      <div data-pop className={`likely-score-pulse ${reveal.agreement ? 'matched' : ''}`}>
        <strong>{game.agreements}/{KIM_DAHA_MUHTEMEL_ROUNDS}</strong>
        <span>aynı hedef</span>
      </div>
      <p className="likely-trust-note">Doğru cevap yok; eğlencelik bir tahmin.</p>
    </section>
  );
}
