// Ayni Anda Soyle: iki oyuncu bes kisa kategoride cevaplarini gizlice
// kilitler. Ham cevaplar yalniz aktif reveal boyunca gorunur; gecmis ve final
// Durable Object durumunda kullanici girdisi biriktirilmez.
import {
  AYNI_ANDA_SOYLE_ANSWER_MS,
  AYNI_ANDA_SOYLE_REVEAL_MS,
  AYNI_ANDA_SOYLE_ROUNDS,
  COUNTDOWN_MS,
  ayniAndaSoyleAnswerKey,
  normalizeAyniAndaSoyleAnswer,
} from '@harfiyen/shared';
import type {
  AyniAndaSoylePrompt,
  AyniAndaSoyleResolution,
  AyniAndaSoyleReveal,
  AyniAndaSoyleState,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import { secureRandomIndex } from './randevu-ruleti';

export const AYNI_ANDA_SOYLE_PROMPT_BANK = [
  { category: 'yemek', prompt: 'Şu an ikinizin de canı hangi yemeği çekiyor?' },
  { category: 'icecek', prompt: 'Bu geceye tek bir içecek seçin.' },
  { category: 'tatli', prompt: 'Birlikte sipariş edeceğiniz tatlı ne?' },
  { category: 'sehir', prompt: 'Şimdi ışınlanabileceğiniz bir şehir yazın.' },
  { category: 'film_dizi', prompt: 'Bu gece açacağınız film ya da dizi ne?' },
  { category: 'hayvan', prompt: 'İkinizi anlatan bir hayvan seçin.' },
  { category: 'renk', prompt: 'İlişkinizin rengi ne?' },
  { category: 'tatil', prompt: 'Hayalinizdeki tatil için tek bir yer yazın.' },
  { category: 'sarki', prompt: 'Şu an dinlemek istediğiniz şarkı hangisi?' },
  { category: 'super_guc', prompt: 'Birlikte kullanacağınız süper güç ne?' },
  { category: 'aktivite', prompt: 'Yarın birlikte yapacağınız bir şey yazın.' },
  { category: 'gece_atistirmasi', prompt: 'Gece atıştırmalığı olarak ne seçersiniz?' },
] as const satisfies readonly AyniAndaSoylePrompt[];

export type RandomIndex = (length: number) => number;

function checkedRandomIndex(length: number, randomIndex: RandomIndex): number {
  const index = randomIndex(length);
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError('random index returned an out-of-range value');
  }
  return index;
}

// Banka once klonlanir, sonra Web Crypto tabanli Fisher-Yates ile karistirilir.
// Eksik/tekrarlı banka sessizce fallback prompt uretmez; mac baslatilmaz.
export function selectAyniAndaSoylePrompts(
  bank: readonly AyniAndaSoylePrompt[],
  randomIndex: RandomIndex,
): AyniAndaSoylePrompt[] {
  if (bank.length < AYNI_ANDA_SOYLE_ROUNDS) return [];
  const categories = new Set(bank.map((entry) => entry.category));
  const prompts = new Set(bank.map((entry) => entry.prompt.toLocaleLowerCase('tr-TR')));
  if (categories.size !== bank.length || prompts.size !== bank.length) return [];
  const deck = bank.map((entry) => ({ category: entry.category, prompt: entry.prompt }));
  for (let end = deck.length - 1; end > 0; end -= 1) {
    const index = checkedRandomIndex(end + 1, randomIndex);
    [deck[end], deck[index]] = [deck[index], deck[end]];
  }
  return deck.slice(0, AYNI_ANDA_SOYLE_ROUNDS);
}

export interface AyniAndaSoyleEvaluation {
  answers: Record<string, string | null>;
  match: boolean;
  joint: boolean;
  resolution: AyniAndaSoyleResolution;
}

export function evaluateAyniAndaSoyleRound(
  pids: readonly [string, string],
  answers: Readonly<Record<string, string>>,
): AyniAndaSoyleEvaluation {
  const [first, second] = pids;
  const firstAnswer = answers[first] ?? null;
  const secondAnswer = answers[second] ?? null;
  const joint = firstAnswer !== null && secondAnswer !== null;
  const match = joint && ayniAndaSoyleAnswerKey(firstAnswer) === ayniAndaSoyleAnswerKey(secondAnswer);
  const resolution: AyniAndaSoyleResolution = match
    ? 'match'
    : joint
      ? 'different'
      : firstAnswer !== null || secondAnswer !== null
        ? 'solo'
        : 'skipped';
  return {
    answers: { [first]: firstAnswer, [second]: secondAnswer },
    match,
    joint,
    resolution,
  };
}

function cloneReveal(reveal: AyniAndaSoyleReveal): AyniAndaSoyleReveal {
  return { ...reveal, answers: { ...reveal.answers } };
}

function currentPrompt(state: RoomState): AyniAndaSoylePrompt | undefined {
  const game = state.ayniAndaSoyle;
  return game?.prompts[game.roundIndex];
}

export function toAyniAndaSoyleSnapshot(state: RoomState, you: string): AyniAndaSoyleState | null {
  const game = state.ayniAndaSoyle;
  const visible =
    state.mode === 'ayni_anda_soyle' &&
    (state.phase === 'ayni_anda_soyle_answer' ||
      state.phase === 'ayni_anda_soyle_reveal' ||
      state.phase === 'match_end');
  if (!game || !visible) return null;
  const player = state.players.find((candidate) => candidate.id === you);
  const opponent = state.players.find((candidate) => candidate.id !== you);
  if (!player || !opponent) return null;
  const final = state.phase === 'match_end';
  const prompt = final ? null : currentPrompt(state);
  if (!final && !prompt) return null;
  const answerPhase = state.phase === 'ayni_anda_soyle_answer';
  const revealVisible = state.phase === 'ayni_anda_soyle_reveal';
  return {
    round: final ? AYNI_ANDA_SOYLE_ROUNDS : game.roundIndex + 1,
    category: prompt?.category ?? null,
    prompt: prompt?.prompt ?? null,
    myLocked: answerPhase && game.answers[you] !== undefined,
    opponentLocked: answerPhase && game.answers[opponent.id] !== undefined,
    myAnswer: answerPhase ? game.answers[you] ?? null : null,
    matches: game.matches,
    jointRounds: game.jointRounds,
    differentRounds: game.differentRounds,
    missedRounds: game.missedRounds,
    matchRate: game.matchRate,
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
  };
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

// GameRoom alarmPurpose'i dispatch oncesi temizler. Onceki turun gecikmis
// retry alarmi yeni turun deadline'ini erken kapatamaz.
async function rescheduleIfEarly(ctx: RoomCtx, state: RoomState): Promise<boolean> {
  if (state.deadline === null || Date.now() >= state.deadline) return false;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  return true;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.players.length !== 2) return;
  const prompts = selectAyniAndaSoylePrompts(AYNI_ANDA_SOYLE_PROMPT_BANK, secureRandomIndex);
  if (prompts.length !== AYNI_ANDA_SOYLE_ROUNDS) return;
  state.ayniAndaSoyle = {
    prompts,
    roundIndex: 0,
    answers: {},
    matches: 0,
    jointRounds: 0,
    differentRounds: 0,
    missedRounds: 0,
    matchRate: null,
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
  state.emojiSifre = null;
  state.kirmiziYesil = null;
  state.kimDahaMuhtemel = null;
  state.ikiDogruBirYalan = null;
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startAnswer(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ayniAndaSoyle;
  if (!game || !currentPrompt(state)) return;
  if (state.phase !== 'countdown' && state.phase !== 'ayni_anda_soyle_reveal') return;
  game.answers = {};
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'ayni_anda_soyle_answer';
  state.deadline = Date.now() + AYNI_ANDA_SOYLE_ANSWER_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onAnswer(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  answer: string,
  round: number,
): Promise<void> {
  const game = state.ayniAndaSoyle;
  if (state.phase !== 'ayni_anda_soyle_answer' || !game || !currentPrompt(state)) return;
  if (!state.players.some((candidate) => candidate.id === player.id)) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (game.answers[player.id] !== undefined) return;
  const clean = normalizeAyniAndaSoyleAnswer(answer);
  if (!clean) return;
  game.answers[player.id] = clean;
  if (state.players.length === 2 && state.players.every((candidate) => game.answers[candidate.id] !== undefined)) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onAnswerDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'ayni_anda_soyle_answer' || !state.ayniAndaSoyle || !currentPrompt(state)) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ayniAndaSoyle;
  const prompt = currentPrompt(state);
  const [first, second] = state.players;
  if (state.phase !== 'ayni_anda_soyle_answer' || !game || !prompt || !first || !second) return;
  const result = evaluateAyniAndaSoyleRound([first.id, second.id], game.answers);
  if (result.joint) {
    game.jointRounds += 1;
    if (result.match) game.matches += 1;
    else game.differentRounds += 1;
  } else {
    game.missedRounds += 1;
  }
  game.matchRate = game.jointRounds === 0
    ? null
    : Math.round((game.matches * 100) / game.jointRounds);
  for (const candidate of state.players) candidate.score = game.matches;
  const revealed: AyniAndaSoyleReveal = {
    round: game.roundIndex + 1,
    category: prompt.category,
    prompt: prompt.prompt,
    answers: { ...result.answers },
    match: result.match,
    resolution: result.resolution,
  };
  game.reveal = cloneReveal(revealed);
  state.phase = 'ayni_anda_soyle_reveal';
  state.deadline = Date.now() + AYNI_ANDA_SOYLE_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ayniAndaSoyle;
  if (state.phase !== 'ayni_anda_soyle_reveal' || !game || !game.reveal) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.roundIndex >= AYNI_ANDA_SOYLE_ROUNDS - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startAnswer(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ayniAndaSoyle;
  if (!game) return;
  // Final kalici durum yalniz aggregate metriklerdir. Promptlar statik olsa da
  // final snapshot'i dar tutmak icin, tum ham cevaplarla birlikte scrub edilir.
  game.prompts = [];
  game.answers = {};
  game.reveal = null;
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
