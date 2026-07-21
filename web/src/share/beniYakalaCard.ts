export interface BeniYakalaShareCardInput {
  myName: string;
  partnerName: string;
  myReads: number;
  partnerReads: number;
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const INK = '#3F3D56';
const INK_SOFT = '#6E6A8F';
const PAPER = '#FFFDF9';
const PINK = '#FF6FA9';
const PINK_DARK = '#E44B8D';
const PINK_SOFT = '#FFE1EE';
const BLUE = '#4FB8FF';
const BLUE_SOFT = '#E0F2FF';
const SUN = '#FFC93C';
const MINT = '#3EDBB2';
const GRAPE = '#A78BFA';
const DISPLAY = '"Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
const BODY = '"Nunito", "Avenir Next", "Segoe UI", Arial, sans-serif';

function roundRect(
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
  roundRect(ctx, x, y, width, height, radius);
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
  stroke = INK,
  lineWidth = 6,
) {
  roundRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function safeText(value: string, fallback: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 40) || fallback;
}

function safeScore(value: number): number {
  return Math.round(Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0)));
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : '…';
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.84);
  ctx.bezierCurveTo(x - size * 0.12, y + size * 0.7, x - size * 0.5, y + size * 0.48, x - size * 0.5, y + size * 0.2);
  ctx.bezierCurveTo(x - size * 0.5, y - size * 0.08, x - size * 0.16, y - size * 0.16, x, y + size * 0.09);
  ctx.bezierCurveTo(x + size * 0.16, y - size * 0.16, x + size * 0.5, y - size * 0.08, x + size * 0.5, y + size * 0.2);
  ctx.bezierCurveTo(x + size * 0.5, y + size * 0.48, x + size * 0.12, y + size * 0.7, x, y + size * 0.84);
  ctx.closePath();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke = INK,
  lineWidth = 6,
) {
  heartPath(ctx, x, y, size);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#FFF4EC');
  gradient.addColorStop(0.48, '#FFF9F2');
  gradient.addColorStop(1, '#F7E9FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = 62 + col * 142 + (row % 2) * 36;
      const y = 70 + row * 142;
      drawHeart(ctx, x, y, 20, row % 3 === 0 ? PINK : BLUE, 'transparent', 0);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  drawHeart(ctx, 92, 185, 48, PINK, INK, 5);
  drawHeart(ctx, 986, 225, 37, BLUE, INK, 5);
  drawHeart(ctx, 110, 1665, 34, SUN, INK, 5);
  drawHeart(ctx, 970, 1620, 48, GRAPE, INK, 5);
  ctx.restore();
}

function drawScoreRow(
  ctx: CanvasRenderingContext2D,
  name: string,
  score: number,
  y: number,
  main: string,
  soft: string,
  label: string,
) {
  const x = 94;
  const width = 892;
  const height = 290;

  ctx.save();
  ctx.shadowColor = 'rgba(63,61,86,0.18)';
  ctx.shadowOffsetY = 13;
  fillRoundRect(ctx, x, y, width, height, 50, PAPER);
  ctx.restore();
  strokeRoundRect(ctx, x, y, width, height, 50, INK, 7);

  fillRoundRect(ctx, x + 30, y + 27, width - 60, 80, 28, soft);
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.arc(x + 78, y + 67, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `900 38px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, safeText(name, 'Oyuncu'), 500), x + 126, y + 67);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 25px ${BODY}`;
  ctx.textAlign = 'right';
  ctx.fillText(label, x + width - 50, y + 67);

  const heartSize = 66;
  const gap = 27;
  const total = heartSize * 5 + gap * 4;
  const start = x + (width - total) / 2 + heartSize / 2;
  for (let index = 0; index < 5; index += 1) {
    drawHeart(ctx, start + index * (heartSize + gap), y + 145, heartSize, index < score ? main : '#EEEAF2', INK, 5);
  }

  ctx.fillStyle = INK;
  ctx.font = `900 38px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${score}/5 doğru tahmin`, WIDTH / 2, y + 228);
}

function drawLogo(ctx: CanvasRenderingContext2D, rawUrl?: string) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, BLUE, SUN, MINT, GRAPE, PINK, BLUE, SUN];
  const tile = 70;
  const gap = 10;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const startX = (WIDTH - total) / 2;
  const y = 1690;

  letters.forEach((letter, index) => {
    const x = startX + index * (tile + gap);
    ctx.save();
    ctx.translate(x + tile / 2, y + tile / 2);
    ctx.rotate((index % 2 === 0 ? -1 : 1) * 0.035);
    fillRoundRect(ctx, -tile / 2, -tile / 2, tile, tile, 19, colors[index]);
    strokeRoundRect(ctx, -tile / 2, -tile / 2, tile, tile, 19, INK, 5);
    ctx.fillStyle = INK;
    ctx.font = `900 39px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 0, 3);
    ctx.restore();
  });

  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 27px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('BENİ YAKALA  •  SEÇ, TAHMİN ET, KALBİNİ OKU', WIDTH / 2, 1792);
  ctx.font = `700 24px ${BODY}`;
  const url = (rawUrl ?? window.location.host)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '')
    .slice(0, 96) || 'Harfiyen';
  ctx.fillText(ellipsize(ctx, url, 820), WIDTH / 2, 1840);
}

/** Creates a private 9:16 Story PNG: only player names and aggregate scores are drawn. */
export async function createBeniYakalaShareCard(input: BeniYakalaShareCardInput): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // Sistem fontlarıyla devam edilir.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Paylaşım görseli için Canvas başlatılamadı.');

  const myReads = safeScore(input.myReads);
  const partnerReads = safeScore(input.partnerReads);
  const myName = safeText(input.myName, 'Ben');
  const partnerName = safeText(input.partnerName, 'Partnerim');

  drawBackground(ctx);

  fillRoundRect(ctx, 338, 214, 404, 72, 36, PINK);
  strokeRoundRect(ctx, 338, 214, 404, 72, 36, INK, 5);
  ctx.fillStyle = INK;
  ctx.font = `900 34px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BENİ YAKALA SONUCU', WIDTH / 2, 252);

  ctx.fillStyle = INK;
  ctx.font = `900 74px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('KALBİMİ', WIDTH / 2, 350);

  const scoreGradient = ctx.createLinearGradient(300, 470, 780, 640);
  scoreGradient.addColorStop(0, PINK_DARK);
  scoreGradient.addColorStop(0.5, GRAPE);
  scoreGradient.addColorStop(1, BLUE);
  ctx.fillStyle = scoreGradient;
  ctx.font = `900 152px ${DISPLAY}`;
  ctx.fillText(`${partnerReads}/5`, WIDTH / 2, 430);
  ctx.fillStyle = INK;
  ctx.font = `900 72px ${DISPLAY}`;
  ctx.fillText('OKUDUN!', WIDTH / 2, 600);

  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 31px ${BODY}`;
  ctx.fillText(`${partnerName}, beni ne kadar iyi tanıyorsun?`, WIDTH / 2, 705);

  drawScoreRow(ctx, partnerName, partnerReads, 800, PINK, PINK_SOFT, 'beni okudu');
  drawScoreRow(ctx, myName, myReads, 1122, BLUE, BLUE_SOFT, 'onu okudu');

  fillRoundRect(ctx, 226, 1475, 628, 92, 42, SUN);
  strokeRoundRect(ctx, 226, 1475, 628, 92, 42, INK, 6);
  ctx.fillStyle = INK;
  ctx.font = `900 34px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SEVGİLİNLE SEN DE DENE', WIDTH / 2, 1523);

  drawLogo(ctx, input.url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Paylaşım görseli PNG biçimine dönüştürülemedi.'));
    }, 'image/png');
  });

  return new File([blob], `harfiyen-beni-yakala-${Date.now()}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
