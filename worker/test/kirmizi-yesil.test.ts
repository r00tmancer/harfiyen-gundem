import { describe, expect, it } from 'vitest';
import {
  KIRMIZI_YESIL_ROUNDS,
  KIRMIZI_YESIL_VOTE_MS,
} from '@harfiyen/shared';
import type {
  KirmiziYesilChoice,
  KirmiziYesilReveal,
  KirmiziYesilScenario,
  ServerMsg,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';
import {
  KIRMIZI_YESIL_CATEGORIES,
  evaluateKirmiziYesilRound,
  isKirmiziYesilChoice,
  onRevealDone,
  onVote,
  onVoteDeadline,
  selectKirmiziYesilScenarios,
  startMatch,
  startVote,
  toKirmiziYesilBank,
  toKirmiziYesilSnapshot,
} from '../src/game/modes/kirmizi-yesil';
import bankJson from '../src/data/kirmizi-yesil.json';

const SCENARIOS: KirmiziYesilScenario[] = KIRMIZI_YESIL_CATEGORIES.map((category, index) => ({
  category,
  prompt: `Senaryo ${index + 1}`,
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

function stateForGame(phase: RoomState['phase'] = 'kirmizi_yesil_vote'): RoomState {
  return {
    code: 'KY1234',
    mode: 'kirmizi_yesil',
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
    kirmiziYesil: {
      scenarios: SCENARIOS.map((scenario) => ({ ...scenario })),
      roundIndex: 0,
      votes: {},
      matches: 0,
      redMatches: 0,
      dependsMatches: 0,
      greenMatches: 0,
      jointRounds: 0,
      splitRounds: 0,
      missedRounds: 0,
      history: [],
      reveal: null,
      compatibility: null,
    },
    kimDahaMuhtemel: null,
    ikiDogruBirYalan: null,
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

function revealFor(
  votes: Record<string, KirmiziYesilChoice | null> = { p1: 'green', p2: 'green' },
): KirmiziYesilReveal {
  return {
    round: 1,
    category: 'mesajlasma',
    prompt: 'Senaryo 1',
    votes,
    match: votes.p1 !== null && votes.p1 === votes.p2,
    consensus: votes.p1 !== null && votes.p1 === votes.p2 ? votes.p1 : null,
    resolution: votes.p1 === 'green' && votes.p2 === 'green' ? 'green_together' : 'split',
  };
}

describe('Kirmizi mi Yesil mi? — banka ve guvenli secim', () => {
  it('yalniz exact-key, allowlist kategorili, kisa ve benzersiz promptlari kabul eder', () => {
    const bank = toKirmiziYesilBank([
      { category: 'mesajlasma', prompt: '  Bir davranış  ' },
      { category: 'mesajlasma', prompt: 'bir davranış' },
      { category: 'bilinmeyen', prompt: 'B' },
      { category: 'para', prompt: '' },
      { category: 'para', prompt: 'x'.repeat(141) },
      { category: 'para', prompt: 'C', extra: true },
      null,
      [],
    ]);
    expect(bank).toEqual([{ category: 'mesajlasma', prompt: 'Bir davranış' }]);
  });

  it('uretim bankasinda sekiz kategorinin her biri icin tam alti guvenli kart vardir', () => {
    const bank = toKirmiziYesilBank(bankJson);
    expect(bank).toHaveLength(48);
    for (const category of KIRMIZI_YESIL_CATEGORIES) {
      expect(bank.filter((entry) => entry.category === category)).toHaveLength(6);
    }
    expect(new Set(bank.map((entry) => entry.prompt.toLocaleLowerCase('tr-TR'))).size).toBe(48);
  });

  it('her kategoriden bir kart secer, Fisher-Yates ile karistirir ve banka verisini klonlar', () => {
    const bank = toKirmiziYesilBank(bankJson);
    const selected = selectKirmiziYesilScenarios(bank, (length) => length - 1);
    expect(selected).toHaveLength(KIRMIZI_YESIL_ROUNDS);
    expect(new Set(selected.map((entry) => entry.category))).toEqual(new Set(KIRMIZI_YESIL_CATEGORIES));
    selected[0].prompt = 'Degisti';
    expect(bank.some((entry) => entry.prompt === 'Degisti')).toBe(false);
  });

  it('eksik kategoride bos doner, bozuk random indeksini reddeder', () => {
    expect(selectKirmiziYesilScenarios(SCENARIOS.slice(0, 7), () => 0)).toEqual([]);
    expect(() => selectKirmiziYesilScenarios(SCENARIOS, (length) => length)).toThrow(RangeError);
  });

  it('choice allowlisti yalniz uc literal degeri kabul eder', () => {
    expect(['red', 'depends', 'green'].every(isKirmiziYesilChoice)).toBe(true);
    expect(isKirmiziYesilChoice('maybe')).toBe(false);
    expect(isKirmiziYesilChoice(true)).toBe(false);
  });
});

describe('Kirmizi mi Yesil mi? — sonuc semantigi', () => {
  it.each([
    ['red', 'red', 'red_together', 'red'],
    ['depends', 'depends', 'depends_together', 'depends'],
    ['green', 'green', 'green_together', 'green'],
  ] as const)('iki %s oyu match ve %s sonucu verir', (first, second, resolution, consensus) => {
    expect(evaluateKirmiziYesilRound(['p1', 'p2'], { p1: first, p2: second })).toEqual({
      votes: { p1: first, p2: second },
      match: true,
      consensus,
      resolution,
      joint: true,
    });
  });

  it('farkli iki oyu split ve joint, tek oyu solo yapar', () => {
    expect(evaluateKirmiziYesilRound(['p1', 'p2'], { p1: 'red', p2: 'green' })).toMatchObject({
      match: false,
      consensus: null,
      resolution: 'split',
      joint: true,
    });
    expect(evaluateKirmiziYesilRound(['p1', 'p2'], { p1: 'depends' })).toEqual({
      votes: { p1: 'depends', p2: null },
      match: false,
      consensus: null,
      resolution: 'solo',
      joint: false,
    });
  });

  it('iki timeoutu null/null acar fakat match saymaz', () => {
    expect(evaluateKirmiziYesilRound(['p1', 'p2'], {})).toEqual({
      votes: { p1: null, p2: null },
      match: false,
      consensus: null,
      resolution: 'skipped',
      joint: false,
    });
  });
});

describe('Kirmizi mi Yesil mi? — recipient snapshot gizliligi', () => {
  it('vote fazinda yalniz alicinin oyunu ve rakibin kilit bayragini gosterir', () => {
    const state = stateForGame();
    state.kirmiziYesil!.votes = { p1: 'depends', p2: 'green' };
    const p1 = toKirmiziYesilSnapshot(state, 'p1');
    const p2 = toKirmiziYesilSnapshot(state, 'p2');
    expect(p1).toMatchObject({ myChoice: 'depends', myLocked: true, opponentLocked: true, reveal: null });
    expect(p2).toMatchObject({ myChoice: 'green', myLocked: true, opponentLocked: true, reveal: null });
    expect(p1).not.toHaveProperty('votes');
    expect(p1).not.toHaveProperty('scenarios');
    expect(p1?.compatibility).toBeNull();
    expect(toKirmiziYesilSnapshot(state, 'sahte')).toBeNull();
  });

  it('gecmis reveal reconnectte kalir ama aktif rakip oyu sizmaz ve klonlanir', () => {
    const state = stateForGame();
    const previous = revealFor();
    state.kirmiziYesil!.roundIndex = 1;
    state.kirmiziYesil!.history = [previous];
    state.kirmiziYesil!.votes = { p2: 'red' };
    const snapshot = toKirmiziYesilSnapshot(state, 'p1');
    expect(snapshot).toMatchObject({ round: 2, myChoice: null, opponentLocked: true, reveal: null });
    expect(snapshot?.history).toEqual([previous]);
    snapshot!.history[0].votes.p2 = 'red';
    expect(state.kirmiziYesil!.history[0].votes.p2).toBe('green');
  });

  it('iki oyu reveal/match_end fazinda acar, yuzdeyi yalniz match_endde projekte eder', () => {
    const state = stateForGame('kirmizi_yesil_reveal');
    const revealed = revealFor();
    state.kirmiziYesil!.votes = { p1: 'green', p2: 'green' };
    state.kirmiziYesil!.history = [revealed];
    state.kirmiziYesil!.reveal = revealed;
    state.kirmiziYesil!.compatibility = 100;
    expect(toKirmiziYesilSnapshot(state, 'p1')).toMatchObject({ reveal: revealed, compatibility: null });
    state.phase = 'match_end';
    expect(toKirmiziYesilSnapshot(state, 'p2')).toMatchObject({ reveal: revealed, compatibility: 100 });
  });
});

describe('Kirmizi mi Yesil mi? — durum makinesi ve alarm guvenligi', () => {
  it('maci sekiz kategoride kurar ve countdown sonrasi dokuz saniyelik vote acar', async () => {
    const state = stateForGame('lobby');
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.kirmiziYesil?.scenarios).toHaveLength(8);
    expect(new Set(state.kirmiziYesil?.scenarios.map((entry) => entry.category))).toEqual(
      new Set(KIRMIZI_YESIL_CATEGORIES),
    );
    const before = Date.now();
    await startVote(h.ctx, state);
    expect(state.phase).toBe('kirmizi_yesil_vote');
    expect(state.deadline).toBeGreaterThanOrEqual(before + KIRMIZI_YESIL_VOTE_MS);
  });

  it('phase, deadline, stale round, sahte oyuncu ve ilk oy kilidini uygular', async () => {
    const state = stateForGame();
    const h = harness();
    const [p1] = state.players;
    await onVote(h.ctx, state, player('p3'), 'red', 1);
    await onVote(h.ctx, state, p1, 'red', 2);
    await onVote(h.ctx, state, p1, 'maybe' as KirmiziYesilChoice, 1);
    expect(state.kirmiziYesil?.votes).toEqual({});
    await onVote(h.ctx, state, p1, 'depends', 1);
    await onVote(h.ctx, state, p1, 'green', 1);
    expect(state.kirmiziYesil?.votes).toEqual({ p1: 'depends' });
    const late = stateForGame();
    late.deadline = Date.now() - 1;
    await onVote(h.ctx, late, late.players[0], 'red', 1);
    expect(late.kirmiziYesil?.votes).toEqual({});
  });

  it('iki oy gelince sonucu ve ortak skoru yalniz bir kez yazar', async () => {
    const state = stateForGame();
    const h = harness();
    await onVote(h.ctx, state, state.players[0], 'depends', 1);
    await onVote(h.ctx, state, state.players[1], 'depends', 1);
    expect(state.phase).toBe('kirmizi_yesil_reveal');
    expect(state.kirmiziYesil).toMatchObject({
      matches: 1,
      dependsMatches: 1,
      jointRounds: 1,
      splitRounds: 0,
      missedRounds: 0,
    });
    expect(state.players.map((entry) => entry.score)).toEqual([1, 1]);
    const saves = h.saves;
    await onVoteDeadline(h.ctx, state);
    expect(state.kirmiziYesil?.history).toHaveLength(1);
    expect(h.saves).toBe(saves);
  });

  it('split, solo ve skipped sonucunu timeout semantigiyle sayar', async () => {
    const split = stateForGame();
    const h = harness();
    await onVote(h.ctx, split, split.players[0], 'red', 1);
    await onVote(h.ctx, split, split.players[1], 'green', 1);
    expect(split.kirmiziYesil).toMatchObject({ jointRounds: 1, splitRounds: 1, missedRounds: 0 });
    expect(split.kirmiziYesil?.reveal?.resolution).toBe('split');

    const solo = stateForGame();
    solo.deadline = Date.now() - 1;
    solo.kirmiziYesil!.votes = { p1: 'green' };
    await onVoteDeadline(h.ctx, solo);
    expect(solo.kirmiziYesil).toMatchObject({ jointRounds: 0, splitRounds: 0, missedRounds: 1 });
    expect(solo.kirmiziYesil?.reveal).toMatchObject({
      votes: { p1: 'green', p2: null },
      resolution: 'solo',
    });

    const skipped = stateForGame();
    skipped.deadline = Date.now() - 1;
    await onVoteDeadline(h.ctx, skipped);
    expect(skipped.kirmiziYesil?.reveal).toMatchObject({
      votes: { p1: null, p2: null },
      match: false,
      resolution: 'skipped',
    });
  });

  it('erken/retry alarmini vote ve reveal deadlineina yeniden kurar, yeni turu erken bitirmez', async () => {
    const state = stateForGame();
    const h = harness();
    state.alarmPurpose = null;
    const voteDeadline = state.deadline!;
    await onVoteDeadline(h.ctx, state);
    expect(state.phase).toBe('kirmizi_yesil_vote');
    expect(state.alarmPurpose).toBe('phase');
    expect(h.alarms.at(-1)).toBe(voteDeadline);

    state.deadline = Date.now() - 1;
    await onVoteDeadline(h.ctx, state);
    const revealDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('kirmizi_yesil_reveal');
    expect(h.alarms.at(-1)).toBe(revealDeadline);

    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('kirmizi_yesil_vote');
    expect(state.kirmiziYesil?.roundIndex).toBe(1);
    const nextVoteDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onVoteDeadline(h.ctx, state);
    expect(state.phase).toBe('kirmizi_yesil_vote');
    expect(state.kirmiziYesil?.votes).toEqual({});
    expect(h.alarms.at(-1)).toBe(nextVoteDeadline);
  });

  it('sekiz turu bitirir; yuzdeyi yalniz iki oyun oldugu turlardan hesaplar ve winner dayatmaz', async () => {
    const state = stateForGame();
    const h = harness();
    const patterns: Array<[KirmiziYesilChoice | null, KirmiziYesilChoice | null]> = [
      ['red', 'red'],
      ['depends', 'depends'],
      ['green', 'green'],
      ['red', 'green'],
      ['depends', 'red'],
      ['green', 'green'],
      ['red', null],
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
    expect(state.kirmiziYesil).toMatchObject({
      matches: 4,
      redMatches: 1,
      dependsMatches: 1,
      greenMatches: 2,
      jointRounds: 6,
      splitRounds: 2,
      missedRounds: 2,
      compatibility: 67,
    });
    expect(state.kirmiziYesil?.history).toHaveLength(8);
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

  it('hic ortak oy yoksa compatibility null kalir; startMatch rovansta tum ozetleri temizler', async () => {
    const state = stateForGame();
    const h = harness();
    for (let index = 0; index < KIRMIZI_YESIL_ROUNDS; index += 1) {
      state.deadline = Date.now() - 1;
      await onVoteDeadline(h.ctx, state);
      state.deadline = Date.now() - 1;
      await onRevealDone(h.ctx, state);
    }
    expect(state.kirmiziYesil).toMatchObject({ jointRounds: 0, missedRounds: 8, compatibility: null });
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.kirmiziYesil).toMatchObject({
      roundIndex: 0,
      votes: {},
      matches: 0,
      redMatches: 0,
      dependsMatches: 0,
      greenMatches: 0,
      jointRounds: 0,
      splitRounds: 0,
      missedRounds: 0,
      history: [],
      reveal: null,
      compatibility: null,
    });
  });
});
