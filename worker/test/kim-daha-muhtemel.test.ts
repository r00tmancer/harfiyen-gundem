import { describe, expect, it } from 'vitest';
import {
  KIM_DAHA_MUHTEMEL_ROUNDS,
  KIM_DAHA_MUHTEMEL_VOTE_MS,
} from '@harfiyen/shared';
import type {
  KimDahaMuhtemelChoice,
  KimDahaMuhtemelPrompt,
  KimDahaMuhtemelReveal,
  ServerMsg,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';
import {
  KIM_DAHA_MUHTEMEL_CATEGORIES,
  evaluateKimDahaMuhtemelRound,
  isKimDahaMuhtemelChoice,
  onRevealDone,
  onVote,
  onVoteDeadline,
  resolveKimDahaMuhtemelTarget,
  selectKimDahaMuhtemelPrompts,
  startMatch,
  startVote,
  toKimDahaMuhtemelBank,
  toKimDahaMuhtemelSnapshot,
} from '../src/game/modes/kim-daha-muhtemel';
import bankJson from '../src/data/kim-daha-muhtemel.json';

const PROMPTS: KimDahaMuhtemelPrompt[] = KIM_DAHA_MUHTEMEL_CATEGORIES.map((category, index) => ({
  category,
  prompt: `Kim ${index + 1}?`,
}));

function player(id: string): PlayerState {
  return {
    id,
    reconnectHash: (id === 'p1' ? '1' : '2').repeat(64),
    nick: id,
    avatar: id === 'p1' ? 0 : 1,
    score: 0,
    connected: true,
    ready: true,
    pickedLetter: null,
    rematch: false,
    lastSubmitAt: 0,
    lastReactAt: 0,
  };
}

function stateForGame(phase: RoomState['phase'] = 'kim_daha_muhtemel_vote'): RoomState {
  return {
    code: 'KDM123',
    mode: 'kim_daha_muhtemel',
    creator: 'p1',
    phase,
    round: 1,
    turn: null,
    players: [player('p1'), player('p2')],
    letters: null,
    pending: null,
    deadline: Date.now() + 60_000,
    usedWords: [],
    winner: null,
    jokers: { p1: 1, p2: 1 },
    frozenUntil: {},
    alarmPurpose: 'phase',
    sayi: null,
    zincir: null,
    uzun: null,
    bom: null,
    telepati: null,
    korSiralama: null,
    beniYakala: null,
    randevuRuleti: null,
    emojiSifre: null,
    kirmiziYesil: null,
    kimDahaMuhtemel: {
      prompts: PROMPTS.map((prompt) => ({ ...prompt })),
      roundIndex: 0,
      votes: {},
      agreements: 0,
      samePersonAgreements: 0,
      bothAgreements: 0,
      jointRounds: 0,
      splitRounds: 0,
      missedRounds: 0,
      spotlights: { p1: 0, p2: 0 },
      history: [],
      reveal: null,
      agreementPct: null,
    },
  };
}

interface Harness {
  ctx: RoomCtx;
  alarms: number[];
  readonly saves: number;
  readonly snapshots: number;
  readonly alarmDeletes: number;
  messages: ServerMsg[];
}

function harness(): Harness {
  const mutable = {
    saves: 0,
    snapshots: 0,
    alarmDeletes: 0,
    alarms: [] as number[],
    messages: [] as ServerMsg[],
  };
  const ctx: RoomCtx = {
    broadcast(message) {
      mutable.messages.push(message);
    },
    sendTo() {},
    sendToOthers() {},
    broadcastSnapshot() {
      mutable.snapshots += 1;
    },
    async save() {
      mutable.saves += 1;
    },
    async setAlarm(at) {
      mutable.alarms.push(at);
    },
    async deleteAlarm() {
      mutable.alarmDeletes += 1;
    },
    scoresOf(state) {
      return Object.fromEntries(state.players.map((candidate) => [candidate.id, candidate.score]));
    },
    dict: () => new Set<string>(),
    pairs: () => ({}),
    startCounts: () => new Map<string, number>(),
    fetchMeaning() {},
  };
  return {
    ctx,
    alarms: mutable.alarms,
    messages: mutable.messages,
    get saves() {
      return mutable.saves;
    },
    get snapshots() {
      return mutable.snapshots;
    },
    get alarmDeletes() {
      return mutable.alarmDeletes;
    },
  };
}

function revealFor(): KimDahaMuhtemelReveal {
  return {
    round: 1,
    category: 'ilk_hamle',
    prompt: 'Kim 1?',
    targets: {
      p1: { kind: 'player', playerId: 'p1' },
      p2: { kind: 'player', playerId: 'p1' },
    },
    agreement: true,
    consensus: { kind: 'player', playerId: 'p1' },
    resolution: 'same_player',
  };
}

describe('Kim Daha Muhtemel? — banka ve Web Crypto secim sinirlari', () => {
  it('yalniz exact-key, allowlist kategorili, kisa ve benzersiz promptlari kabul eder', () => {
    expect(toKimDahaMuhtemelBank([
      { category: 'ilk_hamle', prompt: '  Bir soru?  ' },
      { category: 'ilk_hamle', prompt: 'bir soru?' },
      { category: 'bilinmeyen', prompt: 'B' },
      { category: 'lezzet', prompt: '' },
      { category: 'lezzet', prompt: 'x'.repeat(121) },
      { category: 'lezzet', prompt: 'C', extra: true },
      null,
      [],
    ])).toEqual([{ category: 'ilk_hamle', prompt: 'Bir soru?' }]);
  });

  it('uretim bankasinda sekiz kategorinin her biri icin tam alti guvenli prompt vardir', () => {
    const bank = toKimDahaMuhtemelBank(bankJson);
    expect(bank).toHaveLength(48);
    for (const category of KIM_DAHA_MUHTEMEL_CATEGORIES) {
      expect(bank.filter((entry) => entry.category === category)).toHaveLength(6);
    }
    expect(new Set(bank.map((entry) => entry.prompt.toLocaleLowerCase('tr-TR'))).size).toBe(48);
  });

  it('her kategoriden bir prompt secer, Fisher-Yates ile karistirir ve banka verisini klonlar', () => {
    const bank = toKimDahaMuhtemelBank(bankJson);
    const selected = selectKimDahaMuhtemelPrompts(bank, (length) => length - 1);
    expect(selected).toHaveLength(KIM_DAHA_MUHTEMEL_ROUNDS);
    expect(new Set(selected.map((entry) => entry.category))).toEqual(
      new Set(KIM_DAHA_MUHTEMEL_CATEGORIES),
    );
    selected[0].prompt = 'Degisti';
    expect(bank.some((entry) => entry.prompt === 'Degisti')).toBe(false);
  });

  it('eksik kategoride bos doner ve bozuk random indeksini reddeder', () => {
    expect(selectKimDahaMuhtemelPrompts(PROMPTS.slice(0, 7), () => 0)).toEqual([]);
    expect(() => selectKimDahaMuhtemelPrompts(PROMPTS, (length) => length)).toThrow(RangeError);
  });

  it('choice allowlisti yalniz self, partner ve both kabul eder', () => {
    expect(['self', 'partner', 'both'].every(isKimDahaMuhtemelChoice)).toBe(true);
    expect(isKimDahaMuhtemelChoice('p1')).toBe(false);
    expect(isKimDahaMuhtemelChoice(true)).toBe(false);
  });
});

describe('Kim Daha Muhtemel? — goreli oylarin mutlak hedef semantigi', () => {
  it('self ve partner secimlerini oy veren oyuncuya gore mutlak hedefe cevirir', () => {
    expect(resolveKimDahaMuhtemelTarget('p1', 'p2', 'self')).toEqual({ kind: 'player', playerId: 'p1' });
    expect(resolveKimDahaMuhtemelTarget('p1', 'p2', 'partner')).toEqual({ kind: 'player', playerId: 'p2' });
    expect(resolveKimDahaMuhtemelTarget('p1', 'p2', 'both')).toEqual({ kind: 'both' });
  });

  it('p1 self + p2 partner secimini p1 uzerinde uzlasi sayar', () => {
    expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], { p1: 'self', p2: 'partner' })).toEqual({
      targets: {
        p1: { kind: 'player', playerId: 'p1' },
        p2: { kind: 'player', playerId: 'p1' },
      },
      agreement: true,
      consensus: { kind: 'player', playerId: 'p1' },
      resolution: 'same_player',
      joint: true,
    });
  });

  it('p1 partner + p2 self secimini p2 uzerinde uzlasi sayar', () => {
    expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], { p1: 'partner', p2: 'self' })).toMatchObject({
      agreement: true,
      consensus: { kind: 'player', playerId: 'p2' },
      resolution: 'same_player',
      joint: true,
    });
  });

  it('iki self ve iki partner ham oyu esit gorunse de farkli hedefler oldugu icin split yapar', () => {
    for (const choice of ['self', 'partner'] as const) {
      expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], { p1: choice, p2: choice })).toMatchObject({
        agreement: false,
        consensus: null,
        resolution: 'split',
        joint: true,
      });
    }
  });

  it('iki both oyunu uzlasi sayar', () => {
    expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], { p1: 'both', p2: 'both' })).toEqual({
      targets: { p1: { kind: 'both' }, p2: { kind: 'both' } },
      agreement: true,
      consensus: { kind: 'both' },
      resolution: 'both_together',
      joint: true,
    });
  });

  it('timeoutlari fallback uretmeden null hedef, solo veya skipped yapar', () => {
    expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], { p1: 'partner' })).toEqual({
      targets: { p1: { kind: 'player', playerId: 'p2' }, p2: null },
      agreement: false,
      consensus: null,
      resolution: 'solo',
      joint: false,
    });
    expect(evaluateKimDahaMuhtemelRound(['p1', 'p2'], {})).toEqual({
      targets: { p1: null, p2: null },
      agreement: false,
      consensus: null,
      resolution: 'skipped',
      joint: false,
    });
  });
});

describe('Kim Daha Muhtemel? — recipient snapshot gizliligi', () => {
  it('vote fazinda yalniz alicinin oyunu ve rakibin kilit bayragini gosterir', () => {
    const state = stateForGame();
    state.kimDahaMuhtemel!.votes = { p1: 'self', p2: 'partner' };
    const p1 = toKimDahaMuhtemelSnapshot(state, 'p1');
    const p2 = toKimDahaMuhtemelSnapshot(state, 'p2');
    expect(p1).toMatchObject({ myChoice: 'self', myLocked: true, opponentLocked: true, reveal: null });
    expect(p2).toMatchObject({ myChoice: 'partner', myLocked: true, opponentLocked: true, reveal: null });
    expect(p1).not.toHaveProperty('votes');
    expect(p1).not.toHaveProperty('prompts');
    expect(p1?.agreementPct).toBeNull();
    expect(toKimDahaMuhtemelSnapshot(state, 'sahte')).toBeNull();
  });

  it('gecmis reveal reconnectte kalir, aktif rakip oyu sizmaz ve tum nested veriler klonlanir', () => {
    const state = stateForGame();
    const previous = revealFor();
    state.kimDahaMuhtemel!.roundIndex = 1;
    state.kimDahaMuhtemel!.history = [previous];
    state.kimDahaMuhtemel!.votes = { p2: 'self' };
    state.kimDahaMuhtemel!.spotlights = { p1: 1, p2: 0 };
    const snapshot = toKimDahaMuhtemelSnapshot(state, 'p1');
    expect(snapshot).toMatchObject({ round: 2, myChoice: null, opponentLocked: true, reveal: null });
    expect(snapshot?.history).toEqual([previous]);
    const target = snapshot!.history[0].targets.p1;
    if (target?.kind === 'player') target.playerId = 'degisti';
    const consensus = snapshot!.history[0].consensus;
    if (consensus?.kind === 'player') consensus.playerId = 'degisti';
    snapshot!.spotlights.p1 = 99;
    expect(state.kimDahaMuhtemel!.history[0].targets.p1).toEqual({ kind: 'player', playerId: 'p1' });
    expect(state.kimDahaMuhtemel!.history[0].consensus).toEqual({ kind: 'player', playerId: 'p1' });
    expect(state.kimDahaMuhtemel!.spotlights.p1).toBe(1);
  });

  it('reveal hedeflerini iki tarafa acar, yuzdeyi yalniz match_endde projekte eder', () => {
    const state = stateForGame('kim_daha_muhtemel_reveal');
    const revealed = revealFor();
    state.kimDahaMuhtemel!.history = [revealed];
    state.kimDahaMuhtemel!.reveal = revealed;
    state.kimDahaMuhtemel!.agreementPct = 100;
    expect(toKimDahaMuhtemelSnapshot(state, 'p1')).toMatchObject({ reveal: revealed, agreementPct: null });
    state.phase = 'match_end';
    expect(toKimDahaMuhtemelSnapshot(state, 'p2')).toMatchObject({ reveal: revealed, agreementPct: 100 });
  });
});

describe('Kim Daha Muhtemel? — durum makinesi ve alarm guvenligi', () => {
  it('maci sekiz kategoride kurar ve countdown sonrasi dokuz saniyelik vote acar', async () => {
    const state = stateForGame('lobby');
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.kimDahaMuhtemel?.prompts).toHaveLength(8);
    expect(new Set(state.kimDahaMuhtemel?.prompts.map((entry) => entry.category))).toEqual(
      new Set(KIM_DAHA_MUHTEMEL_CATEGORIES),
    );
    const before = Date.now();
    await startVote(h.ctx, state);
    expect(state.phase).toBe('kim_daha_muhtemel_vote');
    expect(state.deadline).toBeGreaterThanOrEqual(before + KIM_DAHA_MUHTEMEL_VOTE_MS);
  });

  it('phase, deadline, stale round, sahte oyuncu ve ilk oy kilidini uygular', async () => {
    const state = stateForGame();
    const h = harness();
    const [p1] = state.players;
    await onVote(h.ctx, state, player('p3'), 'self', 1);
    await onVote(h.ctx, state, p1, 'self', 2);
    await onVote(h.ctx, state, p1, 'player' as KimDahaMuhtemelChoice, 1);
    expect(state.kimDahaMuhtemel?.votes).toEqual({});
    await onVote(h.ctx, state, p1, 'partner', 1);
    await onVote(h.ctx, state, p1, 'both', 1);
    expect(state.kimDahaMuhtemel?.votes).toEqual({ p1: 'partner' });
    const late = stateForGame();
    late.deadline = Date.now() - 1;
    await onVote(h.ctx, late, late.players[0], 'self', 1);
    expect(late.kimDahaMuhtemel?.votes).toEqual({});
  });

  it('same_player uzlasisini, ortak skoru ve spotlighti yalniz bir kez yazar', async () => {
    const state = stateForGame();
    const h = harness();
    await onVote(h.ctx, state, state.players[0], 'self', 1);
    await onVote(h.ctx, state, state.players[1], 'partner', 1);
    expect(state.phase).toBe('kim_daha_muhtemel_reveal');
    expect(state.kimDahaMuhtemel).toMatchObject({
      agreements: 1,
      samePersonAgreements: 1,
      bothAgreements: 0,
      jointRounds: 1,
      splitRounds: 0,
      missedRounds: 0,
      spotlights: { p1: 1, p2: 0 },
    });
    expect(state.players.map((entry) => entry.score)).toEqual([1, 1]);
    const saves = h.saves;
    await onVoteDeadline(h.ctx, state);
    expect(state.kimDahaMuhtemel?.history).toHaveLength(1);
    expect(h.saves).toBe(saves);
  });

  it('both uzlasisi spotlight eklemez; split, solo ve skipped metriklerini ayirir', async () => {
    const both = stateForGame();
    const h = harness();
    await onVote(h.ctx, both, both.players[0], 'both', 1);
    await onVote(h.ctx, both, both.players[1], 'both', 1);
    expect(both.kimDahaMuhtemel).toMatchObject({
      agreements: 1,
      samePersonAgreements: 0,
      bothAgreements: 1,
      spotlights: { p1: 0, p2: 0 },
    });

    const split = stateForGame();
    await onVote(h.ctx, split, split.players[0], 'self', 1);
    await onVote(h.ctx, split, split.players[1], 'self', 1);
    expect(split.kimDahaMuhtemel).toMatchObject({ jointRounds: 1, splitRounds: 1, missedRounds: 0 });

    const solo = stateForGame();
    solo.deadline = Date.now() - 1;
    solo.kimDahaMuhtemel!.votes = { p1: 'partner' };
    await onVoteDeadline(h.ctx, solo);
    expect(solo.kimDahaMuhtemel).toMatchObject({ jointRounds: 0, splitRounds: 0, missedRounds: 1 });
    expect(solo.kimDahaMuhtemel?.reveal).toMatchObject({
      targets: { p1: { kind: 'player', playerId: 'p2' }, p2: null },
      resolution: 'solo',
    });

    const skipped = stateForGame();
    skipped.deadline = Date.now() - 1;
    await onVoteDeadline(h.ctx, skipped);
    expect(skipped.kimDahaMuhtemel?.reveal).toMatchObject({
      targets: { p1: null, p2: null },
      agreement: false,
      resolution: 'skipped',
    });
  });

  it('erken/retry alarmini vote ve reveal deadlineina yeniden kurar, yeni turu erken bitirmez', async () => {
    const state = stateForGame();
    const h = harness();
    state.alarmPurpose = null;
    const voteDeadline = state.deadline!;
    await onVoteDeadline(h.ctx, state);
    expect(state.phase).toBe('kim_daha_muhtemel_vote');
    expect(state.alarmPurpose).toBe('phase');
    expect(h.alarms.at(-1)).toBe(voteDeadline);

    state.deadline = Date.now() - 1;
    await onVoteDeadline(h.ctx, state);
    const revealDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('kim_daha_muhtemel_reveal');
    expect(h.alarms.at(-1)).toBe(revealDeadline);

    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('kim_daha_muhtemel_vote');
    expect(state.kimDahaMuhtemel?.roundIndex).toBe(1);
    const nextVoteDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onVoteDeadline(h.ctx, state);
    expect(state.phase).toBe('kim_daha_muhtemel_vote');
    expect(state.kimDahaMuhtemel?.votes).toEqual({});
    expect(h.alarms.at(-1)).toBe(nextVoteDeadline);
  });

  it('sekiz turu tamamlar ve final metriklerini yalniz joint turlardan hesaplar', async () => {
    const state = stateForGame();
    const h = harness();
    const patterns: Array<[KimDahaMuhtemelChoice | null, KimDahaMuhtemelChoice | null]> = [
      ['self', 'partner'],
      ['partner', 'self'],
      ['both', 'both'],
      ['self', 'self'],
      ['partner', 'partner'],
      ['self', 'partner'],
      ['self', null],
      [null, null],
    ];
    for (let index = 0; index < patterns.length; index += 1) {
      const [first, second] = patterns[index];
      if (first) await onVote(h.ctx, state, state.players[0], first, index + 1);
      if (second) await onVote(h.ctx, state, state.players[1], second, index + 1);
      if (!first || !second) {
        state.deadline = Date.now() - 1;
        await onVoteDeadline(h.ctx, state);
      }
      state.deadline = Date.now() - 1;
      await onRevealDone(h.ctx, state);
    }
    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.alarmPurpose).toBeNull();
    expect(state.kimDahaMuhtemel).toMatchObject({
      agreements: 4,
      samePersonAgreements: 3,
      bothAgreements: 1,
      jointRounds: 6,
      splitRounds: 2,
      missedRounds: 2,
      spotlights: { p1: 2, p2: 1 },
      agreementPct: 67,
    });
    expect(state.kimDahaMuhtemel?.history).toHaveLength(8);
    expect(state.players.map((entry) => entry.score)).toEqual([4, 4]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 4, p2: 4 },
      word: null,
    });
    const saves = h.saves;
    await onRevealDone(h.ctx, state);
    expect(h.saves).toBe(saves);
  });

  it('hic joint tur yoksa agreementPct null kalir; startMatch rovansta tum ozetleri temizler', async () => {
    const state = stateForGame();
    const h = harness();
    for (let index = 0; index < KIM_DAHA_MUHTEMEL_ROUNDS; index += 1) {
      state.deadline = Date.now() - 1;
      await onVoteDeadline(h.ctx, state);
      state.deadline = Date.now() - 1;
      await onRevealDone(h.ctx, state);
    }
    expect(state.kimDahaMuhtemel).toMatchObject({ jointRounds: 0, missedRounds: 8, agreementPct: null });
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.kimDahaMuhtemel).toMatchObject({
      roundIndex: 0,
      votes: {},
      agreements: 0,
      samePersonAgreements: 0,
      bothAgreements: 0,
      jointRounds: 0,
      splitRounds: 0,
      missedRounds: 0,
      spotlights: { p1: 0, p2: 0 },
      history: [],
      reveal: null,
      agreementPct: null,
    });
  });
});
