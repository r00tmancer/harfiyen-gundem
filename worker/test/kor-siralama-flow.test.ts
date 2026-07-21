import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@harfiyen/shared';
import {
  onJoker,
  onPickDeadline,
  onRank,
  onRevealDone,
  startItem,
  startMatch,
} from '../src/game/modes/kor-siralama';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';

const PACK = {
  topic: 'Gece atistirmasi',
  prompt: 'En iyiden en kotuye sirala',
  items: ['A', 'B', 'C', 'D', 'E'],
};

function player(id: string, nick: string): PlayerState {
  return {
    id,
    reconnectHash: (id === 'p1' ? '1' : '2').repeat(64),
    nick,
    avatar: 0,
    score: 0,
    connected: true,
    ready: true,
    pickedLetter: null,
    rematch: false,
    lastSubmitAt: 0,
    lastReactAt: 0,
  };
}

function stateForRank(): RoomState {
  return {
    code: 'KOR123',
    mode: 'kor_siralama',
    creator: 'p1',
    phase: 'kor_sirala',
    round: 1,
    turn: null,
    players: [player('p1', 'Ay'), player('p2', 'Yildiz')],
    letters: null,
    pending: null,
    deadline: Date.now() + 60_000,
    usedWords: [],
    winner: null,
    jokers: { p1: 1, p2: 1 },
    frozenUntil: { p1: 0, p2: 0 },
    alarmPurpose: 'phase',
    sayi: null,
    zincir: null,
    uzun: null,
    bom: null,
    telepati: null,
    korSiralama: {
      pack: { ...PACK, items: [...PACK.items] },
      itemIndex: 0,
      placements: {
        p1: [null, null, null, null, null],
        p2: [null, null, null, null, null],
      },
      answers: {},
      lastSlots: null,
      exactMatches: 0,
      compatibility: null,
    },
    beniYakala: null,
  };
}

function stateForLobby(): RoomState {
  const state = stateForRank();
  state.phase = 'lobby';
  state.korSiralama = null;
  return state;
}

interface CtxHarness {
  ctx: RoomCtx;
  messages: ServerMsg[];
  alarms: number[];
  saves: number;
  snapshots: number;
  alarmDeletes: number;
}

function makeCtx(): CtxHarness {
  const harness: CtxHarness = {
    messages: [],
    alarms: [],
    saves: 0,
    snapshots: 0,
    alarmDeletes: 0,
    ctx: undefined as unknown as RoomCtx,
  };
  harness.ctx = {
    broadcast: (msg) => {
      harness.messages.push(msg);
    },
    sendTo: () => undefined,
    sendToOthers: () => undefined,
    broadcastSnapshot: () => {
      harness.snapshots += 1;
    },
    save: async () => {
      harness.saves += 1;
    },
    setAlarm: async (at) => {
      harness.alarms.push(at);
    },
    deleteAlarm: async () => {
      harness.alarmDeletes += 1;
    },
    scoresOf: (state) => Object.fromEntries(state.players.map((p) => [p.id, p.score])),
    dict: () => new Set<string>(),
    pairs: () => ({}),
    startCounts: () => new Map<string, number>(),
    fetchMeaning: () => undefined,
  };
  return harness;
}

async function rank(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  slot: number,
): Promise<void> {
  const k = state.korSiralama!;
  await onRank(ctx, state, player, slot, k.itemIndex + 1, k.pack.items[k.itemIndex]);
}

async function pass(ctx: RoomCtx, state: RoomState, player: PlayerState): Promise<void> {
  const k = state.korSiralama!;
  await onJoker(ctx, state, player, k.itemIndex + 1, k.pack.items[k.itemIndex]);
}

describe('Kor Siralama — sunucu akis durum makinesi', () => {
  it('maci kurar; iki oyuncu siralayinca cevaplari reveal fazinda acar', async () => {
    const state = stateForLobby();
    const h = makeCtx();

    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.korSiralama?.placements.p1).toEqual([null, null, null, null, null]);

    await startItem(h.ctx, state);
    const [p1, p2] = state.players;
    await rank(h.ctx, state, p1, 2);
    expect(state.phase).toBe('kor_sirala');
    expect(state.korSiralama?.answers).toEqual({ p1: 2 });

    await rank(h.ctx, state, p2, 4);
    expect(state.phase).toBe('kor_reveal');
    expect(state.korSiralama?.lastSlots).toEqual({ p1: 2, p2: 4 });
    expect(state.korSiralama?.placements.p1[1]).toBe(state.korSiralama?.pack.items[0]);
    expect(state.korSiralama?.placements.p2[3]).toBe(state.korSiralama?.pack.items[0]);
  });

  it('ayni oyuncunun ikinci cevabini ve dolu yuvaya yeni kart koymayi reddeder', async () => {
    const state = stateForRank();
    const h = makeCtx();
    const [p1, p2] = state.players;

    await rank(h.ctx, state, p1, 1);
    const savesAfterFirstAnswer = h.saves;
    await rank(h.ctx, state, p1, 2);
    expect(state.korSiralama?.answers).toEqual({ p1: 1 });
    expect(state.korSiralama?.placements.p1).toEqual(['A', null, null, null, null]);
    expect(h.saves).toBe(savesAfterFirstAnswer);

    await rank(h.ctx, state, p2, 5);
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('kor_sirala');
    expect(state.korSiralama?.itemIndex).toBe(1);

    const savesBeforeOccupiedSlot = h.saves;
    await rank(h.ctx, state, p1, 1);
    expect(state.korSiralama?.answers).toEqual({});
    expect(state.korSiralama?.placements.p1).toEqual(['A', null, null, null, null]);
    expect(h.saves).toBe(savesBeforeOccupiedSlot);
  });

  it('sure dolunca cevaplamayan oyuncunun kartini ilk bos yuvaya otomatik kilitler', async () => {
    const state = stateForRank();
    const h = makeCtx();
    const [p1] = state.players;
    const k = state.korSiralama!;
    k.itemIndex = 1;
    k.placements.p1[1] = 'A';
    k.placements.p2[0] = 'A';
    state.round = 2;

    await rank(h.ctx, state, p1, 4);
    await onPickDeadline(h.ctx, state);

    expect(state.phase).toBe('kor_reveal');
    expect(k.placements.p1).toEqual([null, 'A', null, 'B', null]);
    expect(k.placements.p2).toEqual(['A', 'B', null, null, null]);
    expect(k.lastSlots).toEqual({ p1: 4, p2: 2 });
  });

  it('pas jokerini yalniz kimse secmeden kullanir ve mevcut karti sona yollar', async () => {
    const state = stateForRank();
    const h = makeCtx();
    const [p1, p2] = state.players;

    await pass(h.ctx, state, p1);
    expect(state.korSiralama?.pack.items).toEqual(['B', 'C', 'D', 'E', 'A']);
    expect(state.jokers.p1).toBe(0);
    expect(h.messages).toContainEqual({ t: 'joker_used', by: 'p1', kind: 'pas' });

    await rank(h.ctx, state, p1, 1);
    const itemsAfterAnswer = [...state.korSiralama!.pack.items];
    const savesAfterAnswer = h.saves;
    await pass(h.ctx, state, p2);
    expect(state.korSiralama?.pack.items).toEqual(itemsAfterAnswer);
    expect(state.jokers.p2).toBe(1);
    expect(h.saves).toBe(savesAfterAnswer);
  });

  it('son kart reveal edildikten sonra maci bitirip 0-100 uyum sonucunu hesaplar', async () => {
    const state = stateForRank();
    const h = makeCtx();
    const [p1, p2] = state.players;
    const p2Slots = [2, 1, 3, 5, 4];

    for (let item = 0; item < PACK.items.length; item += 1) {
      expect(state.phase).toBe('kor_sirala');
      await rank(h.ctx, state, p1, item + 1);
      await rank(h.ctx, state, p2, p2Slots[item]);
      expect(state.phase).toBe('kor_reveal');

      if (item < PACK.items.length - 1) {
        await onRevealDone(h.ctx, state);
      }
    }

    expect(state.phase).toBe('kor_reveal');
    expect(state.korSiralama?.compatibility).toBeNull();
    await onRevealDone(h.ctx, state);

    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.alarmPurpose).toBeNull();
    expect(state.korSiralama?.placements).toEqual({
      p1: ['A', 'B', 'C', 'D', 'E'],
      p2: ['B', 'A', 'C', 'E', 'D'],
    });
    expect(state.korSiralama?.compatibility).toBe(67);
    expect(state.korSiralama!.compatibility).toBeGreaterThanOrEqual(0);
    expect(state.korSiralama!.compatibility).toBeLessThanOrEqual(100);
    expect(state.korSiralama?.exactMatches).toBe(1);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 1, p2: 1 },
      word: null,
    });
  });

  it('stale kart ve deadline sonrasi rank/pas mesajlarini reddeder', async () => {
    const state = stateForRank();
    const h = makeCtx();
    const [p1] = state.players;

    await onJoker(h.ctx, state, p1, 1, 'yanlis-kart');
    expect(state.korSiralama?.pack.items[0]).toBe('A');
    expect(state.jokers.p1).toBe(1);

    await onRank(h.ctx, state, p1, 3, 1, 'yanlis-kart');
    expect(state.korSiralama?.answers).toEqual({});

    state.deadline = Date.now() - 1;
    await onRank(h.ctx, state, p1, 3, 1, 'A');
    await onJoker(h.ctx, state, p1, 1, 'A');
    expect(state.korSiralama?.answers).toEqual({});
    expect(state.korSiralama?.pack.items[0]).toBe('A');
    expect(state.jokers.p1).toBe(1);
  });
});
