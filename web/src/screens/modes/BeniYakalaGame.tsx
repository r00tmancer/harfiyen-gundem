import { useEffect, useRef, useState } from 'react';
import {
  BENI_YAKALA_ANSWER_MS,
  BENI_YAKALA_PREDICT_MS,
  BENI_YAKALA_ROUNDS,
} from '@harfiyen/shared';
import type { PlayerPublic, RoomSnapshot } from '@harfiyen/shared';
import { useRemaining } from '../../hooks';
import { send } from '../../net/ws';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { Avatar } from '../../ui/avatars';
import { IconHeartSolid, IconHeartsDuo } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';
import { popIn, staggerIn, wobble } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function RoundDots({ round }: { round: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Tur ${round}/${BENI_YAKALA_ROUNDS}`}>
      {Array.from({ length: BENI_YAKALA_ROUNDS }, (_, index) => (
        <span
          key={index}
          className={`q-dot ${index < round - 1 ? 'done' : index === round - 1 ? 'cur' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    popIn(ref.current);
  }, []);

  return (
    <span ref={ref} className="chip chip-p2" role="status">
      {children}
    </span>
  );
}

function QuestionCard({ prompt, eyebrow }: { prompt: string; eyebrow: string }) {
  return (
    <div data-pop className="beni-question card-candy text-center">
      <p className="text-[12px] font-extrabold tracking-wide uppercase" style={{ color: 'var(--p1-dark)' }}>
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-[25px] leading-[1.12] font-extrabold">{prompt}</h2>
    </div>
  );
}

function ChoiceGrid({
  options,
  selected,
  disabled,
  label,
  onChoose,
}: {
  options: readonly string[];
  selected: number | null;
  disabled: boolean;
  label: string;
  onChoose: (choice: number) => void;
}) {
  return (
    <fieldset data-pop className="m-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((option, index) => {
          const isSelected = selected === index;
          return (
            <button
              key={`${index}-${option}`}
              type="button"
              className={`beni-choice ${isSelected ? 'sel' : ''}`}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${OPTION_LETTERS[index] ?? index + 1}: ${option}`}
              onClick={() => onChoose(index)}
            >
              <span className="beni-choice-letter" aria-hidden="true">
                {OPTION_LETTERS[index] ?? index + 1}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PhaseHeader({ snap, total }: { snap: RoomSnapshot; total: number }) {
  const t = snap.beniYakala;
  const rem = useRemaining(snap.deadline);
  if (!t) return null;

  return (
    <>
      <div data-pop className="flex items-center justify-between gap-2">
        <RoundDots round={t.round} />
        <span className="chip chip-sun font-display text-base" aria-live="polite">
          {Math.ceil(rem / 1000)} sn
        </span>
      </div>
      <div data-pop>
        <TimerBar deadline={snap.deadline} total={total} />
      </div>
    </>
  );
}

export function BeniYakalaAnswer({ snap }: { snap: RoomSnapshot }) {
  const t = snap.beniYakala;
  const root = useRef<HTMLDivElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const [sending, setSending] = useState<number | null>(null);

  useEffect(() => {
    staggerIn(root.current);
  }, [t?.round]);

  useEffect(() => {
    if (!connected || t?.myAnswered) setSending(null);
  }, [connected, t?.round, t?.myAnswered]);

  if (!t) return null;
  const locked = t.myAnswered;
  const round = t.round;
  const visibleChoice = t.myAnswer ?? sending;

  function choose(choice: number) {
    if (!connected || locked || sending !== null) return;
    setSending(choice);
    send({ t: 'beni_yakala_answer', choice, round });
  }

  return (
    <div ref={root} className="flex flex-col gap-3.5">
      <PhaseHeader snap={snap} total={BENI_YAKALA_ANSWER_MS} />
      <QuestionCard prompt={t.prompt} eyebrow="Önce sen cevapla" />
      <p data-pop className="font-display text-center text-lg font-extrabold">
        Sen hangisini seçerdin?
      </p>
      <ChoiceGrid
        options={t.options}
        selected={visibleChoice}
        disabled={!connected || locked || sending !== null}
        label="Kendi gizli cevabın"
        onChoose={choose}
      />
      <div className="flex min-h-9 flex-wrap items-center justify-center gap-2">
        {(locked || sending !== null) && <span className="chip chip-ok">Cevabın gizlice kilitlendi</span>}
        {t.oppAnswered && <StatusBadge>O da seçti</StatusBadge>}
      </div>
      <p className="text-center text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
        Cevaplarınız tahminler bitene kadar birbirinize gösterilmez.
      </p>
    </div>
  );
}

export function BeniYakalaPredict({ snap }: { snap: RoomSnapshot }) {
  const t = snap.beniYakala;
  const root = useRef<HTMLDivElement>(null);
  const connected = useStore((state) => state.conn === 'open');
  const opp = oppOf(snap);
  const [sending, setSending] = useState<number | null>(null);

  useEffect(() => {
    staggerIn(root.current);
  }, [t?.round]);

  useEffect(() => {
    if (!connected || t?.myPredicted) setSending(null);
  }, [connected, t?.round, t?.myPredicted]);

  if (!t) return null;
  const locked = t.myPredicted;
  const round = t.round;
  const visibleChoice = t.myPrediction ?? sending;
  const ownAnswer = t.myAnswer === null ? 'Süre doldu' : (t.options[t.myAnswer] ?? 'Cevap yok');

  function choose(choice: number) {
    if (!connected || locked || sending !== null) return;
    setSending(choice);
    send({ t: 'beni_yakala_predict', choice, round });
  }

  return (
    <div ref={root} className="flex flex-col gap-3.5">
      <PhaseHeader snap={snap} total={BENI_YAKALA_PREDICT_MS} />
      <QuestionCard prompt={t.prompt} eyebrow="Şimdi kalbini oku" />
      <div data-pop className="flex items-center justify-center gap-2">
        <span className="chip chip-soft max-w-full">
          Senin cevabın: <strong className="truncate">{ownAnswer}</strong>
        </span>
      </div>
      <p data-pop className="font-display text-center text-lg font-extrabold">
        {opp?.nick ?? 'Partnerin'} hangisini seçti?
      </p>
      <ChoiceGrid
        options={t.options}
        selected={visibleChoice}
        disabled={!connected || locked || sending !== null}
        label={`${opp?.nick ?? 'Partnerinin'} cevabı için tahminin`}
        onChoose={choose}
      />
      <div className="flex min-h-9 flex-wrap items-center justify-center gap-2">
        {(locked || sending !== null) && <span className="chip chip-ok">Tahminin kilitlendi</span>}
        {t.oppPredicted && <StatusBadge>O da tahmin etti</StatusBadge>}
      </div>
    </div>
  );
}

function answerLabel(options: readonly string[], choice: number | null | undefined): string {
  if (choice === null || choice === undefined) return 'Süre doldu';
  return options[choice] ?? 'Cevap yok';
}

function RevealPlayerCard({
  player,
  idx,
  answer,
  prediction,
  correct,
  mine,
}: {
  player: PlayerPublic;
  idx: 0 | 1;
  answer: string;
  prediction: string;
  correct: boolean;
  mine: boolean;
}) {
  return (
    <article
      className={`beni-reveal-card card-candy ${correct ? 'correct' : ''}`}
      style={{ '--beni-player': PLAYER_CSS[idx].main, '--beni-soft': PLAYER_CSS[idx].soft } as React.CSSProperties}
      aria-label={`${mine ? 'Sen' : player.nick} tur sonucu`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar index={player.avatar} color={PLAYER_CSS[idx].main} size={38} />
        <p className="font-display min-w-0 truncate text-[14px] font-extrabold">{mine ? 'Sen' : player.nick}</p>
        {correct && (
          <span className="ml-auto inline-flex" style={{ color: 'var(--p1-dark)' }} aria-label="Doğru tahmin">
            <IconHeartSolid size={20} />
          </span>
        )}
      </div>
      <dl className="mt-2 grid gap-2 text-left">
        <div>
          <dt>Seçti</dt>
          <dd>{answer}</dd>
        </div>
        <div>
          <dt>{mine ? 'Partnerini tahmin etti' : 'Seni tahmin etti'}</dt>
          <dd>{prediction}</dd>
        </div>
      </dl>
    </article>
  );
}

export function BeniYakalaReveal({ snap }: { snap: RoomSnapshot }) {
  const t = snap.beniYakala;
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const reveal = t?.reveal;
  const myCorrect = !!(me && reveal?.correct[me.id]);
  const oppCorrect = !!(opp && reveal?.correct[opp.id]);

  useEffect(() => {
    staggerIn(root.current);
    if (!reveal) return;
    if (myCorrect || oppCorrect) {
      heartBurst();
      popIn(titleRef.current, 0.15);
    } else {
      wobble(titleRef.current);
    }
  }, [reveal, myCorrect, oppCorrect]);

  if (!t) return null;
  if (!reveal) {
    return (
      <div className="flex flex-col items-center gap-4 pt-6 text-center" role="status">
        <IconHeartsDuo size={42} style={{ color: 'var(--p1)' }} />
        <p className="font-display text-xl font-extrabold">Cevaplar açılıyor...</p>
        <RoundDots round={t.round} />
      </div>
    );
  }

  const myReads = me ? (t.reads[me.id] ?? 0) : 0;
  const oppReads = opp ? (t.reads[opp.id] ?? 0) : 0;

  return (
    <div ref={root} className="flex flex-col items-center gap-3.5 pt-1 text-center">
      <RoundDots round={t.round} />
      <div data-pop className="beni-reveal-question card-candy w-full">
        <p className="font-display text-[20px] leading-tight font-extrabold">{t.prompt}</p>
      </div>
      <h2 ref={titleRef} data-pop className="font-display text-[29px] leading-tight font-extrabold" role="status">
        {myCorrect && oppCorrect
          ? 'İKİNİZ DE BİLDİNİZ!'
          : myCorrect
            ? 'Kalbini okudun!'
            : oppCorrect
              ? 'Kalbini okudu!'
              : reveal.exactMatch
                ? 'Cevaplar aynı, tahminler şaştı'
                : 'Bu tur kalpler gizemli kaldı'}
      </h2>
      <div data-pop className="grid w-full grid-cols-2 items-stretch gap-2.5">
        {me && (
          <RevealPlayerCard
            player={me}
            idx={myIdx}
            answer={answerLabel(t.options, reveal.answers[me.id])}
            prediction={answerLabel(t.options, reveal.predictions[me.id])}
            correct={myCorrect}
            mine
          />
        )}
        {opp && (
          <RevealPlayerCard
            player={opp}
            idx={oppIdx}
            answer={answerLabel(t.options, reveal.answers[opp.id])}
            prediction={answerLabel(t.options, reveal.predictions[opp.id])}
            correct={oppCorrect}
            mine={false}
          />
        )}
      </div>
      <div data-pop className="flex flex-wrap items-center justify-center gap-2">
        <span className="chip chip-p1">
          <IconHeartSolid size={14} /> Sen {myReads}/{BENI_YAKALA_ROUNDS}
        </span>
        <span className="chip chip-p2">
          <IconHeartSolid size={14} /> {opp?.nick ?? 'O'} {oppReads}/{BENI_YAKALA_ROUNDS}
        </span>
      </div>
      <p data-pop className="text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
        {t.round >= BENI_YAKALA_ROUNDS ? 'Kalp okuma sonucunuz hazırlanıyor...' : 'Sıradaki soru geliyor...'}
      </p>
    </div>
  );
}
