// GameRoom kalici durum modelleri ve mod isleyicilerinin kullandigi baglam arayuzu.
// Sunucu tarafi durum, snapshot'tan AYRIDIR: gizli bilgiler (sayi sirlari) burada tutulur,
// snapshot'a asla sizmaz (round_end aralik-daraltma acilimi haric).
import type {
  BeniYakalaQuestion,
  BeniYakalaReveal,
  EmojiSifreCode,
  EmojiSifreOptions,
  EmojiSifreReveal,
  GameMode,
  KimDahaMuhtemelChoice,
  KimDahaMuhtemelPrompt,
  KimDahaMuhtemelReveal,
  KirmiziYesilChoice,
  KirmiziYesilReveal,
  KirmiziYesilScenario,
  KorSiralamaPack,
  Phase,
  RandevuPlanItem,
  RandevuRuletiReveal,
  RandevuRuletiRound,
  ServerMsg,
  TelepatiQuestion,
} from '@harfiyen/shared';

export interface PlayerState {
  id: string; // herkese acik, oda icinde sabit oyuncu kimligi
  reconnectHash: string; // SHA-256; secret ve hash snapshot/event'lere asla girmez
  nick: string;
  avatar: number;
  score: number;
  connected: boolean;
  ready: boolean;
  pickedLetter: string | null; // secilen harf gizli tutulur, snapshot'ta boolean'a indirgenir
  rematch: boolean;
  lastSubmitAt: number;
  lastReactAt: number; // tepki throttle'i; kalici tutulur (hibernation'a dayanikli)
}

// ---- Moda ozel sunucu durumlari (gizli alanlar dahil) ----

export interface SayiServer {
  roundWins: Record<string, number>; // pid -> kazanilan raund
  secrets: Record<string, number | null>; // pid -> gizli sayi (SADECE sunucu)
  picked: Record<string, boolean>; // pid -> sayisini kilitledi mi
  bounds: Record<string, { lo: number; hi: number }>; // tahmin eden pid -> RAKIP sayisi icin bilinen aralik
  thermo: Record<string, boolean>; // pid -> sonraki tahmin termometreli mi
  equalizer: boolean; // eşitleme asamasi aktif mi
  starter: string | null; // bu raundun baslatici pid'i (raundlar arasi alternatif icin saklanir)
}

export interface ZincirServer {
  lives: Record<string, number>;
  lastWord: string | null;
  requiredLetter: string | null;
  turnMs: number; // bu turun toplam suresi (gitgide kisalir)
  acceptedCount: number; // kabul edilen kelime sayisi (round = +1)
}

export interface UzunServer {
  rights: Record<string, number>; // pid -> bu raunt kalan gonderim hakki
  best: Record<string, { word: string; len: number; at: number } | null>; // pid -> en iyi gecerli gonderim
  submitted: Record<string, boolean>; // pid -> kilitlendi mi (hak kalmadi)
}

// Telepati: ham secimler ('a'|'b'|'ben'|'o') reveal'e kadar SADECE sunucuda tutulur,
// snapshot'a yalniz answered bayraklari iner.
export interface TelepatiServer {
  questions: TelepatiQuestion[]; // maca ozel rastgele soru alt kumesi (rovansta tazelenir)
  qIndex: number; // 1..TELEPATI_QUESTIONS
  answers: Record<string, string>; // pid -> ham secim (ilk cevap kilitler)
  matches: number; // ORTAK uyum puani
  doubled: boolean; // bu soruda cifte kalp aktif mi
}

// Kor Siralama: placements ve o anki answers mac sonuna/reveal'e kadar sunucuda tutulur.
// Her placements dizisinin indeksi sirayi (0..4), degeri o yuvaya kilitlenen karti temsil eder.
export interface KorSiralamaServer {
  pack: KorSiralamaPack;
  itemIndex: number; // sunucuda 0 tabanli
  placements: Record<string, Array<string | null>>;
  answers: Record<string, number>; // pid -> 1..5 (mevcut kart)
  lastSlots: Record<string, number> | null;
  exactMatches: number;
  compatibility: number | null;
}

// Beni Yakala: answers/predictions aktif fazlarda SADECE sunucuda tutulur.
// Snapshot her aliciya yalniz kendi ham degerini verir; iki taraf ancak reveal'de acilir.
export interface BeniYakalaServer {
  questions: BeniYakalaQuestion[];
  roundIndex: number; // 0 tabanli
  answers: Record<string, number>; // pid -> 0..3; eksik = cevaplamadi
  predictions: Record<string, number>; // pid -> partner icin 0..3; eksik = tahmin etmedi
  reads: Record<string, number>; // pid -> toplam dogru tahmin
  exactMatches: number;
  mutualReads: number;
  reveal: BeniYakalaReveal | null;
}

// Randevu Ruleti: aktif picks haritasi reveal'e kadar yalniz sunucuda kalir.
// Tamamlanan reveal/history ve plan reconnect ile kalici olarak geri gelir.
export interface RandevuRuletiServer {
  rounds: RandevuRuletiRound[];
  roundIndex: number; // 0 tabanli
  picks: Record<string, number>; // pid -> 0..5; eksik = timeout/henuz kilitlemedi
  matches: number;
  plan: RandevuPlanItem[];
  history: RandevuRuletiReveal[];
  reveal: RandevuRuletiReveal | null;
}

export interface EmojiSifreServerRound {
  target: string;
  options: EmojiSifreOptions;
  correctChoice: number;
  fallback: EmojiSifreCode;
}

// Emoji Sifre: hedef/secenekler ve ham tahmin role gore recipient snapshot'ta
// daraltilir. Kod, tahmin fazina gecene kadar cozucuden gizli tutulur.
export interface EmojiSifreServer {
  rounds: EmojiSifreServerRound[];
  roundIndex: number; // 0 tabanli; players[roundIndex % 2] kodlayici
  code: EmojiSifreCode | null;
  codeFallback: boolean;
  guess: number | null;
  correctCount: number;
  history: EmojiSifreReveal[];
  reveal: EmojiSifreReveal | null;
}

// Kirmizi mi Yesil mi?: aktif oylar reveal'e kadar yalniz sunucuda kalir.
// Mac icin secilen gelecek senaryolar recipient snapshot'a hic tasinmaz.
export interface KirmiziYesilServer {
  scenarios: KirmiziYesilScenario[];
  roundIndex: number; // 0 tabanli
  votes: Record<string, KirmiziYesilChoice>;
  matches: number;
  redMatches: number;
  dependsMatches: number;
  greenMatches: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  history: KirmiziYesilReveal[];
  reveal: KirmiziYesilReveal | null;
  compatibility: number | null;
}

// Kim Daha Muhtemel?: self/partner oylar sunucuda, oy veren oyuncunun
// kimligine gore mutlak hedefe cevrilir. Aktif rakip oyu reveal'e kadar gizlidir.
export interface KimDahaMuhtemelServer {
  prompts: KimDahaMuhtemelPrompt[];
  roundIndex: number; // 0 tabanli
  votes: Record<string, KimDahaMuhtemelChoice>;
  agreements: number;
  samePersonAgreements: number;
  bothAgreements: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  spotlights: Record<string, number>;
  history: KimDahaMuhtemelReveal[];
  reveal: KimDahaMuhtemelReveal | null;
  agreementPct: number | null;
}

// 7 Bom: gizli alan yok; snapshot'taki BomState ile ayni sekil.
export interface BomServer {
  lives: Record<string, number>; // pid -> kalan can
  current: number; // siradaki soylenecek sayi (ikisi de gorur)
  turnMs: number; // bu turun suresi (gitgide kisalir)
  insured: Record<string, boolean>; // pid -> sigorta jokeri aktif mi (bir hatayi affeder)
}

export interface RoomState {
  code: string;
  mode: GameMode;
  creator: string | null; // odayi kuran (ilk katilan) pid; set_mode yalniz ona acik
  phase: Phase;
  round: number;
  turn: string | null; // (sayi/zincir) sira hangi oyuncuda
  players: PlayerState[];
  letters: [string, string] | null; // sadece racing/uzun_race/round_end'de acik
  pending: { letters: [string, string]; rerolled: boolean } | null; // countdown boyunca gizli
  deadline: number | null;
  usedWords: string[];
  winner: string | null;
  jokers: Record<string, number>; // pid -> kalan joker hakki (mod basina tur MODE_JOKER)
  frozenUntil: Record<string, number>; // (harf) pid -> donmanin bittigi an (epoch ms)
  alarmPurpose: 'phase' | 'cleanup' | null;
  sayi: SayiServer | null;
  zincir: ZincirServer | null;
  uzun: UzunServer | null;
  bom: BomServer | null;
  telepati: TelepatiServer | null;
  korSiralama: KorSiralamaServer | null;
  beniYakala: BeniYakalaServer | null;
  randevuRuleti: RandevuRuletiServer | null;
  emojiSifre: EmojiSifreServer | null;
  kirmiziYesil: KirmiziYesilServer | null;
  kimDahaMuhtemel: KimDahaMuhtemelServer | null;
}

// Mod isleyicilerine verilen dar baglam. GameRoom bu metotlari saglar; boylece
// soket/alarm/depolama ayrintilari DO kabuğunda kalir, mod dosyalari saf akista yogunlasir.
export interface RoomCtx {
  broadcast(msg: ServerMsg): void;
  sendTo(ws: WebSocket, msg: ServerMsg): void;
  sendToOthers(pid: string, msg: ServerMsg): void;
  broadcastSnapshot(state: RoomState): void;
  save(state: RoomState): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  scoresOf(state: RoomState): Record<string, number>;
  dict(): ReadonlySet<string>;
  pairs(): Readonly<Record<string, number>>;
  startCounts(): ReadonlyMap<string, number>;
  fetchMeaning(word: string): void; // ates-et-unut (harf modu TDK anlami)
}
