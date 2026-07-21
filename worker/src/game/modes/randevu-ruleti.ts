// Randevu Ruleti: yemek, etkinlik ve tatli kategorilerindeki gizli secimleri
// uc parcalik ortak plana cevirir. Farkli secimler ve iki tarafli timeout
// sonucunda karar Web Crypto ile sunucuda verilir; aktif rakip secimi sizmaz.
import {
  COUNTDOWN_MS,
  RANDEVU_RULETI_CHOICE_COUNT,
  RANDEVU_RULETI_PICK_MS,
  RANDEVU_RULETI_REVEAL_MS,
  RANDEVU_RULETI_ROUNDS,
} from '@harfiyen/shared';
import type {
  RandevuCategory,
  RandevuResolution,
  RandevuRuletiReveal,
  RandevuRuletiRound,
  RandevuRuletiState,
} from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import bankJson from '../../data/randevu-ruleti.json';

const CATEGORIES = ['yemek', 'etkinlik', 'tatli'] as const satisfies readonly RandevuCategory[];
const MAX_PROMPT_LENGTH = 80;
const MAX_CHOICE_LENGTH = 40;
const UINT32_RANGE = 0x1_0000_0000;

export type RandomIndex = (length: number) => number;
export type RandomFill = (sample: Uint32Array) => Uint32Array;

// ---- Saf mantik ----

function isCategory(value: unknown): value is RandevuCategory {
  return value === 'yemek' || value === 'etkinlik' || value === 'tatli';
}

export function toRandevuRuletiBank(data: unknown): RandevuRuletiRound[] {
  if (!Array.isArray(data)) return [];
  const bank: RandevuRuletiRound[] = [];
  for (const raw of data) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const { category, prompt, choices } = raw as {
      category?: unknown;
      prompt?: unknown;
      choices?: unknown;
    };
    if (!isCategory(category) || typeof prompt !== 'string') continue;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) continue;
    if (!Array.isArray(choices) || choices.length !== RANDEVU_RULETI_CHOICE_COUNT) continue;
    if (!choices.every((choice) => typeof choice === 'string')) continue;
    const clean = (choices as string[]).map((choice) => choice.trim());
    if (clean.some((choice) => !choice || choice.length > MAX_CHOICE_LENGTH)) continue;
    if (new Set(clean.map((choice) => choice.toLocaleLowerCase('tr-TR'))).size !== clean.length) continue;
    bank.push({
      category,
      prompt: cleanPrompt,
      choices: [clean[0], clean[1], clean[2], clean[3], clean[4], clean[5]],
    });
  }
  return bank;
}

// Modulo bias olmadan 0..length-1 arasi Web Crypto secimi. Rejection sampling,
// 2^32'nin length'e tam bolunmeyen kuyruk degerlerini yeniden ceker.
export function secureRandomIndex(
  length: number,
  fill: RandomFill = (sample) => crypto.getRandomValues(sample),
): number {
  if (!Number.isInteger(length) || length < 1 || length > UINT32_RANGE) {
    throw new RangeError('random index length must be a positive uint32 range');
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % length);
  const sample = new Uint32Array(1);
  do {
    fill(sample);
  } while (sample[0] >= limit);
  return sample[0] % length;
}

export function selectRandevuRounds(
  bank: readonly RandevuRuletiRound[],
  randomIndex: RandomIndex,
): RandevuRuletiRound[] {
  const selected: RandevuRuletiRound[] = [];
  for (const category of CATEGORIES) {
    const candidates = bank.filter((round) => round.category === category);
    if (candidates.length === 0) return [];
    const picked = candidates[randomIndex(candidates.length)];
    if (!picked) return [];
    selected.push({
      category: picked.category,
      prompt: picked.prompt,
      choices: [...picked.choices],
    });
  }
  return selected;
}

export interface RandevuChoiceResult {
  choices: Record<string, number | null>;
  same: boolean;
  selectedChoice: number;
  resolution: RandevuResolution;
}

export function resolveRandevuChoice(
  pids: readonly [string, string],
  picks: Readonly<Record<string, number>>,
  optionCount: number,
  randomIndex: RandomIndex,
): RandevuChoiceResult {
  const [first, second] = pids;
  const firstChoice = picks[first] ?? null;
  const secondChoice = picks[second] ?? null;
  const choices = { [first]: firstChoice, [second]: secondChoice };
  if (firstChoice !== null && secondChoice !== null && firstChoice === secondChoice) {
    return { choices, same: true, selectedChoice: firstChoice, resolution: 'match' };
  }
  if (firstChoice !== null && secondChoice !== null) {
    const candidates = [firstChoice, secondChoice];
    return {
      choices,
      same: false,
      selectedChoice: candidates[randomIndex(candidates.length)],
      resolution: 'roulette',
    };
  }
  const single = firstChoice ?? secondChoice;
  if (single !== null) {
    return { choices, same: false, selectedChoice: single, resolution: 'single' };
  }
  return {
    choices,
    same: false,
    selectedChoice: randomIndex(optionCount),
    resolution: 'fallback',
  };
}

function cloneReveal(reveal: RandevuRuletiReveal): RandevuRuletiReveal {
  return { ...reveal, choices: { ...reveal.choices } };
}

// Recipient'a ozel tek projeksiyon kapisi. Aktif turdaki picks haritasi bu
// helper disinda RoomSnapshot'a cevrilmez; rakibin degeri reveal'e kadar yoktur.
export function toRandevuRuletiSnapshot(state: RoomState, you: string): RandevuRuletiState | null {
  const game = state.randevuRuleti;
  const round = game?.rounds[game.roundIndex];
  const visible =
    state.mode === 'randevu_ruleti' &&
    (state.phase === 'randevu_secim' || state.phase === 'randevu_reveal' || state.phase === 'match_end');
  if (!game || !round || !visible) return null;
  const opponent = state.players.find((player) => player.id !== you);
  const revealVisible = state.phase === 'randevu_reveal' || state.phase === 'match_end';
  return {
    round: game.roundIndex + 1,
    category: round.category,
    prompt: round.prompt,
    choices: [...round.choices],
    myLocked: game.picks[you] !== undefined,
    opponentLocked: opponent ? game.picks[opponent.id] !== undefined : false,
    myChoice: game.picks[you] ?? null,
    matches: game.matches,
    plan: game.plan.map((item) => ({ ...item })),
    history: game.history.map(cloneReveal),
    reveal: revealVisible && game.reveal ? cloneReveal(game.reveal) : null,
  };
}

// ---- Sunucu akisi ----

const BANK = toRandevuRuletiBank(bankJson);

function currentRound(state: RoomState): RandevuRuletiRound | undefined {
  const game = state.randevuRuleti;
  return game?.rounds[game.roundIndex];
}

function beforeDeadline(state: RoomState): boolean {
  return state.deadline !== null && Date.now() < state.deadline;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const rounds = selectRandevuRounds(BANK, secureRandomIndex);
  if (rounds.length !== RANDEVU_RULETI_ROUNDS) return;
  state.randevuRuleti = {
    rounds,
    roundIndex: 0,
    picks: {},
    matches: 0,
    plan: [],
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
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
  ctx.broadcastSnapshot(state);
}

export async function startRound(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.randevuRuleti;
  if (!game || !currentRound(state)) return;
  if (state.phase !== 'countdown' && state.phase !== 'randevu_reveal') return;
  game.picks = {};
  game.reveal = null;
  state.round = game.roundIndex + 1;
  state.turn = null;
  state.phase = 'randevu_secim';
  state.deadline = Date.now() + RANDEVU_RULETI_PICK_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onPick(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  choice: number,
  round: number,
): Promise<void> {
  const game = state.randevuRuleti;
  const current = currentRound(state);
  if (state.phase !== 'randevu_secim' || !game || !current) return;
  if (!beforeDeadline(state) || round !== game.roundIndex + 1) return;
  if (!Number.isInteger(choice) || choice < 0 || choice >= current.choices.length) return;
  if (game.picks[player.id] !== undefined) return;
  game.picks[player.id] = choice;
  if (state.players.length === 2 && state.players.every((candidate) => game.picks[candidate.id] !== undefined)) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onPickDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  await reveal(ctx, state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.randevuRuleti;
  const round = currentRound(state);
  const [first, second] = state.players;
  // Faz kapisi alarm retry/duplicate mesajda sonucu ve plani ikinci kez yazmayi engeller.
  if (state.phase !== 'randevu_secim' || !game || !round || !first || !second) return;
  const result = resolveRandevuChoice(
    [first.id, second.id],
    game.picks,
    round.choices.length,
    secureRandomIndex,
  );
  const selectedLabel = round.choices[result.selectedChoice];
  const revealed: RandevuRuletiReveal = {
    round: game.roundIndex + 1,
    category: round.category,
    choices: result.choices,
    same: result.same,
    selectedChoice: result.selectedChoice,
    selectedLabel,
    resolution: result.resolution,
  };
  if (result.same) game.matches += 1;
  for (const player of state.players) player.score = game.matches;
  game.plan.push({ category: round.category, choice: result.selectedChoice, label: selectedLabel });
  game.history.push(revealed);
  game.reveal = revealed;
  state.phase = 'randevu_reveal';
  state.deadline = Date.now() + RANDEVU_RULETI_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const game = state.randevuRuleti;
  if (state.phase !== 'randevu_reveal' || !game || !game.reveal) return;
  if (game.roundIndex >= game.rounds.length - 1) {
    await finish(ctx, state);
    return;
  }
  game.roundIndex += 1;
  await startRound(ctx, state);
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
