// Emoji Sifre: oyuncular sabit katilim sirasina gore dort tur boyunca kodlayici
// ve cozucu rollerini degistirir. Hedef, secenekler, kod ve tahmin yalniz ilgili
// recipient'a acilir; tamamlanan reveal/history reconnect icin kalici tutulur.
import {
  COUNTDOWN_MS,
  EMOJI_SIFRE_CODE_COUNT,
  EMOJI_SIFRE_CODE_MS,
  EMOJI_SIFRE_GUESS_MS,
  EMOJI_SIFRE_OPTION_COUNT,
  EMOJI_SIFRE_PALETTE,
  EMOJI_SIFRE_REVEAL_MS,
  EMOJI_SIFRE_ROUNDS,
} from '@harfiyen/shared';
import type {
  EmojiSifreCode,
  EmojiSifreOptions,
  EmojiSifreReveal,
  EmojiSifreRole,
  EmojiSifreState,
} from '@harfiyen/shared';
import type {
  EmojiSifreServerRound,
  PlayerState,
  RoomCtx,
  RoomState,
} from '../state';
import { secureRandomIndex } from './randevu-ruleti';
import bankJson from '../../data/emoji-sifre.json';

const MAX_LABEL_LENGTH = 40;

export interface EmojiSifreBankEntry {
  target: string;
  distractors: [string, string, string];
  fallback: EmojiSifreCode;
}

export type RandomIndex = (length: number) => number;

function normalizedLabel(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

function toCode(values: readonly number[]): EmojiSifreCode {
  return [values[0], values[1], values[2]];
}

function toOptions(values: readonly string[]): EmojiSifreOptions {
  return [values[0], values[1], values[2], values[3]];
}

function isPaletteIndex(value: unknown, paletteLength: number): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value < paletteLength;
}

export function isEmojiSifreCode(value: unknown): value is EmojiSifreCode {
  return (
    Array.isArray(value) &&
    value.length === EMOJI_SIFRE_CODE_COUNT &&
    value.every((entry) => isPaletteIndex(entry, EMOJI_SIFRE_PALETTE.length))
  );
}

// Banka, runtime'a tasinmadan once tam sekil ve indeks allowlist'i ile temizlenir.
// Ayni emoji kodda tekrar edebilir; fakat hedef ve uc yanlis secenek benzersizdir.
export function toEmojiSifreBank(
  data: unknown,
  paletteLength = EMOJI_SIFRE_PALETTE.length,
): EmojiSifreBankEntry[] {
  if (!Array.isArray(data) || !Number.isInteger(paletteLength) || paletteLength < 1) return [];
  const bank: EmojiSifreBankEntry[] = [];
  const targets = new Set<string>();

  for (const raw of data) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const { target, distractors, fallback } = raw as {
      target?: unknown;
      distractors?: unknown;
      fallback?: unknown;
    };
    if (typeof target !== 'string') continue;
    const cleanTarget = target.trim();
    if (!cleanTarget || cleanTarget.length > MAX_LABEL_LENGTH) continue;
    if (!Array.isArray(distractors) || distractors.length !== EMOJI_SIFRE_OPTION_COUNT - 1) continue;
    if (!distractors.every((entry) => typeof entry === 'string')) continue;
    const cleanDistractors = (distractors as string[]).map((entry) => entry.trim());
    if (cleanDistractors.some((entry) => !entry || entry.length > MAX_LABEL_LENGTH)) continue;
    const labels = [cleanTarget, ...cleanDistractors];
    if (new Set(labels.map(normalizedLabel)).size !== EMOJI_SIFRE_OPTION_COUNT) continue;
    if (!Array.isArray(fallback) || fallback.length !== EMOJI_SIFRE_CODE_COUNT) continue;
    if (!fallback.every((entry) => isPaletteIndex(entry, paletteLength))) continue;

    const targetKey = normalizedLabel(cleanTarget);
    if (targets.has(targetKey)) continue;
    targets.add(targetKey);
    bank.push({
      target: cleanTarget,
      distractors: [cleanDistractors[0], cleanDistractors[1], cleanDistractors[2]],
      fallback: toCode(fallback as number[]),
    });
  }
  return bank;
}

function checkedRandomIndex(length: number, randomIndex: RandomIndex): number {
  const index = randomIndex(length);
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError('random index returned an out-of-range value');
  }
  return index;
}

function shuffle<T>(values: T[], randomIndex: RandomIndex): void {
  for (let end = values.length - 1; end > 0; end -= 1) {
    const index = checkedRandomIndex(end + 1, randomIndex);
    [values[end], values[index]] = [values[index], values[end]];
  }
}

// Dort benzersiz banka kaydi ve her kayit icin ayri, bias'siz secenek sirasi.
// Fisher-Yates boyunca tum indeksler uretimde Web Crypto rejection sampling'den gelir.
export function selectEmojiSifreRounds(
  bank: readonly EmojiSifreBankEntry[],
  count: number,
  randomIndex: RandomIndex,
): EmojiSifreServerRound[] {
  if (!Number.isInteger(count) || count < 1 || count > bank.length) return [];
  const pool = bank.map((entry) => ({
    target: entry.target,
    distractors: [...entry.distractors] as [string, string, string],
    fallback: [...entry.fallback] as EmojiSifreCode,
  }));
  const selected: EmojiSifreServerRound[] = [];

  for (let position = 0; position < count; position += 1) {
    const swapWith = position + checkedRandomIndex(pool.length - position, randomIndex);
    [pool[position], pool[swapWith]] = [pool[swapWith], pool[position]];
    const entry = pool[position];
    const options = [entry.target, ...entry.distractors];
    shuffle(options, randomIndex);
    const correctChoice = options.indexOf(entry.target);
    selected.push({
      target: entry.target,
      options: toOptions(options),
      correctChoice,
      fallback: [...entry.fallback] as EmojiSifreCode,
    });
  }
  return selected;
}

function cloneReveal(reveal: EmojiSifreReveal): EmojiSifreReveal {
  return {
    ...reveal,
    options: [...reveal.options],
    code: [...reveal.code],
  };
}

function rolesFor(
  state: RoomState,
  roundIndex: number,
): { encoder: PlayerState; decoder: PlayerState } | null {
  const first = state.players[0];
  const second = state.players[1];
  if (!first || !second) return null;
  return roundIndex % 2 === 0
    ? { encoder: first, decoder: second }
    : { encoder: second, decoder: first };
}

// Tum gizli alanlar bu tek recipient projeksiyon kapisindan gecer.
export function toEmojiSifreSnapshot(state: RoomState, you: string): EmojiSifreState | null {
  const game = state.emojiSifre;
  const round = game?.rounds[game.roundIndex];
  const visible =
    state.mode === 'emoji_sifre' &&
    (state.phase === 'emoji_sifre_encode' ||
      state.phase === 'emoji_sifre_guess' ||
      state.phase === 'emoji_sifre_reveal' ||
      state.phase === 'match_end');
  if (!game || !round || !visible) return null;
  const roles = rolesFor(state, game.roundIndex);
  if (!roles) return null;
  let role: EmojiSifreRole;
  if (you === roles.encoder.id) role = 'encoder';
  else if (you === roles.decoder.id) role = 'decoder';
  else return null;

  const revealVisible = state.phase === 'emoji_sifre_reveal' || state.phase === 'match_end';
  const targetVisible = role === 'encoder' || revealVisible;
  const optionsVisible = (role === 'decoder' && state.phase === 'emoji_sifre_guess') || revealVisible;
  const codeVisible =
    (role === 'encoder' && state.phase === 'emoji_sifre_encode') ||
    state.phase === 'emoji_sifre_guess' ||
    revealVisible;

  return {
    round: game.roundIndex + 1,
    encoder: roles.encoder.id,
    decoder: roles.decoder.id,
    role,
    target: targetVisible ? round.target : null,
    options: optionsVisible ? [...round.options] : null,
    code: codeVisible && game.code ? [...game.code] : null,
    codeLocked: game.code !== null,
    guessLocked: game.guess !== null,
    myGuess: role === 'decoder' ? game.guess : null,
    correctCount: game.correctCount,
    history: game.history.map(cloneReveal),
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
  };
}

// ---- Sunucu akis durum makinesi ----

const BANK = toEmojiSifreBank(bankJson);

function currentRound(state: RoomState): EmojiSifreServerRound | undefined {
  const game = state.emojiSifre;
  return game?.rounds[game.roundIndex];
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

// Alarm retry'si yeni fazin daha ileri deadline'ina denk gelirse faz adi ayni
// olsa bile turu erken kapatmasin. GameRoom alarmPurpose'i dispatch oncesi
// temizledigi icin burada tekrar kurup tek aktif alarmi ayni tarihe yazariz.
async function rescheduleIfEarly(ctx: RoomCtx, state: RoomState): Promise<boolean> {
  if (state.deadline === null || Date.now() >= state.deadline) return false;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  return true;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const rounds = selectEmojiSifreRounds(BANK, EMOJI_SIFRE_ROUNDS, secureRandomIndex);
  if (rounds.length !== EMOJI_SIFRE_ROUNDS || !rolesFor(state, 0)) return;
  state.emojiSifre = {
    rounds,
    roundIndex: 0,
    code: null,
    codeFallback: false,
    guess: null,
    correctCount: 0,
    history: [],
    reveal: null,
  };
  state.round = 1;
  state.turn = null;
  state.letters = null;
  state.pending = null;
  state.winner = null;
  state.sayi = null;
  state.zincir = null;
  state.uzun = null;
  state.bom = null;
  state.telepati = null;
  state.korSiralama = null;
  state.beniYakala = null;
  state.randevuRuleti = null;
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startEncode(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.emojiSifre;
  if (!game || !currentRound(state) || !rolesFor(state, game.roundIndex)) return;
  if (state.phase !== 'countdown' && state.phase !== 'emoji_sifre_reveal') return;
  game.code = null;
  game.codeFallback = false;
  game.guess = null;
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'emoji_sifre_encode';
  state.deadline = Date.now() + EMOJI_SIFRE_CODE_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onCode(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  emojis: EmojiSifreCode,
  round: number,
): Promise<void> {
  const game = state.emojiSifre;
  if (state.phase !== 'emoji_sifre_encode' || !game || !currentRound(state)) return;
  const roles = rolesFor(state, game.roundIndex);
  if (!roles || player.id !== roles.encoder.id) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1 || game.code !== null) return;
  if (!isEmojiSifreCode(emojis)) return;
  game.code = [...emojis];
  game.codeFallback = false;
  await startGuess(ctx, state);
}

export async function onCodeDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.emojiSifre;
  const round = currentRound(state);
  if (state.phase !== 'emoji_sifre_encode' || !game || !round) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.code === null) {
    game.code = [...round.fallback];
    game.codeFallback = true;
  }
  await startGuess(ctx, state);
}

export async function startGuess(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.emojiSifre;
  if (state.phase !== 'emoji_sifre_encode' || !game || !currentRound(state) || game.code === null) return;
  game.guess = null;
  state.phase = 'emoji_sifre_guess';
  state.deadline = Date.now() + EMOJI_SIFRE_GUESS_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onGuess(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: number,
  round: number,
): Promise<void> {
  const game = state.emojiSifre;
  if (state.phase !== 'emoji_sifre_guess' || !game || !currentRound(state)) return;
  const roles = rolesFor(state, game.roundIndex);
  if (!roles || player.id !== roles.decoder.id) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1 || game.guess !== null) return;
  if (!Number.isInteger(choice) || choice < 0 || choice >= EMOJI_SIFRE_OPTION_COUNT) return;
  game.guess = choice;
  await reveal(ctx, state);
}

export async function onGuessDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'emoji_sifre_guess' || !state.emojiSifre || !currentRound(state)) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.emojiSifre;
  const round = currentRound(state);
  if (state.phase !== 'emoji_sifre_guess' || !game || !round || game.code === null) return;
  const roles = rolesFor(state, game.roundIndex);
  if (!roles) return;
  // Hazir fallback, cozucunun kodlayiciyi okudugunu kanitlamaz; tahmin dogru
  // gorunse bile ortak skor yalniz insan koduyla artar.
  const correct = !game.codeFallback && game.guess !== null && game.guess === round.correctChoice;
  if (correct) game.correctCount += 1;
  for (const player of state.players) player.score = game.correctCount;
  const revealed: EmojiSifreReveal = {
    round: game.roundIndex + 1,
    encoder: roles.encoder.id,
    decoder: roles.decoder.id,
    target: round.target,
    options: [...round.options],
    code: [...game.code],
    guess: game.guess,
    correctChoice: round.correctChoice,
    correct,
    codeFallback: game.codeFallback,
  };
  game.history.push(cloneReveal(revealed));
  game.reveal = cloneReveal(revealed);
  state.phase = 'emoji_sifre_reveal';
  state.deadline = Date.now() + EMOJI_SIFRE_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.emojiSifre;
  if (state.phase !== 'emoji_sifre_reveal' || !game || !game.reveal) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.roundIndex >= game.rounds.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startEncode(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  state.phase = 'match_end';
  state.winner = null;
  state.turn = null;
  state.deadline = null;
  state.alarmPurpose = null;
  await ctx.deleteAlarm();
  await ctx.save(state);
  ctx.broadcast({ t: 'match_end', winner: null, scores: ctx.scoresOf(state), word: null });
  ctx.broadcastSnapshot(state);
}
