export interface EmojiSifreStoryRound {
  target: string;
  emojis: readonly [string, string, string];
  status: 'solved' | 'assisted' | 'miss';
}

export interface EmojiSifreShareCardInput {
  playerA: string;
  playerB: string;
  correct: number;
  /** Yalnız sunucunun açtığı tur geçmişi kabul edilir; aktif/gizli seçim alanı yoktur. */
  revealedRounds: readonly EmojiSifreStoryRound[];
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const NIGHT = '#0C0920';
const PANEL = '#21183E';
const INK = '#FFF8FF';
const SOFT = '#CFC4EB';
const PINK = '#FF65B3';
const CYAN = '#58E8FF';
const PURPLE = '#A97BFF';
const LIME = '#A8F56A';
const SUN = '#FFD76A';
const DISPLAY = '"Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
const BODY = '"Nunito", "Avenir Next", "Segoe UI", Arial, sans-serif';

function path(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 5,
) {
  path(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function clean(raw: string, fallback: string, max = 48): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function ellipsize(ctx: CanvasRenderingContext2D, raw: string, maxWidth: number): string {
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  let end = raw.length;
  while (end > 0 && ctx.measureText(`${raw.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end ? `${raw.slice(0, end).trimEnd()}…` : '…';
}

function background(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#0A071A');
  bg.addColorStop(0.52, '#21133C');
  bg.addColorStop(1, '#080719');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const leftGlow = ctx.createRadialGradient(30, 330, 20, 30, 330, 520);
  leftGlow.addColorStop(0, 'rgba(255,101,179,.35)');
  leftGlow.addColorStop(1, 'rgba(255,101,179,0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, 650, 900);
  const rightGlow = ctx.createRadialGradient(1070, 1300, 20, 1070, 1300, 580);
  rightGlow.addColorStop(0, 'rgba(88,232,255,.28)');
  rightGlow.addColorStop(1, 'rgba(88,232,255,0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(360, 700, 720, 1220);

  for (let i = 0; i < 44; i += 1) {
    const x = 28 + ((i * 197) % 1024);
    const y = 36 + ((i * 281) % 1840);
    ctx.globalAlpha = i % 4 === 0 ? 0.8 : 0.34;
    ctx.fillStyle = [PINK, CYAN, PURPLE, SUN][i % 4];
    ctx.beginPath();
    ctx.arc(x, y, i % 8 === 0 ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundRow(ctx: CanvasRenderingContext2D, round: EmojiSifreStoryRound, index: number) {
  const x = 76;
  const y = 620 + index * 228;
  const color = round.status === 'solved' ? LIME : round.status === 'assisted' ? SUN : PINK;
  const mine = index % 2 === 0;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.globalAlpha = 0.25;
  box(ctx, x, y, 928, 190, 45, color);
  ctx.restore();
  box(ctx, x, y, 928, 190, 45, PANEL, color, 5);

  // Mesaj balonu kuyruğu
  ctx.beginPath();
  if (mine) {
    ctx.moveTo(x + 56, y + 184);
    ctx.lineTo(x + 35, y + 219);
    ctx.lineTo(x + 105, y + 187);
  } else {
    ctx.moveTo(x + 872, y + 184);
    ctx.lineTo(x + 893, y + 219);
    ctx.lineTo(x + 823, y + 187);
  }
  ctx.closePath();
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();

  box(ctx, x + 28, y + 28, 100, 56, 27, '#2B2048', color, 4);
  ctx.fillStyle = color;
  ctx.font = `900 19px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(round.status === 'solved' ? 'ÇÖZÜLDÜ' : round.status === 'assisted' ? 'İPUCU' : 'PAS', x + 78, y + 57);

  ctx.fillStyle = INK;
  ctx.font = `900 54px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(ellipsize(ctx, clean(round.target, 'Sürpriz kelime'), 678), x + 158, y + 24);

  ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillText(round.emojis.join('  '), x + 158, y + 92);

  ctx.fillStyle = SOFT;
  ctx.font = `850 27px ${BODY}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1}/4`, x + 886, y + 124);
}

function footer(ctx: CanvasRenderingContext2D, rawUrl?: string) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, CYAN, SUN, LIME, PURPLE, PINK, CYAN, SUN];
  const tile = 68;
  const gap = 10;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const start = (WIDTH - total) / 2;
  letters.forEach((letter, i) => {
    box(ctx, start + i * (tile + gap), 1660, tile, tile, 18, colors[i], INK, 4);
    ctx.fillStyle = NIGHT;
    ctx.font = `900 38px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, start + i * (tile + gap) + tile / 2, 1697);
  });

  ctx.fillStyle = SOFT;
  ctx.font = `850 26px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('EMOJİ ŞİFRE  •  3 EMOJİYLE ANLAT', WIDTH / 2, 1760);
  const url = (rawUrl ?? window.location.host)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '')
    .slice(0, 96) || 'Harfiyen';
  ctx.font = `750 23px ${BODY}`;
  ctx.fillText(ellipsize(ctx, url, 820), WIDTH / 2, 1812);
}

/** 1080×1920 PNG. Yalnız açılmış tur geçmişini kabul eder; aktif gizli kod girişi yoktur. */
export async function createEmojiSifreShareCard(input: EmojiSifreShareCardInput): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // Sistem fontlarıyla devam edilir.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Story görseli için Canvas başlatılamadı.');

  const score = Math.round(Math.max(0, Math.min(4, Number.isFinite(input.correct) ? input.correct : 0)));
  const rounds = input.revealedRounds.slice(0, 4).map((round): EmojiSifreStoryRound => ({
    target: clean(round.target, 'Sürpriz kelime'),
    emojis: round.emojis.map((emoji) => clean(emoji, '❔', 8)) as [string, string, string],
    status: round.status === 'solved' || round.status === 'assisted' ? round.status : 'miss',
  }));

  background(ctx);
  box(ctx, 286, 126, 508, 72, 36, '#2C1B4D', PURPLE, 5);
  ctx.fillStyle = INK;
  ctx.font = `900 31px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MESAJI ÇÖZEBİLDİK Mİ?', WIDTH / 2, 164);

  ctx.fillStyle = INK;
  ctx.font = `900 76px ${DISPLAY}`;
  ctx.textBaseline = 'top';
  ctx.fillText('EMOJİ ŞİFRE', WIDTH / 2, 244);

  const names = `${clean(input.playerA, 'Oyuncu 1', 24)} + ${clean(input.playerB, 'Oyuncu 2', 24)}`;
  box(ctx, 190, 360, 700, 78, 39, '#21183E', PINK, 4);
  ctx.fillStyle = INK;
  ctx.font = `850 31px ${BODY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, names, 620), WIDTH / 2, 401);

  const scoreGradient = ctx.createLinearGradient(260, 472, 820, 566);
  scoreGradient.addColorStop(0, PINK);
  scoreGradient.addColorStop(0.5, PURPLE);
  scoreGradient.addColorStop(1, CYAN);
  box(ctx, 280, 476, 520, 106, 50, scoreGradient, INK, 5);
  ctx.fillStyle = NIGHT;
  ctx.font = `900 54px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${score}/4 ORTAK ŞİFRE`, WIDTH / 2, 532);

  rounds.forEach((round, index) => roundRow(ctx, round, index));
  footer(ctx, input.url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Story PNG biçimine dönüştürülemedi.')), 'image/png');
  });
  return new File([blob], `harfiyen-emoji-sifre-${Date.now()}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
