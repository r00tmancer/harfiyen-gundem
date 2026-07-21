// Beni Yakala: her oyuncu once kendi tercihini gizlice kilitler, sonra
// partnerinin tercihini tahmin eder. Ham cevaplar/tahminler aktif fazlarda
// yalniz sunucu durumunda kalir; reveal projeksiyonu iki taraf da tahmin
// ettiginde veya sunucu alarmi sureyi bitirdiginde acilir.
import {
  BENI_YAKALA_ANSWER_MS,
  BENI_YAKALA_OPTION_COUNT,
  BENI_YAKALA_PREDICT_MS,
  BENI_YAKALA_REVEAL_MS,
  BENI_YAKALA_ROUNDS,
  COUNTDOWN_MS,
} from '@harfiyen/shared';
import type {
  BeniYakalaQuestion,
  BeniYakalaReveal,
  BeniYakalaState,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import bankJson from '../../data/beni-yakala.json';

const MAX_PROMPT_LENGTH = 120;
const MAX_OPTION_LENGTH = 48;

// ---- Saf mantik ----

export function toBeniYakalaBank(data: unknown): BeniYakalaQuestion[] {
  if (!Array.isArray(data)) return [];
  const bank: BeniYakalaQuestion[] = [];
  for (const raw of data) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const { prompt, options } = raw as { prompt?: unknown; options?: unknown };
    if (typeof prompt !== 'string') continue;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) continue;
    if (!Array.isArray(options) || options.length !== BENI_YAKALA_OPTION_COUNT) continue;
    if (!options.every((option) => typeof option === 'string')) continue;
    const clean = (options as string[]).map((option) => option.trim());
    if (clean.some((option) => !option || option.length > MAX_OPTION_LENGTH)) continue;
    const unique = new Set(clean.map((option) => option.toLocaleLowerCase('tr-TR')));
    if (unique.size !== BENI_YAKALA_OPTION_COUNT) continue;
    bank.push({
      prompt: cleanPrompt,
      options: [clean[0], clean[1], clean[2], clean[3]],
    });
  }
  return bank;
}

// Kismi Fisher-Yates: her mac/rovans icin tekrarsiz, taze bes soru.
export function pickBeniYakalaQuestions(
  bank: readonly BeniYakalaQuestion[],
  count: number,
  rand: () => number,
): BeniYakalaQuestion[] {
  const indices = bank.map((_, index) => index);
  const take = Math.max(0, Math.min(Math.floor(count), indices.length));
  for (let index = 0; index < take; index += 1) {
    const randomIndex = index + Math.floor(rand() * (indices.length - index));
    const bounded = Math.max(index, Math.min(indices.length - 1, randomIndex));
    [indices[index], indices[bounded]] = [indices[bounded], indices[index]];
  }
  return indices.slice(0, take).map((index) => {
    const question = bank[index];
    return { prompt: question.prompt, options: [...question.options] };
  });
}

export function evaluateBeniYakalaRound(
  pids: readonly [string, string],
  answers: Readonly<Record<string, number>>,
  predictions: Readonly<Record<string, number>>,
): BeniYakalaReveal {
  const [first, second] = pids;
  const firstAnswer = answers[first] ?? null;
  const secondAnswer = answers[second] ?? null;
  const firstPrediction = predictions[first] ?? null;
  const secondPrediction = predictions[second] ?? null;
  const firstCorrect = firstPrediction !== null && secondAnswer !== null && firstPrediction === secondAnswer;
  const secondCorrect = secondPrediction !== null && firstAnswer !== null && secondPrediction === firstAnswer;
  const exactMatch = firstAnswer !== null && secondAnswer !== null && firstAnswer === secondAnswer;
  const mutualRead = firstCorrect && secondCorrect;
  return {
    answers: { [first]: firstAnswer, [second]: secondAnswer },
    predictions: { [first]: firstPrediction, [second]: secondPrediction },
    correct: { [first]: firstCorrect, [second]: secondCorrect },
    exactMatch,
    mutualRead,
  };
}

function cloneReveal(reveal: BeniYakalaReveal): BeniYakalaReveal {
  return {
    answers: { ...reveal.answers },
    predictions: { ...reveal.predictions },
    correct: { ...reveal.correct },
    exactMatch: reveal.exactMatch,
    mutualRead: reveal.mutualRead,
  };
}

// Kisiye ozel tek guvenlik kapisi: Room bu helper disinda beniYakala sunucu
// durumunu snapshot'a cevirmemeli. Rakibin ham degerleri reveal'e kadar yoktur.
export function toBeniYakalaSnapshot(state: RoomState, you: string): BeniYakalaState | null {
  const game = state.beniYakala;
  const question = game?.questions[game.roundIndex];
  const visible =
    state.phase === 'beni_yakala_answer' ||
    state.phase === 'beni_yakala_predict' ||
    state.phase === 'beni_yakala_reveal' ||
    state.phase === 'match_end';
  if (!game || !question || !visible) return null;
  const opponent = state.players.find((player) => player.id !== you);
  const revealVisible = state.phase === 'beni_yakala_reveal' || state.phase === 'match_end';
  return {
    round: game.roundIndex + 1,
    prompt: question.prompt,
    options: [...question.options],
    myAnswered: game.answers[you] !== undefined,
    oppAnswered: opponent ? game.answers[opponent.id] !== undefined : false,
    myPredicted: game.predictions[you] !== undefined,
    oppPredicted: opponent ? game.predictions[opponent.id] !== undefined : false,
    myAnswer: game.answers[you] ?? null,
    myPrediction: game.predictions[you] ?? null,
    reads: { ...game.reads },
    exactMatches: game.exactMatches,
    mutualReads: game.mutualReads,
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
  };
}

// ---- Sunucu akisi ----

let bankCache: BeniYakalaQuestion[] | null = null;
function getBank(): BeniYakalaQuestion[] {
  bankCache ??= toBeniYakalaBank(bankJson);
  return bankCache;
}

function currentQuestion(state: RoomState): BeniYakalaQuestion | undefined {
  const game = state.beniYakala;
  return game?.questions[game.roundIndex];
}

function isValidChoice(question: BeniYakalaQuestion, choice: number): boolean {
  return Number.isInteger(choice) && choice >= 0 && choice < question.options.length;
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const questions = pickBeniYakalaQuestions(getBank(), BENI_YAKALA_ROUNDS, Math.random);
  if (questions.length !== BENI_YAKALA_ROUNDS) return;
  state.beniYakala = {
    questions,
    roundIndex: 0,
    answers: {},
    predictions: {},
    reads: Object.fromEntries(state.players.map((player) => [player.id, 0])),
    exactMatches: 0,
    mutualReads: 0,
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
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startAnswer(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.beniYakala;
  if (!game || !currentQuestion(state)) return;
  if (state.phase !== 'countdown' && state.phase !== 'beni_yakala_reveal') return;
  game.answers = {};
  game.predictions = {};
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'beni_yakala_answer';
  state.deadline = Date.now() + BENI_YAKALA_ANSWER_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onAnswer(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: number,
  round: number,
): Promise<void> {
  const game = state.beniYakala;
  const question = currentQuestion(state);
  if (state.phase !== 'beni_yakala_answer' || !game || !question) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (!isValidChoice(question, choice) || game.answers[player.id] !== undefined) return;
  game.answers[player.id] = choice;
  if (state.players.length === 2 && state.players.every((candidate) => game.answers[candidate.id] !== undefined)) {
    await startPredict(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onAnswerDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'beni_yakala_answer') return;
  await startPredict(ctx, state);
}

export async function startPredict(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.beniYakala;
  if (state.phase !== 'beni_yakala_answer' || !game || !currentQuestion(state)) return;
  game.predictions = {};
  game.reveal = null;
  state.phase = 'beni_yakala_predict';
  state.deadline = Date.now() + BENI_YAKALA_PREDICT_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onPredict(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: number,
  round: number,
): Promise<void> {
  const game = state.beniYakala;
  const question = currentQuestion(state);
  if (state.phase !== 'beni_yakala_predict' || !game || !question) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (!isValidChoice(question, choice) || game.predictions[player.id] !== undefined) return;
  game.predictions[player.id] = choice;
  if (
    state.players.length === 2 &&
    state.players.every((candidate) => game.predictions[candidate.id] !== undefined)
  ) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onPredictDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.beniYakala;
  const [first, second] = state.players;
  // Faz kapisi reveal'i idempotent yapar: gecikmis alarm/tekrar mesaj ikinci kez puan yazamaz.
  if (state.phase !== 'beni_yakala_predict' || !game || !first || !second) return;
  const verdict = evaluateBeniYakalaRound(
    [first.id, second.id],
    game.answers,
    game.predictions,
  );
  for (const player of state.players) {
    if (verdict.correct[player.id]) game.reads[player.id] = (game.reads[player.id] ?? 0) + 1;
    player.score = game.reads[player.id] ?? 0;
  }
  if (verdict.exactMatch) game.exactMatches += 1;
  if (verdict.mutualRead) game.mutualReads += 1;
  game.reveal = verdict;
  state.phase = 'beni_yakala_reveal';
  state.deadline = Date.now() + BENI_YAKALA_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.beniYakala;
  if (state.phase !== 'beni_yakala_reveal' || !game || !game.reveal) return;
  if (game.roundIndex >= game.questions.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startAnswer(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  state.phase = 'match_end';
  state.winner = null; // cift testi: bireysel reads skorlari var, kazanan dayatilmiyor
  state.turn = null;
  state.deadline = null;
  state.alarmPurpose = null;
  await ctx.deleteAlarm();
  await ctx.save(state);
  ctx.broadcast({ t: 'match_end', winner: null, scores: ctx.scoresOf(state), word: null });
  ctx.broadcastSnapshot(state);
}
