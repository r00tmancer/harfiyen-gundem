import { useEffect, useRef, useState } from 'react';
import {
  RANDEVU_RULETI_PICK_MS,
  RANDEVU_RULETI_ROUNDS,
} from '@harfiyen/shared';
import type { PlayerPublic, RandevuCategory, RoomSnapshot } from '@harfiyen/shared';
import { staggerIn, popIn, wobble } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconHeartSolid, IconRoulette } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';

const CATEGORY_ORDER: RandevuCategory[] = ['yemek', 'etkinlik', 'tatli'];
const CATEGORY_META: Record<
  RandevuCategory,
  { label: string; kicker: string; symbol: string; accent: string }
> = {
  yemek: { label: 'Yemek', kicker: 'Uzay mutfağından başlangıç', symbol: '✦', accent: '#FF62B0' },
  etkinlik: { label: 'Etkinlik', kicker: 'Gecenin yörüngesini seç', symbol: '◉', accent: '#55E7FF' },
  tatli: { label: 'Tatlı', kicker: 'Kozmik final', symbol: '★', accent: '#FFD166' },
};

function CategorySteps({ active }: { active: RandevuCategory }) {
  const activeIndex = CATEGORY_ORDER.indexOf(active);
  return (
    <ol className="roulette-steps" aria-label={`Randevu planı: ${CATEGORY_META[active].label} turu`}>
      {CATEGORY_ORDER.map((category, index) => {
        const meta = CATEGORY_META[category];
        return (
          <li key={category} className={index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}>
            <span aria-hidden="true">{index < activeIndex ? '✓' : meta.symbol}</span>
            <strong>{meta.label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function OpponentLockedBadge() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    popIn(ref.current);
  }, []);
  return (
    <span ref={ref} className="roulette-chip roulette-chip-cyan" role="status">
      O da seçimini kilitledi
    </span>
  );
}

export function RandevuRuletiPick({ snap }: { snap: RoomSnapshot }) {
  const t = snap.randevuRuleti;
  const root = useRef<HTMLDivElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [sending, setSending] = useState<number | null>(null);
  const rem = useRemaining(snap.deadline);
  const expired = rem <= 0;

  useEffect(() => {
    staggerIn(root.current);
  }, [t?.round]);

  useEffect(() => {
    if (!connected || t?.myLocked || expired) setSending(null);
  }, [connected, expired, t?.round, t?.myLocked]);

  if (!t) return null;
  const meta = CATEGORY_META[t.category];
  const locked = t.myLocked;
  const visibleChoice = t.myChoice ?? sending;
  const round = t.round;

  function choose(choice: number) {
    if (!connected || expired || locked || sending !== null) return;
    setSending(choice);
    send({ t: 'randevu_ruleti_pick', choice, round });
  }

  return (
    <section
      ref={root}
      className="roulette-panel flex flex-col gap-3.5"
      style={{ '--roulette-accent': meta.accent } as React.CSSProperties}
      aria-labelledby="roulette-pick-title"
    >
      <CategorySteps active={t.category} />

      <div data-pop className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="roulette-kicker">{meta.kicker}</p>
          <h2 id="roulette-pick-title" className="font-display text-[25px] leading-tight font-extrabold">
            {t.prompt}
          </h2>
        </div>
        <span className="roulette-timer" aria-live="polite">
          {Math.ceil(rem / 1000)} sn
        </span>
      </div>
      <TimerBar deadline={snap.deadline} total={RANDEVU_RULETI_PICK_MS} />

      <fieldset data-pop className="m-0 border-0 p-0">
        <legend className="sr-only">{meta.label} için gizli seçimin</legend>
        <div className="roulette-choice-grid">
          {t.choices.map((choice, index) => {
            const selected = visibleChoice === index;
            return (
              <button
                key={`${index}-${choice}`}
                type="button"
                className={`roulette-choice ${selected ? 'selected' : ''}`}
                disabled={!connected || expired || locked || sending !== null}
                aria-pressed={selected}
                aria-label={`${index + 1}. seçenek: ${choice}`}
                onClick={() => choose(index)}
              >
                <span className="roulette-choice-orbit" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{choice}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex min-h-10 flex-wrap items-center justify-center gap-2">
        {(expired || locked || sending !== null) && (
          <span className="roulette-chip roulette-chip-pink" role="status">
            {expired && !locked
              ? 'Süre doldu — sonuç bekleniyor'
              : locked && t.myChoice === null
                ? 'Süren doldu — rulet karar verecek'
                : 'Seçimin gizlice kilitlendi'}
          </span>
        )}
        {t.opponentLocked && <OpponentLockedBadge />}
      </div>

      <p className="roulette-privacy">Seçiminiz açılışa kadar gizli kalır. Ses veya titreşim gerekmez.</p>
    </section>
  );
}

function choiceLabel(choices: readonly string[], choice: number | null | undefined): string {
  if (choice === null || choice === undefined) return 'Süre doldu';
  return choices[choice] ?? 'Seçim yok';
}

function PlayerRevealCard({
  player,
  idx,
  choice,
  mine,
  selected,
}: {
  player: PlayerPublic;
  idx: 0 | 1;
  choice: string;
  mine: boolean;
  selected: boolean;
}) {
  const timeout = choice === 'Süre doldu';
  return (
    <article
      className={`roulette-player-card ${selected ? 'plan-choice' : ''} ${timeout ? 'timed-out' : ''}`}
      aria-label={`${mine ? 'Sen' : player.nick}: ${choice}`}
    >
      <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={38} />
      <p>{mine ? 'Sen' : player.nick}</p>
      <strong>{choice}</strong>
      {selected && <span>plana girdi</span>}
    </article>
  );
}

function RouletteWheel({
  selectedLabel,
  candidateA,
  candidateB,
}: {
  selectedLabel: string;
  candidateA: string;
  candidateB: string;
}) {
  return (
    <div className="roulette-wheel-stage" aria-label={`Rulet sonucu: ${selectedLabel}`}>
      <span className="roulette-pointer" aria-hidden="true" />
      <div className="roulette-wheel" aria-hidden="true">
        <span>✦</span>
        <span>♥</span>
        <span>◉</span>
        <span>★</span>
      </div>
      <div className="roulette-result-pill">
        <div className="roulette-candidates" aria-label={`${candidateA} ve ${candidateB} arasında rulet`}>
          <span>{candidateA}</span>
          <b aria-hidden="true">↔</b>
          <span>{candidateB}</span>
        </div>
        <small>RULETİN SEÇİMİ</small>
        <strong>{selectedLabel}</strong>
      </div>
    </div>
  );
}

function TimeoutResult({
  selectedLabel,
  resolution,
}: {
  selectedLabel: string;
  resolution: 'single' | 'fallback';
}) {
  return (
    <div className="roulette-timeout-result" role="status">
      <IconRoulette size={34} />
      <div>
        <small>{resolution === 'single' ? 'TEK KİLİTLENEN SEÇİM' : 'İKİNİZİN DE SÜRESİ DOLDU'}</small>
        <strong>{selectedLabel}</strong>
        <p>{resolution === 'single' ? 'Bu tur doğrudan plana girdi.' : 'Evren seçenek havuzundan sizin için seçti.'}</p>
      </div>
    </div>
  );
}

function revealTitle(resolution: 'match' | 'roulette' | 'single' | 'fallback'): string {
  if (resolution === 'match') return 'AYNI KALP!';
  if (resolution === 'single') return 'Bir seçim yıldızlaştı';
  if (resolution === 'fallback') return 'Evren sizin için seçti';
  return 'Rulet karar verdi!';
}

export function RandevuRuletiReveal({ snap }: { snap: RoomSnapshot }) {
  const t = snap.randevuRuleti;
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const reveal = t?.reveal;

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    if (reveal.same) {
      heartBurst();
      popIn(titleRef.current, 0.16);
    } else {
      wobble(titleRef.current);
    }
  }, [reveal]);

  if (!t) return null;
  const meta = CATEGORY_META[t.category];
  if (!reveal) {
    return (
      <section className="roulette-panel flex min-h-80 flex-col items-center justify-center gap-5 text-center" role="status">
        <IconRoulette size={58} className="roulette-waiting-icon" />
        <h2 className="font-display text-2xl font-extrabold">Kozmik rulet hazırlanıyor...</h2>
        <CategorySteps active={t.category} />
      </section>
    );
  }

  const myRaw = me ? reveal.choices[me.id] : null;
  const oppRaw = opp ? reveal.choices[opp.id] : null;
  const myLabel = choiceLabel(t.choices, myRaw);
  const oppLabel = choiceLabel(t.choices, oppRaw);
  const selectedIndex = reveal.selectedChoice;

  return (
    <section
      ref={root}
      className="roulette-panel flex flex-col items-center gap-3.5 text-center"
      style={{ '--roulette-accent': meta.accent } as React.CSSProperties}
      aria-labelledby="roulette-reveal-title"
    >
      <CategorySteps active={t.category} />
      <p data-pop className="roulette-kicker">{meta.label} seçimi açıldı</p>
      <h2 id="roulette-reveal-title" ref={titleRef} data-pop className="roulette-reveal-title" role="status">
        {revealTitle(reveal.resolution)}
      </h2>

      <div data-pop className="grid w-full grid-cols-2 gap-2.5">
        {me && (
          <PlayerRevealCard
            player={me}
            idx={myIdx}
            choice={myLabel}
            mine
            selected={myRaw !== null && myRaw === selectedIndex}
          />
        )}
        {opp && (
          <PlayerRevealCard
            player={opp}
            idx={oppIdx}
            choice={oppLabel}
            mine={false}
            selected={oppRaw !== null && oppRaw === selectedIndex}
          />
        )}
      </div>

      {reveal.resolution === 'match' ? (
        <div data-pop className="roulette-same-result">
          <IconHeartSolid size={28} />
          <div>
            <small>PLANA EKLENDİ</small>
            <strong>{reveal.selectedLabel}</strong>
          </div>
          <IconHeartSolid size={28} />
        </div>
      ) : reveal.resolution === 'roulette' ? (
        <div data-pop className="w-full" key={`wheel-${reveal.round}`}>
          <RouletteWheel selectedLabel={reveal.selectedLabel} candidateA={myLabel} candidateB={oppLabel} />
        </div>
      ) : (
        <div data-pop className="w-full">
          <TimeoutResult selectedLabel={reveal.selectedLabel} resolution={reveal.resolution} />
        </div>
      )}

      <div data-pop className="flex flex-wrap items-center justify-center gap-2">
        <span className="roulette-chip roulette-chip-pink">
          <IconHeartSolid size={14} /> {t.matches}/{RANDEVU_RULETI_ROUNDS} aynı seçim
        </span>
        <span className="roulette-chip roulette-chip-cyan">Plan {t.plan.length}/{RANDEVU_RULETI_ROUNDS}</span>
      </div>
      <p className="roulette-privacy">
        {t.round >= RANDEVU_RULETI_ROUNDS ? 'Randevu planınız hazırlanıyor...' : 'Sıradaki plan parçası geliyor...'}
      </p>
    </section>
  );
}
