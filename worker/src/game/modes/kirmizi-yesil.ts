// Kirmizi mi Yesil mi?: sekiz kategoriden gelen senaryolar gizlice oylanir.
// Aktif rakip oyu reveal'e kadar yalniz sunucuda, gelecek senaryolar ise mac
// boyunca tum recipient snapshot'larin disinda kalir.
import {
  COUNTDOWN_MS,
  KIRMIZI_YESIL_REVEAL_MS,
  KIRMIZI_YESIL_ROUNDS,
  KIRMIZI_YESIL_VOTE_MS,
} from '@harfiyen/shared';
import type {
  KirmiziYesilCategory,
  KirmiziYesilChoice,
  KirmiziYesilResolution,
  KirmiziYesilReveal,
  KirmiziYesilScenario,
  KirmiziYesilState,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import { secureRandomIndex } from './randevu-ruleti';
import bankJson from '../../data/kirmizi-yesil.json';

export const KIRMIZI_YESIL_CATEGORIES = [
  'mesajlasma',
  'plan_zaman',
  'ev_halleri',
  'jestler',
  'sosyal_hayat',
  'iletisim',
  'para',
  'komik_huylar',
] as const satisfies readonly KirmiziYesilCategory[];

const MAX_PROMPT_LENGTH = 140;

export type RandomIndex = (length: number) => number;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isCategory(value: unknown): value is KirmiziYesilCategory {
  return KIRMIZI_YESIL_CATEGORIES.some((category) => category === value);
}

export function isKirmiziYesilChoice(value: unknown): value is KirmiziYesilChoice {
  return value === 'red' || value === 'depends' || value === 'green';
}

function normalizedPrompt(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

export function toKirmiziYesilBank(data: unknown): KirmiziYesilScenario[] {
  if (!Array.isArray(data)) return [];
  const bank: KirmiziYesilScenario[] = [];
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

// Her kategoriden tam bir kart secilir; ardindan Web Crypto tabanli
// Fisher-Yates ile tur sirasi karistirilir.
export function selectKirmiziYesilScenarios(
  bank: readonly KirmiziYesilScenario[],
  randomIndex: RandomIndex,
): KirmiziYesilScenario[] {
  const selected: KirmiziYesilScenario[] = [];
  for (const category of KIRMIZI_YESIL_CATEGORIES) {
    const candidates = bank.filter((scenario) => scenario.category === category);
    if (candidates.length === 0) return [];
    const scenario = candidates[checkedRandomIndex(candidates.length, randomIndex)];
    selected.push({ category: scenario.category, prompt: scenario.prompt });
  }
  shuffle(selected, randomIndex);
  return selected;
}

export interface KirmiziYesilEvaluation {
  votes: Record<string, KirmiziYesilChoice | null>;
  match: boolean;
  consensus: KirmiziYesilChoice | null;
  resolution: KirmiziYesilResolution;
  joint: boolean;
}

export function evaluateKirmiziYesilRound(
  pids: readonly [string, string],
  votes: Readonly<Record<string, KirmiziYesilChoice>>,
): KirmiziYesilEvaluation {
  const [first, second] = pids;
  const firstVote = votes[first] ?? null;
  const secondVote = votes[second] ?? null;
  const joint = firstVote !== null && secondVote !== null;
  const match = joint && firstVote === secondVote;
  const consensus = match ? firstVote : null;
  let resolution: KirmiziYesilResolution;
  if (consensus === 'red') resolution = 'red_together';
  else if (consensus === 'depends') resolution = 'depends_together';
  else if (consensus === 'green') resolution = 'green_together';
  else if (joint) resolution = 'split';
  else if (firstVote !== null || secondVote !== null) resolution = 'solo';
  else resolution = 'skipped';
  return {
    votes: { [first]: firstVote, [second]: secondVote },
    match,
    consensus,
    resolution,
    joint,
  };
}

function cloneReveal(reveal: KirmiziYesilReveal): KirmiziYesilReveal {
  return { ...reveal, votes: { ...reveal.votes } };
}

export function toKirmiziYesilSnapshot(state: RoomState, you: string): KirmiziYesilState | null {
  const game = state.kirmiziYesil;
  const scenario = game?.scenarios[game.roundIndex];
  const visible =
    state.mode === 'kirmizi_yesil' &&
    (state.phase === 'kirmizi_yesil_vote' ||
      state.phase === 'kirmizi_yesil_reveal' ||
      state.phase === 'match_end');
  if (!game || !scenario || !visible) return null;
  const player = state.players.find((candidate) => candidate.id === you);
  const opponent = state.players.find((candidate) => candidate.id !== you);
  if (!player || !opponent) return null;
  const revealVisible = state.phase === 'kirmizi_yesil_reveal' || state.phase === 'match_end';
  return {
    round: game.roundIndex + 1,
    category: scenario.category,
    prompt: scenario.prompt,
    myLocked: game.votes[you] !== undefined,
    opponentLocked: game.votes[opponent.id] !== undefined,
    myChoice: game.votes[you] ?? null,
    matches: game.matches,
    redMatches: game.redMatches,
    dependsMatches: game.dependsMatches,
    greenMatches: game.greenMatches,
    jointRounds: game.jointRounds,
    splitRounds: game.splitRounds,
    missedRounds: game.missedRounds,
    history: game.history.map(cloneReveal),
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
    compatibility: state.phase === 'match_end' ? game.compatibility : null,
  };
}

const BANK = toKirmiziYesilBank(bankJson);

function currentScenario(state: RoomState): KirmiziYesilScenario | undefined {
  const game = state.kirmiziYesil;
  return game?.scenarios[game.roundIndex];
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

// GameRoom dispatch'ten once alarmPurpose'i temizler. Gecikmis bir retry daha
// sonraki turun ayni fazina denk gelirse yeni deadline'i erken bitirmemelidir.
async function rescheduleIfEarly(ctx: RoomCtx, state: RoomState): Promise<boolean> {
  if (state.deadline === null || Date.now() >= state.deadline) return false;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  return true;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const scenarios = selectKirmiziYesilScenarios(BANK, secureRandomIndex);
  if (scenarios.length !== KIRMIZI_YESIL_ROUNDS || state.players.length !== 2) return;
  state.kirmiziYesil = {
    scenarios,
    roundIndex: 0,
    votes: {},
    matches: 0,
    redMatches: 0,
    dependsMatches: 0,
    greenMatches: 0,
    jointRounds: 0,
    splitRounds: 0,
    missedRounds: 0,
    history: [],
    reveal: null,
    compatibility: null,
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
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startVote(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kirmiziYesil;
  if (!game || !currentScenario(state)) return;
  if (state.phase !== 'countdown' && state.phase !== 'kirmizi_yesil_reveal') return;
  game.votes = {};
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'kirmizi_yesil_vote';
  state.deadline = Date.now() + KIRMIZI_YESIL_VOTE_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onVote(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: KirmiziYesilChoice,
  round: number,
): Promise<void> {
  const game = state.kirmiziYesil;
  if (state.phase !== 'kirmizi_yesil_vote' || !game || !currentScenario(state)) return;
  if (!state.players.some((candidate) => candidate.id === player.id)) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (!isKirmiziYesilChoice(choice) || game.votes[player.id] !== undefined) return;
  game.votes[player.id] = choice;
  if (state.players.length === 2 && state.players.every((candidate) => game.votes[candidate.id] !== undefined)) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onVoteDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'kirmizi_yesil_vote' || !state.kirmiziYesil || !currentScenario(state)) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kirmiziYesil;
  const scenario = currentScenario(state);
  const [first, second] = state.players;
  if (state.phase !== 'kirmizi_yesil_vote' || !game || !scenario || !first || !second) return;
  const result = evaluateKirmiziYesilRound([first.id, second.id], game.votes);
  if (result.joint) game.jointRounds += 1;
  else game.missedRounds += 1;
  if (result.match) {
    game.matches += 1;
    if (result.consensus === 'red') game.redMatches += 1;
    else if (result.consensus === 'depends') game.dependsMatches += 1;
    else if (result.consensus === 'green') game.greenMatches += 1;
  } else if (result.joint) {
    game.splitRounds += 1;
  }
  for (const candidate of state.players) candidate.score = game.matches;
  const revealed: KirmiziYesilReveal = {
    round: game.roundIndex + 1,
    category: scenario.category,
    prompt: scenario.prompt,
    votes: { ...result.votes },
    match: result.match,
    consensus: result.consensus,
    resolution: result.resolution,
  };
  game.history.push(cloneReveal(revealed));
  game.reveal = cloneReveal(revealed);
  state.phase = 'kirmizi_yesil_reveal';
  state.deadline = Date.now() + KIRMIZI_YESIL_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kirmiziYesil;
  if (state.phase !== 'kirmizi_yesil_reveal' || !game || !game.reveal) return;
  if (await rescheduleIfEarly(ctx, state)) return;
  if (game.roundIndex >= game.scenarios.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startVote(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.kirmiziYesil;
  if (!game) return;
  game.compatibility = game.jointRounds === 0
    ? null
    : Math.round((game.matches * 100) / game.jointRounds);
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
