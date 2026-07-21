// Iki Dogru Bir Yalan: iki oyuncu setup'ta paketlerini ayni anda kilitler.
// Paketler setup snapshot'ina girmez; guess/reveal'de yalniz current paket,
// history'de ise yalniz tamamlanmis turlar recipient'a acilir.
import {
  COUNTDOWN_MS,
  IKI_DOGRU_BIR_YALAN_GUESS_MS,
  IKI_DOGRU_BIR_YALAN_REVEAL_MS,
  IKI_DOGRU_BIR_YALAN_SETUP_MS,
  IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT,
  normalizeIkiDogruBirYalanStatements,
} from '@harfiyen/shared';
import type {
  IkiDogruBirYalanReveal,
  IkiDogruBirYalanRole,
  IkiDogruBirYalanState,
  IkiDogruBirYalanStatements,
} from '@harfiyen/shared';
import type {
  IkiDogruBirYalanServerPack,
  PlayerState,
  RoomCtx,
  RoomState,
} from '../state';
import { secureRandomIndex } from './randevu-ruleti';

export type RandomIndex = (length: number) => number;

function checkedRandomIndex(length: number, randomIndex: RandomIndex): number {
  const index = randomIndex(length);
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError('random index returned an out-of-range value');
  }
  return index;
}

// Mevcut pack sahipleri Web Crypto tabanli Fisher-Yates ile karistirilir.
// Tek/zero packte random kaynaga dokunulmaz.
export function selectIkiDogruBirYalanOrder(
  subjectIds: readonly string[],
  randomIndex: RandomIndex,
): string[] {
  const order = [...subjectIds];
  for (let end = order.length - 1; end > 0; end -= 1) {
    const index = checkedRandomIndex(end + 1, randomIndex);
    [order[end], order[index]] = [order[index], order[end]];
  }
  return order;
}

function cloneStatements(statements: IkiDogruBirYalanStatements): IkiDogruBirYalanStatements {
  return [...statements];
}

function cloneReveal(reveal: IkiDogruBirYalanReveal): IkiDogruBirYalanReveal {
  return { ...reveal, statements: cloneStatements(reveal.statements) };
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

// GameRoom alarmPurpose'i dispatch oncesi temizler. Onceki turun gecikmis
// alarmi yeni bir setup/guess/reveal deadline'ini erken kapatmamali.
async function rescheduleIfEarly(ctx: RoomCtx, state: RoomState): Promise<boolean> {
  if (state.deadline === null || Date.now() >= state.deadline) return false;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  return true;
}

function currentRoles(
  state: RoomState,
): { subject: PlayerState; guesser: PlayerState; pack: IkiDogruBirYalanServerPack } | null {
  const game = state.ikiDogruBirYalan;
  const subjectId = game?.order[game.roundIndex];
  if (!game || !subjectId) return null;
  const subject = state.players.find((player) => player.id === subjectId);
  const guesser = state.players.find((player) => player.id !== subjectId);
  const pack = game.packs[subjectId];
  return subject && guesser && pack ? { subject, guesser, pack } : null;
}

export function toIkiDogruBirYalanSnapshot(
  state: RoomState,
  you: string,
): IkiDogruBirYalanState | null {
  const game = state.ikiDogruBirYalan;
  const visible =
    state.mode === 'iki_dogru_bir_yalan' &&
    (state.phase === 'iki_dogru_bir_yalan_setup' ||
      state.phase === 'iki_dogru_bir_yalan_guess' ||
      state.phase === 'iki_dogru_bir_yalan_reveal' ||
      state.phase === 'match_end');
  if (!game || !visible) return null;
  const player = state.players.find((candidate) => candidate.id === you);
  const opponent = state.players.find((candidate) => candidate.id !== you);
  if (!player || !opponent) return null;

  const active = state.phase === 'iki_dogru_bir_yalan_guess' || state.phase === 'iki_dogru_bir_yalan_reveal';
  const roles = active ? currentRoles(state) : null;
  let role: IkiDogruBirYalanRole = state.phase === 'iki_dogru_bir_yalan_setup' ? 'setup' : 'done';
  if (roles) role = roles.subject.id === you ? 'subject' : 'guesser';
  const revealVisible = state.phase === 'iki_dogru_bir_yalan_reveal' || state.phase === 'match_end';
  const round = active
    ? game.roundIndex + 1
    : state.phase === 'match_end'
      ? game.availableRounds
      : 0;

  return {
    round,
    availableRounds: game.availableRounds,
    role,
    mySubmitted: game.packs[you] !== undefined,
    opponentSubmitted: game.packs[opponent.id] !== undefined,
    subjectId: roles?.subject.id ?? null,
    guesserId: roles?.guesser.id ?? null,
    statements: roles ? cloneStatements(roles.pack.statements) : null,
    myGuess: roles?.guesser.id === you ? game.guess : null,
    guessLocked: roles ? game.guess !== null : false,
    caughtCount: game.caughtCount,
    wrongCount: game.wrongCount,
    skippedCount: game.skippedCount,
    attemptedCount: game.attemptedCount,
    catches: { ...game.catches },
    catchRate: game.catchRate,
    history: game.history.map(cloneReveal),
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
  };
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.players.length !== 2) return;
  state.ikiDogruBirYalan = {
    packs: {},
    order: [],
    roundIndex: 0,
    guess: null,
    caughtCount: 0,
    wrongCount: 0,
    skippedCount: 0,
    attemptedCount: 0,
    availableRounds: 0,
    catches: Object.fromEntries(state.players.map((player) => [player.id, 0])),
    catchRate: null,
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
  state.emojiSifre = null;
  state.kirmiziYesil = null;
  state.kimDahaMuhtemel = null;
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startSetup(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  if (state.phase !== 'countdown' || !game || state.players.length !== 2) return;
  state.turn = null;
  state.phase = 'iki_dogru_bir_yalan_setup';
  state.deadline = Date.now() + IKI_DOGRU_BIR_YALAN_SETUP_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onPack(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  statements: IkiDogruBirYalanStatements,
  lieIndex: number,
): Promise<void> {
  const game = state.ikiDogruBirYalan;
  if (state.phase !== 'iki_dogru_bir_yalan_setup' || !game) return;
  if (!state.players.some((candidate) => candidate.id === player.id)) return;
  if (!beforeDeadline(state) || game.packs[player.id] !== undefined) return;
  const clean = normalizeIkiDogruBirYalanStatements(statements);
  if (
    !clean ||
    !Number.isInteger(lieIndex) ||
    lieIndex < 0 ||
    lieIndex >= IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT
  ) return;
  game.packs[player.id] = { statements: clean, lieIndex };
  if (state.players.every((candidate) => game.packs[candidate.id] !== undefined)) {
    await closeSetup(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onSetupDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'iki_dogru_bir_yalan_setup' || !state.ikiDogruBirYalan) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await closeSetup(ctx, state);
}

async function closeSetup(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  if (state.phase !== 'iki_dogru_bir_yalan_setup' || !game) return;
  const submitted = state.players
    .filter((player) => game.packs[player.id] !== undefined)
    .map((player) => player.id);
  game.order = selectIkiDogruBirYalanOrder(submitted, secureRandomIndex);
  game.availableRounds = game.order.length;
  game.roundIndex = 0;
  if (game.availableRounds === 0) {
    await finish(ctx, state);
    return;
  }
  await startGuess(ctx, state);
}

async function startGuess(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  const roles = currentRoles(state);
  if (
    !game ||
    !roles ||
    (state.phase !== 'iki_dogru_bir_yalan_setup' && state.phase !== 'iki_dogru_bir_yalan_reveal')
  ) return;
  game.guess = null;
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = roles.guesser.id;
  state.phase = 'iki_dogru_bir_yalan_guess';
  state.deadline = Date.now() + IKI_DOGRU_BIR_YALAN_GUESS_MS;
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
  const game = state.ikiDogruBirYalan;
  const roles = currentRoles(state);
  if (state.phase !== 'iki_dogru_bir_yalan_guess' || !game || !roles) return;
  if (player.id !== roles.guesser.id || !state.players.some((candidate) => candidate.id === player.id)) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1 || game.guess !== null) return;
  if (!Number.isInteger(choice) || choice < 0 || choice >= IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT) return;
  game.guess = choice;
  await reveal(ctx, state);
}

export async function onGuessDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'iki_dogru_bir_yalan_guess' || !state.ikiDogruBirYalan || !currentRoles(state)) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  const roles = currentRoles(state);
  if (state.phase !== 'iki_dogru_bir_yalan_guess' || !game || !roles) return;
  const caught = game.guess !== null && game.guess === roles.pack.lieIndex;
  if (game.guess === null) {
    game.skippedCount += 1;
  } else {
    game.attemptedCount += 1;
    if (caught) {
      game.caughtCount += 1;
      game.catches[roles.guesser.id] = (game.catches[roles.guesser.id] ?? 0) + 1;
    } else {
      game.wrongCount += 1;
    }
  }
  game.catchRate = game.attemptedCount === 0
    ? null
    : Math.round((game.caughtCount * 100) / game.attemptedCount);
  for (const player of state.players) player.score = game.catches[player.id] ?? 0;
  const revealed: IkiDogruBirYalanReveal = {
    round: game.roundIndex + 1,
    subjectId: roles.subject.id,
    guesserId: roles.guesser.id,
    statements: cloneStatements(roles.pack.statements),
    lieIndex: roles.pack.lieIndex,
    guessIndex: game.guess,
    caught,
  };
  game.history.push(cloneReveal(revealed));
  game.reveal = cloneReveal(revealed);
  state.turn = null;
  state.phase = 'iki_dogru_bir_yalan_reveal';
  state.deadline = Date.now() + IKI_DOGRU_BIR_YALAN_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  if (state.phase !== 'iki_dogru_bir_yalan_reveal' || !game || !game.reveal) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.roundIndex >= game.order.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startGuess(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.ikiDogruBirYalan;
  if (!game) return;
  // Reveal fazinda reconnect icin tutulan UGC, mac sonucu yalniz aggregate
  // metriklere donustugunde kalici Durable Object durumundan silinir.
  game.packs = {};
  game.order = [];
  game.guess = null;
  game.history = [];
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
