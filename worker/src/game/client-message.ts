import {
  BENI_YAKALA_OPTION_COUNT,
  BENI_YAKALA_ROUNDS,
  KOR_SIRALAMA_ITEMS,
  REACTION_COUNT,
  SAYI_MAX,
  SAYI_MIN,
  TR_LETTERS,
  normalizeTr,
} from '@harfiyen/shared';
import type { ClientMsg, GameMode } from '@harfiyen/shared';

// Normal oyun hamleleri birkac yuz byte'i gecmez. Sinir, JSON.parse oncesinde
// uygulanir; boylece istemci tek cerceveyle DO'ya sinirsiz ayrıştırma isi veremez.
export const MAX_CLIENT_MESSAGE_BYTES = 2_048;

export type ClientMessageError =
  | 'too_large'
  | 'binary_not_supported'
  | 'invalid_json'
  | 'invalid_message';

export type ClientMessageParseResult =
  | { ok: true; value: ClientMsg }
  | { ok: false; reason: ClientMessageError };

const GAME_MODES = {
  harf: true,
  sayi: true,
  zincir: true,
  uzun: true,
  bom: true,
  telepati: true,
  kor_siralama: true,
  beni_yakala: true,
} satisfies Readonly<Record<GameMode, true>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GAME_MODES, value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isPlayableLetter(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = normalizeTr(value);
  return TR_LETTERS.some((letter) => letter === normalized);
}

function validateParsedMessage(value: unknown): ClientMsg | null {
  if (!isRecord(value) || typeof value.t !== 'string') return null;

  switch (value.t) {
    case 'ready':
      return hasExactKeys(value, ['t']) ? { t: 'ready' } : null;

    case 'set_mode':
      return hasExactKeys(value, ['t', 'mode']) && isGameMode(value.mode)
        ? { t: 'set_mode', mode: value.mode }
        : null;

    case 'pick_letter':
      return hasExactKeys(value, ['t', 'letter']) && isPlayableLetter(value.letter)
        ? { t: 'pick_letter', letter: value.letter }
        : null;

    case 'submit_word':
      return hasExactKeys(value, ['t', 'word']) && typeof value.word === 'string'
        ? { t: 'submit_word', word: value.word }
        : null;

    case 'pick_number':
      return hasExactKeys(value, ['t', 'value']) && isIntegerInRange(value.value, SAYI_MIN, SAYI_MAX)
        ? { t: 'pick_number', value: value.value }
        : null;

    case 'guess':
      return hasExactKeys(value, ['t', 'value']) && isIntegerInRange(value.value, SAYI_MIN, SAYI_MAX)
        ? { t: 'guess', value: value.value }
        : null;

    case 'bom_press':
      return hasExactKeys(value, ['t', 'kind']) && (value.kind === 'number' || value.kind === 'bom')
        ? { t: 'bom_press', kind: value.kind }
        : null;

    case 'telepati_answer':
      return hasExactKeys(value, ['t', 'choice']) &&
        (value.choice === 'a' || value.choice === 'b' || value.choice === 'ben' || value.choice === 'o')
        ? { t: 'telepati_answer', choice: value.choice }
        : null;

    case 'kor_rank':
      return hasExactKeys(value, ['t', 'slot', 'itemIndex', 'item']) &&
        isIntegerInRange(value.slot, 1, KOR_SIRALAMA_ITEMS) &&
        isIntegerInRange(value.itemIndex, 1, KOR_SIRALAMA_ITEMS) &&
        typeof value.item === 'string' &&
        value.item.length > 0
        ? { t: 'kor_rank', slot: value.slot, itemIndex: value.itemIndex, item: value.item }
        : null;

    case 'kor_pass':
      return hasExactKeys(value, ['t', 'itemIndex', 'item']) &&
        isIntegerInRange(value.itemIndex, 1, KOR_SIRALAMA_ITEMS) &&
        typeof value.item === 'string' &&
        value.item.length > 0
        ? { t: 'kor_pass', itemIndex: value.itemIndex, item: value.item }
        : null;

    case 'beni_yakala_answer':
      return hasExactKeys(value, ['t', 'choice', 'round']) &&
        isIntegerInRange(value.choice, 0, BENI_YAKALA_OPTION_COUNT - 1) &&
        isIntegerInRange(value.round, 1, BENI_YAKALA_ROUNDS)
        ? { t: 'beni_yakala_answer', choice: value.choice, round: value.round }
        : null;

    case 'beni_yakala_predict':
      return hasExactKeys(value, ['t', 'choice', 'round']) &&
        isIntegerInRange(value.choice, 0, BENI_YAKALA_OPTION_COUNT - 1) &&
        isIntegerInRange(value.round, 1, BENI_YAKALA_ROUNDS)
        ? { t: 'beni_yakala_predict', choice: value.choice, round: value.round }
        : null;

    case 'use_joker':
      return hasExactKeys(value, ['t']) ? { t: 'use_joker' } : null;

    case 'react':
      return hasExactKeys(value, ['t', 'id']) && isIntegerInRange(value.id, 0, REACTION_COUNT - 1)
        ? { t: 'react', id: value.id }
        : null;

    case 'rematch':
      return hasExactKeys(value, ['t']) ? { t: 'rematch' } : null;

    default:
      return null;
  }
}

export function parseClientMessage(frame: string | ArrayBuffer): ClientMessageParseResult {
  if (typeof frame !== 'string') {
    return frame.byteLength > MAX_CLIENT_MESSAGE_BYTES
      ? { ok: false, reason: 'too_large' }
      : { ok: false, reason: 'binary_not_supported' };
  }

  // UTF-16 uzunlugu hizli bir ilk kapidir. Kisa cok-byte'li metinlerde de gercek
  // UTF-8 boyutunu olcerek WebSocket cerceve sinirini dogru uygulariz.
  if (
    frame.length > MAX_CLIENT_MESSAGE_BYTES ||
    new TextEncoder().encode(frame).byteLength > MAX_CLIENT_MESSAGE_BYTES
  ) {
    return { ok: false, reason: 'too_large' };
  }

  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  const message = validateParsedMessage(value);
  return message
    ? { ok: true, value: message }
    : { ok: false, reason: 'invalid_message' };
}
