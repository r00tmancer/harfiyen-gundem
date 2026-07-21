// Harfiyen — istemci ile sunucunun ortak sözleşmesi.
// Bu dosya hem worker hem web tarafından import edilir; değişiklikler iki tarafı da kırar.

// ---- Oyun sabitleri ----
export const TARGET_SCORE = 5; // maçı kazanmak için gereken puan
export const PICK_MS = 10_000; // harf seçme süresi
export const COUNTDOWN_MS = 3_000; // 3-2-1 geri sayım
export const RACE_MS = 45_000; // kelime yarışı süresi (kimse bulamazsa harfler yenilenir)
export const RESULT_MS = 4_000; // raund sonucu ekranda kalma süresi (rakip, kazanan kelimeyi rahat okuyabilmeli)
export const MIN_WORD_LEN = 3;
export const MIN_PAIR_WORDS = 3; // bir harf çiftinin kabul edilmesi için gereken asgari çözüm sayısı
export const SUBMIT_THROTTLE_MS = 350;
export const MAX_NICK_LEN = 12;
export const AVATAR_COUNT = 8;
export const JOKER_FREEZE_MS = 5_000; // buz jokeri: rakibin yazma alanı bu kadar donar
export const JOKER_PER_ROUNDS = 5; // her 5 raundluk blok için 1 joker hakkı (1. ve 6. raundda dolar)

// ---- Oyun modları ----
export type GameMode =
  | 'harf'
  | 'sayi'
  | 'zincir'
  | 'uzun'
  | 'bom'
  | 'telepati'
  | 'kor_siralama'
  | 'beni_yakala'
  | 'randevu_ruleti'
  | 'emoji_sifre'
  | 'kirmizi_yesil'
  | 'kim_daha_muhtemel'
  | 'iki_dogru_bir_yalan'
  | 'ayni_anda_soyle';
export const DEFAULT_MODE: GameMode = 'harf';

// Telepati (Uyum Testi) — ko-op: aynı soruya gizlice cevap verin, uyuşursa ortak puan
export const TELEPATI_QUESTIONS = 10; // maç başına soru
export const TELEPATI_ANSWER_MS = 15_000;
export const TELEPATI_REVEAL_MS = 3_500;

// Kor Siralama — secenekler tek tek gelir; gelecegi bilmeden 1-5 arasina kilitlenir
export const KOR_SIRALAMA_ITEMS = 5;
export const KOR_SIRALAMA_PICK_MS = 20_000;
export const KOR_SIRALAMA_REVEAL_MS = 3_200;

// Beni Yakala — once kendi secimini kilitle, sonra partnerinin secimini tahmin et
export const BENI_YAKALA_ROUNDS = 5;
export const BENI_YAKALA_OPTION_COUNT = 4;
export const BENI_YAKALA_ANSWER_MS = 10_000;
export const BENI_YAKALA_PREDICT_MS = 10_000;
export const BENI_YAKALA_REVEAL_MS = 3_200;

// Randevu Ruleti — uc kategoride gizli secimler ortak plana donusur
export const RANDEVU_RULETI_ROUNDS = 3;
export const RANDEVU_RULETI_CHOICE_COUNT = 6;
export const RANDEVU_RULETI_PICK_MS = 12_000;
export const RANDEVU_RULETI_REVEAL_MS = 3_200;

// Emoji Sifre — kodlayici hedefi tam uc emojiyle anlatir, cozucu dort sik arasindan bulur
export const EMOJI_SIFRE_ROUNDS = 4;
export const EMOJI_SIFRE_CODE_COUNT = 3;
export const EMOJI_SIFRE_OPTION_COUNT = 4;
export const EMOJI_SIFRE_CODE_MS = 18_000;
export const EMOJI_SIFRE_GUESS_MS = 12_000;
export const EMOJI_SIFRE_REVEAL_MS = 3_200;
export const EMOJI_SIFRE_PALETTE = [
  '😂', '🥰', '😴', '🤫', '❤️', '🔥', '🎉', '🌙',
  '⭐', '🍕', '☕', '🎬', '🎮', '🚀', '🏠', '🌊',
  '🐱', '🎁', '📱', '🌧️', '🚗', '🍦', '🎵', '💃',
] as const;

// Kirmizi mi Yesil mi? — ayni senaryoya gizli red/depends/green oylari
export const KIRMIZI_YESIL_ROUNDS = 8;
export const KIRMIZI_YESIL_VOTE_MS = 9_000;
export const KIRMIZI_YESIL_REVEAL_MS = 2_200;

// Kim Daha Muhtemel? — ayni soruda kimin isaret edildigine gizlice oy verilir
export const KIM_DAHA_MUHTEMEL_ROUNDS = 8;
export const KIM_DAHA_MUHTEMEL_VOTE_MS = 9_000;
export const KIM_DAHA_MUHTEMEL_REVEAL_MS = 2_300;

// Iki Dogru Bir Yalan — iki oyuncu uc iddia hazirlar, partner gizli yalani bulur
export const IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT = 3;
export const IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH = 72;
export const IKI_DOGRU_BIR_YALAN_SETUP_MS = 60_000;
export const IKI_DOGRU_BIR_YALAN_GUESS_MS = 18_000;
export const IKI_DOGRU_BIR_YALAN_REVEAL_MS = 4_200;

// Ayni Anda Soyle — bes kisa kategoride gizli cevaplar birlikte acilir
export const AYNI_ANDA_SOYLE_ROUNDS = 5;
export const AYNI_ANDA_SOYLE_ANSWER_MS = 12_000;
export const AYNI_ANDA_SOYLE_REVEAL_MS = 3_200;
export const AYNI_ANDA_SOYLE_MAX_ANSWER_LENGTH = 32;

// Tepkiler: maç içi sticker gönderimi
export const REACTION_COUNT = 6; // sticker id: 0..5
export const REACTION_THROTTLE_MS = 3_000;

// Bom (7 Bom): sırayla say, 7'nin katı veya içinde 7 geçen sayıda BOM de
export const BOM_LIVES = 3;
export const BOM_DIGIT = 7;
export const BOM_START_MS = 6_000; // ilk turların süresi
export const BOM_MIN_MS = 2_500; // taban süre
export const BOM_DECAY_MS = 150; // her sayıda süre bu kadar kısalır
// Bir sayıda BOM denmesi gerekiyor mu?
export function isBom(n: number): boolean {
  return n % BOM_DIGIT === 0 || String(n).includes(String(BOM_DIGIT));
}

// Sayı Avı
export const SAYI_MIN = 1;
export const SAYI_MAX = 100;
export const SAYI_ROUNDS_TO_WIN = 3; // 3 raund kazanan maçı alır
export const SAYI_PICK_MS = 15_000; // gizli sayı seçme süresi
export const SAYI_TURN_MS = 20_000; // tahmin sırası süresi (dolarsa sıra yanar)
// Termometre jokeri mesafe bantları (|tahmin - gizli|)
export const SAYI_BAND_KAYNIYOR = 3;
export const SAYI_BAND_SICAK = 10;
export const SAYI_BAND_ILIK = 25;

// Kelime Zinciri
export const ZINCIR_LIVES = 3;
export const ZINCIR_START_MS = 15_000; // ilk tur süresi
export const ZINCIR_MIN_MS = 6_000; // sürenin inebileceği taban
export const ZINCIR_DECAY_MS = 500; // her başarılı kelimede süre bu kadar kısalır

// En Uzun Kelime
export const UZUN_ROUND_MS = 30_000; // tek gönderimlik yarış süresi
export const UZUN_TARGET = 5; // maçı kazanmak için puan

// Mod başına joker türü (UI metni istemcide)
export type JokerKind = 'buz' | 'termometre' | 'pas' | 'cifte_sans' | 'sigorta' | 'cifte_kalp';
export const MODE_JOKER: Record<GameMode, JokerKind | null> = {
  harf: 'buz',
  sayi: 'termometre',
  zincir: 'pas',
  uzun: 'cifte_sans',
  bom: 'sigorta', // bir sonraki hatanı affeder (can gitmez)
  telepati: 'cifte_kalp', // bu soru eşleşirse 2 puan sayılır
  kor_siralama: 'pas', // mevcut karti sona atar; siradaki kart bilinmez
  beni_yakala: null, // bu modda joker yok
  randevu_ruleti: null, // bu modda joker yok
  emoji_sifre: null, // bu kisa co-op modunda joker yok
  kirmizi_yesil: null, // bu hizli uyum testinde joker yok
  kim_daha_muhtemel: null, // bu hizli cift oyununda joker yok
  iki_dogru_bir_yalan: null, // bu kisa tanişma oyununda joker yok
  ayni_anda_soyle: null, // bu kisa ortak cevap oyununda joker yok
};

export const TR_LETTERS = [
  'a', 'b', 'c', 'ç', 'd', 'e', 'f', 'g', 'ğ', 'h', 'ı', 'i', 'j', 'k', 'l',
  'm', 'n', 'o', 'ö', 'p', 'r', 's', 'ş', 't', 'u', 'ü', 'v', 'y', 'z',
] as const;
export type TrLetter = (typeof TR_LETTERS)[number];

// ---- Türkçe normalizasyon ----
// DİKKAT: plain toLowerCase() Türkçede yanlıştır ('I' -> 'i' verir, 'ı' vermez).
// Sözlükteki şapkalı harfler (kâğıt, askerî) sadeleştirilir; kelime listesi de aynı biçimde üretilir.
export function normalizeTr(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

// Sırasız harf çifti anahtarı; pairs.json bu anahtarla indekslidir.
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('');
}

// Kelime, harflerden biriyle başlayıp diğeriyle bitmeli (iki yön de geçerli).
export function matchesPattern(word: string, l1: string, l2: string): boolean {
  const start = word[0];
  const end = word[word.length - 1];
  return (start === l1 && end === l2) || (start === l2 && end === l1);
}

// ---- Durum modelleri ----
export type Phase =
  | 'lobby' // rakip bekleniyor / hazır olma
  | 'picking' // (harf/uzun) iki oyuncu gizlice harf seçiyor
  | 'countdown' // 3-2-1
  | 'racing' // (harf) kelime yarışı
  | 'sayi_pick' // (sayi) iki oyuncu gizli sayısını seçiyor
  | 'sayi_turn' // (sayi) sıradaki oyuncu tahmin ediyor
  | 'zincir_turn' // (zincir) sıradaki oyuncu kelime yazıyor, bomba tıkırdıyor
  | 'uzun_race' // (uzun) tek gönderimlik uzun kelime yarışı
  | 'bom_turn' // (bom) sıradaki oyuncu sayıya ya da BOM'a basıyor
  | 'telepati_soru' // (telepati) iki oyuncu da gizlice cevaplıyor
  | 'telepati_reveal' // (telepati) cevaplar açıldı, eşleşme gösteriliyor
  | 'kor_sirala' // (kor siralama) mevcut kart bos bir 1-5 yuvasina kilitleniyor
  | 'kor_reveal' // (kor siralama) iki oyuncunun bu karttaki sirasi aciliyor
  | 'beni_yakala_answer' // (beni yakala) herkes kendi tercihini gizlice kilitliyor
  | 'beni_yakala_predict' // (beni yakala) herkes partnerinin tercihini tahmin ediyor
  | 'beni_yakala_reveal' // (beni yakala) cevaplar ve tahminler aciliyor
  | 'randevu_secim' // (randevu ruleti) iki oyuncu gizli secimini kilitliyor
  | 'randevu_reveal' // (randevu ruleti) secimler ve ortak sonuc aciliyor
  | 'emoji_sifre_encode' // (emoji sifre) kodlayici hedefi uc emojiyle anlatiyor
  | 'emoji_sifre_guess' // (emoji sifre) cozucu dort secenekten tahmin ediyor
  | 'emoji_sifre_reveal' // (emoji sifre) hedef, kod ve tahmin aciliyor
  | 'kirmizi_yesil_vote' // (kirmizi mi yesil mi) iki oyuncu gizlice oy veriyor
  | 'kirmizi_yesil_reveal' // (kirmizi mi yesil mi) iki oy aciliyor
  | 'kim_daha_muhtemel_vote' // iki oyuncu self/partner/both secimini gizlice kilitliyor
  | 'kim_daha_muhtemel_reveal' // oylar mutlak hedeflere cevrilip aciliyor
  | 'iki_dogru_bir_yalan_setup' // iki oyuncu kendi uc iddiasini ayni anda hazirliyor
  | 'iki_dogru_bir_yalan_guess' // aktif tahminci partnerinin yalanini seciyor
  | 'iki_dogru_bir_yalan_reveal' // aktif paketin yalani ve tahmini aciliyor
  | 'ayni_anda_soyle_answer' // iki oyuncu kisa cevabini gizlice kilitliyor
  | 'ayni_anda_soyle_reveal' // iki cevap ayni anda aciliyor
  | 'round_end' // raund sonucu gösteriliyor
  | 'match_end'; // maç bitti

// Sayı Avı: her oyuncunun RAKİBİN sayısı için bildiği aralık (tahminciye göre)
export interface SayiState {
  roundWins: Record<string, number>; // oyuncu id -> kazanılan raund
  bounds: Record<string, { lo: number; hi: number }>; // tahmin EDEN oyuncu id -> bildiği aralık (lo < x < hi)
  myNumber: number | null; // SADECE alıcının kendi gizli sayısı (snapshot kişiye özel)
  myPicked: boolean;
  oppPicked: boolean;
  equalizer: boolean; // ikinci oyuncunun eşitleme tahmini aşaması mı
}

export interface ZincirState {
  lives: Record<string, number>;
  lastWord: string | null;
  requiredLetter: string | null; // sıradaki kelimenin başlaması gereken harf
  turnMs: number; // bu turun toplam süresi (gitgide kısalır)
}

export interface UzunState {
  submitted: Record<string, boolean>; // kim kelimesini kilitledi (kelime gizli)
}

export interface BomState {
  lives: Record<string, number>;
  current: number; // sıradaki söylenecek sayı (ikisi de görür)
  turnMs: number; // bu turun süresi (gitgide kısalır)
  insured: Record<string, boolean>; // sigorta jokeri aktif mi (bir hatayı affeder)
}

export interface TelepatiQuestion {
  type: 'kim' | 'ab';
  q: string;
  a?: string; // ab tipinde şık metinleri
  b?: string;
}

export interface TelepatiState {
  qIndex: number; // 1..TELEPATI_QUESTIONS
  question: TelepatiQuestion;
  matches: number; // eşleşen soru puanı (çifte kalp ile bir soru 2 sayılabilir)
  myAnswered: boolean;
  oppAnswered: boolean;
  doubled: boolean; // bu soruda çifte kalp aktif mi
}

export interface KorSiralamaPack {
  topic: string;
  prompt: string;
  items: string[];
}

export interface KorSiralamaState {
  topic: string;
  prompt: string;
  itemIndex: number; // 1..KOR_SIRALAMA_ITEMS
  currentItem: string;
  mySlots: Array<string | null>; // yalniz alicinin kendi kilitli listesi
  myRanked: boolean;
  oppRanked: boolean;
  exactMatches: number; // ayni karti ayni siraya koyma sayisi
  lastSlots: Record<string, number> | null; // reveal sirasinda pid -> 1..5
  compatibility: number | null; // yalniz mac sonunda 0..100
  finalRankings: Record<string, string[]> | null; // yalniz mac sonunda iki liste
}

export interface BeniYakalaQuestion {
  prompt: string;
  options: [string, string, string, string];
}

export interface BeniYakalaReveal {
  answers: Record<string, number | null>; // pid -> gercek secim; timeout = null
  predictions: Record<string, number | null>; // pid -> partner tahmini; timeout = null
  correct: Record<string, boolean>; // pid -> partnerini bu turda bildi mi
  exactMatch: boolean; // iki gercek secim ayni mi (null eslesme sayilmaz)
  mutualRead: boolean; // iki oyuncu da birbirini bildi mi
}

export interface BeniYakalaState {
  round: number; // 1..BENI_YAKALA_ROUNDS
  prompt: string;
  options: [string, string, string, string];
  myAnswered: boolean;
  oppAnswered: boolean;
  myPredicted: boolean;
  oppPredicted: boolean;
  myAnswer: number | null; // sadece alicinin kendi secimi; 0..3
  myPrediction: number | null; // sadece alicinin kendi tahmini; 0..3
  reads: Record<string, number>; // pid -> dogru partner tahmini sayisi
  exactMatches: number; // gercek cevaplarin ayni oldugu tur sayisi
  mutualReads: number; // iki oyuncunun da birbirini bildigi tur sayisi
  reveal: BeniYakalaReveal | null;
}

export type RandevuCategory = 'yemek' | 'etkinlik' | 'tatli';
export type RandevuResolution = 'match' | 'roulette' | 'single' | 'fallback';

export interface RandevuRuletiRound {
  category: RandevuCategory;
  prompt: string;
  choices: [string, string, string, string, string, string];
}

export interface RandevuRuletiReveal {
  round: number;
  category: RandevuCategory;
  choices: Record<string, number | null>; // pid -> gizli secim; timeout = null
  same: boolean; // iki oyuncu da ayni secimi kilitledi mi
  selectedChoice: number; // plana giren 0..5 secenek
  selectedLabel: string;
  resolution: RandevuResolution;
}

export interface RandevuPlanItem {
  category: RandevuCategory;
  choice: number;
  label: string;
}

export interface RandevuRuletiState {
  round: number; // 1..RANDEVU_RULETI_ROUNDS
  category: RandevuCategory;
  prompt: string;
  choices: [string, string, string, string, string, string];
  myLocked: boolean;
  opponentLocked: boolean;
  myChoice: number | null; // yalniz alicinin kendi secimi
  matches: number; // ayni secimin kilitlendigi tur sayisi
  plan: RandevuPlanItem[]; // tamamlanan turlarin ortak randevu plani
  history: RandevuRuletiReveal[]; // yalniz tamamlanip acilmis turlar
  reveal: RandevuRuletiReveal | null; // aktif tur yalniz reveal/match_end fazinda acilir
}

export type EmojiSifreRole = 'encoder' | 'decoder';
export type EmojiSifreCode = [number, number, number];
export type EmojiSifreOptions = [string, string, string, string];

export interface EmojiSifreReveal {
  round: number;
  encoder: string;
  decoder: string;
  target: string;
  options: EmojiSifreOptions;
  code: EmojiSifreCode;
  guess: number | null; // 0..3; timeout = null
  correctChoice: number;
  correct: boolean;
  codeFallback: boolean; // kodlayici timeout olduysa sunucunun hazir kodu kullanildi
}

export interface EmojiSifreState {
  round: number; // 1..EMOJI_SIFRE_ROUNDS
  encoder: string;
  decoder: string;
  role: EmojiSifreRole;
  target: string | null; // encode/guess fazinda yalniz kodlayici; reveal'de ortak
  options: EmojiSifreOptions | null; // guess fazinda yalniz cozucu; reveal'de ortak
  code: EmojiSifreCode | null; // encode fazinda cozucuden gizli; guess'te iki tarafa acik
  codeLocked: boolean;
  guessLocked: boolean;
  myGuess: number | null; // reveal oncesi yalniz cozucunun kendi tahmini
  correctCount: number; // ortak dogru sayisi; iki oyuncunun score alaniyla ayni
  history: EmojiSifreReveal[];
  reveal: EmojiSifreReveal | null;
}

export type KirmiziYesilChoice = 'red' | 'depends' | 'green';
export type KirmiziYesilCategory =
  | 'mesajlasma'
  | 'plan_zaman'
  | 'ev_halleri'
  | 'jestler'
  | 'sosyal_hayat'
  | 'iletisim'
  | 'para'
  | 'komik_huylar';
export type KirmiziYesilResolution =
  | 'red_together'
  | 'depends_together'
  | 'green_together'
  | 'split'
  | 'solo'
  | 'skipped';

export interface KirmiziYesilScenario {
  category: KirmiziYesilCategory;
  prompt: string;
}

export interface KirmiziYesilReveal {
  round: number;
  category: KirmiziYesilCategory;
  prompt: string;
  votes: Record<string, KirmiziYesilChoice | null>;
  match: boolean;
  consensus: KirmiziYesilChoice | null;
  resolution: KirmiziYesilResolution;
}

export interface KirmiziYesilState {
  round: number; // 1..KIRMIZI_YESIL_ROUNDS
  category: KirmiziYesilCategory;
  prompt: string;
  myLocked: boolean;
  opponentLocked: boolean;
  myChoice: KirmiziYesilChoice | null; // yalniz alicinin kendi aktif oyu
  matches: number;
  redMatches: number;
  dependsMatches: number;
  greenMatches: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  history: KirmiziYesilReveal[]; // yalniz tamamlanip acilmis turlar
  reveal: KirmiziYesilReveal | null;
  compatibility: number | null; // yalniz match_end fazinda
}

export type KimDahaMuhtemelChoice = 'self' | 'partner' | 'both';
export type KimDahaMuhtemelCategory =
  | 'ilk_hamle'
  | 'plan_pusulasi'
  | 'lezzet'
  | 'kahkaha'
  | 'macera'
  | 'ince_jest'
  | 'sosyal_sahne'
  | 'gece_modu';
export type KimDahaMuhtemelTarget =
  | { kind: 'player'; playerId: string }
  | { kind: 'both' };
export type KimDahaMuhtemelResolution =
  | 'same_player'
  | 'both_together'
  | 'split'
  | 'solo'
  | 'skipped';

export interface KimDahaMuhtemelPrompt {
  category: KimDahaMuhtemelCategory;
  prompt: string;
}

export interface KimDahaMuhtemelReveal {
  round: number;
  category: KimDahaMuhtemelCategory;
  prompt: string;
  targets: Record<string, KimDahaMuhtemelTarget | null>;
  agreement: boolean;
  consensus: KimDahaMuhtemelTarget | null;
  resolution: KimDahaMuhtemelResolution;
}

export interface KimDahaMuhtemelState {
  round: number; // 1..KIM_DAHA_MUHTEMEL_ROUNDS
  category: KimDahaMuhtemelCategory;
  prompt: string;
  myLocked: boolean;
  opponentLocked: boolean;
  myChoice: KimDahaMuhtemelChoice | null; // yalniz alicinin kendi aktif oyu
  agreements: number;
  samePersonAgreements: number;
  bothAgreements: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  spotlights: Record<string, number>; // yalniz same_player uzlasilarinin hedefleri
  history: KimDahaMuhtemelReveal[];
  reveal: KimDahaMuhtemelReveal | null;
  agreementPct: number | null; // yalniz match_end fazinda
}

export type IkiDogruBirYalanStatements = [string, string, string];
export type IkiDogruBirYalanRole = 'setup' | 'subject' | 'guesser' | 'done';

export interface IkiDogruBirYalanReveal {
  round: number;
  subjectId: string;
  guesserId: string;
  statements: IkiDogruBirYalanStatements;
  lieIndex: number; // 0..2
  guessIndex: number | null; // timeout = null
  caught: boolean;
}

export interface IkiDogruBirYalanState {
  round: number; // setup/neutral finalde 0; aktif veya tamamlanmis macta 1..availableRounds
  availableRounds: number; // setup kapaninca 0..2
  role: IkiDogruBirYalanRole;
  mySubmitted: boolean;
  opponentSubmitted: boolean;
  subjectId: string | null;
  guesserId: string | null;
  statements: IkiDogruBirYalanStatements | null; // yalniz current guess/reveal paketi
  myGuess: number | null; // yalniz recipient aktif tahminciyse
  guessLocked: boolean;
  caughtCount: number;
  wrongCount: number;
  skippedCount: number;
  attemptedCount: number;
  catches: Record<string, number>; // guesser pid -> yakalanan yalan sayisi
  catchRate: number | null; // attemptedCount 0 ise null
  history: IkiDogruBirYalanReveal[];
  reveal: IkiDogruBirYalanReveal | null;
}

export type AyniAndaSoyleCategory =
  | 'yemek'
  | 'icecek'
  | 'tatli'
  | 'sehir'
  | 'film_dizi'
  | 'hayvan'
  | 'renk'
  | 'tatil'
  | 'sarki'
  | 'super_guc'
  | 'aktivite'
  | 'gece_atistirmasi';

export interface AyniAndaSoylePrompt {
  category: AyniAndaSoyleCategory;
  prompt: string;
}

export type AyniAndaSoyleResolution = 'match' | 'different' | 'solo' | 'skipped';

export interface AyniAndaSoyleReveal {
  round: number;
  category: AyniAndaSoyleCategory;
  prompt: string;
  answers: Record<string, string | null>;
  match: boolean;
  resolution: AyniAndaSoyleResolution;
}

export interface AyniAndaSoyleState {
  round: number; // 1..AYNI_ANDA_SOYLE_ROUNDS
  category: AyniAndaSoyleCategory | null; // match_end'de aggregate-only: null
  prompt: string | null; // match_end'de aggregate-only: null
  myLocked: boolean;
  opponentLocked: boolean;
  myAnswer: string | null; // answer fazinda yalniz alicinin kendi cevabi
  matches: number;
  jointRounds: number;
  differentRounds: number;
  missedRounds: number;
  matchRate: number | null; // jointRounds 0 ise null
  reveal: AyniAndaSoyleReveal | null; // ham cevaplar yalniz aktif reveal'da
}

function hasForbiddenUserTextControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x1f ||
      code === 0x7f ||
      (code >= 0x80 && code <= 0x9f) ||
      code === 0x00ad ||
      code === 0x034f ||
      code === 0x061c ||
      code === 0x180e ||
      code === 0x200e ||
      code === 0x200f ||
      code === 0x200b ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) ||
      code === 0xfeff ||
      (code >= 0xfff9 && code <= 0xfffb)
    ) return true;
  }
  return false;
}

function ikiDogruBirYalanDuplicateKey(value: string): string {
  let comparable = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    // ZWJ/ZWNJ ve variation selector'lar emoji sunumunda kalabilir; fakat
    // gorunurde ayni iki iddiayi benzersiz gostermek icin duplicate anahtarinda
    // fark yaratmalarina izin verilmez.
    if (
      code === 0x200c ||
      code === 0x200d ||
      (code >= 0xfe00 && code <= 0xfe0f) ||
      (code >= 0xe0100 && code <= 0xe01ef)
    ) continue;
    comparable += character;
  }
  return comparable.toLocaleLowerCase('tr-TR');
}

// Sunucu ve istemci parser'i ayni kanonik metni kullanir: NFKC, kenar trim ve
// Unicode bosluklarini tek ASCII bosluga indirme. Kontroller normalize edilmeden
// once reddedilir; boylece newline/tab trim sirasinda sessizce kaybolmaz.
export function normalizeIkiDogruBirYalanStatements(
  value: unknown,
): IkiDogruBirYalanStatements | null {
  if (!Array.isArray(value) || value.length !== IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || hasForbiddenUserTextControl(entry)) return null;
    const clean = entry.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (
      !clean ||
      [...clean].length > IKI_DOGRU_BIR_YALAN_MAX_STATEMENT_LENGTH ||
      hasForbiddenUserTextControl(clean)
    ) return null;
    normalized.push(clean);
  }
  const unique = new Set(normalized.map(ikiDogruBirYalanDuplicateKey));
  if (unique.size !== IKI_DOGRU_BIR_YALAN_STATEMENT_COUNT) return null;
  return [normalized[0], normalized[1], normalized[2]];
}

// Emoji birlestiricileri display'de korunur; karsilastirma anahtarinda ise
// gorunurde ayni cevabi farkli gostermelerine izin verilmez. Bosluk ve noktalama
// toleransi "pizza!" ile "PİZZA" gibi niyet olarak ayni cevaplari eslestirir.
export function ayniAndaSoyleAnswerKey(value: string): string {
  let comparable = '';
  for (const character of value.normalize('NFKC')) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code === 0x200c ||
      code === 0x200d ||
      (code >= 0xfe00 && code <= 0xfe0f) ||
      (code >= 0xe0100 && code <= 0xe01ef)
    ) continue;
    comparable += character;
  }
  return comparable
    .toLocaleLowerCase('tr-TR')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[\p{P}\p{Z}]/gu, '');
}

// Tek bir kisa cevap icin ortak istemci/sunucu kanoniklestirmesi. Kontrol ve
// gorunmez karakterler normalize edilmeden once reddedilir; ZWJ/ZWNJ ile emoji
// variation selector'lari display icin kalabilir, fakat key'de fark yaratmaz.
export function normalizeAyniAndaSoyleAnswer(value: unknown): string | null {
  if (typeof value !== 'string' || hasForbiddenUserTextControl(value)) return null;
  const clean = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const key = ayniAndaSoyleAnswerKey(clean);
  if (
    !clean ||
    [...clean].length > AYNI_ANDA_SOYLE_MAX_ANSWER_LENGTH ||
    hasForbiddenUserTextControl(clean) ||
    !/[\p{L}\p{N}\p{S}]/u.test(key)
  ) return null;
  return clean;
}

export interface PlayerPublic {
  id: string;
  nick: string;
  avatar: number; // 0..AVATAR_COUNT-1
  score: number;
  connected: boolean;
  ready: boolean;
  pickedLetter: boolean; // bu raund harfini kilitledi mi (harfin kendisi gizli kalır)
  jokers: number; // kalan buz jokeri hakkı
}

export interface RoomSnapshot {
  code: string;
  mode: GameMode;
  phase: Phase;
  round: number; // 1'den başlar
  you: string; // senin oyuncu id'in
  players: PlayerPublic[];
  letters: [string, string] | null; // (harf/uzun) sadece yarış/round_end fazlarında dolu
  deadline: number | null; // aktif fazın bitişi, epoch ms (sunucu saati)
  usedWords: string[]; // bu maçta kabul edilmiş kelimeler (tekrar kullanılamaz)
  winner: string | null; // match_end'de kazanan oyuncu id'i
  frozenUntil: Record<string, number>; // (harf) oyuncu id -> buz jokerinin bittiği an
  turn: string | null; // sira tabanli modlarda aktif oyuncu pid'i
  sayi: SayiState | null;
  zincir: ZincirState | null;
  uzun: UzunState | null;
  bom: BomState | null;
  telepati: TelepatiState | null;
  korSiralama: KorSiralamaState | null;
  beniYakala: BeniYakalaState | null;
  randevuRuleti: RandevuRuletiState | null;
  emojiSifre: EmojiSifreState | null;
  kirmiziYesil: KirmiziYesilState | null;
  kimDahaMuhtemel: KimDahaMuhtemelState | null;
  ikiDogruBirYalan: IkiDogruBirYalanState | null;
  ayniAndaSoyle: AyniAndaSoyleState | null;
}

// ---- Mesajlar: istemci -> sunucu ----
export type ClientMsg =
  | { t: 'ready' }
  | { t: 'set_mode'; mode: GameMode } // sadece lobby'de, sadece odayı kuran (ilk oyuncu)
  | { t: 'pick_letter'; letter: string }
  | { t: 'submit_word'; word: string } // harf/zincir/uzun modlarında kelime gönderimi
  | { t: 'pick_number'; value: number } // (sayi) gizli sayı seçimi
  | { t: 'guess'; value: number } // (sayi) sıradaki tahmin
  | { t: 'bom_press'; kind: 'number' | 'bom' } // (bom) sıradaki oyuncunun seçimi
  | { t: 'telepati_answer'; choice: 'a' | 'b' | 'ben' | 'o' } // (telepati) gizli cevap
  | { t: 'kor_rank'; slot: number; itemIndex: number; item: string } // stale kart hamlesi sunucuda reddedilir
  | { t: 'kor_pass'; itemIndex: number; item: string } // (kor siralama) gorulen karti sona at
  | { t: 'beni_yakala_answer'; choice: number; round: number } // choice 0..3; stale tur reddedilir
  | { t: 'beni_yakala_predict'; choice: number; round: number } // partner tahmini; stale tur reddedilir
  | { t: 'randevu_ruleti_pick'; choice: number; round: number } // choice 0..5; stale tur reddedilir
  | { t: 'emoji_sifre_code'; emojis: EmojiSifreCode; round: number } // ayni emoji birden cok kez kullanilabilir
  | { t: 'emoji_sifre_guess'; choice: number; round: number } // choice 0..3; stale tur reddedilir
  | { t: 'kirmizi_yesil_vote'; choice: KirmiziYesilChoice; round: number } // stale tur ve tekrar oy reddedilir
  | { t: 'kim_daha_muhtemel_vote'; choice: KimDahaMuhtemelChoice; round: number } // stale tur ve tekrar oy reddedilir
  | { t: 'iki_dogru_bir_yalan_pack'; statements: IkiDogruBirYalanStatements; lieIndex: number }
  | { t: 'iki_dogru_bir_yalan_guess'; choice: number; round: number }
  | { t: 'ayni_anda_soyle_answer'; answer: string; round: number }
  | { t: 'use_joker' } // moda özel joker (MODE_JOKER)
  | { t: 'react'; id: number } // sticker tepkisi (0..REACTION_COUNT-1), sunucu 3sn throttle uygular
  | { t: 'rematch' };

// ---- Mesajlar: sunucu -> istemci ----
export type WordRejectReason =
  | 'not_in_dict'
  | 'wrong_pattern'
  | 'already_used'
  | 'too_short'
  | 'too_late'
  | 'throttled'
  | 'frozen'; // buz jokeri yüzünden donuk

export type ServerMsg =
  | { t: 'snapshot'; state: RoomSnapshot } // katılım/yeniden bağlanma ve her faz değişiminde tam durum
  | { t: 'opp_picked' } // rakip harfini kilitledi
  | { t: 'countdown'; from: number } // geri sayım başlangıcı (istemci 3-2-1 animasyonu oynatır)
  | { t: 'letters'; letters: [string, string]; rerolled: boolean } // yarış başlangıcında açıklanır
  | { t: 'word_accepted'; by: string; word: string; scores: Record<string, number> }
  | { t: 'word_rejected'; word: string; reason: WordRejectReason } // yalnızca gönderene
  | { t: 'opp_rejected' } // rakip denedi-tutmadı sinyali (küçük vfx için)
  | { t: 'round_end'; winner: string | null; word: string | null; scores: Record<string, number> }
  | { t: 'word_info'; word: string; meaning: string } // TDK anlamı, asenkron gelebilir
  | { t: 'joker_used'; by: string; kind: JokerKind; until?: number } // until sadece buz için
  | { t: 'mode_set'; mode: GameMode } // lobby'de mod değişti
  // Sayı Avı
  | {
      t: 'guess_result';
      by: string; // tahmini yapan
      value: number;
      result: 'yukari' | 'asagi' | 'buldu' | 'kayniyor' | 'sicak' | 'ilik' | 'soguk'; // son dördü termometre jokeri
      bounds: { lo: number; hi: number } | null; // tahmincinin güncel aralığı (termometrede değişmez -> null olabilir)
    }
  // Kelime Zinciri
  | { t: 'zincir_word'; by: string; word: string; nextLetter: string; turnMs: number } // kabul edilen halka
  | { t: 'zincir_boom'; loser: string; lives: Record<string, number>; nextLetter: string | null } // süre doldu, can gitti
  // Bom
  | {
      t: 'bom_result';
      by: string;
      value: number; // basılan andaki sayı
      kind: 'number' | 'bom' | 'timeout';
      ok: boolean; // doğru hamle miydi
      insured: boolean; // hata sigortayla affedildi mi
      lives: Record<string, number>;
      next: number; // sıradaki sayı
      turnMs: number;
    }
  // Telepati
  | {
      t: 'telepati_reveal';
      match: boolean;
      // cevaplar: ab tipinde 'a'|'b'; kim tipinde işaret edilen OYUNCUNUN pid'i (UI nick'e çevirir)
      answers: Record<string, string>; // cevaplamayan oyuncunun anahtarı hiç yer almaz
      matches: number; // güncel toplam (çifte kalp uygulanmış)
      doubled: boolean; // bu soru 2 puan mı sayıldı
      qIndex: number;
    }
  // En Uzun Kelime
  | { t: 'uzun_locked'; by: string } // oyuncu kelimesini kilitledi (kelime gizli)
  | {
      t: 'uzun_reveal';
      words: Record<string, { word: string; len: number } | null>; // oyuncu id -> gönderdiği (null = göndermedi/geçersiz)
      winner: string | null;
      scores: Record<string, number>;
    }
  | { t: 'match_end'; winner: string | null; scores: Record<string, number>; word: string | null } // winner null = ko-op mod (telepati); word = maçı bitiren kelime (kelime modları)
  | { t: 'rematch_state'; want: string[] } // rövanş isteyen oyuncu id'leri
  | { t: 'reaction'; by: string; id: number } // sticker tepkisi yayını
  | { t: 'opp_conn'; connected: boolean }
  | { t: 'error'; code: 'room_full' | 'not_found' | 'bad_msg'; msg?: string };

// ---- REST ----
// POST /api/rooms                 -> { code: string }
// GET  /api/rooms/:code           -> { exists: boolean, joinable: boolean }
// WS   /ws/:code?nick=..&avatar=..
//      Sec-WebSocket-Protocol: harfiyen.v2, harfiyen.auth.<16-byte-base64url-secret>
//      Secret oda bazli localStorage'da tutulur; URL/payload/snapshot'a girmez.
