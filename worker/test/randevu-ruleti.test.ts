import { describe, expect, it } from 'vitest';
import type {
  RandevuRuletiReveal,
  RandevuRuletiRound,
  ServerMsg,
} from '@harfiyen/shared';
import {
  onPick,
  onPickDeadline,
  onRevealDone,
  resolveRandevuChoice,
  secureRandomIndex,
  selectRandevuRounds,
  startMatch,
  startRound,
  toRandevuRuletiBank,
  toRandevuRuletiSnapshot,
} from '../src/game/modes/randevu-ruleti';
import type { PlayerState, RoomCtx, RoomState } from '../src/game/state';
import bankJson from '../src/data/randevu-ruleti.json';

const ROUNDS: RandevuRuletiRound[] = [
  {
    category: 'yemek',
    prompt: 'Ne yiyelim?',
    choices: ['Pizza', 'Sushi', 'Mantı', 'Burger', 'Makarna', 'Taco'],
  },
  {
    category: 'etkinlik',
    prompt: 'Ne yapalım?',
    choices: ['Sinema', 'Bowling', 'Sahil', 'Konser', 'Karaoke', 'Oyun'],
  },
  {
    category: 'tatli',
    prompt: 'Hangi tatlı?',
    choices: ['Sufle', 'Waffle', 'Baklava', 'Dondurma', 'Tiramisu', 'Brownie'],
  },
];

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

function stateForGame(phase: RoomState['phase'] = 'randevu_secim'): RoomState {
  return {
    code: 'DATE42',
    mode: 'randevu_ruleti',
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
    beniYakala: null,
    randevuRuleti: {
      rounds: ROUNDS.map((round) => ({ ...round, choices: [...round.choices] })),
      roundIndex: 0,
      picks: {},
      matches: 0,
      plan: [],
      history: [],
      reveal: null,
    },
    emojiSifre: null,
    kirmiziYesil: null,
    kimDahaMuhtemel: null,
    ikiDogruBirYalan: null,
  };
}

interface Harness {
  ctx: RoomCtx;
  messages: ServerMsg[];
  alarms: number[];
  readonly saves: number;
  readonly snapshots: number;
  readonly alarmDeletes: number;
}

function harness(): Harness {
  const mutable = {
    messages: [] as ServerMsg[],
    alarms: [] as number[],
    saves: 0,
    snapshots: 0,
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

function priorReveal(): RandevuRuletiReveal {
  return {
    round: 1,
    category: 'yemek',
    choices: { p1: 0, p2: 2 },
    same: false,
    selectedChoice: 2,
    selectedLabel: 'Mantı',
    resolution: 'roulette',
  };
}

describe('Randevu Ruleti — banka ve guvenli rulet', () => {
  it('yalniz uc kategoriden, alti benzersiz ve kisa secenekli kayitlari kabul eder', () => {
    const bank = toRandevuRuletiBank([
      { category: 'yemek', prompt: '  Ne yiyelim? ', choices: [' A ', 'B', 'C', 'D', 'E', 'F'] },
      { category: 'gezi', prompt: 'Nereye?', choices: ['A', 'B', 'C', 'D', 'E', 'F'] },
      { category: 'tatli', prompt: 'Tekrar', choices: ['A', 'a', 'C', 'D', 'E', 'F'] },
      { category: 'etkinlik', prompt: 'Eksik', choices: ['A', 'B', 'C', 'D', 'E'] },
      { category: 'tatli', prompt: '', choices: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ]);
    expect(bank).toEqual([
      { category: 'yemek', prompt: 'Ne yiyelim?', choices: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ]);
  });

  it('uretim bankasinda her kategori icin cesit ve uzay mutfagi imzasi bulunur', () => {
    const bank = toRandevuRuletiBank(bankJson);
    for (const category of ['yemek', 'etkinlik', 'tatli'] as const) {
      expect(bank.filter((round) => round.category === category).length).toBeGreaterThanOrEqual(5);
    }
    expect(bank.some((round) => round.choices.includes("Uzay mutfağı challenge'ı"))).toBe(true);
  });

  it('kategori sirasini korur, her kategoriden tek set secer ve banka verisini klonlar', () => {
    const bank = [...ROUNDS, ...ROUNDS.map((round) => ({ ...round, prompt: `${round.prompt} 2` }))];
    const selected = selectRandevuRounds(bank, (length) => length - 1);
    expect(selected.map((round) => round.category)).toEqual(['yemek', 'etkinlik', 'tatli']);
    expect(selected.map((round) => round.prompt)).toEqual(['Ne yiyelim? 2', 'Ne yapalım? 2', 'Hangi tatlı? 2']);
    selected[0].choices[0] = 'Degisti';
    expect(bank[3].choices[0]).toBe('Pizza');
  });

  it('Web Crypto uint32 secimini modulo bias kuyrugunda yeniden ceker', () => {
    const values = [0xffff_ffff, 7];
    let calls = 0;
    const index = secureRandomIndex(6, (sample) => {
      sample[0] = values[calls] ?? 0;
      calls += 1;
      return sample;
    });
    expect(index).toBe(1);
    expect(calls).toBe(2);
    expect(() => secureRandomIndex(0)).toThrow(RangeError);
    expect(() => secureRandomIndex(1.5)).toThrow(RangeError);
  });

  it('ayni secimi direkt kazanir ve ruleti cagirmadan match verir', () => {
    let randomCalls = 0;
    const result = resolveRandevuChoice(['p1', 'p2'], { p1: 4, p2: 4 }, 6, () => {
      randomCalls += 1;
      return 0;
    });
    expect(result).toEqual({
      choices: { p1: 4, p2: 4 },
      same: true,
      selectedChoice: 4,
      resolution: 'match',
    });
    expect(randomCalls).toBe(0);
  });

  it('farkli secimlerde sadece iki aday arasindan sunucu sonucunu secer', () => {
    expect(resolveRandevuChoice(['p1', 'p2'], { p1: 1, p2: 5 }, 6, () => 1)).toEqual({
      choices: { p1: 1, p2: 5 },
      same: false,
      selectedChoice: 5,
      resolution: 'roulette',
    });
  });

  it('tek timeoutta kilitli secimi, iki timeoutta havuzdan guvenli fallbacki alir', () => {
    expect(resolveRandevuChoice(['p1', 'p2'], { p1: 3 }, 6, () => 0)).toEqual({
      choices: { p1: 3, p2: null },
      same: false,
      selectedChoice: 3,
      resolution: 'single',
    });
    expect(resolveRandevuChoice(['p1', 'p2'], {}, 6, () => 4)).toEqual({
      choices: { p1: null, p2: null },
      same: false,
      selectedChoice: 4,
      resolution: 'fallback',
    });
  });
});

describe('Randevu Ruleti — recipient snapshot ve reconnect', () => {
  it('aktif turda yalniz kendi secimini ve rakibin kilit bayragini gosterir', () => {
    const state = stateForGame();
    state.randevuRuleti!.picks = { p1: 4, p2: 1 };
    const snapshot = toRandevuRuletiSnapshot(state, 'p1');
    expect(snapshot).toMatchObject({
      myLocked: true,
      opponentLocked: true,
      myChoice: 4,
      reveal: null,
    });
    expect(snapshot).not.toHaveProperty('picks');
    expect(snapshot?.history).toEqual([]);
  });

  it('reconnectte onceki reveal/plan kalir, aktif rakip secimi yine sizmaz', () => {
    const state = stateForGame();
    const reveal = priorReveal();
    state.randevuRuleti!.roundIndex = 1;
    state.round = 2;
    state.randevuRuleti!.picks = { p1: 3, p2: 5 };
    state.randevuRuleti!.matches = 0;
    state.randevuRuleti!.plan = [{ category: 'yemek', choice: 2, label: 'Mantı' }];
    state.randevuRuleti!.history = [reveal];

    const snapshot = toRandevuRuletiSnapshot(state, 'p1');
    expect(snapshot?.round).toBe(2);
    expect(snapshot?.myChoice).toBe(3);
    expect(snapshot?.opponentLocked).toBe(true);
    expect(snapshot?.reveal).toBeNull();
    expect(snapshot?.history).toEqual([reveal]);
    expect(snapshot?.plan).toEqual([{ category: 'yemek', choice: 2, label: 'Mantı' }]);

    snapshot!.history[0].choices.p2 = 5;
    expect(state.randevuRuleti!.history[0].choices.p2).toBe(2);
  });

  it('iki oyuncunun ham secimlerini yalniz reveal ve match_end fazinda acar', () => {
    const state = stateForGame('randevu_reveal');
    const reveal = priorReveal();
    state.randevuRuleti!.picks = { p1: 0, p2: 2 };
    state.randevuRuleti!.reveal = reveal;
    state.randevuRuleti!.history = [reveal];
    expect(toRandevuRuletiSnapshot(state, 'p1')?.reveal).toEqual(reveal);
    state.phase = 'match_end';
    expect(toRandevuRuletiSnapshot(state, 'p2')?.reveal).toEqual(reveal);
  });
});

describe('Randevu Ruleti — sunucu durum makinesi', () => {
  it('maci uc kategoride kurar ve countdown sonrasi 12 saniyelik secimi acar', async () => {
    const state = stateForGame('lobby');
    const h = harness();
    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.randevuRuleti?.rounds.map((round) => round.category)).toEqual(['yemek', 'etkinlik', 'tatli']);
    expect(state.randevuRuleti?.rounds.every((round) => round.choices.length === 6)).toBe(true);
    expect(state.randevuRuleti?.plan).toEqual([]);

    await startRound(h.ctx, state);
    expect(state.phase).toBe('randevu_secim');
    expect(state.deadline).toBeGreaterThan(Date.now());
  });

  it('phase, deadline, stale round ve ilk aksiyon kilidini uygular', async () => {
    const state = stateForGame();
    const h = harness();
    const [p1, p2] = state.players;
    await onPick(h.ctx, state, p1, 1, 2);
    expect(state.randevuRuleti?.picks).toEqual({});
    await onPick(h.ctx, state, p1, 1, 1);
    await onPick(h.ctx, state, p1, 5, 1);
    expect(state.randevuRuleti?.picks).toEqual({ p1: 1 });

    state.deadline = Date.now() - 1;
    await onPick(h.ctx, state, p2, 3, 1);
    expect(state.randevuRuleti?.picks).toEqual({ p1: 1 });
    await onPickDeadline(h.ctx, state);
    expect(state.phase).toBe('randevu_reveal');
    expect(state.randevuRuleti?.reveal?.resolution).toBe('single');
    expect(state.randevuRuleti?.reveal?.choices).toEqual({ p1: 1, p2: null });
  });

  it('iki secimden sonra tek reveal/plan yazar; gecikmis alarm idempotent kalir', async () => {
    const state = stateForGame();
    const h = harness();
    const [p1, p2] = state.players;
    await onPick(h.ctx, state, p1, 1, 1);
    await onPick(h.ctx, state, p2, 4, 1);
    expect(state.phase).toBe('randevu_reveal');
    expect(state.randevuRuleti?.reveal?.resolution).toBe('roulette');
    expect([1, 4]).toContain(state.randevuRuleti?.reveal?.selectedChoice);
    expect(state.randevuRuleti?.plan).toHaveLength(1);
    expect(state.randevuRuleti?.history).toHaveLength(1);
    const saves = h.saves;

    await onPickDeadline(h.ctx, state);
    expect(state.randevuRuleti?.plan).toHaveLength(1);
    expect(state.randevuRuleti?.history).toHaveLength(1);
    expect(h.saves).toBe(saves);
  });

  it('iki taraf da timeout olunca bile guvenli fallback ile turu tamamlar', async () => {
    const state = stateForGame();
    const h = harness();
    await onPickDeadline(h.ctx, state);
    expect(state.phase).toBe('randevu_reveal');
    expect(state.randevuRuleti?.reveal?.choices).toEqual({ p1: null, p2: null });
    expect(state.randevuRuleti?.reveal?.resolution).toBe('fallback');
    expect(state.randevuRuleti?.reveal?.selectedChoice).toBeGreaterThanOrEqual(0);
    expect(state.randevuRuleti?.reveal?.selectedChoice).toBeLessThan(6);
    expect(state.randevuRuleti?.plan).toHaveLength(1);
  });

  it('uc kategoriyi tam plan/history olarak bitirir ve match sayisini korur', async () => {
    const state = stateForGame();
    const h = harness();
    const [p1, p2] = state.players;

    for (let round = 1; round <= 3; round += 1) {
      const choice = round;
      await onPick(h.ctx, state, p1, choice, round);
      await onPick(h.ctx, state, p2, choice, round);
      expect(state.phase).toBe('randevu_reveal');
      await onRevealDone(h.ctx, state);
    }

    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.randevuRuleti?.matches).toBe(3);
    expect(state.randevuRuleti?.plan.map((item) => item.category)).toEqual(['yemek', 'etkinlik', 'tatli']);
    expect(state.randevuRuleti?.plan.map((item) => item.choice)).toEqual([1, 2, 3]);
    expect(state.randevuRuleti?.history).toHaveLength(3);
    expect(state.randevuRuleti?.history.every((reveal) => reveal.resolution === 'match')).toBe(true);
    expect(state.players.map((entry) => entry.score)).toEqual([3, 3]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 3, p2: 3 },
      word: null,
    });
  });

  it('rovans baslangicinda onceki plan/history/match durumunu temizler', async () => {
    const state = stateForGame('match_end');
    state.randevuRuleti!.matches = 1;
    state.randevuRuleti!.plan = [{ category: 'yemek', choice: 2, label: 'Mantı' }];
    state.randevuRuleti!.history = [priorReveal()];
    state.randevuRuleti!.reveal = priorReveal();
    const h = harness();

    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.randevuRuleti?.matches).toBe(0);
    expect(state.randevuRuleti?.plan).toEqual([]);
    expect(state.randevuRuleti?.history).toEqual([]);
    expect(state.randevuRuleti?.reveal).toBeNull();
  });
});
