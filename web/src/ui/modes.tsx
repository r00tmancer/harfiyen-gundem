import type { ComponentType } from 'react';
import type { SVGProps } from 'react';
import type { GameMode } from '@harfiyen/shared';
import { IconBomb, IconBurst, IconHeartsDuo, IconRanking, IconRuler, IconTarget, IconTilesDuo } from './icons';

// mod tanitim metinleri + ikonlari (lobi karti, oyun basligi, zafer ekrani)
export const MODE_ORDER: GameMode[] = ['beni_yakala', 'kor_siralama', 'telepati', 'harf', 'sayi', 'zincir', 'uzun', 'bom'];

export interface ModeMeta {
  name: string;
  desc: string;
  joker: string;
  badge?: string;
  Icon: ComponentType<{ size?: number } & SVGProps<SVGSVGElement>>;
}

export const MODE_META: Record<GameMode, ModeMeta> = {
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
    badge: 'YENİ · 2 DK',
    Icon: IconHeartsDuo,
  },
  kor_siralama: {
    name: 'Kör Sıralama',
    desc: 'Gelecek kartları bilmeden seçenekleri 1-5 arasına kilitleyin.',
    joker: 'Joker: Pas — bu kartı destenin sonuna at',
    Icon: IconRanking,
  },
};
