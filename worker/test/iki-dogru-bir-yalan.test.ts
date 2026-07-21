import { describe, expect, it } from 'vitest';
import {
  IKI_DOGRU_BIR_YALAN_GUESS_MS,
  IKI_DOGRU_BIR_YALAN_SETUP_MS,
} from '@harfiyen/shared';
import type {
  IkiDogruBirYalanReveal,
  IkiDogruBirYalanStatements,
  ServerMsg,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';
import {
  onGuess,
  onGuessDeadline,
  onPack,
  onRevealDone,
  onSetupDeadline,
  selectIkiDogruBirYalanOrder,
  startMatch,
  startSetup,
  toIkiDogruBirYalanSnapshot,
} from '../src/game/modes/iki-dogru-bir-yalan';

const P1_STATEMENTS: IkiDogruBirYalanStatements = [
  'Bir kez paraşütle atladım',
  'Hiç kahve içmedim',
  'Üç dil konuşuyorum',
];
const P2_STATEMENTS: IkiDogruBirYalanStatements = [
  'Bir maraton bitirdim',
  'Keman çalabiliyorum',
  'Kutup ışıklarını gördüm',
];

function player(id: string): PlayerState {
  return {
    id,
    reconnectHash: (id === 'p1' ? '1' : id === 'p2' ? '2' : '3').repeat(64),
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

function stateForGame(phase: RoomState['phase'] = 'iki_dogru_bir_yalan_setup'): RoomState {
  return {
    code: 'IDBY12',
    mode: 'iki_dogru_bir_yalan',
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
    kimDahaMuhtemel: null,
    ikiDogruBirYalan: {
      packs: {},
      order: [],
      roundIndex: 0,
      guess: null,
      caughtCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      attemptedCount: 0,
      availableRounds: 0,
      catches: { p1: 0, p2: 0 },
      catchRate: null,
      history: [],
      reveal: null,
    },
    ayniAndaSoyle: null,
  };
}

function guessState(roundIndex = 0): RoomState {
  const state = stateForGame('iki_dogru_bir_yalan_guess');
  state.ikiDogruBirYalan!.packs = {
    p1: { statements: [...P1_STATEMENTS], lieIndex: 1 },
    p2: { statements: [...P2_STATEMENTS], lieIndex: 2 },
  };
  state.ikiDogruBirYalan!.order = ['p1', 'p2'];
  state.ikiDogruBirYalan!.availableRounds = 2;
  state.ikiDogruBirYalan!.roundIndex = roundIndex;
  state.round = roundIndex + 1;
  state.turn = roundIndex === 0 ? 'p2' : 'p1';
  return state;
}

interface Harness {
  ctx: RoomCtx;
  alarms: number[];
  events: string[];
  messages: ServerMsg[];
  readonly saves: number;
  readonly snapshots: number;
  readonly alarmDeletes: number;
}

function harness(): Harness {
  const mutable = {
    saves: 0,
    snapshots: 0,
    alarmDeletes: 0,
    alarms: [] as number[],
    events: [] as string[],
    messages: [] as ServerMsg[],
  };
  const ctx: RoomCtx = {
    broadcast(message) {
      mutable.events.push(`broadcast:${message.t}`);
      mutable.messages.push(message);
    },
    sendTo() {},
    sendToOthers() {},
    broadcastSnapshot() {
      mutable.events.push('snapshot');
      mutable.snapshots += 1;
    },
    async save() {
      mutable.events.push('save');
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
    events: mutable.events,
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

function revealFor(): IkiDogruBirYalanReveal {
  return {
    round: 1,
    subjectId: 'p1',
    guesserId: 'p2',
    statements: [...P1_STATEMENTS],
    lieIndex: 1,
    guessIndex: 1,
    caught: true,
  };
}

describe('Iki Dogru Bir Yalan — guvenli sira secimi', () => {
  it('Fisher-Yates sirayi klonlar ve enjekte edilen indeksle deterministik karistirir', () => {
    const source = ['p1', 'p2'];
    expect(selectIkiDogruBirYalanOrder(source, () => 0)).toEqual(['p2', 'p1']);
    expect(source).toEqual(['p1', 'p2']);
  });

  it('sifir/tek packte random istemez, bozuk random indeksini reddeder', () => {
    const shouldNotRun = () => {
      throw new Error('random calismamali');
    };
    expect(selectIkiDogruBirYalanOrder([], shouldNotRun)).toEqual([]);
    expect(selectIkiDogruBirYalanOrder(['p1'], shouldNotRun)).toEqual(['p1']);
    expect(() => selectIkiDogruBirYalanOrder(['p1', 'p2'], (length) => length)).toThrow(RangeError);
  });
});

describe('Iki Dogru Bir Yalan — setup ve recipient gizliligi', () => {
  it('maci countdown ile baslatir, tum eski ozetleri sifirlar ve save sonrasi yayinlar', async () => {
    const state = guessState();
    state.phase = 'match_end';
    state.ikiDogruBirYalan!.caughtCount = 2;
    state.players[0].score = 1;
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.ikiDogruBirYalan).toMatchObject({
      packs: {},
      order: [],
      caughtCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      attemptedCount: 0,
      availableRounds: 0,
      catches: { p1: 0, p2: 0 },
      catchRate: null,
      history: [],
      reveal: null,
    });
    expect(h.events).toEqual(['save', 'broadcast:countdown', 'snapshot']);
  });

  it('countdown sonrasi 60 saniyelik setup acar', async () => {
    const state = stateForGame('countdown');
    const h = harness();
    const before = Date.now();
    await startSetup(h.ctx, state);
    expect(state.phase).toBe('iki_dogru_bir_yalan_setup');
    expect(state.deadline).toBeGreaterThanOrEqual(before + IKI_DOGRU_BIR_YALAN_SETUP_MS);
    expect(h.events).toEqual(['save', 'snapshot']);
  });

  it('setup snapshotinda yalniz submitted bayraklari vardir; ham/future pack ve yalan sizmaz', () => {
    const state = stateForGame();
    state.ikiDogruBirYalan!.packs.p1 = { statements: [...P1_STATEMENTS], lieIndex: 1 };
    const p1 = toIkiDogruBirYalanSnapshot(state, 'p1');
    const p2 = toIkiDogruBirYalanSnapshot(state, 'p2');
    expect(p1).toMatchObject({
      round: 0,
      availableRounds: 0,
      role: 'setup',
      mySubmitted: true,
      opponentSubmitted: false,
      subjectId: null,
      guesserId: null,
      statements: null,
      reveal: null,
    });
    expect(p2).toMatchObject({ mySubmitted: false, opponentSubmitted: true, statements: null });
    expect(JSON.stringify(p1)).not.toContain(P1_STATEMENTS[0]);
    expect(p1).not.toHaveProperty('packs');
    expect(p1).not.toHaveProperty('lieIndex');
    expect(toIkiDogruBirYalanSnapshot(state, 'sahte')).toBeNull();
  });

  it('packi kanoniklestirip ilk gonderimi kilitler; duplicate, gec, sahte ve bozuk packi reddeder', async () => {
    const state = stateForGame();
    const h = harness();
    await onPack(h.ctx, state, player('p3'), P1_STATEMENTS, 1);
    await onPack(h.ctx, state, state.players[0], ['A', 'a', 'C'], 1);
    expect(state.ikiDogruBirYalan?.packs).toEqual({});
    await onPack(
      h.ctx,
      state,
      state.players[0],
      ['  İlk\u00a0iddia  ', 'İkinci iddia', 'Üçüncü iddia'],
      1,
    );
    await onPack(h.ctx, state, state.players[0], P1_STATEMENTS, 0);
    expect(state.ikiDogruBirYalan?.packs.p1).toEqual({
      statements: ['İlk iddia', 'İkinci iddia', 'Üçüncü iddia'],
      lieIndex: 1,
    });
    const late = stateForGame();
    late.deadline = Date.now() - 1;
    await onPack(h.ctx, late, late.players[0], P1_STATEMENTS, 1);
    expect(late.ikiDogruBirYalan?.packs).toEqual({});
  });

  it('iki pack gelir gelmez iki turluk guess acar ve future packi snapshot disinda tutar', async () => {
    const state = stateForGame();
    const h = harness();
    await onPack(h.ctx, state, state.players[0], P1_STATEMENTS, 1);
    await onPack(h.ctx, state, state.players[1], P2_STATEMENTS, 2);
    expect(state.phase).toBe('iki_dogru_bir_yalan_guess');
    expect(state.ikiDogruBirYalan?.availableRounds).toBe(2);
    expect(new Set(state.ikiDogruBirYalan?.order)).toEqual(new Set(['p1', 'p2']));
    const snap = toIkiDogruBirYalanSnapshot(state, 'p1')!;
    const subject = state.ikiDogruBirYalan!.order[0];
    const current = subject === 'p1' ? P1_STATEMENTS : P2_STATEMENTS;
    const future = subject === 'p1' ? P2_STATEMENTS : P1_STATEMENTS;
    expect(snap.statements).toEqual(current);
    expect(JSON.stringify(snap)).not.toContain(future[0]);
    expect(JSON.stringify(snap)).not.toContain('lieIndex');
  });

  it('setup deadlineinda bir packi bir tura cevirir, sifir packi neutral bitirir', async () => {
    const one = stateForGame();
    const h = harness();
    one.ikiDogruBirYalan!.packs.p2 = { statements: [...P2_STATEMENTS], lieIndex: 2 };
    one.deadline = Date.now() - 1;
    await onSetupDeadline(h.ctx, one);
    expect(one.phase).toBe('iki_dogru_bir_yalan_guess');
    expect(one.ikiDogruBirYalan).toMatchObject({ order: ['p2'], availableRounds: 1 });
    expect(one.turn).toBe('p1');

    const zero = stateForGame();
    zero.deadline = Date.now() - 1;
    await onSetupDeadline(h.ctx, zero);
    expect(zero.phase).toBe('match_end');
    expect(zero.winner).toBeNull();
    expect(zero.ikiDogruBirYalan).toMatchObject({ availableRounds: 0, history: [], catchRate: null });
    expect(zero.players.map((entry) => entry.score)).toEqual([0, 0]);
    expect(toIkiDogruBirYalanSnapshot(zero, 'p1')).toMatchObject({ role: 'done', round: 0 });
  });

  it('erken setup alarmi ayni deadlinea yeniden kurulur', async () => {
    const state = stateForGame();
    const h = harness();
    const deadline = state.deadline!;
    state.alarmPurpose = null;
    await onSetupDeadline(h.ctx, state);
    expect(state.phase).toBe('iki_dogru_bir_yalan_setup');
    expect(state.alarmPurpose).toBe('phase');
    expect(h.alarms.at(-1)).toBe(deadline);
  });
});

describe('Iki Dogru Bir Yalan — guess/reveal ve reconnect', () => {
  it("current paketi iki tarafa acar; yalan gizli ve myGuess yalniz guesser recipient'indadir", () => {
    const state = guessState();
    state.ikiDogruBirYalan!.guess = 1;
    const subject = toIkiDogruBirYalanSnapshot(state, 'p1');
    const guesser = toIkiDogruBirYalanSnapshot(state, 'p2');
    expect(subject).toMatchObject({
      role: 'subject',
      subjectId: 'p1',
      guesserId: 'p2',
      statements: P1_STATEMENTS,
      myGuess: null,
      guessLocked: true,
      reveal: null,
    });
    expect(guesser).toMatchObject({ role: 'guesser', myGuess: 1, guessLocked: true, reveal: null });
    expect(JSON.stringify(subject)).not.toContain('lieIndex');
    expect(JSON.stringify(guesser)).not.toContain(P2_STATEMENTS[0]);
  });

  it('yalniz aktif guesser, current roundda, deadline oncesi ilk tahmini kilitleyebilir', async () => {
    const state = guessState();
    const h = harness();
    await onGuess(h.ctx, state, state.players[0], 1, 1); // subject
    await onGuess(h.ctx, state, player('p3'), 1, 1); // sahte
    await onGuess(h.ctx, state, state.players[1], 1, 2); // stale/future
    await onGuess(h.ctx, state, state.players[1], 3, 1); // invalid
    expect(state.ikiDogruBirYalan?.guess).toBeNull();
    await onGuess(h.ctx, state, state.players[1], 1, 1);
    expect(state.phase).toBe('iki_dogru_bir_yalan_reveal');
    expect(state.ikiDogruBirYalan?.history).toHaveLength(1);
    const saves = h.saves;
    await onGuess(h.ctx, state, state.players[1], 1, 1);
    await onGuessDeadline(h.ctx, state);
    expect(h.saves).toBe(saves);

    const late = guessState();
    late.deadline = Date.now() - 1;
    await onGuess(h.ctx, late, late.players[1], 1, 1);
    expect(late.ikiDogruBirYalan?.guess).toBeNull();
  });

  it('dogru tahmini caught/attempted/catches ve yalniz guesser skoru olarak yazar', async () => {
    const state = guessState();
    const h = harness();
    await onGuess(h.ctx, state, state.players[1], 1, 1);
    expect(state.ikiDogruBirYalan).toMatchObject({
      caughtCount: 1,
      wrongCount: 0,
      skippedCount: 0,
      attemptedCount: 1,
      catches: { p1: 0, p2: 1 },
      catchRate: 100,
    });
    expect(state.players.map((entry) => entry.score)).toEqual([0, 1]);
    expect(state.ikiDogruBirYalan?.reveal).toMatchObject({
      guessIndex: 1,
      lieIndex: 1,
      caught: true,
    });
  });

  it('yanlis tahmini wrong, timeoutu skipped sayar; timeout null kalir ve attempted paydasina girmez', async () => {
    const wrong = guessState();
    const h = harness();
    await onGuess(h.ctx, wrong, wrong.players[1], 0, 1);
    expect(wrong.ikiDogruBirYalan).toMatchObject({
      caughtCount: 0,
      wrongCount: 1,
      skippedCount: 0,
      attemptedCount: 1,
      catchRate: 0,
    });

    const skipped = guessState();
    skipped.deadline = Date.now() - 1;
    await onGuessDeadline(h.ctx, skipped);
    expect(skipped.ikiDogruBirYalan).toMatchObject({
      caughtCount: 0,
      wrongCount: 0,
      skippedCount: 1,
      attemptedCount: 0,
      catchRate: null,
    });
    expect(skipped.ikiDogruBirYalan?.reveal).toMatchObject({ guessIndex: null, caught: false });
  });

  it('reveal/history reconnectte acilir ve statement dizileri derin klonlanir', async () => {
    const state = guessState();
    const h = harness();
    await onGuess(h.ctx, state, state.players[1], 1, 1);
    const p1 = toIkiDogruBirYalanSnapshot(state, 'p1')!;
    const p2 = toIkiDogruBirYalanSnapshot(state, 'p2')!;
    expect(p1.reveal).toEqual(revealFor());
    expect(p2.reveal).toEqual(revealFor());
    expect(p1.history).toEqual([revealFor()]);
    p1.history[0].statements[0] = 'Degisti';
    p1.reveal!.statements[1] = 'Degisti';
    p1.catches.p2 = 99;
    expect(state.ikiDogruBirYalan!.history[0].statements).toEqual(P1_STATEMENTS);
    expect(state.ikiDogruBirYalan!.reveal!.statements).toEqual(P1_STATEMENTS);
    expect(state.ikiDogruBirYalan!.catches.p2).toBe(1);
  });

  it('erken guess/reveal alarmini yeniden kurar ve gecikmis alarm yeni guess turunu erken bitirmez', async () => {
    const state = guessState();
    const h = harness();
    const guessDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onGuessDeadline(h.ctx, state);
    expect(state.phase).toBe('iki_dogru_bir_yalan_guess');
    expect(h.alarms.at(-1)).toBe(guessDeadline);

    state.deadline = Date.now() - 1;
    await onGuessDeadline(h.ctx, state);
    const revealDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('iki_dogru_bir_yalan_reveal');
    expect(h.alarms.at(-1)).toBe(revealDeadline);

    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('iki_dogru_bir_yalan_guess');
    expect(state.ikiDogruBirYalan?.roundIndex).toBe(1);
    const nextGuessDeadline = state.deadline!;
    expect(nextGuessDeadline).toBeGreaterThanOrEqual(Date.now() + IKI_DOGRU_BIR_YALAN_GUESS_MS - 10);
    state.alarmPurpose = null;
    await onGuessDeadline(h.ctx, state); // onceki turun gecikmis retry'si
    expect(state.phase).toBe('iki_dogru_bir_yalan_guess');
    expect(h.alarms.at(-1)).toBe(nextGuessDeadline);
  });

  it('iki turu caught+wrong ile bitirir; winner null, bireysel skor ve final metrikleri dogrudur', async () => {
    const state = guessState();
    const h = harness();
    await onGuess(h.ctx, state, state.players[1], 1, 1); // p2 yakalar
    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    await onGuess(h.ctx, state, state.players[0], 0, 2); // p1 yanlis
    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.alarmPurpose).toBeNull();
    expect(state.ikiDogruBirYalan).toMatchObject({
      caughtCount: 1,
      wrongCount: 1,
      skippedCount: 0,
      attemptedCount: 2,
      availableRounds: 2,
      catches: { p1: 0, p2: 1 },
      catchRate: 50,
    });
    expect(state.ikiDogruBirYalan).toMatchObject({
      packs: {},
      order: [],
      guess: null,
      history: [],
      reveal: null,
    });
    expect(state.players.map((entry) => entry.score)).toEqual([0, 1]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 0, p2: 1 },
      word: null,
    });
    const final = toIkiDogruBirYalanSnapshot(state, 'p1')!;
    expect(final).toMatchObject({ role: 'done', round: 2, subjectId: null, statements: null });
    expect(final.history).toHaveLength(0);
    expect(JSON.stringify(final)).not.toContain(P1_STATEMENTS[0]);
    expect(JSON.stringify(final)).not.toContain(P2_STATEMENTS[0]);
    expect(JSON.stringify(final)).not.toContain('lieIndex');
  });

  it('caught+timeout finalinde catchRate attempted uzerinden 100 kalir', async () => {
    const state = guessState();
    const h = harness();
    await onGuess(h.ctx, state, state.players[1], 1, 1);
    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    state.deadline = Date.now() - 1;
    await onGuessDeadline(h.ctx, state);
    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.ikiDogruBirYalan).toMatchObject({
      caughtCount: 1,
      wrongCount: 0,
      skippedCount: 1,
      attemptedCount: 1,
      catchRate: 100,
    });
  });
});
