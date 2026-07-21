export interface KorShareCardInput {
  topic: string;
  pct: number;
  exactMatches: number;
  url?: string;
  playerA: {
    name: string;
    ranking: string[];
  };
  playerB: {
    name: string;
    ranking: string[];
  };
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const INK = '#3F3D56';
const INK_SOFT = '#6E6A8F';
const PAPER = '#FFFDF9';
const PINK = '#FF6FA9';
const PINK_SOFT = '#FFE1EE';
const BLUE = '#4FB8FF';
const BLUE_SOFT = '#E0F2FF';
const SUN = '#FFC93C';
const MINT = '#3EDBB2';
const GRAPE = '#A78BFA';
const DISPLAY_FONT = '"Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
const BODY_FONT = '"Nunito", "Avenir Next", "Segoe UI", Arial, sans-serif';

type PlayerCard = KorShareCardInput['playerA'];

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
  stroke = INK,
  lineWidth = 6,
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function cleanText(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) {
    end -= 1;
  }
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : '…';
}

function drawCenteredWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = cleanText(text, 'Bizim sıralamamız').split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  const consumedWords = lines.join(' ').split(' ').length;
  if (consumedWords < words.length && lines.length > 0) {
    lines[lines.length - 1] = ellipsize(ctx, `${lines[lines.length - 1]} ${words.slice(consumedWords).join(' ')}`, maxWidth);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((value, index) => ctx.fillText(value, centerX, startY + index * lineHeight));
  return startY + lines.length * lineHeight;
}

function drawSprinkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  rotation: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  fillRoundRect(ctx, -13, -5, 26, 10, 5, color);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, '#FFF6EC');
  background.addColorStop(0.55, '#FFF9F2');
  background.addColorStop(1, '#FFEEDD');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#FFD9C3';
  for (let y = 42; y < CARD_HEIGHT; y += 84) {
    for (let x = 42; x < CARD_WIDTH; x += 84) {
      ctx.beginPath();
      ctx.arc(x + ((y / 84) % 2 ? 21 : 0), y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.9;
  drawSprinkle(ctx, 89, 145, PINK, -0.6);
  drawSprinkle(ctx, 981, 175, BLUE, 0.45);
  drawSprinkle(ctx, 137, 441, MINT, 0.3);
  drawSprinkle(ctx, 938, 472, GRAPE, -0.5);
  drawSprinkle(ctx, 99, 1707, SUN, -0.2);
  drawSprinkle(ctx, 972, 1730, PINK, 0.6);
  ctx.restore();
}

function drawCrown(ctx: CanvasRenderingContext2D, centerX: number, y: number) {
  ctx.save();
  ctx.translate(centerX, y);
  ctx.beginPath();
  ctx.moveTo(-55, 34);
  ctx.lineTo(-47, -25);
  ctx.lineTo(-13, 8);
  ctx.lineTo(0, -38);
  ctx.lineTo(16, 8);
  ctx.lineTo(50, -25);
  ctx.lineTo(57, 34);
  ctx.closePath();
  ctx.fillStyle = SUN;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-54, 34);
  ctx.lineTo(56, 34);
  ctx.stroke();
  ctx.restore();
}

function normalizedRanking(ranking: readonly string[]): string[] {
  return Array.from({ length: 5 }, (_, index) => cleanText(ranking[index] ?? '', '—'));
}

function drawPlayerRanking(
  ctx: CanvasRenderingContext2D,
  player: PlayerCard,
  ranking: readonly string[],
  otherRanking: readonly string[],
  x: number,
  color: string,
  softColor: string,
) {
  const width = 464;
  const y = 804;
  const height = 770;

  ctx.save();
  ctx.shadowColor = 'rgba(63, 61, 86, 0.16)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 15;
  fillRoundRect(ctx, x, y, width, height, 42, PAPER);
  ctx.restore();
  strokeRoundRect(ctx, x, y, width, height, 42);

  fillRoundRect(ctx, x + 24, y + 24, width - 48, 108, 28, softColor);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 76, y + 78, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `800 38px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const name = ellipsize(ctx, cleanText(player.name, 'Oyuncu'), width - 160);
  ctx.fillText(name, x + 121, y + 78);

  const own = normalizedRanking(ranking);
  const other = normalizedRanking(otherRanking);
  own.forEach((item, index) => {
    const rowX = x + 24;
    const rowY = y + 157 + index * 116;
    const isExact = item !== '—' && item === other[index];
    fillRoundRect(ctx, rowX, rowY, width - 48, 92, 25, isExact ? '#D9F9EF' : softColor);
    strokeRoundRect(ctx, rowX, rowY, width - 48, 92, 25, isExact ? '#20A984' : INK, 4);

    ctx.fillStyle = isExact ? MINT : color;
    ctx.beginPath();
    ctx.arc(rowX + 47, rowY + 46, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `900 29px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), rowX + 47, rowY + 47);

    ctx.font = `800 30px ${BODY_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(ellipsize(ctx, item, width - 148), rowX + 89, rowY + 47);
  });
}

function drawLogo(ctx: CanvasRenderingContext2D, rawUrl?: string) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, BLUE, SUN, MINT, GRAPE, PINK, BLUE, SUN];
  const tileSize = 70;
  const gap = 10;
  const totalWidth = letters.length * tileSize + (letters.length - 1) * gap;
  const startX = (CARD_WIDTH - totalWidth) / 2;
  const y = 1691;

  letters.forEach((letter, index) => {
    const x = startX + index * (tileSize + gap);
    ctx.save();
    ctx.translate(x + tileSize / 2, y + tileSize / 2);
    ctx.rotate((index % 2 === 0 ? -1 : 1) * 0.035);
    fillRoundRect(ctx, -tileSize / 2, -tileSize / 2, tileSize, tileSize, 19, colors[index]);
    strokeRoundRect(ctx, -tileSize / 2, -tileSize / 2, tileSize, tileSize, 19, INK, 5);
    ctx.fillStyle = INK;
    ctx.font = `900 39px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 0, 3);
    ctx.restore();
  });

  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 27px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('KÖR SIRALAMA  •  SIRANI SEÇ, SONUCU GÖR', CARD_WIDTH / 2, 1794);
  ctx.font = `700 24px ${BODY_FONT}`;
  const url = cleanText(rawUrl ?? window.location.host, 'Harfiyen').replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.fillText(ellipsize(ctx, url, 820), CARD_WIDTH / 2, 1842);
}

/**
 * Creates a 9:16 PNG share card suitable for iPhone share sheets and Instagram Stories.
 * This helper is browser-only and intentionally performs no network requests.
 */
export async function createKorShareCard(input: KorShareCardInput): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // The canvas font stack below remains usable when a web font fails to load.
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Paylaşım görseli için Canvas başlatılamadı.');

  drawBackground(ctx);
  drawCrown(ctx, CARD_WIDTH / 2, 128);

  fillRoundRect(ctx, 333, 225, 414, 70, 35, GRAPE);
  strokeRoundRect(ctx, 333, 225, 414, 70, 35, INK, 5);
  ctx.fillStyle = INK;
  ctx.font = `900 34px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KÖR SIRALAMA SONUCU', CARD_WIDTH / 2, 263);

  ctx.fillStyle = INK;
  ctx.font = `900 56px ${DISPLAY_FONT}`;
  drawCenteredWrappedText(ctx, input.topic, CARD_WIDTH / 2, 340, 880, 65, 2);

  const pct = Math.round(Math.max(0, Math.min(100, Number.isFinite(input.pct) ? input.pct : 0)));
  const exactMatches = Math.round(
    Math.max(0, Math.min(5, Number.isFinite(input.exactMatches) ? input.exactMatches : 0)),
  );

  ctx.save();
  ctx.shadowColor = 'rgba(63, 61, 86, 0.17)';
  ctx.shadowOffsetY = 12;
  fillRoundRect(ctx, 267, 512, 546, 225, 62, PAPER);
  ctx.restore();
  strokeRoundRect(ctx, 267, 512, 546, 225, 62, INK, 7);

  const badge = ctx.createLinearGradient(305, 545, 775, 699);
  badge.addColorStop(0, PINK);
  badge.addColorStop(0.5, GRAPE);
  badge.addColorStop(1, BLUE);
  fillRoundRect(ctx, 303, 548, 474, 118, 53, badge);

  ctx.fillStyle = PAPER;
  ctx.font = `900 78px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`%${pct}`, CARD_WIDTH / 2, 610);
  ctx.fillStyle = INK;
  ctx.font = `800 29px ${BODY_FONT}`;
  ctx.fillText(`${exactMatches}/5 sıra tam aynı`, CARD_WIDTH / 2, 701);

  drawPlayerRanking(ctx, input.playerA, input.playerA.ranking, input.playerB.ranking, 58, PINK, PINK_SOFT);
  drawPlayerRanking(ctx, input.playerB, input.playerB.ranking, input.playerA.ranking, 558, BLUE, BLUE_SOFT);
  drawLogo(ctx, input.url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error('Paylaşım görseli PNG biçimine dönüştürülemedi.'));
      }, 'image/png');
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Paylaşım görseli oluşturulamadı.'));
    }
  });

  return new File([blob], `harfiyen-kor-siralama-${Date.now()}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
