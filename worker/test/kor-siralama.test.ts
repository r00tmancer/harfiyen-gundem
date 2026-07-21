import { describe, expect, it } from 'vitest';
import { KOR_SIRALAMA_ITEMS } from '@harfiyen/shared';
import {
  korSiralamaCompatibility,
  pickKorSiralamaPack,
  toKorSiralamaBank,
} from '../src/game/modes/kor-siralama';
import bankJson from '../src/data/kor-siralama.json';

describe('korSiralamaCompatibility — iki listenin uyumu', () => {
  const base = ['a', 'b', 'c', 'd', 'e'];

  it('ayni siralama %100 verir', () => {
    expect(korSiralamaCompatibility(base, [...base])).toBe(100);
  });

  it('tam ters siralama %0 verir', () => {
    expect(korSiralamaCompatibility(base, [...base].reverse())).toBe(0);
  });

  it('tek komsu takasi kismi uyum verir', () => {
    expect(korSiralamaCompatibility(base, ['b', 'a', 'c', 'd', 'e'])).toBe(83);
  });

  it('olcum iki oyuncu icin simetriktir', () => {
    const other = ['c', 'a', 'e', 'b', 'd'];
    expect(korSiralamaCompatibility(base, other)).toBe(korSiralamaCompatibility(other, base));
  });

  it('tek elemanli ayni liste %100 verir', () => {
    expect(korSiralamaCompatibility(['x'], ['x'])).toBe(100);
  });

  it('farkli eleman, boy veya tekrarli liste gecersizdir', () => {
    expect(korSiralamaCompatibility(base, ['a', 'b'])).toBe(0);
    expect(korSiralamaCompatibility(base, ['a', 'b', 'c', 'd', 'x'])).toBe(0);
    expect(korSiralamaCompatibility(base, ['a', 'a', 'c', 'd', 'e'])).toBe(0);
    expect(korSiralamaCompatibility([], [])).toBe(0);
  });
});

describe('toKorSiralamaBank — 5 kartli paket dogrulama', () => {
  it('gecerli paketi temizleyip kabul eder', () => {
    expect(
      toKorSiralamaBank([
        { topic: '  Tatil ', prompt: ' Hangisi? ', items: [' A ', 'B', 'C', 'D', 'E'] },
      ]),
    ).toEqual([{ topic: 'Tatil', prompt: 'Hangisi?', items: ['A', 'B', 'C', 'D', 'E'] }]);
  });

  it('eksik, bos veya tekrarli kartli paketleri atar', () => {
    expect(
      toKorSiralamaBank([
        { topic: 'x', prompt: 'y', items: ['a', 'b'] },
        { topic: 'x', prompt: 'y', items: ['a', 'b', 'c', 'd', 'A'] },
        { topic: '', prompt: 'y', items: ['a', 'b', 'c', 'd', 'e'] },
        null,
      ]),
    ).toEqual([]);
  });

  it('gercek banka yeterli, benzersiz ve her paket tam 5 karttir', () => {
    const bank = toKorSiralamaBank(bankJson);
    expect(bank.length).toBeGreaterThanOrEqual(20);
    for (const pack of bank) {
      expect(pack.items).toHaveLength(KOR_SIRALAMA_ITEMS);
      expect(new Set(pack.items).size).toBe(KOR_SIRALAMA_ITEMS);
    }
  });
});

describe('pickKorSiralamaPack — guvenli rastgele secim', () => {
  const bank = ['ilk', 'orta', 'son'];

  it('0 ilk, 1 sinir degeri son paketi verir', () => {
    expect(pickKorSiralamaPack(bank, () => 0)).toBe('ilk');
    expect(pickKorSiralamaPack(bank, () => 1)).toBe('son');
  });

  it('bos bankada undefined verir', () => {
    expect(pickKorSiralamaPack([], Math.random)).toBeUndefined();
  });
});
