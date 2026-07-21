// GameRoom — SQLite destekli, hibernation kullanan Durable Object.
// Tum zamanlama ctx.storage.setAlarm ile; setTimeout/setInterval KULLANILMAZ.
// Kabuk (soket/alarm/katilim/snapshot) burada; moda ozel akis game/modes/*.ts icinde.
import { DurableObject } from 'cloudflare:workers';
import {
  AVATAR_COUNT,
  COUNTDOWN_MS,
  DEFAULT_MODE,
  JOKER_FREEZE_MS,
  MAX_NICK_LEN,
  MIN_PAIR_WORDS,
  PICK_MS,
  RACE_MS,
  RESULT_MS,
  SUBMIT_THROTTLE_MS,
  TARGET_SCORE,
  TR_LETTERS,
  normalizeTr,
  pairKey,
} from '@harfiyen/shared';
import type { GameMode, RoomSnapshot, ServerMsg } from '@harfiyen/shared';
import {
  canReact,
  canUseJoker,
  chooseFallbackPair,
  isFrozen,
  isNickClean,
  jokerGrantedOnRound,
  loadDict,
  loadStartCounts,
  toPairCounts,
  toWordSet,
  validateWord,
} from './game/logic';
import { parseClientMessage } from './game/client-message';
import {
  WS_APP_PROTOCOL,
  createPublicPlayerId,
  hashReconnectSecret,
  parseReconnectProtocols,
  resolvePlayerJoin,
} from './reconnect-auth';
import type { PlayerState, RoomCtx, RoomState } from './game/state';
import * as sayi from './game/modes/sayi';
import * as zincir from './game/modes/zincir';
import * as uzun from './game/modes/uzun';
import * as bom from './game/modes/bom';
import * as telepati from './game/modes/telepati';
import * as korSiralama from './game/modes/kor-siralama';
import * as beniYakala from './game/modes/beni-yakala';
import * as randevuRuleti from './game/modes/randevu-ruleti';
import * as emojiSifre from './game/modes/emoji-sifre';
import * as kirmiziYesil from './game/modes/kirmizi-yesil';
import * as kimDahaMuhtemel from './game/modes/kim-daha-muhtemel';
import * as ikiDogruBirYalan from './game/modes/iki-dogru-bir-yalan';
import * as ayniAndaSoyle from './game/modes/ayni-anda-soyle';
import wordsRaw from './data/words.txt';
import pairsJson from './data/pairs.json';
import badwordsJson from './data/badwords.json';

const CLEANUP_MS = 10 * 60_000;
const STATE_KEY = 'state';
const FALLBACK_NICK = 'Oyuncu';

const MODES: GameMode[] = [
  'harf',
  'sayi',
  'zincir',
  'uzun',
  'bom',
  'telepati',
  'kor_siralama',
  'beni_yakala',
  'randevu_ruleti',
  'emoji_sifre',
  'kirmizi_yesil',
  'kim_daha_muhtemel',
  'iki_dogru_bir_yalan',
  'ayni_anda_soyle',
];
function isGameMode(x: unknown): x is GameMode {
  return typeof x === 'string' && (MODES as string[]).includes(x);
}

interface Attachment {
  pid: string;
}

// Veri, izolat basina bir kez tembel olarak hazirlanir.
let pairsCache: Record<string, number> | null = null;
function getPairs(): Record<string, number> {
  pairsCache ??= toPairCounts(pairsJson);
  return pairsCache;
}
let badwordsCache: Set<string> | null = null;
function getBadwords(): Set<string> {
  badwordsCache ??= toWordSet(badwordsJson);
  return badwordsCache;
}

function randomLetter(): string {
  return TR_LETTERS[Math.floor(Math.random() * TR_LETTERS.length)];
}

export class GameRoom extends DurableObject<Env> {
  // Mod isleyicilerine verilen dar baglam; DO metotlarini kapatarak private tutar.
  private mc(): RoomCtx {
    return {
      broadcast: (m) => this.broadcast(m),
      sendTo: (ws, m) => this.sendTo(ws, m),
      sendToOthers: (pid, m) => this.sendToOthers(pid, m),
      broadcastSnapshot: (s) => this.broadcastSnapshot(s),
      save: (s) => this.save(s),
      setAlarm: (at) => this.ctx.storage.setAlarm(at),
      deleteAlarm: () => this.ctx.storage.deleteAlarm(),
      scoresOf: (s) => this.scoresOf(s),
      dict: () => loadDict(wordsRaw),
      pairs: () => getPairs(),
      startCounts: () => loadStartCounts(wordsRaw),
      fetchMeaning: (w) => this.ctx.waitUntil(this.fetchMeaning(w)),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleJoin(request, url);
    }
    if (url.pathname === '/reserve' && request.method === 'POST') {
      return this.handleReserve(url);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      const state = await this.getState();
      return Response.json({
        exists: state !== null,
        joinable: state !== null && state.players.length < 2,
      });
    }
    return new Response('bulunamadi', { status: 404 });
  }

  // ---- REST (worker icinden) ----

  private async handleReserve(url: URL): Promise<Response> {
    const existing = await this.getState();
    if (existing) return Response.json({ ok: false }, { status: 409 });
    const state: RoomState = {
      code: url.searchParams.get('code') ?? '',
      mode: DEFAULT_MODE,
      creator: null,
      phase: 'lobby',
      round: 1,
      turn: null,
      players: [],
      letters: null,
      pending: null,
      deadline: null,
      usedWords: [],
      winner: null,
      jokers: {},
      frozenUntil: {},
      alarmPurpose: 'cleanup', // kimse katilmazsa oda kendini temizler
      sayi: null,
      zincir: null,
      uzun: null,
      bom: null,
      telepati: null,
      korSiralama: null,
      beniYakala: null,
      randevuRuleti: null,
      emojiSifre: null,
      kirmiziYesil: null,
      kimDahaMuhtemel: null,
      ikiDogruBirYalan: null,
      ayniAndaSoyle: null,
    };
    await this.ctx.storage.setAlarm(Date.now() + CLEANUP_MS);
    await this.save(state);
    return Response.json({ ok: true });
  }

  // ---- Katilim ----

  private async handleJoin(request: Request, url: URL): Promise<Response> {
    const auth = parseReconnectProtocols(request.headers.get('Sec-WebSocket-Protocol'));
    if (!auth.ok) return new Response('gecersiz websocket kimligi', { status: 400 });
    const reconnectHash = await hashReconnectSecret(auth.secret);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const upgradeHeaders = { 'Sec-WebSocket-Protocol': WS_APP_PROTOCOL };

    const reject = (code: 'room_full' | 'not_found' | 'bad_msg', msg?: string): Response => {
      // Reddetme soketini de hibernation API'sine ver; istemci 101'i alirken
      // koparsa hata GameRoom.webSocketError'a duser ve DO'yu dusurmez.
      this.ctx.acceptWebSocket(server, ['rejected']);
      server.serializeAttachment({ pid: '' } satisfies Attachment);
      // 101 yaniti istemciye ulasmadan ayni tikta send/close etmek workerd'de
      // `Network connection lost` uretebilir. Kisa beklemeler waitUntil ile
      // izlenir; istemci hata mesajini alir, sonra politika koduyla kapanir.
      this.ctx.waitUntil(
        (async () => {
          await scheduler.wait(5);
          try {
            server.send(JSON.stringify({ t: 'error', code, msg } satisfies ServerMsg));
            await scheduler.wait(25);
            server.close(1008, code);
          } catch {
            // istemci once kapatmis olabilir
          }
        })(),
      );
      return new Response(null, { status: 101, webSocket: client, headers: upgradeHeaders });
    };

    const state = await this.getState();
    if (!state) return reject('not_found');

    const resolution = await resolvePlayerJoin(state.players, reconnectHash);
    if (resolution.kind === 'full') return reject('room_full');

    let player: PlayerState;
    if (resolution.kind === 'new') {
      const rawNick = (url.searchParams.get('nick') ?? '').trim().slice(0, MAX_NICK_LEN);
      const nick = rawNick && isNickClean(rawNick, getBadwords()) ? rawNick : FALLBACK_NICK;
      const avatarRaw = Number(url.searchParams.get('avatar'));
      const avatar = Number.isInteger(avatarRaw) && avatarRaw >= 0 && avatarRaw < AVATAR_COUNT ? avatarRaw : 0;
      player = {
        id: createPublicPlayerId(state.players),
        reconnectHash,
        nick,
        avatar,
        score: 0,
        connected: true,
        ready: false,
        pickedLetter: null,
        rematch: false,
        lastSubmitAt: 0,
        lastReactAt: 0,
      };
      state.players.push(player);
      state.creator ??= player.id; // ilk katilan odayi kurar (players[0])
      state.jokers[player.id] = 1; // her oyuncu maca 1 jokerle baslar
    } else {
      player = resolution.player;
      // Ayni secret geri geldi: eski soket(ler) kapatilir, yenisi gecer.
      for (const old of this.ctx.getWebSockets(player.id)) {
        try {
          old.close(1000, 'replaced');
        } catch {
          // zaten kapali olabilir
        }
      }
      player.connected = true;
    }

    if (state.alarmPurpose === 'cleanup') {
      await this.ctx.storage.deleteAlarm();
      state.alarmPurpose = null;
      // bos kalinca donmus faz makinesini tekrar kur
      if (state.phase !== 'lobby' && state.phase !== 'match_end' && state.deadline !== null) {
        state.alarmPurpose = 'phase';
        await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, state.deadline));
      }
    }

    await this.save(state);
    this.ctx.acceptWebSocket(server, [player.id]);
    server.serializeAttachment({ pid: player.id } satisfies Attachment);
    this.sendToOthers(player.id, { t: 'opp_conn', connected: true });
    this.broadcastSnapshot(state);
    return new Response(null, { status: 101, webSocket: client, headers: upgradeHeaders });
  }

  // ---- WS mesajlari ----

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const pid = this.pidOf(ws);
    if (!pid) return;

    const parsed = parseClientMessage(message);
    if (!parsed.ok) {
      const detail =
        parsed.reason === 'too_large'
          ? 'mesaj cok buyuk'
          : parsed.reason === 'binary_not_supported'
            ? 'binary mesaj desteklenmiyor'
            : parsed.reason === 'invalid_json'
              ? 'gecersiz json'
              : 'gecersiz mesaj';
      this.sendTo(ws, { t: 'error', code: 'bad_msg', msg: detail });
      if (parsed.reason === 'too_large' || parsed.reason === 'binary_not_supported') {
        try {
          ws.close(parsed.reason === 'too_large' ? 1009 : 1003, detail);
        } catch {
          // kapanmakta olan soket
        }
      }
      return;
    }
    const msg = parsed.value;

    const state = await this.getState();
    if (!state) return;
    const player = state.players.find((p) => p.id === pid);
    if (!player) return;

    switch (msg.t) {
      case 'ready':
        await this.onReady(state, player);
        break;
      case 'set_mode':
        await this.onSetMode(state, player, msg.mode);
        break;
      case 'pick_letter':
        await this.onPickLetter(state, player, msg.letter);
        break;
      case 'pick_number':
        await sayi.onPickNumber(this.mc(), state, player, msg.value);
        break;
      case 'guess':
        await sayi.onGuess(this.mc(), state, player, msg.value);
        break;
      case 'bom_press':
        await bom.onPress(this.mc(), state, player, msg.kind);
        break;
      case 'telepati_answer':
        await telepati.onAnswer(this.mc(), state, player, msg.choice);
        break;
      case 'kor_rank':
        await korSiralama.onRank(this.mc(), state, player, msg.slot, msg.itemIndex, msg.item);
        break;
      case 'kor_pass':
        await korSiralama.onJoker(this.mc(), state, player, msg.itemIndex, msg.item);
        break;
      case 'beni_yakala_answer':
        await beniYakala.onAnswer(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'beni_yakala_predict':
        await beniYakala.onPredict(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'randevu_ruleti_pick':
        await randevuRuleti.onPick(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'emoji_sifre_code':
        await emojiSifre.onCode(this.mc(), state, player, msg.emojis, msg.round);
        break;
      case 'emoji_sifre_guess':
        await emojiSifre.onGuess(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'kirmizi_yesil_vote':
        await kirmiziYesil.onVote(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'kim_daha_muhtemel_vote':
        await kimDahaMuhtemel.onVote(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'iki_dogru_bir_yalan_pack':
        await ikiDogruBirYalan.onPack(this.mc(), state, player, msg.statements, msg.lieIndex);
        break;
      case 'iki_dogru_bir_yalan_guess':
        await ikiDogruBirYalan.onGuess(this.mc(), state, player, msg.choice, msg.round);
        break;
      case 'ayni_anda_soyle_answer':
        await ayniAndaSoyle.onAnswer(this.mc(), state, player, msg.answer, msg.round);
        break;
      case 'submit_word':
        if (state.mode === 'zincir') await zincir.onSubmit(this.mc(), state, player, ws, msg.word);
        else if (state.mode === 'uzun') await uzun.onSubmit(this.mc(), state, player, ws, msg.word);
        else await this.onSubmitWord(state, player, ws, msg.word); // harf
        break;
      case 'use_joker':
        await this.onUseJokerDispatch(state, player);
        break;
      case 'react':
        await this.onReact(state, player, msg.id);
        break;
      case 'rematch':
        await this.onRematch(state, player);
        break;
      default:
        this.sendTo(ws, { t: 'error', code: 'bad_msg' });
    }
  }

  // set_mode: yalniz lobby'de ve yalniz odayi kuran (creator) degistirebilir.
  private async onSetMode(state: RoomState, player: PlayerState, mode: GameMode): Promise<void> {
    if (state.phase !== 'lobby') return;
    if (state.creator !== player.id) return;
    if (!isGameMode(mode) || mode === state.mode) return;
    state.mode = mode;
    await this.save(state);
    this.broadcast({ t: 'mode_set', mode });
    this.broadcastSnapshot(state);
  }

  private async onUseJokerDispatch(state: RoomState, player: PlayerState): Promise<void> {
    switch (state.mode) {
      case 'harf':
        await this.onUseJoker(state, player);
        break;
      case 'sayi':
        await sayi.onJoker(this.mc(), state, player);
        break;
      case 'zincir':
        await zincir.onJoker(this.mc(), state, player);
        break;
      case 'uzun':
        await uzun.onJoker(this.mc(), state, player);
        break;
      case 'bom':
        await bom.onJoker(this.mc(), state, player);
        break;
      case 'telepati':
        await telepati.onJoker(this.mc(), state, player);
        break;
      case 'kor_siralama':
        break; // bu mod stale-kart korumali kor_pass mesaji kullanir
      case 'beni_yakala':
        break; // bu kisa cift testinde joker yok
      case 'randevu_ruleti':
        break; // bu ortak plan modunda joker yok
      case 'emoji_sifre':
        break; // bu kisa co-op modunda joker yok
      case 'kirmizi_yesil':
        break; // bu hizli uyum testinde joker yok
      case 'kim_daha_muhtemel':
        break; // bu hizli cift oyununda joker yok
      case 'iki_dogru_bir_yalan':
        break; // bu kisa tanişma oyununda joker yok
      case 'ayni_anda_soyle':
        break; // bu kisa ortak cevap oyununda joker yok
    }
  }

  private async onReady(state: RoomState, player: PlayerState): Promise<void> {
    if (state.phase !== 'lobby') return;
    player.ready = true;
    if (state.players.length === 2 && state.players.every((p) => p.ready)) {
      await this.startMode(state);
      return;
    }
    await this.save(state);
    this.broadcastSnapshot(state);
  }

  // Moda gore mac baslatir. harf/uzun secim (picking) ile, sayi sayi_pick, zincir countdown.
  private async startMode(state: RoomState): Promise<void> {
    switch (state.mode) {
      case 'harf':
      case 'uzun':
        await this.startPicking(state);
        break;
      case 'sayi':
        await sayi.startMatch(this.mc(), state);
        break;
      case 'zincir':
        await zincir.startMatch(this.mc(), state);
        break;
      case 'bom':
        await bom.startMatch(this.mc(), state);
        break;
      case 'telepati':
        await telepati.startMatch(this.mc(), state);
        break;
      case 'kor_siralama':
        await korSiralama.startMatch(this.mc(), state);
        break;
      case 'beni_yakala':
        await beniYakala.startMatch(this.mc(), state);
        break;
      case 'randevu_ruleti':
        await randevuRuleti.startMatch(this.mc(), state);
        break;
      case 'emoji_sifre':
        await emojiSifre.startMatch(this.mc(), state);
        break;
      case 'kirmizi_yesil':
        await kirmiziYesil.startMatch(this.mc(), state);
        break;
      case 'kim_daha_muhtemel':
        await kimDahaMuhtemel.startMatch(this.mc(), state);
        break;
      case 'iki_dogru_bir_yalan':
        await ikiDogruBirYalan.startMatch(this.mc(), state);
        break;
      case 'ayni_anda_soyle':
        await ayniAndaSoyle.startMatch(this.mc(), state);
        break;
    }
  }

  private async onPickLetter(state: RoomState, player: PlayerState, rawLetter: string): Promise<void> {
    if (state.phase !== 'picking') return;
    if (player.pickedLetter !== null) return; // ilk secim kilitler
    const letter = normalizeTr(String(rawLetter ?? ''));
    if (!(TR_LETTERS as readonly string[]).includes(letter)) return;
    player.pickedLetter = letter;
    this.sendToOthers(player.id, { t: 'opp_picked' });
    if (state.players.length === 2 && state.players.every((p) => p.pickedLetter !== null)) {
      await this.startCountdown(state);
      return;
    }
    await this.save(state);
  }

  private async onSubmitWord(state: RoomState, player: PlayerState, ws: WebSocket, rawWord: string): Promise<void> {
    const attempt = normalizeTr(String(rawWord ?? ''));
    if (state.phase !== 'racing' || !state.letters) {
      this.sendTo(ws, { t: 'word_rejected', word: attempt, reason: 'too_late' });
      return;
    }
    const now = Date.now();
    // donuk oyuncunun denemesi reddedilir; rakibe opp_rejected sinyali de gitmez
    if (isFrozen(state.frozenUntil, player.id, now)) {
      this.sendTo(ws, { t: 'word_rejected', word: attempt, reason: 'frozen' });
      return;
    }
    if (now - player.lastSubmitAt < SUBMIT_THROTTLE_MS) {
      this.sendTo(ws, { t: 'word_rejected', word: attempt, reason: 'throttled' });
      return;
    }
    player.lastSubmitAt = now;

    const verdict = validateWord(attempt, state.letters, new Set(state.usedWords), loadDict(wordsRaw));
    if (!verdict.ok) {
      await this.save(state);
      this.sendTo(ws, { t: 'word_rejected', word: attempt, reason: verdict.reason });
      this.sendToOthers(player.id, { t: 'opp_rejected' });
      return;
    }

    const word = verdict.word;
    state.usedWords.push(word);
    player.score += 1;
    state.frozenUntil = {}; // yaris bitiyor, donmalar temizlenir
    const scores = this.scoresOf(state);
    this.broadcast({ t: 'word_accepted', by: player.id, word, scores });
    this.ctx.waitUntil(this.fetchMeaning(word));

    if (player.score >= TARGET_SCORE) {
      state.phase = 'match_end';
      state.winner = player.id;
      state.letters = null;
      state.pending = null;
      state.deadline = null;
      state.alarmPurpose = null;
      await this.ctx.storage.deleteAlarm();
      await this.save(state);
      this.broadcast({ t: 'match_end', winner: player.id, scores, word });
      this.broadcastSnapshot(state);
      return;
    }

    state.phase = 'round_end';
    state.deadline = now + RESULT_MS;
    state.alarmPurpose = 'phase';
    await this.ctx.storage.setAlarm(state.deadline);
    await this.save(state);
    this.broadcast({ t: 'round_end', winner: player.id, word, scores });
    this.broadcastSnapshot(state);
  }

  // Buz jokeri (harf): yalnizca racing fazinda, hak varsa ve rakip zaten donuk degilse.
  // Gecersiz kullanim sessizce yutulur (hata mesaji yok).
  private async onUseJoker(state: RoomState, player: PlayerState): Promise<void> {
    if (state.phase !== 'racing') return;
    const opponent = state.players.find((p) => p.id !== player.id);
    if (!opponent) return;
    const now = Date.now();
    if (!canUseJoker(state.jokers[player.id] ?? 0, isFrozen(state.frozenUntil, opponent.id, now))) return;

    state.jokers[player.id] = (state.jokers[player.id] ?? 0) - 1;
    const until = now + JOKER_FREEZE_MS;
    state.frozenUntil[opponent.id] = until;
    await this.save(state);
    this.broadcast({ t: 'joker_used', by: player.id, kind: 'buz', until });
    this.broadcastSnapshot(state);
  }

  // Tepki: her fazda serbest (lobby dahil). Gecersiz id veya throttle sessizce yutulur.
  // Gonderene de yayinlanir (echo = iletim onayi).
  private async onReact(state: RoomState, player: PlayerState, id: number): Promise<void> {
    const now = Date.now();
    if (!canReact(id, player.lastReactAt ?? 0, now)) return; // eski kayitlarda alan olmayabilir
    player.lastReactAt = now;
    await this.save(state);
    this.broadcast({ t: 'reaction', by: player.id, id });
  }

  private async onRematch(state: RoomState, player: PlayerState): Promise<void> {
    if (state.phase !== 'match_end') return;
    player.rematch = true;
    this.broadcast({ t: 'rematch_state', want: state.players.filter((p) => p.rematch).map((p) => p.id) });
    if (state.players.length === 2 && state.players.every((p) => p.rematch)) {
      for (const p of state.players) {
        p.score = 0;
        p.rematch = false;
        p.pickedLetter = null;
        state.jokers[p.id] = 1; // rovansta joker haklari sifirlanip 1'e doner
      }
      state.usedWords = [];
      state.winner = null;
      state.round = 1;
      state.turn = null;
      state.frozenUntil = {};
      state.sayi = null;
      state.zincir = null;
      state.uzun = null;
      state.bom = null;
      state.telepati = null; // rovansta taze soru alt kumesi kurulur
      state.korSiralama = null; // rovansta taze konu/deste secilir
      state.beniYakala = null; // rovansta taze bes soru secilir
      state.randevuRuleti = null; // rovansta uc kategori icin taze secenek setleri secilir
      state.emojiSifre = null; // rovansta taze hedefler ve secenek siralari uretilir
      state.kirmiziYesil = null; // rovansta sekiz kategoriden taze senaryolar secilir
      state.kimDahaMuhtemel = null; // rovansta sekiz kategoriden taze promptlar secilir
      state.ikiDogruBirYalan = null; // rovansta iki yeni oyuncu paketi hazirlanir
      state.ayniAndaSoyle = null; // rovansta bes yeni kategori guvenle secilir
      this.broadcast({ t: 'rematch_state', want: [] });
      // mod rovansta korunur; her mod kendi durumunu bastan kurar
      await this.startMode(state);
      return;
    }
    await this.save(state);
  }

  // ---- Faz gecisleri (harf/uzun paylasimli secim + harf yarisi) ----

  private async startPicking(state: RoomState): Promise<void> {
    state.phase = 'picking';
    state.letters = null;
    state.pending = null;
    state.turn = null;
    state.sayi = null;
    state.zincir = null;
    state.uzun = null;
    state.bom = null;
    state.telepati = null;
    state.korSiralama = null;
    state.beniYakala = null;
    state.randevuRuleti = null;
    state.emojiSifre = null;
    state.kirmiziYesil = null;
    state.kimDahaMuhtemel = null;
    state.ikiDogruBirYalan = null;
    state.ayniAndaSoyle = null;
    for (const p of state.players) p.pickedLetter = null;
    state.deadline = Date.now() + PICK_MS;
    state.alarmPurpose = 'phase';
    await this.ctx.storage.setAlarm(state.deadline);
    await this.save(state);
    this.broadcastSnapshot(state);
  }

  private async startCountdown(state: RoomState): Promise<void> {
    // secmeyene rastgele harf atanir
    for (const p of state.players) p.pickedLetter ??= randomLetter();
    const a = state.players[0]?.pickedLetter ?? randomLetter();
    const b = state.players[1]?.pickedLetter ?? randomLetter();
    let letters: [string, string] = [a, b];
    let rerolled = false;
    const pairs = getPairs();
    if ((pairs[pairKey(a, b)] ?? 0) < MIN_PAIR_WORDS) {
      const fallback = chooseFallbackPair(pairs, MIN_PAIR_WORDS, Math.random);
      if (fallback) {
        letters = fallback;
        rerolled = true;
      }
    }
    state.pending = { letters, rerolled };
    state.phase = 'countdown';
    state.deadline = Date.now() + COUNTDOWN_MS;
    state.alarmPurpose = 'phase';
    await this.ctx.storage.setAlarm(state.deadline);
    await this.save(state);
    this.broadcast({ t: 'countdown', from: 3 });
    this.broadcastSnapshot(state);
  }

  private async startRacing(state: RoomState): Promise<void> {
    const pending = state.pending ?? { letters: [randomLetter(), randomLetter()] as [string, string], rerolled: false };
    state.letters = pending.letters;
    state.pending = null;
    state.phase = 'racing';
    state.frozenUntil = {}; // yaris temiz baslar
    state.deadline = Date.now() + RACE_MS;
    state.alarmPurpose = 'phase';
    await this.ctx.storage.setAlarm(state.deadline);
    await this.save(state);
    this.broadcast({ t: 'letters', letters: pending.letters, rerolled: pending.rerolled });
    this.broadcastSnapshot(state);
  }

  // ---- Alarm (mod + faza gore yonlendirir) ----

  async alarm(): Promise<void> {
    const state = await this.getState();
    if (!state) return;

    if (state.alarmPurpose === 'cleanup') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    state.alarmPurpose = null;

    // terk edilmis oda: faz dongusunu durdur, temizlige gec
    if (this.ctx.getWebSockets().length === 0) {
      state.alarmPurpose = 'cleanup';
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_MS);
      await this.save(state);
      return;
    }

    switch (state.phase) {
      case 'picking':
        await this.startCountdown(state);
        break;
      case 'countdown':
        if (state.mode === 'uzun') await uzun.startRace(this.mc(), state);
        else if (state.mode === 'zincir') await zincir.startTurn(this.mc(), state);
        else if (state.mode === 'bom') await bom.startTurn(this.mc(), state);
        else if (state.mode === 'telepati') await telepati.startQuestion(this.mc(), state);
        else if (state.mode === 'kor_siralama') await korSiralama.startItem(this.mc(), state);
        else if (state.mode === 'beni_yakala') await beniYakala.startAnswer(this.mc(), state);
        else if (state.mode === 'randevu_ruleti') await randevuRuleti.startRound(this.mc(), state);
        else if (state.mode === 'emoji_sifre') await emojiSifre.startEncode(this.mc(), state);
        else if (state.mode === 'kirmizi_yesil') await kirmiziYesil.startVote(this.mc(), state);
        else if (state.mode === 'kim_daha_muhtemel') await kimDahaMuhtemel.startVote(this.mc(), state);
        else if (state.mode === 'iki_dogru_bir_yalan') await ikiDogruBirYalan.startSetup(this.mc(), state);
        else if (state.mode === 'ayni_anda_soyle') await ayniAndaSoyle.startAnswer(this.mc(), state);
        else await this.startRacing(state); // harf
        break;
      case 'racing': {
        // sure doldu, kazanan yok
        state.phase = 'round_end';
        state.frozenUntil = {}; // yaristan cikarken bayat donmalar temizlenir
        state.deadline = Date.now() + RESULT_MS;
        state.alarmPurpose = 'phase';
        await this.ctx.storage.setAlarm(state.deadline);
        await this.save(state);
        this.broadcast({ t: 'round_end', winner: null, word: null, scores: this.scoresOf(state) });
        this.broadcastSnapshot(state);
        break;
      }
      case 'sayi_pick':
        await sayi.onPickDeadline(this.mc(), state);
        break;
      case 'sayi_turn':
        await sayi.onTurnDeadline(this.mc(), state);
        break;
      case 'zincir_turn':
        await zincir.onBoom(this.mc(), state);
        break;
      case 'bom_turn':
        await bom.onTimeout(this.mc(), state);
        break;
      case 'uzun_race':
        await uzun.onRaceDeadline(this.mc(), state);
        break;
      case 'telepati_soru':
        await telepati.onAnswerDeadline(this.mc(), state);
        break;
      case 'telepati_reveal':
        await telepati.onRevealDone(this.mc(), state);
        break;
      case 'kor_sirala':
        await korSiralama.onPickDeadline(this.mc(), state);
        break;
      case 'kor_reveal':
        await korSiralama.onRevealDone(this.mc(), state);
        break;
      case 'beni_yakala_answer':
        await beniYakala.onAnswerDeadline(this.mc(), state);
        break;
      case 'beni_yakala_predict':
        await beniYakala.onPredictDeadline(this.mc(), state);
        break;
      case 'beni_yakala_reveal':
        await beniYakala.onRevealDone(this.mc(), state);
        break;
      case 'randevu_secim':
        await randevuRuleti.onPickDeadline(this.mc(), state);
        break;
      case 'randevu_reveal':
        await randevuRuleti.onRevealDone(this.mc(), state);
        break;
      case 'emoji_sifre_encode':
        await emojiSifre.onCodeDeadline(this.mc(), state);
        break;
      case 'emoji_sifre_guess':
        await emojiSifre.onGuessDeadline(this.mc(), state);
        break;
      case 'emoji_sifre_reveal':
        await emojiSifre.onRevealDone(this.mc(), state);
        break;
      case 'kirmizi_yesil_vote':
        await kirmiziYesil.onVoteDeadline(this.mc(), state);
        break;
      case 'kirmizi_yesil_reveal':
        await kirmiziYesil.onRevealDone(this.mc(), state);
        break;
      case 'kim_daha_muhtemel_vote':
        await kimDahaMuhtemel.onVoteDeadline(this.mc(), state);
        break;
      case 'kim_daha_muhtemel_reveal':
        await kimDahaMuhtemel.onRevealDone(this.mc(), state);
        break;
      case 'iki_dogru_bir_yalan_setup':
        await ikiDogruBirYalan.onSetupDeadline(this.mc(), state);
        break;
      case 'iki_dogru_bir_yalan_guess':
        await ikiDogruBirYalan.onGuessDeadline(this.mc(), state);
        break;
      case 'iki_dogru_bir_yalan_reveal':
        await ikiDogruBirYalan.onRevealDone(this.mc(), state);
        break;
      case 'ayni_anda_soyle_answer':
        await ayniAndaSoyle.onAnswerDeadline(this.mc(), state);
        break;
      case 'ayni_anda_soyle_reveal':
        await ayniAndaSoyle.onRevealDone(this.mc(), state);
        break;
      case 'round_end':
        if (state.mode === 'sayi') {
          await sayi.nextRound(this.mc(), state);
        } else {
          // harf/uzun ayni ritim: yeni raund + 5'lik blok joker dolumu
          state.round += 1;
          if (jokerGrantedOnRound(state.round)) {
            for (const p of state.players) state.jokers[p.id] = (state.jokers[p.id] ?? 0) + 1;
          }
          await this.startPicking(state);
        }
        break;
      default:
        await this.save(state);
    }
  }

  // ---- Baglanti kopmasi ----

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const pid = this.pidOf(ws);
    if (!pid) return;
    const state = await this.getState();
    if (!state) return;
    const player = state.players.find((p) => p.id === pid);
    if (!player) return;

    // ayni pid'in baska acik soketi varsa (reconnect ile degistirildi) bagli sayilir
    const stillOpen = this.ctx.getWebSockets(pid).some((s) => s !== ws);
    player.connected = stillOpen;
    if (!stillOpen) this.sendToOthers(pid, { t: 'opp_conn', connected: false });

    const anyOpen = this.ctx.getWebSockets().some((s) => s !== ws);
    if (!anyOpen && (state.phase === 'lobby' || state.phase === 'match_end')) {
      state.alarmPurpose = 'cleanup';
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_MS);
    }
    await this.save(state);
  }

  // ---- TDK anlami (asenkron, oyun beklemez) ----

  private async fetchMeaning(word: string): Promise<void> {
    try {
      const key = `meaning:${word}`;
      let meaning = await this.ctx.storage.get<string>(key);
      if (!meaning) {
        const res = await fetch(`https://sozluk.gov.tr/gts?ara=${encodeURIComponent(word)}`, {
          signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return; // bulunamayinca {error} doner
        const first = data[0] as { anlamlarListe?: { anlam?: string }[] } | undefined;
        meaning = first?.anlamlarListe?.[0]?.anlam;
        if (!meaning) return;
        await this.ctx.storage.put(key, meaning);
      }
      this.broadcast({ t: 'word_info', word, meaning });
    } catch {
      // sessiz: anlam gelmezse oyun etkilenmez
    }
  }

  // ---- Yardimcilar ----

  private async getState(): Promise<RoomState | null> {
    const state = (await this.ctx.storage.get<RoomState>(STATE_KEY)) ?? null;
    if (state) {
      // yeni alanlar sonradan eklendi; eski kayitlarda eksik olabilir
      state.jokers ??= {};
      state.frozenUntil ??= {};
      state.mode ??= DEFAULT_MODE;
      state.creator ??= state.players[0]?.id ?? null;
      state.turn ??= null;
      state.sayi ??= null;
      state.zincir ??= null;
      state.uzun ??= null;
      state.bom ??= null;
      state.telepati ??= null;
      state.korSiralama ??= null;
      state.beniYakala ??= null;
      state.randevuRuleti ??= null;
      state.emojiSifre ??= null;
      state.kirmiziYesil ??= null;
      state.kimDahaMuhtemel ??= null;
      state.ikiDogruBirYalan ??= null;
      state.ayniAndaSoyle ??= null;
    }
    return state;
  }

  private save(state: RoomState): Promise<void> {
    return this.ctx.storage.put(STATE_KEY, state);
  }

  private pidOf(ws: WebSocket): string | null {
    try {
      const att = ws.deserializeAttachment() as Attachment | null;
      return att?.pid ?? null;
    } catch {
      return null;
    }
  }

  private scoresOf(state: RoomState): Record<string, number> {
    return Object.fromEntries(state.players.map((p) => [p.id, p.score]));
  }

  private sendTo(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // kapanmakta olan soket
    }
  }

  private broadcast(msg: ServerMsg): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.pidOf(ws)) this.sendTo(ws, msg);
    }
  }

  private sendToOthers(pid: string, msg: ServerMsg): void {
    for (const ws of this.ctx.getWebSockets()) {
      const otherPid = this.pidOf(ws);
      if (otherPid && otherPid !== pid) this.sendTo(ws, msg);
    }
  }

  private broadcastSnapshot(state: RoomState): void {
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.pidOf(ws);
      if (!pid) continue;
      this.sendTo(ws, { t: 'snapshot', state: this.snapshotFor(state, pid) });
    }
  }

  private snapshotFor(state: RoomState, you: string): RoomSnapshot {
    const lettersVisible = state.phase === 'racing' || state.phase === 'uzun_race' || state.phase === 'round_end';
    // suresi gecmis donmalar snapshot'a sizmasin
    const now = Date.now();
    const frozenUntil: Record<string, number> = {};
    for (const [pid, until] of Object.entries(state.frozenUntil)) {
      if (now < until) frozenUntil[pid] = until;
    }
    const opp = state.players.find((p) => p.id !== you);

    // Sayi: gizli sayi ASLA sizmaz; alici SADECE kendi myNumber'ini gorur.
    // (round_end acilimi bounds icinde gelir; secretsler yine gizli kalir.)
    const sayiSnap = state.sayi
      ? {
          roundWins: state.sayi.roundWins,
          bounds: state.sayi.bounds,
          myNumber: state.sayi.secrets[you] ?? null,
          myPicked: state.sayi.picked[you] ?? false,
          oppPicked: (opp ? state.sayi.picked[opp.id] : false) ?? false,
          equalizer: state.sayi.equalizer,
        }
      : null;

    const zincirSnap = state.zincir
      ? {
          lives: state.zincir.lives,
          lastWord: state.zincir.lastWord,
          requiredLetter: state.zincir.requiredLetter,
          turnMs: state.zincir.turnMs,
        }
      : null;

    const uzunSnap = state.uzun ? { submitted: state.uzun.submitted } : null;

    // Telepati: ham secimler reveal'e kadar ASLA sizmaz; alici yalniz kisiye ozel
    // myAnswered/oppAnswered bayraklarini gorur. Soru geri sayim bitmeden acilmaz.
    const telepatiQ = state.telepati ? state.telepati.questions[state.telepati.qIndex - 1] : undefined;
    const telepatiVisible =
      state.phase === 'telepati_soru' || state.phase === 'telepati_reveal' || state.phase === 'match_end';
    const telepatiSnap =
      state.telepati && telepatiQ && telepatiVisible
        ? {
            qIndex: state.telepati.qIndex,
            question: telepatiQ,
            matches: state.telepati.matches,
            myAnswered: state.telepati.answers[you] !== undefined,
            oppAnswered: opp ? state.telepati.answers[opp.id] !== undefined : false,
            doubled: state.telepati.doubled,
          }
        : null;

    // Kor Siralama: aktif turda rakibin tam listesi gizli; alici yalniz kendi
    // yuvalarini ve rakibin kilitleyip kilitlemedigini gorur. Reveal'de o kartin
    // iki sira numarasi, mac sonunda iki tam liste birden acilir.
    const kor = state.korSiralama;
    const korItem = kor?.pack.items[kor.itemIndex];
    const korVisible = state.phase === 'kor_sirala' || state.phase === 'kor_reveal' || state.phase === 'match_end';
    const korSnap =
      kor && korItem && korVisible
        ? {
            topic: kor.pack.topic,
            prompt: kor.pack.prompt,
            itemIndex: kor.itemIndex + 1,
            currentItem: korItem,
            mySlots: [...(kor.placements[you] ?? [])],
            myRanked: kor.answers[you] !== undefined,
            oppRanked: opp ? kor.answers[opp.id] !== undefined : false,
            exactMatches: kor.exactMatches,
            lastSlots: state.phase === 'kor_reveal' || state.phase === 'match_end' ? kor.lastSlots : null,
            compatibility: state.phase === 'match_end' ? kor.compatibility : null,
            finalRankings:
              state.phase === 'match_end'
                ? Object.fromEntries(
                    state.players.map((player) => [
                      player.id,
                      (kor.placements[player.id] ?? []).map((item) => item ?? '—'),
                    ]),
                  )
                : null,
          }
        : null;

    const beniYakalaSnap = beniYakala.toBeniYakalaSnapshot(state, you);
    const randevuRuletiSnap = randevuRuleti.toRandevuRuletiSnapshot(state, you);
    const emojiSifreSnap = emojiSifre.toEmojiSifreSnapshot(state, you);
    const kirmiziYesilSnap = kirmiziYesil.toKirmiziYesilSnapshot(state, you);
    const kimDahaMuhtemelSnap = kimDahaMuhtemel.toKimDahaMuhtemelSnapshot(state, you);
    const ikiDogruBirYalanSnap = ikiDogruBirYalan.toIkiDogruBirYalanSnapshot(state, you);
    const ayniAndaSoyleSnap = ayniAndaSoyle.toAyniAndaSoyleSnapshot(state, you);

    // Bom: gizli alan yok; sunucu durumu oldugu gibi gorunur.
    const bomSnap = state.bom
      ? {
          lives: state.bom.lives,
          current: state.bom.current,
          turnMs: state.bom.turnMs,
          insured: state.bom.insured,
        }
      : null;

    return {
      code: state.code,
      mode: state.mode,
      phase: state.phase,
      round: state.round,
      you,
      players: state.players.map((p) => ({
        id: p.id,
        nick: p.nick,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected,
        ready: p.ready,
        pickedLetter: p.pickedLetter !== null,
        jokers: state.jokers[p.id] ?? 0,
      })),
      letters: lettersVisible ? state.letters : null,
      deadline: state.deadline,
      usedWords: state.usedWords,
      winner: state.winner,
      frozenUntil,
      turn: state.turn,
      sayi: sayiSnap,
      zincir: zincirSnap,
      uzun: uzunSnap,
      bom: bomSnap,
      telepati: telepatiSnap,
      korSiralama: korSnap,
      beniYakala: beniYakalaSnap,
      randevuRuleti: randevuRuletiSnap,
      emojiSifre: emojiSifreSnap,
      kirmiziYesil: kirmiziYesilSnap,
      kimDahaMuhtemel: kimDahaMuhtemelSnap,
      ikiDogruBirYalan: ikiDogruBirYalanSnap,
      ayniAndaSoyle: ayniAndaSoyleSnap,
    };
  }
}
