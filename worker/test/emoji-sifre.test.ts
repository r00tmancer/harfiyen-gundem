import { describe, expect, it } from 'vitest';
import {
  EMOJI_SIFRE_PALETTE,
  EMOJI_SIFRE_ROUNDS,
} from '@harfiyen/shared';
import type {
  EmojiSifreCode,
  EmojiSifreReveal,
  ServerMsg,
} from '@harfiyen/shared';
import {
  isEmojiSifreCode,
  onCode,
  onCodeDeadline,
  onGuess,
  onGuessDeadline,
  onRevealDone,
  selectEmojiSifreRounds,
  startEncode,
  startMatch,
  toEmojiSifreBank,
  toEmojiSifreSnapshot,
} from '../src/game/modes/emoji-sifre';
import type {
  EmojiSifreServerRound,
  PlayerState,
  RoomCtx,
  RoomState,
} from '../src/game/state';
import bankJson from '../src/data/emoji-sifre.json';

const ROUNDS: EmojiSifreServerRound[] = [
  {
    target: 'İlk buluşma',
    options: ['İlk buluşma', 'Film gecesi', 'Kahve molası', 'Yolculuk'],
    correctChoice: 0,
    fallback: [0, 0, 0],
  },
  {
    target: 'Sarılmak',
    options: ['Barışmak', 'Sarılmak', 'Özlemek', 'Uyumak'],
    correctChoice: 1,
    fallback: [4, 4, 1],
  },
  {
    target: 'Oyun gecesi',
    options: ['Film gecesi', 'Birlikte dans', 'Oyun gecesi', 'Uzay mutfağı'],
    correctChoice: 2,
    fallback: [12, 6, 0],
  },
  {
    target: 'Dondurma kaçamağı',
    options: ['Kahve molası', 'Pizza gecesi', 'Birlikte yemek', 'Dondurma kaçamağı'],
    correctChoice: 3,
    fallback: [21, 0, 4],
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

function stateForGame(phase: RoomState['phase'] = 'emoji_sifre_encode'): RoomState {
  return {
    code: 'EMOJI4',
    mode: 'emoji_sifre',
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
    randevuRuleti: null,
    emojiSifre: {
      rounds: ROUNDS.map((round) => ({
        ...round,
        options: [...round.options],
        fallback: [...round.fallback],
      })),
      roundIndex: 0,
      code: null,
      codeFallback: false,
      guess: null,
      correctCount: 0,
      history: [],
      reveal: null,
    },
    kirmiziYesil: null,
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

function revealForRound(roundIndex = 0): EmojiSifreReveal {
  const round = ROUNDS[roundIndex];
  const encoder = roundIndex % 2 === 0 ? 'p1' : 'p2';
  const decoder = roundIndex % 2 === 0 ? 'p2' : 'p1';
  return {
    round: roundIndex + 1,
    encoder,
    decoder,
    target: round.target,
    options: [...round.options],
    code: [...round.fallback],
    guess: round.correctChoice,
    correctChoice: round.correctChoice,
    correct: true,
    codeFallback: false,
  };
}

describe('Emoji Sifre — curated banka ve guvenli secim', () => {
  it('yalniz dort benzersiz etiket ve gecerli fallback indeksli kayitlari kabul eder', () => {
    const bank = toEmojiSifreBank([
      { target: '  İlk buluşma ', distractors: [' Film ', 'Kahve', 'Yol'], fallback: [0, 0, 23] },
      { target: 'ilk buluşma', distractors: ['A', 'B', 'C'], fallback: [1, 2, 3] },
      { target: 'Tekrar', distractors: ['A', 'a', 'C'], fallback: [1, 2, 3] },
      { target: 'Hedefle aynı', distractors: ['hedefle aynı', 'B', 'C'], fallback: [1, 2, 3] },
      { target: 'Eksik şık', distractors: ['A', 'B'], fallback: [1, 2, 3] },
      { target: 'Kötü eksi', distractors: ['A', 'B', 'C'], fallback: [-1, 2, 3] },
      { target: 'Kötü üst', distractors: ['A', 'B', 'C'], fallback: [1, 2, 24] },
      { target: 'Kötü kesir', distractors: ['A', 'B', 'C'], fallback: [1, 2.5, 3] },
      { target: 'Kötü uzunluk', distractors: ['A', 'B', 'C'], fallback: [1, 2] },
    ]);
    expect(bank).toEqual([
      {
        target: 'İlk buluşma',
        distractors: ['Film', 'Kahve', 'Yol'],
        fallback: [0, 0, 23],
      },
    ]);
  });

  it('uretim bankasinda en az yirmi temiz hedef ve tum palette indeksleri bulunur', () => {
    const bank = toEmojiSifreBank(bankJson);
    expect(bank.length).toBeGreaterThanOrEqual(20);
    expect(new Set(bank.map((entry) => entry.target.toLocaleLowerCase('tr-TR'))).size).toBe(bank.length);
    for (const entry of bank) {
      expect(entry.fallback).toHaveLength(3);
      for (const index of entry.fallback) {
        expect(EMOJI_SIFRE_PALETTE[index]).toBeTypeOf('string');
      }
    }
    expect(bank.some((entry) => entry.target === 'Uzay mutfağı')).toBe(true);
  });

  it('kod allowlisti [0,0,0] tekrarini kabul eder; sekil ve indeks disini reddeder', () => {
    expect(isEmojiSifreCode([0, 0, 0])).toBe(true);
    expect(isEmojiSifreCode([23, 12, 0])).toBe(true);
    expect(isEmojiSifreCode([0, 1])).toBe(false);
    expect(isEmojiSifreCode([0, 1, 24])).toBe(false);
    expect(isEmojiSifreCode([0, 1.5, 2])).toBe(false);
  });

  it('dort kaydi tekrarsiz secer, secenekleri guvenli karistirir ve targetChoice=0 degerini korur', () => {
    const bank = toEmojiSifreBank(bankJson).slice(0, 6);
    const rounds = selectEmojiSifreRounds(bank, EMOJI_SIFRE_ROUNDS, (length) => length - 1);
    expect(rounds).toHaveLength(4);
    expect(new Set(rounds.map((round) => round.target)).size).toBe(4);
    expect(rounds.every((round) => round.correctChoice === 0)).toBe(true);
    for (const round of rounds) {
      expect(round.options[round.correctChoice]).toBe(round.target);
      expect(new Set(round.options).size).toBe(4);
    }

    rounds[0].options[0] = 'Değişti';
    rounds[0].fallback[0] = 1;
    expect(bank.some((entry) => entry.target === 'Değişti')).toBe(false);
    expect(bank.every((entry) => entry.fallback[0] !== 1 || entry.target !== rounds[0].target)).toBe(true);
  });

  it('bozuk randomIndex sonucunu sessizce kullanmak yerine reddeder', () => {
    const bank = toEmojiSifreBank(bankJson).slice(0, 4);
    expect(() => selectEmojiSifreRounds(bank, 4, (length) => length)).toThrow(RangeError);
    expect(selectEmojiSifreRounds(bank, 5, () => 0)).toEqual([]);
  });
});

describe('Emoji Sifre — recipient snapshot ve reconnect gizliligi', () => {
  it('encode fazinda decoder hedef/options/code gormez; encoder [0,0,0] kodunu korur', () => {
    const state = stateForGame();
    state.emojiSifre!.code = [0, 0, 0];

    expect(toEmojiSifreSnapshot(state, 'p1')).toMatchObject({
      role: 'encoder',
      target: 'İlk buluşma',
      options: null,
      code: [0, 0, 0],
      codeLocked: true,
      myGuess: null,
    });
    expect(toEmojiSifreSnapshot(state, 'p2')).toMatchObject({
      role: 'decoder',
      target: null,
      options: null,
      code: null,
      codeLocked: true,
      myGuess: null,
    });
  });

  it('guess fazinda decoder code+options+guess=0 gorur; encoder hedef+code gorup tahmini gormez', () => {
    const state = stateForGame('emoji_sifre_guess');
    state.emojiSifre!.code = [0, 0, 0];
    state.emojiSifre!.guess = 0;

    const decoder = toEmojiSifreSnapshot(state, 'p2');
    expect(decoder).toMatchObject({
      role: 'decoder',
      target: null,
      options: ROUNDS[0].options,
      code: [0, 0, 0],
      guessLocked: true,
      myGuess: 0,
    });
    expect(decoder).not.toHaveProperty('correctChoice');

    const encoder = toEmojiSifreSnapshot(state, 'p1');
    expect(encoder).toMatchObject({
      role: 'encoder',
      target: ROUNDS[0].target,
      options: null,
      code: [0, 0, 0],
      guessLocked: true,
      myGuess: null,
    });
    expect(encoder).not.toHaveProperty('guess');
  });

  it('roller oyuncu sirasina gore her tur degisir ve onceki history reconnectte kalir', () => {
    const state = stateForGame('emoji_sifre_guess');
    const prior = revealForRound(0);
    state.emojiSifre!.roundIndex = 1;
    state.round = 2;
    state.emojiSifre!.code = [23, 22, 1];
    state.emojiSifre!.history = [prior];

    const p2 = toEmojiSifreSnapshot(state, 'p2');
    expect(p2).toMatchObject({
      round: 2,
      encoder: 'p2',
      decoder: 'p1',
      role: 'encoder',
      target: 'Sarılmak',
      options: null,
      code: [23, 22, 1],
      correctCount: 0,
    });
    expect(p2?.history).toEqual([prior]);

    p2!.history[0].code[0] = 9;
    p2!.history[0].options[0] = 'Değişti';
    expect(state.emojiSifre!.history[0].code[0]).toBe(prior.code[0]);
    expect(state.emojiSifre!.history[0].options[0]).toBe(prior.options[0]);
  });

  it('hedef, tum secenekler ve ham tahmini yalniz reveal/match_end fazinda ortak acar', () => {
    const state = stateForGame('emoji_sifre_reveal');
    const reveal = revealForRound(0);
    state.emojiSifre!.code = [...reveal.code];
    state.emojiSifre!.guess = reveal.guess;
    state.emojiSifre!.history = [reveal];
    state.emojiSifre!.reveal = reveal;

    for (const pid of ['p1', 'p2']) {
      expect(toEmojiSifreSnapshot(state, pid)).toMatchObject({
        target: reveal.target,
        options: reveal.options,
        code: reveal.code,
        reveal,
      });
    }
    state.phase = 'match_end';
    expect(toEmojiSifreSnapshot(state, 'p2')?.reveal).toEqual(reveal);
  });
});

describe('Emoji Sifre — sunucu durum makinesi ve alarm guvenligi', () => {
  it('maci dort benzersiz hedefle kurar ve countdown sonrasi 18 saniyelik encode acar', async () => {
    const state = stateForGame('lobby');
    const h = harness();

    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.emojiSifre?.rounds).toHaveLength(4);
    expect(new Set(state.emojiSifre?.rounds.map((round) => round.target)).size).toBe(4);
    expect(state.emojiSifre?.rounds.every((round) => round.options[round.correctChoice] === round.target)).toBe(true);

    await startEncode(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_encode');
    expect(state.deadline).toBeGreaterThan(Date.now());
    expect(state.emojiSifre?.code).toBeNull();
  });

  it('yalniz encoderin zamaninda/stale olmayan ilk kodunu kabul eder ve tekrarli sifiri korur', async () => {
    const state = stateForGame();
    const h = harness();
    const [encoder, decoder] = state.players;

    await onCode(h.ctx, state, decoder, [1, 2, 3], 1);
    await onCode(h.ctx, state, encoder, [1, 2, 3], 2);
    await onCode(h.ctx, state, encoder, [-1, 0, 1] as EmojiSifreCode, 1);
    expect(state.emojiSifre?.code).toBeNull();

    await onCode(h.ctx, state, encoder, [0, 0, 0], 1);
    expect(state.phase).toBe('emoji_sifre_guess');
    expect(state.emojiSifre?.code).toEqual([0, 0, 0]);
    expect(state.emojiSifre?.codeFallback).toBe(false);
    const saves = h.saves;
    await onCode(h.ctx, state, encoder, [9, 9, 9], 1);
    expect(state.emojiSifre?.code).toEqual([0, 0, 0]);
    expect(h.saves).toBe(saves);

    const late = stateForGame();
    late.deadline = Date.now() - 1;
    await onCode(h.ctx, late, late.players[0], [1, 2, 3], 1);
    expect(late.emojiSifre?.code).toBeNull();
  });

  it('decoderin targetChoice=0 tahminini null saymaz; encoder/stale/duplicate hamleyi reddeder', async () => {
    const state = stateForGame('emoji_sifre_guess');
    const h = harness();
    state.emojiSifre!.code = [0, 0, 0];
    const [encoder, decoder] = state.players;

    await onGuess(h.ctx, state, encoder, 0, 1);
    await onGuess(h.ctx, state, decoder, 0, 2);
    expect(state.emojiSifre?.guess).toBeNull();
    await onGuess(h.ctx, state, decoder, 0, 1);

    expect(state.phase).toBe('emoji_sifre_reveal');
    expect(state.emojiSifre?.guess).toBe(0);
    expect(state.emojiSifre?.reveal).toMatchObject({ guess: 0, correctChoice: 0, correct: true });
    expect(state.emojiSifre?.correctCount).toBe(1);
    expect(state.players.map((entry) => entry.score)).toEqual([1, 1]);
    const history = state.emojiSifre!.history.length;
    await onGuess(h.ctx, state, decoder, 1, 1);
    expect(state.emojiSifre?.history).toHaveLength(history);
  });

  it('encode timeout fallbacki guess fazina tasir ama dogru tahminde ortak puan yazmaz', async () => {
    const state = stateForGame();
    const h = harness();
    state.deadline = Date.now() - 1;

    await onCodeDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_guess');
    expect(state.emojiSifre?.code).toEqual([0, 0, 0]);
    expect(state.emojiSifre?.codeFallback).toBe(true);

    await onGuess(h.ctx, state, state.players[1], 0, 1);
    expect(state.phase).toBe('emoji_sifre_reveal');
    expect(state.emojiSifre?.reveal).toMatchObject({
      guess: 0,
      correctChoice: 0,
      correct: false,
      codeFallback: true,
    });
    expect(state.emojiSifre?.correctCount).toBe(0);
    expect(state.players.map((entry) => entry.score)).toEqual([0, 0]);
  });

  it('guess timeout tahmini null ve yanlis reveal eder', async () => {
    const state = stateForGame('emoji_sifre_guess');
    const h = harness();
    state.emojiSifre!.code = [4, 8, 1];
    state.deadline = Date.now() - 1;

    await onGuessDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_reveal');
    expect(state.emojiSifre?.reveal).toMatchObject({ guess: null, correct: false, codeFallback: false });
    expect(state.emojiSifre?.correctCount).toBe(0);
  });

  it('erken/retry alarmini ayni deadlinea kurar; encode, guess ve reveal fazlarini erken bitirmez', async () => {
    const state = stateForGame();
    const h = harness();
    state.alarmPurpose = null;
    const encodeDeadline = state.deadline!;

    await onCodeDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_encode');
    expect(state.emojiSifre?.code).toBeNull();
    expect(state.alarmPurpose).toBe('phase');
    expect(h.alarms.at(-1)).toBe(encodeDeadline);

    state.deadline = Date.now() - 1;
    await onCodeDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_guess');
    const guessDeadline = state.deadline!;

    // Gecikmis encode alarmi GameRoom tarafindan mevcut guess fazina yonlenir.
    state.alarmPurpose = null;
    await onGuessDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_guess');
    expect(h.alarms.at(-1)).toBe(guessDeadline);

    state.deadline = Date.now() - 1;
    await onGuessDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_reveal');
    const revealDeadline = state.deadline!;

    state.alarmPurpose = null;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_reveal');
    expect(h.alarms.at(-1)).toBe(revealDeadline);

    state.deadline = Date.now() - 1;
    await onRevealDone(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_encode');
    expect(state.emojiSifre?.roundIndex).toBe(1);

    // Eski reveal retry'si yeni turun encode fazina yonlense bile fallback yazamaz.
    const newEncodeDeadline = state.deadline!;
    state.alarmPurpose = null;
    await onCodeDeadline(h.ctx, state);
    expect(state.phase).toBe('emoji_sifre_encode');
    expect(state.emojiSifre?.code).toBeNull();
    expect(h.alarms.at(-1)).toBe(newEncodeDeadline);
  });

  it('dort turda rolleri sirayla degistirir, ortak skoru/historyyi kalici tutar ve winner null bitirir', async () => {
    const state = stateForGame();
    const h = harness();

    for (let index = 0; index < EMOJI_SIFRE_ROUNDS; index += 1) {
      const game = state.emojiSifre!;
      const round = game.rounds[index];
      const encoder = state.players[index % 2];
      const decoder = state.players[(index + 1) % 2];
      const code: EmojiSifreCode = [index, index, index];
      await onCode(h.ctx, state, encoder, code, index + 1);
      const choice = index < 3 ? round.correctChoice : (round.correctChoice + 1) % 4;
      await onGuess(h.ctx, state, decoder, choice, index + 1);

      expect(state.phase).toBe('emoji_sifre_reveal');
      expect(game.history.at(-1)).toMatchObject({
        encoder: encoder.id,
        decoder: decoder.id,
        code,
      });
      state.deadline = Date.now() - 1;
      await onRevealDone(h.ctx, state);
    }

    expect(state.phase).toBe('match_end');
    expect(state.winner).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.alarmPurpose).toBeNull();
    expect(state.emojiSifre?.correctCount).toBe(3);
    expect(state.emojiSifre?.history).toHaveLength(4);
    expect(state.emojiSifre?.history.map((entry) => entry.encoder)).toEqual(['p1', 'p2', 'p1', 'p2']);
    expect(state.players.map((entry) => entry.score)).toEqual([3, 3]);
    expect(h.alarmDeletes).toBe(1);
    expect(h.messages.at(-1)).toEqual({
      t: 'match_end',
      winner: null,
      scores: { p1: 3, p2: 3 },
      word: null,
    });

    const savesAfterFinish = h.saves;
    const messagesAfterFinish = h.messages.length;
    await onRevealDone(h.ctx, state); // ayni alarm retry'si match_end'i tekrar yazamaz
    expect(h.saves).toBe(savesAfterFinish);
    expect(h.messages).toHaveLength(messagesAfterFinish);
    expect(state.emojiSifre?.history).toHaveLength(4);
  });

  it('rovans baslangicinda onceki code/guess/history/skoru temizleyip taze hedefler kurar', async () => {
    const state = stateForGame('match_end');
    const reveal = revealForRound();
    state.emojiSifre!.code = [...reveal.code];
    state.emojiSifre!.guess = 0;
    state.emojiSifre!.correctCount = 1;
    state.emojiSifre!.history = [reveal];
    state.emojiSifre!.reveal = reveal;
    const h = harness();

    await startMatch(h.ctx, state);
    expect(state.phase).toBe('countdown');
    expect(state.emojiSifre).toMatchObject({
      roundIndex: 0,
      code: null,
      codeFallback: false,
      guess: null,
      correctCount: 0,
      history: [],
      reveal: null,
    });
  });
});
