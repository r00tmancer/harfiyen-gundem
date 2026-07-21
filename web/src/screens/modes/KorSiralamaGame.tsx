import { useEffect, useRef, useState } from 'react';
import {
  KOR_SIRALAMA_ITEMS,
  KOR_SIRALAMA_PICK_MS,
} from '@harfiyen/shared';
import type { PlayerPublic, RoomSnapshot } from '@harfiyen/shared';
import { meOf, oppOf, playerIndex, useStore } from '../../store';
import { send } from '../../net/ws';
import { Avatar } from '../../ui/avatars';
import { IconHeartSolid, IconPass, IconRanking } from '../../ui/icons';
import { PLAYER_CSS, TimerBar } from '../../ui/parts';
import { useRemaining } from '../../hooks';
import { popIn, staggerIn, wobble } from '../../fx/anim';
import { heartBurst } from '../../fx/confetti';
import { haptics } from '../../fx/haptics';

function RankDots({ index }: { index: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Kart ${index}/${KOR_SIRALAMA_ITEMS}`}>
      {Array.from({ length: KOR_SIRALAMA_ITEMS }, (_, i) => (
        <span key={i} className={`q-dot ${i < index - 1 ? 'done' : i === index - 1 ? 'cur' : ''}`} />
      ))}
    </div>
  );
}

function OppRankedBadge() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    popIn(ref.current);
  }, []);
  return (
    <span ref={ref} className="chip chip-p2">
      O da sıraladı
    </span>
  );
}

const SLOT_LABELS = ['favorim', '', '', '', 'en sona'] as const;

export function KorSiralamaPick({ snap }: { snap: RoomSnapshot }) {
  const t = snap.korSiralama;
  const root = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const [localSlot, setLocalSlot] = useState<number | null>(null);
  const connected = useStore((state) => state.conn === 'open');
  const rem = useRemaining(snap.deadline);
  const me = meOf(snap);
  const jokers = me?.jokers ?? 0;

  useEffect(() => {
    staggerIn(root.current);
  }, []);

  useEffect(() => {
    setLocalSlot(null);
    popIn(itemRef.current);
  }, [t?.itemIndex, t?.currentItem]);

  if (!t) return null;
  const ranked = localSlot !== null || t.myRanked;
  const mySlots = t.mySlots;
  const currentItem = t.currentItem;
  const currentIndex = t.itemIndex;

  function choose(slot: number) {
    if (!connected || ranked || mySlots[slot - 1] !== null) return;
    setLocalSlot(slot);
    send({ t: 'kor_rank', slot, itemIndex: currentIndex, item: currentItem });
  }

  return (
    <div ref={root} className="flex flex-col gap-3">
      <div data-pop className="flex items-center justify-between gap-2">
        <RankDots index={t.itemIndex} />
        <span className="chip chip-sun font-display text-base" aria-live="polite">
          {Math.ceil(rem / 1000)} sn
        </span>
      </div>
      <div data-pop>
        <TimerBar deadline={snap.deadline} total={KOR_SIRALAMA_PICK_MS} />
      </div>

      <div data-pop className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
            {t.topic}
          </p>
          <p className="font-display text-base leading-tight font-extrabold">{t.prompt}</p>
        </div>
        <button
          type="button"
          className="btn-candy joker-btn shrink-0"
          disabled={!connected || jokers === 0 || ranked || t.oppRanked || t.itemIndex >= KOR_SIRALAMA_ITEMS}
          onClick={() => send({ t: 'kor_pass', itemIndex: t.itemIndex, item: t.currentItem })}
          title="Pas jokeri"
          aria-label={`Pas jokeri: bu kartı destenin sonuna at (${jokers} hak)`}
        >
          <IconPass size={24} />
          <span className="joker-count" aria-hidden="true">
            {jokers}
          </span>
        </button>
      </div>

      <div ref={itemRef} data-pop className="kor-current card-candy text-center">
        <span className="inline-flex" style={{ color: 'var(--grape)' }} aria-hidden="true">
          <IconRanking size={25} />
        </span>
        <p className="font-display text-[23px] leading-tight font-extrabold">{t.currentItem}</p>
        <p className="text-[12px] font-bold" style={{ color: 'var(--ink-soft)' }}>
          Gelecek kartları görmeden boş bir sıraya koy
        </p>
      </div>

      <div data-pop className="flex flex-col gap-2" role="group" aria-label="Sıralama yuvaları">
        {Array.from({ length: KOR_SIRALAMA_ITEMS }, (_, index) => {
          const slot = index + 1;
          const saved = t.mySlots[index];
          const optimistic = localSlot === slot ? t.currentItem : null;
          const value = saved ?? optimistic;
          const selected = optimistic !== null || (t.myRanked && saved === t.currentItem);
          return (
            <button
              key={slot}
              type="button"
              className={`rank-slot ${value ? 'filled' : 'open'} ${selected ? 'selected' : ''}`}
              disabled={!connected || ranked || saved !== null}
              onClick={() => choose(slot)}
              aria-label={`${slot}. sıra${value ? `: ${value}` : ', boş'}`}
            >
              <span className="rank-number">{slot}</span>
              <span className="min-w-0 flex-1 text-left">
                {value ? (
                  <span className="font-display block truncate text-[14px] font-extrabold">{value}</span>
                ) : (
                  <span className="text-[13px] font-bold" style={{ color: 'var(--ink-soft)' }}>
                    Buraya koy
                  </span>
                )}
              </span>
              {SLOT_LABELS[index] && <span className="rank-hint">{SLOT_LABELS[index]}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-center gap-2">
        {ranked && <span className="chip chip-ok">Sıran kilitlendi</span>}
        {t.oppRanked && <OppRankedBadge />}
      </div>
    </div>
  );
}

function RevealCard({
  owner,
  idx,
  slot,
  mine,
}: {
  owner: PlayerPublic;
  idx: 0 | 1;
  slot: number | undefined;
  mine: boolean;
}) {
  return (
    <div className="card-candy flex flex-1 flex-col items-center gap-2 p-3! text-center" style={{ background: PLAYER_CSS[idx].soft }}>
      <Avatar index={owner.avatar} color={PLAYER_CSS[idx].main} size={44} />
      <p className="font-display max-w-full truncate text-[13px] font-bold">{mine ? 'sen' : owner.nick}</p>
      <span className="rank-reveal-number">{slot ?? '—'}</span>
      <p className="text-[11px] font-bold" style={{ color: 'var(--ink-soft)' }}>
        sıraya koydu
      </p>
    </div>
  );
}

export function KorSiralamaReveal({ snap }: { snap: RoomSnapshot }) {
  const t = snap.korSiralama;
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const me = meOf(snap);
  const opp = oppOf(snap);
  const myIdx = me ? playerIndex(snap, me.id) : 0;
  const oppIdx = myIdx === 0 ? 1 : 0;
  const mySlot = me && t?.lastSlots ? t.lastSlots[me.id] : undefined;
  const oppSlot = opp && t?.lastSlots ? t.lastSlots[opp.id] : undefined;
  const same = mySlot !== undefined && mySlot === oppSlot;

  useEffect(() => {
    staggerIn(root.current);
    if (same) {
      haptics.accept();
      heartBurst();
      popIn(titleRef.current, 0.15);
    } else {
      wobble(titleRef.current);
    }
  }, [same]);

  if (!t) return null;

  return (
    <div ref={root} className="flex flex-col items-center gap-4 pt-2 text-center">
      <RankDots index={t.itemIndex} />
      <div data-pop className="chip chip-soft">{t.topic}</div>
      <div data-pop className="kor-reveal-item card-candy w-full">
        <p className="font-display text-[22px] leading-tight font-extrabold">{t.currentItem}</p>
      </div>

      <h2 ref={titleRef} data-pop className="font-display text-3xl font-extrabold" role="status">
        {same ? 'AYNI SIRA!' : 'Listeler ayrıştı'}
      </h2>

      <div data-pop className="flex w-full items-stretch gap-3">
        {me && <RevealCard owner={me} idx={myIdx} slot={mySlot} mine />}
        {opp && <RevealCard owner={opp} idx={oppIdx} slot={oppSlot} mine={false} />}
      </div>

      <div data-pop className="flex flex-wrap items-center justify-center gap-2">
        <span className="chip chip-p1">
          <IconHeartSolid size={14} style={{ color: 'var(--p1-dark)' }} />
          {t.exactMatches} tam eşleşme
        </span>
      </div>
      <p data-pop className="text-[13px] font-bold" style={{ color: 'var(--ink-soft)' }}>
        {t.itemIndex >= KOR_SIRALAMA_ITEMS ? 'İki tam liste açılıyor...' : 'Sıradaki sürpriz kart geliyor...'}
      </p>
    </div>
  );
}
