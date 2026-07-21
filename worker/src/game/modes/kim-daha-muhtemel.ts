// Kim Daha Muhtemel?: sekiz kategoride self/partner/both oylari gizlice
// kilitlenir. Goreli oylar reveal'de mutlak oyuncu hedeflerine cevrilir;
// aktif rakip oyu ve gelecek promptlar recipient snapshot'a sizmaz.
import {
  COUNTDOWN_MS,
  KIM_DAHA_MUHTEMEL_REVEAL_MS,
  KIM_DAHA_MUHTEMEL_ROUNDS,
  KIM_DAHA_MUHTEMEL_VOTE_MS,
} from '@harfiyen/shared';
import type {
  KimDahaMuhtemelCategory,
  KimDahaMuhtemelChoice,
  KimDahaMuhtemelPrompt,
  KimDahaMuhtemelResolution,
  KimDahaMuhtemelReveal,
  KimDahaMuhtemelState,
  KimDahaMuhtemelTarget,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import { secureRandomIndex } from './randevu-ruleti';
import bankJson from '../../data/kim-daha-muhtemel.json';

export const KIM_DAHA_MUHTEMEL_CATEGORIES = [
  'ilk_hamle',
  'plan_pusulasi',
  'lezzet',
  'kahkaha',
  'macera',
  'ince_jest',
  'sosyal_sahne',
  'gece_modu',
] as const satisfies readonly KimDahaMuhtemelCategory[];

const MAX_PROMPT_LENGTH = 120;

export type RandomIndex = (length: number) => number;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isCategory(value: unknown): value is KimDahaMuhtemelCategory {
  return KIM_DAHA_MUHTEMEL_CATEGORIES.some((category) => category === value);
}

export function isKimDahaMuhtemelChoice(value: unknown): value is KimDahaMuhtemelChoice {
  return value === 'self' || value === 'partner' || value === 'both';
}

function normalizedPrompt(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

export function toKimDahaMuhtemelBank(data: unknown): KimDahaMuhtemelPrompt[] {
  if (!Array.isArray(data)) return [];
  const bank: KimDahaMuhtemelPrompt[] = [];
  const prompts = new Set<string>();

  for (const raw of data) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    if (!hasExactKeys(record, ['category', 'prompt'])) continue;
    if (!isCategory(record.category) || typeof record.prompt !== 'string') continue;
    const prompt = record.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) continue;
    const key = normalizedPrompt(prompt);
    if (prompts.has(key)) continue;
    prompts.add(key);
    bank.push({ category: record.category, prompt });
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

// Her kategoriden bir prompt Web Crypto ile secilir, sonra tur sirasi yine
// Web Crypto tabanli Fisher-Yates ile karistirilir.
export function selectKimDahaMuhtemelPrompts(
  bank: readonly KimDahaMuhtemelPrompt[],
  randomIndex: RandomIndex,
): KimDahaMuhtemelPrompt[] {
  const selected: KimDahaMuhtemelPrompt[] = [];
  for (const category of KIM_DAHA_MUHTEMEL_CATEGORIES) {
    const candidates = bank.filter((prompt) => prompt.category === category);
    if (candidates.length === 0) return [];
    const prompt = candidates[checkedRandomIndex(candidates.length, randomIndex)];
    selected.push({ category: prompt.category, prompt: prompt.prompt });
  }
  shuffle(selected, randomIndex);
  return selected;
}

function cloneTarget(target: KimDahaMuhtemelTarget | null): KimDahaMuhtemelTarget | null {
  return target ? { ...target } : null;
}

function targetsEqual(
  first: KimDahaMuhtemelTarget | null,
  second: KimDahaMuhtemelTarget | null,
): boolean {
  if (!first || !second || first.kind !== second.kind) return false;
  if (first.kind === 'both') return true;
  return second.kind === 'player' && first.playerId === second.playerId;
}

export function resolveKimDahaMuhtemelTarget(
  voterId: string,
  partnerId: string,
  choice: KimDahaMuhtemelChoice,
): KimDahaMuhtemelTarget {
  if (choice === 'both') return { kind: 'both' };
  return { kind: 'player', playerId: choice === 'self' ? voterId : partnerId };
}

export interface KimDahaMuhtemelEvaluation {
  targets: Record<string, KimDahaMuhtemelTarget | null>;
  agreement: boolean;
  consensus: KimDahaMuhtemelTarget | null;
  resolution: KimDahaMuhtemelResolution;
  joint: boolean;
}

export function evaluateKimDahaMuhtemelRound(
  pids: readonly [string, string],
  votes: Readonly<Record<string, KimDahaMuhtemelChoice>>,
): KimDahaMuhtemelEvaluation {
  const [first, second] = pids;
  const firstChoice = votes[first];
  const secondChoice = votes[second];
  const firstTarget = firstChoice
    ? resolveKimDahaMuhtemelTarget(first, second, firstChoice)
    : null;
  const secondTarget = secondChoice
    ? resolveKimDahaMuhtemelTarget(second, first, secondChoice)
    : null;
  const joint = firstTarget !== null && secondTarget !== null;
  const agreement = joint && targetsEqual(firstTarget, secondTarget);
  const consensus = agreement ? cloneTarget(firstTarget) : null;
  let resolution: KimDahaMuhtemelResolution;
  if (agreement && consensus?.kind === 'player') resolution = 'same_player';
  else if (agreement) resolution = 'both_together';
  else if (joint) resolution = 'split';
  else if (firstTarget || secondTarget) resolution = 'solo';
  else resolution = 'skipped';
  return {
    targets: { [first]: firstTarget, [second]: secondTarget },
    agreement,
    consensus,
    resolution,
    joint,
  };
}

function cloneReveal(reveal: KimDahaMuhtemelReveal): KimDahaMuhtemelReveal {
  return {
    ...reveal,
    targets: Object.fromEntries(
      Object.entries(reveal.targets).map(([pid, target]) => [pid, cloneTarget(target)]),
    ),
    consensus: cloneTarget(reveal.consensus),
  };
}

export function toKimDahaMuhtemelSnapshot(
  state: RoomState,
  you: string,
): KimDahaMuhtemelState | null {
  const game = state.kimDahaMuhtemel;
  const prompt = game?.prompts[game.roundIndex];
  const visible =
    state.mode === 'kim_daha_muhtemel' &&
    (state.phase === 'kim_daha_muhtemel_vote' ||
      state.phase === 'kim_daha_muhtemel_reveal' ||
      state.phase === 'match_end');
  if (!game || !prompt || !visible) return null;
  const player = state.players.find((candidate) => candidate.id === you);
  const opponent = state.players.find((candidate) => candidate.id !== you);
  if (!player || !opponent) return null;
  const revealVisible = state.phase === 'kim_daha_muhtemel_reveal' || state.phase === 'match_end';
  return {
    round: game.roundIndex + 1,
    category: prompt.category,
    prompt: prompt.prompt,
    myLocked: game.votes[you] !== undefined,
    opponentLocked: game.votes[opponent.id] !== undefined,
    myChoice: game.votes[you] ?? null,
    agreements: game.agreements,
    samePersonAgreements: game.samePersonAgreements,
    bothAgreements: game.bothAgreements,
    jointRounds: game.jointRounds,
    splitRounds: game.splitRounds,
    missedRounds: game.missedRounds,
    spotlights: { ...game.spotlights },
    history: game.history.map(cloneReveal),
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
    agreementPct: state.phase === 'match_end' ? game.agreementPct : null,
  };
}

const BANK = toKimDahaMuhtemelBank(bankJson);

function currentPrompt(state: RoomState): KimDahaMuhtemelPrompt | undefined {
  const game = state.kimDahaMuhtemel;
  return game?.prompts[game.roundIndex];
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

// GameRoom alarm dispatch'inden once alarmPurpose'i temizler. Eski bir alarm
// sonraki turun ayni fazina gecikirse yeni deadline'i erken bitirmemelidir.
async function rescheduleIfEarly(ctx: RoomCtx, state: RoomState): Promise<boolean> {
  if (state.deadline === null || Date.now() >= state.deadline) return false;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  return true;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const prompts = selectKimDahaMuhtemelPrompts(BANK, secureRandomIndex);
  if (prompts.length !== KIM_DAHA_MUHTEMEL_ROUNDS || state.players.length !== 2) return;
  state.kimDahaMuhtemel = {
    prompts,
    roundIndex: 0,
    votes: {},
    agreements: 0,
    samePersonAgreements: 0,
    bothAgreements: 0,
    jointRounds: 0,
    splitRounds: 0,
    missedRounds: 0,
    spotlights: Object.fromEntries(state.players.map((player) => [player.id, 0])),
    history: [],
    reveal: null,
    agreementPct: null,
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
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startVote(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kimDahaMuhtemel;
  if (!game || !currentPrompt(state)) return;
  if (state.phase !== 'countdown' && state.phase !== 'kim_daha_muhtemel_reveal') return;
  game.votes = {};
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'kim_daha_muhtemel_vote';
  state.deadline = Date.now() + KIM_DAHA_MUHTEMEL_VOTE_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onVote(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: KimDahaMuhtemelChoice,
  round: number,
): Promise<void> {
  const game = state.kimDahaMuhtemel;
  if (state.phase !== 'kim_daha_muhtemel_vote' || !game || !currentPrompt(state)) return;
  if (!state.players.some((candidate) => candidate.id === player.id)) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (!isKimDahaMuhtemelChoice(choice) || game.votes[player.id] !== undefined) return;
  game.votes[player.id] = choice;
  if (state.players.length === 2 && state.players.every((candidate) => game.votes[candidate.id] !== undefined)) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onVoteDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (
    state.phase !== 'kim_daha_muhtemel_vote' ||
    !state.kimDahaMuhtemel ||
    !currentPrompt(state)
  ) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kimDahaMuhtemel;
  const prompt = currentPrompt(state);
  const [first, second] = state.players;
  if (
    state.phase !== 'kim_daha_muhtemel_vote' ||
    !game ||
    !prompt ||
    !first ||
    !second
  ) return;
  const result = evaluateKimDahaMuhtemelRound([first.id, second.id], game.votes);
  if (result.joint) game.jointRounds += 1;
  else game.missedRounds += 1;
  if (result.agreement) {
    game.agreements += 1;
    if (result.consensus?.kind === 'player') {
      game.samePersonAgreements += 1;
      game.spotlights[result.consensus.playerId] = (game.spotlights[result.consensus.playerId] ?? 0) + 1;
    } else {
      game.bothAgreements += 1;
    }
  } else if (result.joint) {
    game.splitRounds += 1;
  }
  for (const candidate of state.players) candidate.score = game.agreements;
  const revealed: KimDahaMuhtemelReveal = {
    round: game.roundIndex + 1,
    category: prompt.category,
    prompt: prompt.prompt,
    targets: result.targets,
    agreement: result.agreement,
    consensus: result.consensus,
    resolution: result.resolution,
  };
  game.history.push(cloneReveal(revealed));
  game.reveal = cloneReveal(revealed);
  state.phase = 'kim_daha_muhtemel_reveal';
  state.deadline = Date.now() + KIM_DAHA_MUHTEMEL_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kimDahaMuhtemel;
  if (state.phase !== 'kim_daha_muhtemel_reveal' || !game || !game.reveal) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.roundIndex >= game.prompts.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startVote(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kimDahaMuhtemel;
  if (!game) return;
  game.agreementPct = game.jointRounds === 0
    ? null
    : Math.round((game.agreements * 100) / game.jointRounds);
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
