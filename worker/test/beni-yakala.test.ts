import { describe, expect, it } from 'vitest';
import type { BeniYakalaQuestion, ServerMsg } from '@harfiyen/shared';
import {
  evaluateBeniYakalaRound,
  onAnswer,
  onAnswerDeadline,
  onPredict,
  onPredictDeadline,
  onRevealDone,
  pickBeniYakalaQuestions,
  startAnswer,
  startMatch,
  toBeniYakalaBank,
  toBeniYakalaSnapshot,
} from '../src/game/modes/beni-yakala';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';

const QUESTIONS: BeniYakalaQuestion[] = Array.from({ length: 5 }, (_, index) => ({
  prompt: `Soru ${index + 1}`,
  options: [`A${index}`, `B${index}`, `C${index}`, `D${index}`],
}));

function player(id: string): PlayerState {
  return {
    id,
    reconnectHash: (id === 'p1' ? '1' : '2').repeat(64),
    nick: id,
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

function gameState(phase: RoomState['phase'] = 'beni_yakala_answer'): RoomState {
  return {
    code: 'YAKALA',
    mode: 'beni_yakala',
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
    jokers: { p1: 0, p2: 0 },
    frozenUntil: {},
    alarmPurpose: 'phase',
    sayi: null,
    zincir: null,
    uzun: null,
    bom: null,
    telepati: null,
    korSiralama: null,
    beniYakala: {
      questions: QUESTIONS.map((question) => ({ ...question, options: [...question.options] })),
      roundIndex: 0,
      answers: {},
      predictions: {},
      reads: { p1: 0, p2: 0 },
      exactMatches: 0,
      mutualReads: 0,
      reveal: null,
    },
    randevuRuleti: null,
  };
}

interface Harness {
  ctx: RoomCtx;
  messages: ServerMsg[];
  saves: number;
  snapshots: number;
  alarms: number[];
  alarmDeletes: number;
}

function harness(): Harness {
  const mutable = {
    messages: [] as ServerMsg[],
    saves: 0,
    snapshots: 0,
    alarms: [] as number[],
    alarmDeletes: 0,
  };
  const ctx: RoomCtx = {
    broadcast: (message) => mutable.messages.push(message),
    sendTo: () => undefined,
    sendToOthers: () => undefined,
    broadcastSnapshot: () => {
      mutable.snapshots += 1;
    },
    save: async () => {
      mutable.saves += 1;
    },
    setAlarm: async (at) => {
      mutable.alarms.push(at);
    },
    deleteAlarm: async () => {
      mutable.alarmDeletes += 1;
    },
    scoresOf: (state) => Object.fromEntries(state.players.map((entry) => [entry.id, entry.score])),
    dict: () => new Set<string>(),
    pairs: () => ({}),
    startCounts: () => new Map<string, number>(),
    fetchMeaning: () => undefined,
  };
  return {
    ctx,
    messages: mutable.messages,
    alarms: mutable.alarms,
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

describe('Beni Yakala — soru bankasi ve puanlama', () => {
  it('yalniz dort benzersiz ve sinirli secenekli kayitlari kabul eder', () => {
    const bank = toBeniYakalaBank([
      { prompt: '  Hangisi?  ', options: [' A ', 'B', 'C', 'D'] },
      { prompt: 'Tekrar', options: ['A', 'a', 'C', 'D'] },
      { prompt: 'Eksik', options: ['A', 'B', 'C'] },
      { prompt: '', options: ['A', 'B', 'C', 'D'] },
      { prompt: 'Uzun', options: ['x'.repeat(49), 'B', 'C', 'D'] },
    ]);
    expect(bank).toEqual([{ prompt: 'Hangisi?', options: ['A', 'B', 'C', 'D'] }]);
  });

  it('soru secimini tekrarsiz yapar ve banka nesnelerini mutasyondan korur', () => {
    const selected = pickBeniYakalaQuestions(QUESTIONS, 5, () => 0);
    expect(selected.map((question) => question.prompt)).toHaveLength(5);
    expect(new Set(selected.map((question) => question.prompt)).size).toBe(5);
    selected[0].options[0] = 'degisti';
    expect(QUESTIONS[0].options[0]).toBe('A0');
  });

  it('dogru, karsilikli ve birebir eslesme istatistiklerini ayri hesaplar', () => {
    expect(evaluateBeniYakalaRound(['p1', 'p2'], { p1: 0, p2: 2 }, { p1: 2, p2: 1 })).toEqual({
      answers: { p1: 0, p2: 2 },
      predictions: { p1: 2, p2: 1 },
      correct: { p1: true, p2: false },
      exactMatch: false,
      mutualRead: false,
    });

    expect(evaluateBeniYakalaRound(['p1', 'p2'], { p1: 3, p2: 3 }, { p1: 3, p2: 3 })).toMatchObject({
      correct: { p1: true, p2: true },
      exactMatch: true,
      mutualRead: true,
    });
  });

  it('timeout eksiklerini null acar; cevap veya puan uydurmaz', () => {
    expect(evaluateBeniYakalaRound(['p1', 'p2'], { p1: 1 }, { p2: 1 })).toEqual({
      answers: { p1: 1, p2: null },
      predictions: { p1: null, p2: 1 },
      correct: { p1: false, p2: true },
      exactMatch: false,
      mutualRead: false,
    });
  });
});

describe('Beni Yakala — gizli snapshot projeksiyonu', () => {
  it('answer/predict fazinda rakibin ham cevabini ve tahminini sizdirmaz', () => {
    const state = gameState('beni_yakala_answer');
    state.beniYakala!.answers = { p1: 1, p2: 3 };
    state.beniYakala!.predictions = { p1: 3, p2: 1 };

    for (const phase of ['beni_yakala_answer', 'beni_yakala_predict'] as const) {
      state.phase = phase;
      const snapshot = toBeniYakalaSnapshot(state, 'p1');
      expect(snapshot).toMatchObject({
        myAnswered: true,
        oppAnswered: true,
        myPredicted: true,
        oppPredicted: true,
        myAnswer: 1,
        myPrediction: 3,
        reveal: null,
      });
      expect(snapshot).not.toHaveProperty('answers');
      expect(snapshot).not.toHaveProperty('predictions');
    }
  });

  it('iki tarafin ham degerlerini yalniz reveal/match_end fazinda acar', () => {
    const state = gameState('beni_yakala_reveal');
    state.beniYakala!.answers = { p1: 1, p2: 3 };
    state.beniYakala!.predictions = { p1: 3, p2: 1 };
    state.beniYakala!.reveal = evaluateBeniYakalaRound(
      ['p1', 'p2'],
      state.beniYakala!.answers,
      state.beniYakala!.predictions,
    );

    expect(toBeniYakalaSnapshot(state, 'p1')?.reveal).toEqual({
      answers: { p1: 1, p2: 3 },
      predictions: { p1: 3, p2: 1 },
      correct: { p1: true, p2: true },
      exactMatch: false,
      mutualRead: true,
    });
  });
});

describe('Beni Yakala — sunucu durum makinesi', () => {
  it('maci bes soruyla kurar ve countdown sonrasi cevap fazini acar', async () => {
    const state = gameState('lobby');
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.beniYakala?.questions).toHaveLength(5);
    expect(state.beniYakala?.reads).toEqual({ p1: 0, p2: 0 });

    await startAnswer(h.ctx, state);
    expect(state.phase).toBe('beni_yakala_answer');
    expect(state.deadline).toBeGreaterThan(Date.now());
  });

  it('phase, deadline, stale round ve ilk hamle kilidini uygular', async () => {
    const state = gameState();
    const h = harness();
    const [p1, p2] = state.players;

    await onAnswer(h.ctx, state, p1, 1, 2); // stale gelecek tur
    expect(state.beniYakala?.answers).toEqual({});
    await onAnswer(h.ctx, state, p1, 1, 1);
    await onAnswer(h.ctx, state, p1, 2, 1); // ikinci cevap kilitli
    expect(state.beniYakala?.answers).toEqual({ p1: 1 });

    state.deadline = Date.now() - 1;
    await onAnswer(h.ctx, state, p2, 3, 1);
    expect(state.beniYakala?.answers).toEqual({ p1: 1 });

    await onAnswerDeadline(h.ctx, state);
    expect(state.phase).toBe('beni_yakala_predict');
    await onPredict(h.ctx, state, p1, 3, 2); // stale tur
    expect(state.beniYakala?.predictions).toEqual({});
    state.deadline = Date.now() - 1;
    await onPredict(h.ctx, state, p1, 3, 1);
    expect(state.beniYakala?.predictions).toEqual({});
  });

  it("iki tahminden sonra puani bir kez yazar; gecikmis alarm reveal'i tekrarlamaz", async () => {
    const state = gameState();
    const h = harness();
    const [p1, p2] = state.players;
    await onAnswer(h.ctx, state, p1, 0, 1);
    await onAnswer(h.ctx, state, p2, 2, 1);
    expect(state.phase).toBe('beni_yakala_predict');

    await onPredict(h.ctx, state, p1, 2, 1);
    await onPredict(h.ctx, state, p2, 0, 1);
    expect(state.phase).toBe('beni_yakala_reveal');
    expect(state.beniYakala?.reads).toEqual({ p1: 1, p2: 1 });
    expect(state.beniYakala?.mutualReads).toBe(1);
    const saves = h.saves;

    await onPredictDeadline(h.ctx, state); // eski alarm/tekrar cagrisi
    expect(state.beniYakala?.reads).toEqual({ p1: 1, p2: 1 });
    expect(state.beniYakala?.mutualReads).toBe(1);
    expect(h.saves).toBe(saves);
  });

  it('answer ve predict timeoutunda eksik degerleri null reveal eder', async () => {
    const state = gameState();
    const h = harness();
    const [p1, p2] = state.players;
    await onAnswer(h.ctx, state, p1, 1, 1);
    await onAnswerDeadline(h.ctx, state);
    await onPredict(h.ctx, state, p2, 1, 1);
    await onPredictDeadline(h.ctx, state);

    expect(state.beniYakala?.reveal).toEqual({
      answers: { p1: 1, p2: null },
      predictions: { p1: null, p2: 1 },
      correct: { p1: false, p2: true },
      exactMatch: false,
      mutualRead: false,
    });
    expect(state.beniYakala?.reads).toEqual({ p1: 0, p2: 1 });
  });

  it('bes turu tamamlar; reads, exact ve mutual sayaclarini koruyup kazanan dayatmaz', async () => {
    const state = gameState();
    const h = harness();
    const [p1, p2] = state.players;

    for (let round = 1; round <= 5; round += 1) {
      const choice = (round - 1) % 4;
      await onAnswer(h.ctx, state, p1, choice, round);
      await onAnswer(h.ctx, state, p2, choice, round);
      await onPredict(h.ctx, state, p1, choice, round);
      await onPredict(h.ctx, state, p2, choice, round);
      expect(state.phase).toBe('beni_yakala_reveal');
      await onRevealDone(h.ctx, state);
    }

    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.beniYakala?.reads).toEqual({ p1: 5, p2: 5 });
    expect(state.beniYakala?.exactMatches).toBe(5);
    expect(state.beniYakala?.mutualReads).toBe(5);
    expect(state.players.map((entry) => entry.score)).toEqual([5, 5]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 5, p2: 5 },
      word: null,
    });
  });
});
