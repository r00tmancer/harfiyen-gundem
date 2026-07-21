import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '@harfiyen/shared';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  parseClientMessage,
} from '../src/game/client-message';

function parse(value: unknown) {
  return parseClientMessage(JSON.stringify(value));
}

describe('parseClientMessage — gecerli protokol', () => {
  const validMessages = [
    { t: 'ready' },
    { t: 'set_mode', mode: 'kor_siralama' },
    { t: 'pick_letter', letter: 'İ' },
    { t: 'submit_word', word: 'incir' },
    { t: 'pick_number', value: 1 },
    { t: 'guess', value: 100 },
    { t: 'bom_press', kind: 'number' },
    { t: 'bom_press', kind: 'bom' },
    { t: 'telepati_answer', choice: 'a' },
    { t: 'telepati_answer', choice: 'o' },
    { t: 'kor_rank', slot: 5, itemIndex: 1, item: 'Meteor Mantısı' },
    { t: 'kor_pass', itemIndex: 5, item: 'Ay Peyniri' },
    { t: 'use_joker' },
    { t: 'react', id: 0 },
    { t: 'react', id: 5 },
    { t: 'rematch' },
  ] satisfies ClientMsg[];

  it.each(validMessages)('$t mesaji kabul edilir', (message) => {
    expect(parse(message)).toEqual({ ok: true, value: message });
  });

  it('harf isleyicisinin zaten kabul ettigi bosluklu/buyuk Turkce harfi korur', () => {
    const message = { t: 'pick_letter', letter: '  Ş  ' };
    expect(parse(message)).toEqual({ ok: true, value: message });
  });
});

describe('parseClientMessage — cerceve siniri', () => {
  it('buyuk ASCII cerceveyi JSON.parse etmeden reddeder', () => {
    const frame = JSON.stringify({ t: 'submit_word', word: 'a'.repeat(MAX_CLIENT_MESSAGE_BYTES) });
    expect(parseClientMessage(frame)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('UTF-8 byte uzunlugunu kullanir; UTF-16 karakter sayisina guvenmez', () => {
    const frame = JSON.stringify({ t: 'submit_word', word: 'ü'.repeat(1_100) });
    expect(frame.length).toBeLessThanOrEqual(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMessage(frame)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('binary cerceveleri reddeder ve buyuk binary cerceveyi ayri siniflandirir', () => {
    expect(parseClientMessage(new ArrayBuffer(8))).toEqual({ ok: false, reason: 'binary_not_supported' });
    expect(parseClientMessage(new ArrayBuffer(MAX_CLIENT_MESSAGE_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});

describe('parseClientMessage — guvenilmeyen JSON', () => {
  it('bozuk JSON ile null/dizi/primitive degerleri guvenli bicimde reddeder', () => {
    expect(parseClientMessage('{')).toEqual({ ok: false, reason: 'invalid_json' });
    for (const value of [null, [], true, 7, 'ready']) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('bilinmeyen turleri, eksik alanlari ve fazla alanlari reddeder', () => {
    for (const value of [
      {},
      { t: 'dance' },
      { t: 'ready', admin: true },
      { t: 'set_mode' },
      { t: 'rematch', extra: null },
    ]) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('set_mode ve pick_letter alanlarini sozlesmeye gore dogrular', () => {
    for (const value of [
      { t: 'set_mode', mode: 'admin' },
      { t: 'set_mode', mode: 1 },
      { t: 'pick_letter', letter: 'ab' },
      { t: 'pick_letter', letter: 1 },
    ]) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('kelime alanini string disindaki degerlere kapatir', () => {
    for (const word of [null, 42, {}, []]) {
      expect(parse({ t: 'submit_word', word })).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('sayi hamlelerini sadece 1..100 arasinda tamsayi olarak kabul eder', () => {
    for (const t of ['pick_number', 'guess'] as const) {
      for (const value of [0, 101, 1.5, '7', null]) {
        expect(parse({ t, value })).toEqual({ ok: false, reason: 'invalid_message' });
      }
    }
  });

  it('bom_press icin yalniz number veya bom kabul eder', () => {
    for (const kind of ['timeout', 'anything', 1, null]) {
      expect(parse({ t: 'bom_press', kind })).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('telepati secimini protokol birlesimiyle sinirlar', () => {
    for (const choice of ['evet', '', 1, null]) {
      expect(parse({ t: 'telepati_answer', choice })).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('kor siralama slot/index/item alanlarini eksiksiz dogrular', () => {
    const invalid = [
      { t: 'kor_rank', slot: 0, itemIndex: 1, item: 'A' },
      { t: 'kor_rank', slot: 6, itemIndex: 1, item: 'A' },
      { t: 'kor_rank', slot: 1.5, itemIndex: 1, item: 'A' },
      { t: 'kor_rank', slot: 1, itemIndex: 0, item: 'A' },
      { t: 'kor_rank', slot: 1, itemIndex: 6, item: 'A' },
      { t: 'kor_rank', slot: 1, itemIndex: 1.5, item: 'A' },
      { t: 'kor_rank', slot: 1, itemIndex: 1, item: 7 },
      { t: 'kor_pass', itemIndex: 0, item: 'A' },
      { t: 'kor_pass', itemIndex: 6, item: 'A' },
      { t: 'kor_pass', itemIndex: 1.5, item: 'A' },
      { t: 'kor_pass', itemIndex: 1, item: null },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('react id degerini sticker araligi icindeki tamsayilara sinirlar', () => {
    for (const id of [-1, 6, 1.5, '2', null]) {
      expect(parse({ t: 'react', id })).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });
});
