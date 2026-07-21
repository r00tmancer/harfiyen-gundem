// Kor Siralama: ayni bes kart iki oyuncuya tek tek gelir. Oyuncular gelecekteki
// kartlari gormeden mevcut karti bos bir 1-5 yuvasina kilitler; her kilit geri
// donulemez. Sonunda iki tam siralama acilir ve Spearman footrule benzeri, kolay
// anlatilan bir 0-100 uyum skoru uretilir.
import {
  COUNTDOWN_MS,
  KOR_SIRALAMA_ITEMS,
  KOR_SIRALAMA_PICK_MS,
  KOR_SIRALAMA_REVEAL_MS,
} from '@harfiyen/shared';
import type { KorSiralamaPack } from '@harfiyen/shared';
import type { PlayerState, RoomCtx, RoomState } from '../state';
import bankJson from '../../data/kor-siralama.json';

// ---- Saf mantik ----

export function toKorSiralamaBank(data: unknown): KorSiralamaPack[] {
  if (!Array.isArray(data)) return [];
  const out: KorSiralamaPack[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const { topic, prompt, items } = raw as {
      topic?: unknown;
      prompt?: unknown;
      items?: unknown;
    };
    if (typeof topic !== 'string' || !topic.trim()) continue;
    if (typeof prompt !== 'string' || !prompt.trim()) continue;
    if (!Array.isArray(items) || items.length !== KOR_SIRALAMA_ITEMS) continue;
    if (!items.every((item) => typeof item === 'string' && item.trim().length > 0)) continue;
    const cleanItems = (items as string[]).map((item) => item.trim());
    const unique = new Set(cleanItems.map((item) => item.toLocaleLowerCase('tr-TR')));
    if (unique.size !== KOR_SIRALAMA_ITEMS) continue;
    out.push({ topic: topic.trim(), prompt: prompt.trim(), items: cleanItems });
  }
  return out;
}

export function pickKorSiralamaPack<T>(bank: readonly T[], rand: () => number): T | undefined {
  if (bank.length === 0) return undefined;
  const index = Math.min(bank.length - 1, Math.max(0, Math.floor(rand() * bank.length)));
  return bank[index];
}

// Iki permutasyon arasindaki toplam sira mesafesini 0-100 uyuma cevirir.
// n eleman icin mumkun en buyuk footrule mesafesi floor(n^2 / 2)'dir.
export function korSiralamaCompatibility(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  if (new Set(a).size !== a.length || new Set(b).size !== b.length) return 0;
  const bPos = new Map(b.map((item, index) => [item, index]));
  if (a.some((item) => !bPos.has(item))) return 0;
  const distance = a.reduce((sum, item, index) => sum + Math.abs(index - (bPos.get(item) ?? index)), 0);
  const maxDistance = Math.floor((a.length * a.length) / 2);
  if (maxDistance === 0) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - distance / maxDistance) * 100)));
}

// ---- Sunucu akisi ----

let bankCache: KorSiralamaPack[] | null = null;
function getBank(): KorSiralamaPack[] {
  bankCache ??= toKorSiralamaBank(bankJson);
  return bankCache;
}

function currentItem(state: RoomState): string | undefined {
  const k = state.korSiralama;
  return k?.pack.items[k.itemIndex];
}

function firstOpenSlot(slots: readonly (string | null)[]): number {
  return slots.findIndex((item) => item === null) + 1;
}

export async function startMatch(ctx: RoomCtx, state: RoomState): Promise<void> {
  const selected = pickKorSiralamaPack(getBank(), Math.random);
  if (!selected) return;
  const placements = Object.fromEntries(
    state.players.map((player) => [
      player.id,
      Array.from({ length: KOR_SIRALAMA_ITEMS }, () => null as string | null),
    ]),
  );
  state.korSiralama = {
    pack: { ...selected, items: [...selected.items] },
    itemIndex: 0,
    placements,
    answers: {},
    lastSlots: null,
    exactMatches: 0,
    compatibility: null,
  };
  state.round = 1;
  state.turn = null;
  state.letters = null;
  state.pending = null;
  state.winner = null;
  state.phase = 'countdown';
  state.deadline = Date.now() + COUNTDOWN_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
  ctx.broadcast({ t: 'countdown', from: 3 });
}

export async function startItem(ctx: RoomCtx, state: RoomState): Promise<void> {
  const k = state.korSiralama;
  if (!k || !currentItem(state)) return;
  k.answers = {};
  k.lastSlots = null;
  state.round = k.itemIndex + 1;
  state.turn = null;
  state.phase = 'kor_sirala';
  state.deadline = Date.now() + KOR_SIRALAMA_PICK_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRank(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  slot: number,
  itemIndex: number,
  expectedItem: string,
): Promise<void> {
  const k = state.korSiralama;
  const item = currentItem(state);
  if (state.phase !== 'kor_sirala' || !k || !item) return;
  if (state.deadline === null || Date.now() >= state.deadline) return;
  if (itemIndex !== k.itemIndex + 1 || expectedItem !== item) return;
  if (!Number.isInteger(slot) || slot < 1 || slot > KOR_SIRALAMA_ITEMS) return;
  if (k.answers[player.id] !== undefined) return;
  const slots = k.placements[player.id];
  if (!slots || slots[slot - 1] !== null) return;
  slots[slot - 1] = item;
  k.answers[player.id] = slot;

  if (state.players.length === 2 && state.players.every((p) => k.answers[p.id] !== undefined)) {
    await reveal(ctx, state);
    return;
  }
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

// Sure dolunca cevaplamayanin karti ilk bos yuvaya otomatik kilitlenir; mac durmaz.
export async function onPickDeadline(ctx: RoomCtx, state: RoomState): Promise<void> {
  if (state.phase !== 'kor_sirala' || !state.korSiralama) return;
  const item = currentItem(state);
  if (!item) return;
  for (const player of state.players) {
    if (state.korSiralama.answers[player.id] !== undefined) continue;
    const slots = state.korSiralama.placements[player.id];
    if (!slots) continue;
    const slot = firstOpenSlot(slots);
    if (slot < 1) continue;
    slots[slot - 1] = item;
    state.korSiralama.answers[player.id] = slot;
  }
  await reveal(ctx, state);
}

// Pas jokeri: kimse mevcut karti kilitlemeden once karti destenin sonuna yollar.
export async function onJoker(
  ctx: RoomCtx,
  state: RoomState,
  player: PlayerState,
  itemIndex: number,
  expectedItem: string,
): Promise<void> {
  const k = state.korSiralama;
  if (state.phase !== 'kor_sirala' || !k) return;
  if (state.deadline === null || Date.now() >= state.deadline) return;
  if (itemIndex !== k.itemIndex + 1 || expectedItem !== currentItem(state)) return;
  if ((state.jokers[player.id] ?? 0) <= 0) return;
  if (Object.keys(k.answers).length > 0) return;
  if (k.itemIndex >= k.pack.items.length - 1) return;
  const [item] = k.pack.items.splice(k.itemIndex, 1);
  if (!item) return;
  k.pack.items.push(item);
  state.jokers[player.id] = (state.jokers[player.id] ?? 0) - 1;
  await ctx.save(state);
  ctx.broadcast({ t: 'joker_used', by: player.id, kind: 'pas' });
  ctx.broadcastSnapshot(state);
}

async function reveal(ctx: RoomCtx, state: RoomState): Promise<void> {
  const k = state.korSiralama;
  if (state.phase !== 'kor_sirala' || !k) return;
  const [p1, p2] = state.players;
  if (!p1 || !p2) return;
  k.lastSlots = { ...k.answers };
  if (k.answers[p1.id] === k.answers[p2.id]) k.exactMatches += 1;
  for (const player of state.players) player.score = k.exactMatches;
  state.phase = 'kor_reveal';
  state.deadline = Date.now() + KOR_SIRALAMA_REVEAL_MS;
  state.alarmPurpose = 'phase';
  await ctx.setAlarm(state.deadline);
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
}

export async function onRevealDone(ctx: RoomCtx, state: RoomState): Promise<void> {
  const k = state.korSiralama;
  if (!k) return;
  if (k.itemIndex >= k.pack.items.length - 1) {
    await finish(ctx, state);
    return;
  }
  k.itemIndex += 1;
  await startItem(ctx, state);
}

async function finish(ctx: RoomCtx, state: RoomState): Promise<void> {
  const k = state.korSiralama;
  const [p1, p2] = state.players;
  if (!k || !p1 || !p2) return;
  const a = (k.placements[p1.id] ?? []).map((item) => item ?? '—');
  const b = (k.placements[p2.id] ?? []).map((item) => item ?? '—');
  k.compatibility = korSiralamaCompatibility(a, b);
  state.phase = 'match_end';
  state.winner = null;
  state.turn = null;
  state.deadline = null;
  state.alarmPurpose = null;
  await ctx.deleteAlarm();
  await ctx.save(state);
  ctx.broadcastSnapshot(state);
  ctx.broadcast({ t: 'match_end', winner: null, scores: ctx.scoresOf(state), word: null });
}
