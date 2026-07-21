import { describe, expect, it } from 'vitest';
import {
  AYNI_ANDA_SOYLE_ANSWER_MS,
  AYNI_ANDA_SOYLE_ROUNDS,
  ayniAndaSoyleAnswerKey,
} from '@harfiyen/shared';
import type { AyniAndaSoylePrompt, ServerMsg } from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';
import {
  AYNI_ANDA_SOYLE_PROMPT_BANK,
  evaluateAyniAndaSoyleRound,
  onAnswer,
  onAnswerDeadline,
  onRevealDone,
  selectAyniAndaSoylePrompts,
  startAnswer,
  startMatch,
  toAyniAndaSoyleSnapshot,
} from '../src/game/modes/ayni-anda-soyle';

const PROMPTS: AyniAndaSoylePrompt[] = AYNI_ANDA_SOYLE_PROMPT_BANK
  .slice(0, AYNI_ANDA_SOYLE_ROUNDS)
  .map((entry) => ({ ...entry }));

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

function stateForGame(phase: RoomState['phase'] = 'ayni_anda_soyle_answer'): RoomState {
  return {
    code: 'AAS123',
    mode: 'ayni_anda_soyle',
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
    ikiDogruBirYalan: null,
    ayniAndaSoyle: {
      prompts: PROMPTS.map((entry) => ({ ...entry })),
      roundIndex: 0,
      answers: {},
      matches: 0,
      jointRounds: 0,
      differentRounds: 0,
      missedRounds: 0,
      matchRate: null,
      reveal: null,
    },
  };
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

describe('Ayni Anda Soyle — guvenli kategori secimi ve karsilastirma', () => {
  it('uretim bankasindan Web Crypto indeksine uygun bes farkli kategoriyi klonlar', () => {
    expect(AYNI_ANDA_SOYLE_PROMPT_BANK).toHaveLength(12);
    const sourceFirst = AYNI_ANDA_SOYLE_PROMPT_BANK[0].prompt;
    const selected = selectAyniAndaSoylePrompts(AYNI_ANDA_SOYLE_PROMPT_BANK, () => 0);
    expect(selected).toHaveLength(AYNI_ANDA_SOYLE_ROUNDS);
    expect(new Set(selected.map((entry) => entry.category)).size).toBe(AYNI_ANDA_SOYLE_ROUNDS);
    selected[0].prompt = 'Degisti';
    expect(AYNI_ANDA_SOYLE_PROMPT_BANK[0].prompt).toBe(sourceFirst);
  });

  it('eksik/tekrarli bankada fallback uretmez ve bozuk random indeksini reddeder', () => {
    expect(selectAyniAndaSoylePrompts(PROMPTS.slice(0, 4), () => 0)).toEqual([]);
    expect(selectAyniAndaSoylePrompts([...PROMPTS, { ...PROMPTS[0] }], () => 0)).toEqual([]);
    expect(() => selectAyniAndaSoylePrompts(PROMPTS, (length) => length)).toThrow(RangeError);
  });

  it('Turkce case, sapka, noktalama/bosluk ve emoji presentation farklarini ayni key yapar', () => {
    expect(ayniAndaSoyleAnswerKey(' PİZZÂ! ')).toBe(ayniAndaSoyleAnswerKey('pizza'));
    expect(ayniAndaSoyleAnswerKey(' BİLİM\u00a0KURGU! ')).toBe(ayniAndaSoyleAnswerKey('bilim-kurgu'));
    expect(ayniAndaSoyleAnswerKey('IŞIK')).toBe(ayniAndaSoyleAnswerKey('ışık'));
    expect(ayniAndaSoyleAnswerKey('İNCİR')).toBe(ayniAndaSoyleAnswerKey('incir'));
    expect(ayniAndaSoyleAnswerKey('Ｋｅｄｉ')).toBe(ayniAndaSoyleAnswerKey('kedi'));
    expect(ayniAndaSoyleAnswerKey('①')).toBe(ayniAndaSoyleAnswerKey('1'));
    expect(ayniAndaSoyleAnswerKey('❤️')).toBe(ayniAndaSoyleAnswerKey('❤'));
    expect(ayniAndaSoyleAnswerKey('👨‍👩‍👧')).toBe(ayniAndaSoyleAnswerKey('👨👩👧'));
    expect(ayniAndaSoyleAnswerKey('kırmızı')).not.toBe(ayniAndaSoyleAnswerKey('kirmizi'));
    expect(ayniAndaSoyleAnswerKey('şeker')).not.toBe(ayniAndaSoyleAnswerKey('seker'));
  });

  it('match/different/solo/skipped sonuclarini fallback cevapsiz hesaplar', () => {
    expect(evaluateAyniAndaSoyleRound(['p1', 'p2'], { p1: 'PİZZA!', p2: 'pizza' })).toEqual({
      answers: { p1: 'PİZZA!', p2: 'pizza' },
      match: true,
      joint: true,
      resolution: 'match',
    });
    expect(evaluateAyniAndaSoyleRound(['p1', 'p2'], { p1: 'Pizza', p2: 'Makarna' })).toMatchObject({
      match: false,
      joint: true,
      resolution: 'different',
    });
    expect(evaluateAyniAndaSoyleRound(['p1', 'p2'], { p1: 'Pizza' })).toEqual({
      answers: { p1: 'Pizza', p2: null },
      match: false,
      joint: false,
      resolution: 'solo',
    });
    expect(evaluateAyniAndaSoyleRound(['p1', 'p2'], {})).toEqual({
      answers: { p1: null, p2: null },
      match: false,
      joint: false,
      resolution: 'skipped',
    });
  });
});

describe('Ayni Anda Soyle — baslangic, gizlilik ve idempotency', () => {
  it('yalniz iki katilimciyla countdown baslatir ve taze bes kategori kurar', async () => {
    const state = stateForGame('match_end');
    state.ayniAndaSoyle!.matches = 4;
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.ayniAndaSoyle).toMatchObject({
      roundIndex: 0,
      answers: {},
      matches: 0,
      jointRounds: 0,
      differentRounds: 0,
      missedRounds: 0,
      matchRate: null,
      reveal: null,
    });
    expect(state.ayniAndaSoyle?.prompts).toHaveLength(AYNI_ANDA_SOYLE_ROUNDS);
    expect(new Set(state.ayniAndaSoyle?.prompts.map((entry) => entry.category)).size).toBe(5);
    expect(h.events).toEqual(['save', 'broadcast:countdown', 'snapshot']);

    const alone = stateForGame('lobby');
    alone.players.pop();
    const aloneHarness = harness();
    await startMatch(aloneHarness.ctx, alone);
    expect(alone.phase).toBe('lobby');
    expect(aloneHarness.saves).toBe(0);
  });

  it('countdown sonrasi 12 saniyelik cevap fazi acar', async () => {
    const state = stateForGame('countdown');
    const h = harness();
    const before = Date.now();
    await startAnswer(h.ctx, state);
    expect(state.phase).toBe('ayni_anda_soyle_answer');
    expect(state.deadline).toBeGreaterThanOrEqual(before + AYNI_ANDA_SOYLE_ANSWER_MS);
    expect(h.events).toEqual(['save', 'snapshot']);
  });

  it('answer snapshotinda own cevap ve iki lock disinda rakip/future veri sizdirmaz', () => {
    const state = stateForGame();
    state.ayniAndaSoyle!.answers = { p1: 'Pizza', p2: 'Makarna' };
    const p1 = toAyniAndaSoyleSnapshot(state, 'p1');
    const p2 = toAyniAndaSoyleSnapshot(state, 'p2');
    expect(p1).toMatchObject({
      round: 1,
      category: PROMPTS[0].category,
      prompt: PROMPTS[0].prompt,
      myLocked: true,
      opponentLocked: true,
      myAnswer: 'Pizza',
      reveal: null,
    });
    expect(p2).toMatchObject({ myAnswer: 'Makarna', myLocked: true, opponentLocked: true });
    expect(JSON.stringify(p1)).not.toContain('Makarna');
    expect(JSON.stringify(p1)).not.toContain(PROMPTS[1].prompt);
    expect(JSON.stringify(p1)).not.toContain('AnswerKey');
    expect(JSON.stringify(p1)).not.toContain('"key"');
    expect(p1).not.toHaveProperty('prompts');
    expect(p1).not.toHaveProperty('history');
    expect(toAyniAndaSoyleSnapshot(state, 'sahte')).toBeNull();
  });

  it('yalniz odadaki oyuncunun current-round ilk cevabini deadline oncesi kilitler', async () => {
    const state = stateForGame();
    const h = harness();
    await onAnswer(h.ctx, state, player('p3'), 'Sahte', 1);
    await onAnswer(h.ctx, state, state.players[0], 'Pizza', 2);
    await onAnswer(h.ctx, state, state.players[0], '...', 1);
    expect(state.ayniAndaSoyle?.answers).toEqual({});
    await onAnswer(h.ctx, state, state.players[0], '  PİZZA\u00a0! ', 1);
    await onAnswer(h.ctx, state, state.players[0], 'Makarna', 1);
    expect(state.ayniAndaSoyle?.answers).toEqual({ p1: 'PİZZA !' });

    const late = stateForGame();
    late.deadline = Date.now() - 1;
    await onAnswer(h.ctx, late, late.players[0], 'Pizza', 1);
    expect(late.ayniAndaSoyle?.answers).toEqual({});
  });
});

describe('Ayni Anda Soyle — reveal, timeout, reconnect ve final scrub', () => {
  it('iki cevap gelince birlikte acar, ortak skoru ve aggregate invariantlarini yazar', async () => {
    const state = stateForGame();
    const h = harness();
    await onAnswer(h.ctx, state, state.players[0], 'PİZZÂ!', 1);
    const waiting = toAyniAndaSoyleSnapshot(state, 'p2')!;
    expect(waiting).toMatchObject({ myAnswer: null, myLocked: false, opponentLocked: true, reveal: null });
    expect(JSON.stringify(waiting)).not.toContain('PİZZÂ');

    await onAnswer(h.ctx, state, state.players[1], 'pizza', 1);
    expect(state.phase).toBe('ayni_anda_soyle_reveal');
    expect(state.ayniAndaSoyle).toMatchObject({
      matches: 1,
      jointRounds: 1,
      differentRounds: 0,
      missedRounds: 0,
      matchRate: 100,
    });
    expect(state.ayniAndaSoyle!.matches + state.ayniAndaSoyle!.differentRounds)
      .toBe(state.ayniAndaSoyle!.jointRounds);
    expect(state.players.map((entry) => entry.score)).toEqual([1, 1]);
    const p1 = toAyniAndaSoyleSnapshot(state, 'p1')!;
    const p2 = toAyniAndaSoyleSnapshot(state, 'p2')!;
    expect(p1).toMatchObject({ myAnswer: null, reveal: { match: true, resolution: 'match' } });
    expect(p2.reveal).toEqual(p1.reveal);
    expect(p1.reveal?.answers).toEqual({ p1: 'PİZZÂ!', p2: 'pizza' });
    p1.reveal!.answers.p1 = 'Degisti';
    expect(state.ayniAndaSoyle?.reveal?.answers.p1).toBe('PİZZÂ!');
  });

  it('timeoutta fallback uretmez; tek/bos tur missed, joint=0 ve matchRate=null kalir', async () => {
    const solo = stateForGame();
    const h = harness();
    await onAnswer(h.ctx, solo, solo.players[0], 'Pizza', 1);
    solo.deadline = Date.now() - 1;
    await onAnswerDeadline(h.ctx, solo);
    expect(solo.ayniAndaSoyle).toMatchObject({
      matches: 0,
      jointRounds: 0,
      differentRounds: 0,
      missedRounds: 1,
      matchRate: null,
      reveal: { answers: { p1: 'Pizza', p2: null }, match: false, resolution: 'solo' },
    });

    const skipped = stateForGame();
    skipped.deadline = Date.now() - 1;
    await onAnswerDeadline(h.ctx, skipped);
    expect(skipped.ayniAndaSoyle).toMatchObject({
      jointRounds: 0,
      missedRounds: 1,
      matchRate: null,
      reveal: { answers: { p1: null, p2: null }, resolution: 'skipped' },
    });
    expect(skipped.players.map((entry) => entry.score)).toEqual([0, 0]);
  });

  it('sonraki tur onceki ham cevabi siler; erken/gecikmis retry alarmlari cift skor yazmaz', async () => {
    const state = stateForGame();
    const h = harness();
    const answerDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onAnswerDeadline(h.ctx, state);
    expect(state.phase).toBe('ayni_anda_soyle_answer');
    expect(h.alarms.at(-1)).toBe(answerDeadline);

    await onAnswer(h.ctx, state, state.players[0], 'Pizza', 1);
    await onAnswer(h.ctx, state, state.players[1], 'Pizza!', 1);
    const revealDeadline = state.deadline!;
    const metrics = { matches: 1, jointRounds: 1, differentRounds: 0, missedRounds: 0 };
    state.alarmPurpose = null;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('ayni_anda_soyle_reveal');
    expect(h.alarms.at(-1)).toBe(revealDeadline);
    expect(state.ayniAndaSoyle).toMatchObject(metrics);

    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('ayni_anda_soyle_answer');
    expect(state.ayniAndaSoyle).toMatchObject({ ...metrics, roundIndex: 1, answers: {}, reveal: null });
    const nextSnapshot = toAyniAndaSoyleSnapshot(state, 'p1')!;
    expect(JSON.stringify(nextSnapshot)).not.toContain('Pizza');
    expect(nextSnapshot.prompt).toBe(PROMPTS[1].prompt);

    const nextDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onAnswerDeadline(h.ctx, state); // onceki turun gecikmis retry'si
    expect(state.phase).toBe('ayni_anda_soyle_answer');
    expect(h.alarms.at(-1)).toBe(nextDeadline);
    expect(state.ayniAndaSoyle).toMatchObject(metrics);
  });

  it('besinci reveal sonunda winner=null ve aggregate-only final birakir', async () => {
    const state = stateForGame();
    const game = state.ayniAndaSoyle!;
    game.roundIndex = 4;
    game.matches = 2;
    game.jointRounds = 4;
    game.differentRounds = 2;
    game.missedRounds = 0;
    game.matchRate = 50;
    state.round = 5;
    const h = harness();
    await onAnswer(h.ctx, state, state.players[0], 'Kahve', 5);
    await onAnswer(h.ctx, state, state.players[1], 'kahve!', 5);
    expect(game.matches + game.differentRounds).toBe(game.jointRounds);
    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);

    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.alarmPurpose).toBeNull();
    expect(game).toMatchObject({
      prompts: [],
      answers: {},
      reveal: null,
      matches: 3,
      jointRounds: 5,
      differentRounds: 2,
      missedRounds: 0,
      matchRate: 60,
    });
    expect(game.matches + game.differentRounds).toBe(game.jointRounds);
    expect(state.players.map((entry) => entry.score)).toEqual([3, 3]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 3, p2: 3 },
      word: null,
    });
    const final = toAyniAndaSoyleSnapshot(state, 'p1')!;
    expect(final).toEqual({
      round: 5,
      category: null,
      prompt: null,
      myLocked: false,
      opponentLocked: false,
      myAnswer: null,
      matches: 3,
      jointRounds: 5,
      differentRounds: 2,
      missedRounds: 0,
      matchRate: 60,
      reveal: null,
    });
    expect(JSON.stringify(final)).not.toContain('Kahve');
    expect(final).not.toHaveProperty('prompts');
    expect(final).not.toHaveProperty('history');
  });
});
