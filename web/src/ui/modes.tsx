import type { ComponentType } from 'react';
import type { SVGProps } from 'react';
import type { GameMode } from '@harfiyen/shared';
import { IconBomb, IconBurst, IconEmojiCode, IconFlagRadar, IconHeartsDuo, IconLikely, IconRanking, IconRoulette, IconRuler, IconTarget, IconTilesDuo, IconTruthLie } from './icons';

// mod tanitim metinleri + ikonlari (lobi karti, oyun basligi, zafer ekrani)
export const MODE_ORDER: GameMode[] = ['iki_dogru_bir_yalan', 'kim_daha_muhtemel', 'kirmizi_yesil', 'emoji_sifre', 'randevu_ruleti', 'beni_yakala', 'kor_siralama', 'telepati', 'harf', 'sayi', 'zincir', 'uzun', 'bom'];

export interface ModeMeta {
  name: string;
  desc: string;
  joker: string;
  badge?: string;
  Icon: ComponentType<{ size?: number } & SVGProps<SVGSVGElement>>;
}

export const MODE_META: Record<GameMode, ModeMeta> = {
  iki_dogru_bir_yalan: {
    name: 'İki Doğru Bir Yalan',
    desc: 'Üç kısa iddia yazın; partneriniz gizli yalanı yakalasın.',
    joker: '2 paket · 3 iddia · 1 yalan',
    badge: 'YENİ · 2 DK',
    Icon: IconTruthLie,
  },
  kim_daha_muhtemel: {
    name: 'Kim Daha Muhtemel?',
    desc: 'Sekiz eğlenceli rolde gizlice birbirinizi işaretleyin.',
    joker: '8 tur · Ben, partnerim veya ikimiz',
    Icon: IconLikely,
  },
  harf: {
    name: 'Harf Yarışı',
    desc: 'İki harfe uyan kelimeleri rakipten önce yaz.',
    joker: 'Joker: Buz — rakibi 5 sn dondur',
    Icon: IconTilesDuo,
  },
  sayi: {
    name: 'Sayı Avı',
    desc: 'Rakibin 1-100 arası gizli sayısını önce bul.',
    joker: 'Joker: Termometre — mesafe ipucu',
    Icon: IconTarget,
  },
  zincir: {
    name: 'Kelime Zinciri',
    desc: 'Son harften kelime türet, bomba sende patlamasın.',
    joker: 'Joker: Pas — sırayı rakibe devret',
    Icon: IconBomb,
  },
  uzun: {
    name: 'En Uzun Kelime',
    desc: 'Tek hakla en uzun kelimeyi yazan raundu alır.',
    joker: 'Joker: Çifte Şans — ikinci hak',
    Icon: IconRuler,
  },
  bom: {
    name: 'Bom',
    desc: "Sırayla say: 7'nin katı ve içinde 7 olan sayıda BOM de!",
    joker: 'Joker: Sigorta — bir hatayı affeder',
    Icon: IconBurst,
  },
  telepati: {
    name: 'Telepati',
    desc: 'Aynı soruya gizlice cevap verin — uyuşursa puan!',
    joker: 'Joker: Çifte Kalp — o soru 2 puan',
    Icon: IconHeartsDuo,
  },
  beni_yakala: {
    name: 'Beni Yakala',
    desc: 'Önce kendini seç, sonra sevgilinin cevabını tahmin et.',
    joker: '5 tur · 4 gizli seçenek',
    Icon: IconHeartsDuo,
  },
  randevu_ruleti: {
    name: 'Randevu Ruleti',
    desc: 'Gizlice seçin; üç tur sonunda bu geceki planınız hazır.',
    joker: 'Yemek · Etkinlik · Tatlı',
    Icon: IconRoulette,
  },
  emoji_sifre: {
    name: 'Emoji Şifre',
    desc: 'Üç emojiyle anlat; sevgilin gizli kelimeyi çözsün.',
    joker: '4 tur · Kodla ve çöz',
    Icon: IconEmojiCode,
  },
  kirmizi_yesil: {
    name: 'Kırmızı mı Yeşil mi?',
    desc: 'Aynı senaryoya gizlice renk verin; cevaplar birlikte açılsın.',
    joker: '8 tur · 3 gizli renk',
    Icon: IconFlagRadar,
  },
  kor_siralama: {
    name: 'Kör Sıralama',
    desc: 'Gelecek kartları bilmeden seçenekleri 1-5 arasına kilitleyin.',
    joker: 'Joker: Pas — bu kartı destenin sonuna at',
    Icon: IconRanking,
  },
};
