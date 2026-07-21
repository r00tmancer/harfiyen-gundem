/**
 * Story sınırı bilerek yalnız anonimleştirilmiş maç toplamlarını kabul eder.
 * Oda/oyuncu kimliği, iddialar, yalan seçimi, tahmin ve snapshot bu katmana
 * aktarılmaz; dolayısıyla ham metnin görsele sızacağı bir API yüzeyi yoktur.
 */
export interface IkiDogruBirYalanShareCardInput {
  playerA: string;
  playerB: string;
  caughtCount: number;
  wrongCount: number;
  skippedCount: number;
  attemptedCount: number;
  availableRounds: number;
  catchRate: number;
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const NIGHT = '#0D0B18';
const NIGHT_SOFT = '#181329';
const PANEL = '#211A37';
const PANEL_LIGHT = '#2C2347';
const WHITE = '#FBF8FF';
const MUTED = '#C3BAD8';
const PINK = '#FF72AD';
const CYAN = '#58E8FF';
const SUN = '#FFD166';
const MINT = '#54E3B7';
const GRAPE = '#A875FF';
const DISPLAY = '900 1px "Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
const BODY = '800 1px "Nunito", "Avenir Next", "Segoe UI", Arial, sans-serif';

function roundedRect(
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

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string | CanvasGradient,
  lineWidth: number,
) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function cleanText(value: string, fallback: string, max = 28): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function safeInt(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(max, value)));
}

function ellipsize(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let end = value.length;
  while (end > 0 && ctx.measureText(`${value.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${value.slice(0, end).trimEnd()}…` : '…';
}

function normalizedUrl(raw?: string): string {
  return cleanText(raw ?? window.location.host, 'Harfiyen', 96)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '');
}

function resultCopy(
  caughtCount: number,
  attemptedCount: number,
  availableRounds: number,
): { title: string; subtitle: string } {
  if (availableRounds < 2 || attemptedCount < 2) {
    return {
      title: 'TUR YARIM KALDI',
      subtitle: 'İki paket de tamamlanınca gece özeti hazır.',
    };
  }
  if (caughtCount >= 2) {
    return {
      title: 'YALAN DEDEKTİFLERİ',
      subtitle: 'İki gizli yalan da gözünüzden kaçmadı.',
    };
  }
  if (caughtCount === 1) {
    return {
      title: 'BİRİ YAKALANDI',
      subtitle: 'Bir yalan bulundu, biri poker yüzüne takıldı.',
    };
  }
  return {
    title: 'POKER YÜZLERİ KAZANDI',
    subtitle: 'Bu gece iki yalan da sırrını korudu.',
  };
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const pinkGlow = ctx.createRadialGradient(40, 650, 20, 40, 650, 740);
  pinkGlow.addColorStop(0, 'rgba(255,114,173,.33)');
  pinkGlow.addColorStop(1, 'rgba(255,114,173,0)');
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const blueGlow = ctx.createRadialGradient(1040, 680, 20, 1040, 680, 760);
  blueGlow.addColorStop(0, 'rgba(88,232,255,.25)');
  blueGlow.addColorStop(1, 'rgba(88,232,255,0)');
  ctx.fillStyle = blueGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = WHITE;
  for (let y = 45; y < HEIGHT; y += 72) {
    for (let x = (y / 72) % 2 ? 34 : 70; x < WIDTH; x += 116) {
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = SUN;
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 18]);
  ctx.beginPath();
  ctx.moveTo(64, 1530);
  ctx.quadraticCurveTo(WIDTH / 2, 1665, WIDTH - 64, 1530);
  ctx.stroke();
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, CYAN, SUN, MINT, GRAPE, PINK, CYAN, SUN];
  const tile = 62;
  const gap = 9;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const startX = (WIDTH - total) / 2;
  letters.forEach((letter, index) => {
    const x = startX + index * (tile + gap);
    fillRound(ctx, x, 88, tile, tile, 16, colors[index]);
    ctx.fillStyle = NIGHT;
    ctx.font = DISPLAY.replace('1px', '35px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + tile / 2, 121);
  });
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  color: string,
  value: number,
  label: string,
) {
  fillRound(ctx, x, 1025, 274, 168, 38, PANEL);
  strokeRound(ctx, x, 1025, 274, 168, 38, color, 5);
  ctx.fillStyle = color;
  ctx.font = DISPLAY.replace('1px', '69px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + 137, 1089);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '24px');
  ctx.fillText(label, x + 137, 1150);
}

/** Üretim 1080×1920 PNG'si; dosya yalnız cihazdaki canvas üzerinde oluşur. */
export async function createIkiDogruBirYalanShareCard(
  input: IkiDogruBirYalanShareCardInput,
): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // Web fontu yüklenemezse sistem fontlarıyla devam edilir.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Paylaşım görseli için Canvas başlatılamadı.');

  const playerA = cleanText(input.playerA, 'Ben');
  const playerB = cleanText(input.playerB, 'Partnerim');
  const availableRounds = safeInt(input.availableRounds, 2);
  const attemptedCount = Math.min(safeInt(input.attemptedCount, 2), availableRounds);
  const caughtCount = Math.min(safeInt(input.caughtCount, 2), attemptedCount);
  const wrongCount = Math.min(safeInt(input.wrongCount, 2), attemptedCount);
  const skippedCount = Math.min(safeInt(input.skippedCount, 2), availableRounds);
  const catchRate = safeInt(input.catchRate, 100);
  const result = resultCopy(caughtCount, attemptedCount, availableRounds);

  drawBackground(ctx);
  drawLogo(ctx);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText('GECE MODU · YALAN AVI', WIDTH / 2, 220);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '64px');
  ctx.fillText('İKİ DOĞRU BİR YALAN', WIDTH / 2, 266);

  fillRound(ctx, 154, 362, 772, 84, 42, NIGHT_SOFT);
  strokeRound(ctx, 154, 362, 772, 84, 42, '#766A96', 4);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '30px');
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, `${playerA}  +  ${playerB}`, 690), WIDTH / 2, 404);

  const scoreGradient = ctx.createLinearGradient(112, 480, 968, 480);
  scoreGradient.addColorStop(0, PINK);
  scoreGradient.addColorStop(0.5, SUN);
  scoreGradient.addColorStop(1, CYAN);
  fillRound(ctx, 112, 480, 856, 354, 66, PANEL_LIGHT);
  strokeRound(ctx, 112, 480, 856, 354, 66, scoreGradient, 8);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '142px');
  ctx.textBaseline = 'middle';
  ctx.fillText(`${caughtCount}/${availableRounds}`, WIDTH / 2, 604);
  ctx.font = DISPLAY.replace('1px', '44px');
  ctx.fillText('YALAN YAKALANDI', WIDTH / 2, 714);
  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '29px');
  ctx.fillText(
    availableRounds < 2 || attemptedCount < 2
      ? `${attemptedCount}/${availableRounds} tahmin tamamlandı`
      : `%${catchRate} yakalama oranı`,
    WIDTH / 2,
    780,
  );

  ctx.textBaseline = 'top';
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '46px');
  ctx.fillText(result.title, WIDTH / 2, 872);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText(result.subtitle, WIDTH / 2, 934);

  drawStat(ctx, 80, MINT, caughtCount, 'YAKALANDI');
  drawStat(ctx, 403, PINK, wrongCount, 'KAÇTI');
  drawStat(ctx, 726, GRAPE, skippedCount, 'PAS GEÇİLDİ');

  fillRound(ctx, 126, 1235, 828, 68, 34, '#28213D');
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '24px');
  ctx.textBaseline = 'middle';
  ctx.fillText(`${attemptedCount}/${availableRounds} tahmin · ${caughtCount} doğru · ${wrongCount} yanlış`, WIDTH / 2, 1269);

  fillRound(ctx, 126, 1334, 828, 102, 36, PANEL);
  strokeRound(ctx, 126, 1334, 828, 102, 36, '#766A96', 4);
  ctx.fillStyle = CYAN;
  ctx.font = BODY.replace('1px', '23px');
  ctx.textBaseline = 'middle';
  ctx.fillText('İDDİALARINIZ BU STORY KARTINDA GÖSTERİLMEZ', WIDTH / 2, 1385);

  ctx.fillStyle = SUN;
  ctx.font = DISPLAY.replace('1px', '25px');
  ctx.textBaseline = 'top';
  ctx.fillText(
    ellipsize(ctx, `HARFİYEN  ·  ${normalizedUrl(input.url)}`, 820),
    WIDTH / 2,
    1470,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('PNG üretilemedi.')),
      'image/png',
    );
  });
  return new File([blob], 'harfiyen-iki-dogru-bir-yalan.png', { type: 'image/png' });
}
