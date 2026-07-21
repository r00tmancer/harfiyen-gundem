export interface RandevuStoryPlanItem {
  category: string;
  choice: string;
}

export interface RandevuRuletiShareCardInput {
  playerA: string;
  playerB: string;
  exactMatches: number;
  plan: readonly RandevuStoryPlanItem[];
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const NIGHT = '#09071A';
const NIGHT_2 = '#17112F';
const INK = '#F9F6FF';
const INK_SOFT = '#C9C1E8';
const PANEL = '#191431';
const PINK = '#FF62B0';
const CYAN = '#55E7FF';
const PURPLE = '#A875FF';
const SUN = '#FFD166';
const MINT = '#45F0C1';
const DISPLAY = '"Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
const BODY = '"Nunito", "Avenir Next", "Segoe UI", Arial, sans-serif';

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth = 5,
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function cleanText(value: string, fallback: string, max = 56): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : '…';
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  ctx.moveTo(0, 82);
  ctx.bezierCurveTo(-18, 65, -50, 43, -50, 14);
  ctx.bezierCurveTo(-50, -14, -16, -23, 0, 5);
  ctx.bezierCurveTo(16, -23, 50, -14, 50, 14);
  ctx.bezierCurveTo(50, 43, 18, 65, 0, 82);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, NIGHT);
  bg.addColorStop(0.55, NIGHT_2);
  bg.addColorStop(1, '#080615');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowA = ctx.createRadialGradient(92, 280, 20, 92, 280, 430);
  glowA.addColorStop(0, 'rgba(255,98,176,0.34)');
  glowA.addColorStop(1, 'rgba(255,98,176,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, 720);
  const glowB = ctx.createRadialGradient(1000, 1180, 20, 1000, 1180, 520);
  glowB.addColorStop(0, 'rgba(85,231,255,0.27)');
  glowB.addColorStop(1, 'rgba(85,231,255,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(420, 600, 660, 1060);

  const starColors = [PINK, CYAN, PURPLE, SUN, MINT];
  for (let index = 0; index < 68; index += 1) {
    const x = 36 + ((index * 173) % 1008);
    const y = 38 + ((index * 257) % 1820);
    const radius = index % 9 === 0 ? 5 : index % 3 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = starColors[index % starColors.length];
    ctx.globalAlpha = index % 4 === 0 ? 0.92 : 0.5;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlanRow(
  ctx: CanvasRenderingContext2D,
  item: RandevuStoryPlanItem,
  index: number,
  y: number,
) {
  const colors = [PINK, CYAN, SUN];
  const color = colors[index] ?? PURPLE;
  const x = 84;
  const width = 912;
  const height = 230;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.globalAlpha = 0.38;
  fillRoundRect(ctx, x, y, width, height, 44, color);
  ctx.restore();
  fillRoundRect(ctx, x, y, width, height, 44, PANEL);
  strokeRoundRect(ctx, x, y, width, height, 44, color, 6);

  fillRoundRect(ctx, x + 30, y + 30, 100, 100, 30, color);
  ctx.fillStyle = NIGHT;
  ctx.font = `900 54px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), x + 80, y + 83);

  ctx.fillStyle = color;
  ctx.font = `900 28px ${BODY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(cleanText(item.category, ['YEMEK', 'ETKİNLİK', 'TATLI'][index] ?? 'PLAN').toLocaleUpperCase('tr-TR'), x + 164, y + 36);

  ctx.fillStyle = INK;
  ctx.font = `900 50px ${DISPLAY}`;
  ctx.fillText(ellipsize(ctx, cleanText(item.choice, 'Sürpriz seçim'), 760), x + 164, y + 79);

  ctx.fillStyle = INK_SOFT;
  ctx.font = `750 26px ${BODY}`;
  ctx.fillText(index === 0 ? 'Başlangıç' : index === 1 ? 'Gecenin devamı' : 'Tatlı final', x + 164, y + 162);
}

function drawLogo(ctx: CanvasRenderingContext2D, rawUrl?: string) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, CYAN, SUN, MINT, PURPLE, PINK, CYAN, SUN];
  const tile = 68;
  const gap = 10;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const start = (WIDTH - total) / 2;
  const y = 1664;

  letters.forEach((letter, index) => {
    const x = start + index * (tile + gap);
    fillRoundRect(ctx, x, y, tile, tile, 18, colors[index]);
    strokeRoundRect(ctx, x, y, tile, tile, 18, INK, 4);
    ctx.fillStyle = NIGHT;
    ctx.font = `900 38px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + tile / 2, y + tile / 2 + 3);
  });

  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 26px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('RANDEVU RULETİ  •  GİZLİCE SEÇ, PLANI AÇ', WIDTH / 2, 1768);
  const url = (rawUrl ?? window.location.host)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '')
    .slice(0, 96) || 'Harfiyen';
  ctx.font = `700 23px ${BODY}`;
  ctx.fillText(ellipsize(ctx, url, 820), WIDTH / 2, 1818);
}

/** 9:16 Story PNG. Private player choices are never accepted or rendered. */
export async function createRandevuRuletiShareCard(input: RandevuRuletiShareCardInput): Promise<File> {
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

  const exactMatches = Math.round(Math.max(0, Math.min(3, Number.isFinite(input.exactMatches) ? input.exactMatches : 0)));
  const names = `${cleanText(input.playerA, 'Oyuncu 1', 24)} + ${cleanText(input.playerB, 'Oyuncu 2', 24)}`;
  const plan = Array.from({ length: 3 }, (_, index) => ({
    category: input.plan[index]?.category ?? ['Yemek', 'Etkinlik', 'Tatlı'][index],
    choice: input.plan[index]?.choice ?? 'Sürpriz seçim',
  }));

  drawBackground(ctx);
  drawHeart(ctx, 116, 212, 72, PINK);
  drawHeart(ctx, 966, 226, 58, CYAN);

  fillRoundRect(ctx, 285, 174, 510, 72, 36, '#241A48');
  strokeRoundRect(ctx, 285, 174, 510, 72, 36, PURPLE, 5);
  ctx.fillStyle = INK;
  ctx.font = `900 32px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BU GECEKİ RANDEVUMUZ', WIDTH / 2, 212);

  ctx.fillStyle = INK;
  ctx.font = `900 68px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('PLAN HAZIR ✦', WIDTH / 2, 310);

  fillRoundRect(ctx, 214, 412, 652, 82, 38, '#20183F');
  strokeRoundRect(ctx, 214, 412, 652, 82, 38, PINK, 4);
  ctx.fillStyle = INK;
  ctx.font = `850 31px ${BODY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, names, 570), WIDTH / 2, 455);

  plan.forEach((item, index) => drawPlanRow(ctx, item, index, 570 + index * 260));

  const scoreGradient = ctx.createLinearGradient(245, 1370, 835, 1510);
  scoreGradient.addColorStop(0, PINK);
  scoreGradient.addColorStop(0.5, PURPLE);
  scoreGradient.addColorStop(1, CYAN);
  fillRoundRect(ctx, 180, 1374, 720, 170, 58, scoreGradient);
  strokeRoundRect(ctx, 180, 1374, 720, 170, 58, INK, 6);
  ctx.fillStyle = NIGHT;
  ctx.font = `900 72px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${exactMatches}/3`, WIDTH / 2, 1390);
  ctx.font = `900 34px ${DISPLAY}`;
  ctx.fillText('AYNI SEÇİM', WIDTH / 2, 1471);

  drawLogo(ctx, input.url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Story görseli PNG biçimine dönüştürülemedi.'));
    }, 'image/png');
  });

  return new File([blob], `harfiyen-randevu-ruleti-${Date.now()}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
