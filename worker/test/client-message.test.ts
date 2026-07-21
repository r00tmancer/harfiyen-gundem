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
    { t: 'set_mode', mode: 'randevu_ruleti' },
    { t: 'set_mode', mode: 'emoji_sifre' },
    { t: 'set_mode', mode: 'kirmizi_yesil' },
    { t: 'set_mode', mode: 'kim_daha_muhtemel' },
    { t: 'set_mode', mode: 'iki_dogru_bir_yalan' },
    { t: 'set_mode', mode: 'ayni_anda_soyle' },
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
    { t: 'beni_yakala_answer', choice: 0, round: 1 },
    { t: 'beni_yakala_predict', choice: 3, round: 5 },
    { t: 'randevu_ruleti_pick', choice: 5, round: 3 },
    { t: 'emoji_sifre_code', emojis: [0, 0, 0], round: 1 },
    { t: 'emoji_sifre_code', emojis: [23, 12, 0], round: 4 },
    { t: 'emoji_sifre_guess', choice: 0, round: 1 },
    { t: 'emoji_sifre_guess', choice: 3, round: 4 },
    { t: 'kirmizi_yesil_vote', choice: 'red', round: 1 },
    { t: 'kirmizi_yesil_vote', choice: 'depends', round: 4 },
    { t: 'kirmizi_yesil_vote', choice: 'green', round: 8 },
    { t: 'kim_daha_muhtemel_vote', choice: 'self', round: 1 },
    { t: 'kim_daha_muhtemel_vote', choice: 'partner', round: 4 },
    { t: 'kim_daha_muhtemel_vote', choice: 'both', round: 8 },
    {
      t: 'iki_dogru_bir_yalan_pack',
      statements: ['Bir kez paraşütle atladım', 'Hiç kahve içmedim', 'Üç dil konuşuyorum'],
      lieIndex: 1,
    },
    { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: 1 },
    { t: 'iki_dogru_bir_yalan_guess', choice: 2, round: 2 },
    { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: 1 },
    { t: 'ayni_anda_soyle_answer', answer: '👨‍👩‍👧', round: 5 },
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

  it('beni yakala choice ve stale-round alanlarini tam 0..3 / 1..5 araligina sinirlar', () => {
    for (const t of ['beni_yakala_answer', 'beni_yakala_predict'] as const) {
      const invalid = [
        { t, choice: -1, round: 1 },
        { t, choice: 4, round: 1 },
        { t, choice: 1.5, round: 1 },
        { t, choice: '1', round: 1 },
        { t, choice: 0, round: 0 },
        { t, choice: 0, round: 6 },
        { t, choice: 0, round: 1.5 },
        { t, choice: 0, round: '1' },
        { t, choice: 0 },
        { t, choice: 0, round: 1, extra: true },
      ];
      for (const value of invalid) {
        expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
      }
    }
  });

  it('randevu ruleti secimini exact-key 0..5 / 1..3 araliginda dogrular', () => {
    const invalid = [
      { t: 'randevu_ruleti_pick', choice: -1, round: 1 },
      { t: 'randevu_ruleti_pick', choice: 6, round: 1 },
      { t: 'randevu_ruleti_pick', choice: 1.5, round: 1 },
      { t: 'randevu_ruleti_pick', choice: '1', round: 1 },
      { t: 'randevu_ruleti_pick', choice: 0, round: 0 },
      { t: 'randevu_ruleti_pick', choice: 0, round: 4 },
      { t: 'randevu_ruleti_pick', choice: 0, round: 1.5 },
      { t: 'randevu_ruleti_pick', choice: 0, round: '1' },
      { t: 'randevu_ruleti_pick', choice: 0 },
      { t: 'randevu_ruleti_pick', choice: 0, round: 1, admin: true },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('emoji sifre kodunu exact-key, tam uc allowlist indeksi ve 1..4 tur ile sinirlar', () => {
    const invalid = [
      { t: 'emoji_sifre_code', emojis: [0, 1], round: 1 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2, 3], round: 1 },
      { t: 'emoji_sifre_code', emojis: [-1, 0, 1], round: 1 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 24], round: 1 },
      { t: 'emoji_sifre_code', emojis: [0, 1.5, 2], round: 1 },
      { t: 'emoji_sifre_code', emojis: [0, '1', 2], round: 1 },
      { t: 'emoji_sifre_code', emojis: '0,1,2', round: 1 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2], round: 0 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2], round: 5 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2], round: 1.5 },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2] },
      { t: 'emoji_sifre_code', emojis: [0, 1, 2], round: 1, admin: true },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('emoji sifre tahminini exact-key 0..3 / 1..4 araliginda dogrular', () => {
    const invalid = [
      { t: 'emoji_sifre_guess', choice: -1, round: 1 },
      { t: 'emoji_sifre_guess', choice: 4, round: 1 },
      { t: 'emoji_sifre_guess', choice: 1.5, round: 1 },
      { t: 'emoji_sifre_guess', choice: '1', round: 1 },
      { t: 'emoji_sifre_guess', choice: 0, round: 0 },
      { t: 'emoji_sifre_guess', choice: 0, round: 5 },
      { t: 'emoji_sifre_guess', choice: 0, round: 1.5 },
      { t: 'emoji_sifre_guess', choice: 0 },
      { t: 'emoji_sifre_guess', choice: 0, round: 1, extra: null },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('kirmizi yesil oyunu exact-key choice ve 1..8 tur araliginda dogrular', () => {
    const invalid = [
      { t: 'kirmizi_yesil_vote', choice: 'RED', round: 1 },
      { t: 'kirmizi_yesil_vote', choice: 'green ', round: 1 },
      { t: 'kirmizi_yesil_vote', choice: 'maybe', round: 1 },
      { t: 'kirmizi_yesil_vote', choice: true, round: 1 },
      { t: 'kirmizi_yesil_vote', choice: 'red', round: 0 },
      { t: 'kirmizi_yesil_vote', choice: 'green', round: 9 },
      { t: 'kirmizi_yesil_vote', choice: 'depends', round: 1.5 },
      { t: 'kirmizi_yesil_vote', choice: 'red', round: '1' },
      { t: 'kirmizi_yesil_vote', choice: 'red' },
      { t: 'kirmizi_yesil_vote', choice: 'red', round: 1, pid: 'p2' },
      { t: 'kirmizi_yesil_vote', choice: 'red', round: 1, role: 'admin' },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('kim daha muhtemel oyunu exact-key choice ve 1..8 tur araliginda dogrular', () => {
    const invalid = [
      { t: 'kim_daha_muhtemel_vote', choice: 'SELF', round: 1 },
      { t: 'kim_daha_muhtemel_vote', choice: 'partner ', round: 1 },
      { t: 'kim_daha_muhtemel_vote', choice: 'player', round: 1 },
      { t: 'kim_daha_muhtemel_vote', choice: true, round: 1 },
      { t: 'kim_daha_muhtemel_vote', choice: 'self', round: 0 },
      { t: 'kim_daha_muhtemel_vote', choice: 'both', round: 9 },
      { t: 'kim_daha_muhtemel_vote', choice: 'partner', round: 1.5 },
      { t: 'kim_daha_muhtemel_vote', choice: 'self', round: '1' },
      { t: 'kim_daha_muhtemel_vote', choice: 'self' },
      { t: 'kim_daha_muhtemel_vote', choice: 'self', round: 1, pid: 'p2' },
      { t: 'kim_daha_muhtemel_vote', choice: 'partner', round: 1, role: 'admin' },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('iki dogru bir yalan pack metnini NFKC, trim ve Unicode bosluk collapse ile kanoniklestirir', () => {
    expect(parse({
      t: 'iki_dogru_bir_yalan_pack',
      statements: ['  İlk\u00a0iddia  ', 'İkinci\u2003iddia', 'Tam genişlik：Ａ'],
      lieIndex: 2,
    })).toEqual({
      ok: true,
      value: {
        t: 'iki_dogru_bir_yalan_pack',
        statements: ['İlk iddia', 'İkinci iddia', 'Tam genişlik:A'],
        lieIndex: 2,
      },
    });
    expect(parse({
      t: 'iki_dogru_bir_yalan_pack',
      statements: ['Ailem 👨‍👩‍👧', 'Bir kedim var', 'Dağ yürüyüşünü severim'],
      lieIndex: 0,
    })).toMatchObject({ ok: true });
  });

  it('iki dogru bir yalan packini exact-key, 3 benzersiz kisa metin ve tek lieIndex ile sinirlar', () => {
    const valid = ['Bir', 'İki', 'Üç'];
    const invalid = [
      { t: 'iki_dogru_bir_yalan_pack', statements: valid },
      { t: 'iki_dogru_bir_yalan_pack', statements: valid, lieIndex: 0, admin: true },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir', 'İki'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir', 'İki', 'Üç', 'Dört'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir', 2, 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['\u00a0', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['x'.repeat(73), 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['İDDİA', 'iddia', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['①', '1', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\nSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\tSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u007fSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u0085Satır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u00adSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u200bSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u2060Satır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u206fSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\ufeffSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u202eSatır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir\u2066Satır', 'İki', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: ['Bir', 'B\u200dir', 'Üç'], lieIndex: 0 },
      { t: 'iki_dogru_bir_yalan_pack', statements: valid, lieIndex: -1 },
      { t: 'iki_dogru_bir_yalan_pack', statements: valid, lieIndex: 3 },
      { t: 'iki_dogru_bir_yalan_pack', statements: valid, lieIndex: 1.5 },
      { t: 'iki_dogru_bir_yalan_pack', statements: valid, lieIndex: '1' },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('iki dogru bir yalan tahminini exact-key choice 0..2 ve round 1..2 ile sinirlar', () => {
    const invalid = [
      { t: 'iki_dogru_bir_yalan_guess', choice: -1, round: 1 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 3, round: 1 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 1.5, round: 1 },
      { t: 'iki_dogru_bir_yalan_guess', choice: '1', round: 1 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: 0 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: 3 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: 1.5 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: '1' },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0 },
      { t: 'iki_dogru_bir_yalan_guess', choice: 0, round: 1, pid: 'p2' },
    ];
    for (const value of invalid) {
      expect(parse(value)).toEqual({ ok: false, reason: 'invalid_message' });
    }
  });

  it('ayni anda soyle cevabini NFKC, trim ve Unicode bosluk collapse ile kanoniklestirir', () => {
    expect(parse({
      t: 'ayni_anda_soyle_answer',
      answer: '  Tam\u00a0genişlik：Ａ  ',
      round: 3,
    })).toEqual({
      ok: true,
      value: { t: 'ayni_anda_soyle_answer', answer: 'Tam genişlik:A', round: 3 },
    });
    expect(parse({ t: 'ayni_anda_soyle_answer', answer: 'Ailem 👨‍👩‍👧', round: 1 })).toMatchObject({
      ok: true,
    });
    expect(parse({ t: 'ayni_anda_soyle_answer', answer: '🚀'.repeat(32), round: 5 })).toMatchObject({
      ok: true,
    });
  });

  it('ayni anda soyle mesajini exact-key, kisa gorunur cevap ve 1..5 tur ile sinirlar', () => {
    const invalid = [
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza' },
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: 1, admin: true },
      { t: 'ayni_anda_soyle_answer', answer: '', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: '\u00a0', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: '...!?', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: '\u0301', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'x'.repeat(33), round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: '🚀'.repeat(33), round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 7, round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\nSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\tSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u007fSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u0085Satir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u00adSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u200bSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u2060Satir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u206fSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\ufeffSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u202eSatir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Bir\u2066Satir', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: '\u200d', round: 1 },
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: 0 },
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: 6 },
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: 1.5 },
      { t: 'ayni_anda_soyle_answer', answer: 'Pizza', round: '1' },
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
