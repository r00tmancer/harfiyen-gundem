/**
 * Story siniri bilerek yalniz mac toplamlarini kabul eder. Ham cevap, aktif
 * kategori, history, oda kodu, oyuncu kimligi veya RoomSnapshot bu API'ye
 * giremez; dolayisiyla ozel cevaplar paylasim gorseline sizamaz.
 */
export interface AyniAndaSoyleShareCardInput {
  playerA: string;
  playerB: string;
  matches: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  compatibility: number;
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const ROUNDS = 5;
const NIGHT = '#080B18';
const NIGHT_SOFT = '#13182B';
const PANEL = '#1A2035';
const PANEL_LIGHT = '#252C44';
const WHITE = '#FAF8FF';
const MUTED = '#B9C2D8';
const PINK = '#FF72B6';
const CYAN = '#55E7FF';
const SUN = '#FFD166';
const MINT = '#58E4B8';
const GRAPE = '#A88BFF';
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

function resultCopy(jointRounds: number, compatibility: number): { title: string; subtitle: string } {
  if (jointRounds < 3) {
    return { title: 'FREKANS YARIM KALDI', subtitle: 'Sağlam bir sonuç için biraz daha birlikte cevaplayın.' };
  }
  if (compatibility >= 80) {
    return { title: 'TEK ZİHİN, İKİ TELEFON', subtitle: 'Cevaplarınız neredeyse aynı anda aynı yere indi.' };
  }
  if (compatibility >= 60) {
    return { title: 'AYNI FREKANSTASINIZ', subtitle: 'Gecenin çoğunda aynı kelimeyi yakaladınız.' };
  }
  if (compatibility >= 40) {
    return { title: 'BİRKAÇ KELİME UZAKTA', subtitle: 'Ortak cevaplar var; sürprizler de yerini koruyor.' };
  }
  return { title: 'İKİ AYRI EVREN', subtitle: 'Farklı cevaplar, konuşacak daha çok şey demek.' };
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const leftGlow = ctx.createRadialGradient(70, 660, 20, 70, 660, 760);
  leftGlow.addColorStop(0, 'rgba(255,114,182,.36)');
  leftGlow.addColorStop(1, 'rgba(255,114,182,0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const rightGlow = ctx.createRadialGradient(1010, 650, 20, 1010, 650, 760);
  rightGlow.addColorStop(0, 'rgba(85,231,255,.31)');
  rightGlow.addColorStop(1, 'rgba(85,231,255,0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const centerGlow = ctx.createRadialGradient(540, 820, 0, 540, 820, 500);
  centerGlow.addColorStop(0, 'rgba(255,209,102,.17)');
  centerGlow.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 250, WIDTH, 1150);

  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = WHITE;
  for (let y = 52; y < HEIGHT; y += 76) {
    for (let x = (Math.floor(y / 76) % 2 ? 38 : 78); x < WIDTH; x += 124) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  align: 'left' | 'right',
) {
  fillRound(ctx, x, y, width, height, 48, PANEL_LIGHT);
  strokeRound(ctx, x, y, width, height, 48, color, 6);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (align === 'left') {
    ctx.moveTo(x + 86, y + height - 3);
    ctx.lineTo(x + 40, y + height + 51);
    ctx.lineTo(x + 130, y + height - 3);
  } else {
    ctx.moveTo(x + width - 86, y + height - 3);
    ctx.lineTo(x + width - 40, y + height + 51);
    ctx.lineTo(x + width - 130, y + height - 3);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  color: string,
  value: number,
  label: string,
) {
  fillRound(ctx, x, 1088, 282, 164, 36, PANEL);
  strokeRound(ctx, x, 1088, 282, 164, 36, color, 5);
  ctx.fillStyle = color;
  ctx.font = DISPLAY.replace('1px', '68px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + 141, 1150);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '24px');
  ctx.fillText(label, x + 141, 1211);
}

/** Üretim 1080×1920 PNG'si; gorsel yalniz cihazdaki canvas'ta olusur. */
export async function createAyniAndaSoyleShareCard(
  input: AyniAndaSoyleShareCardInput,
): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // Web fontu yuklenemezse sistem fontlariyla devam edilir.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Paylaşım görseli için Canvas başlatılamadı.');

  const playerA = cleanText(input.playerA, 'Ben');
  const playerB = cleanText(input.playerB, 'Partnerim');
  const jointRounds = safeInt(input.jointRounds, ROUNDS);
  const matches = Math.min(safeInt(input.matches, ROUNDS), jointRounds);
  const splitRounds = Math.min(safeInt(input.splitRounds, ROUNDS), jointRounds);
  const missedRounds = safeInt(input.missedRounds, ROUNDS);
  const compatibility = safeInt(input.compatibility, 100);
  const result = resultCopy(jointRounds, compatibility);

  drawBackground(ctx);
  drawLogo(ctx);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText('AYNI SORU · BİRLİKTE AÇILIR', WIDTH / 2, 220);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '67px');
  ctx.fillText('AYNI ANDA SÖYLE', WIDTH / 2, 265);

  fillRound(ctx, 154, 360, 772, 84, 42, NIGHT_SOFT);
  strokeRound(ctx, 154, 360, 772, 84, 42, '#727D9C', 4);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '30px');
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, `${playerA}  +  ${playerB}`, 690), WIDTH / 2, 402);

  drawSpeechBubble(ctx, 90, 492, 430, 240, PINK, 'left');
  drawSpeechBubble(ctx, 560, 492, 430, 240, CYAN, 'right');
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '72px');
  ctx.textBaseline = 'middle';
  ctx.fillText('…', 305, 604);
  ctx.fillText('…', 775, 604);

  fillRound(ctx, 368, 658, 344, 172, 62, '#302A1B');
  strokeRound(ctx, 368, 658, 344, 172, 62, SUN, 7);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '86px');
  ctx.fillText(`${matches}/${ROUNDS}`, WIDTH / 2, 716);
  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '24px');
  ctx.fillText('ORTAK CEVAP', WIDTH / 2, 786);

  ctx.textBaseline = 'top';
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '45px');
  ctx.fillText(result.title, WIDTH / 2, 872);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText(result.subtitle, WIDTH / 2, 932);

  const pctGradient = ctx.createLinearGradient(180, 1006, 900, 1006);
  pctGradient.addColorStop(0, PINK);
  pctGradient.addColorStop(.5, SUN);
  pctGradient.addColorStop(1, CYAN);
  fillRound(ctx, 186, 990, 708, 72, 36, PANEL);
  strokeRound(ctx, 186, 990, 708, 72, 36, pctGradient, 5);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '34px');
  ctx.textBaseline = 'middle';
  ctx.fillText(jointRounds < 3 ? 'ORTAK TUR EKSİK' : `%${compatibility} AYNI FREKANS`, WIDTH / 2, 1026);

  drawStat(ctx, 78, MINT, matches, 'EŞLEŞTİ');
  drawStat(ctx, 399, GRAPE, splitRounds, 'FARKLI');
  drawStat(ctx, 720, CYAN, jointRounds, 'ORTAK TUR');

  fillRound(ctx, 126, 1292, 828, 70, 35, '#252B42');
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '23px');
  ctx.textBaseline = 'middle';
  ctx.fillText(`${matches} eşleşme · ${splitRounds} farklı · ${missedRounds} kaçan tur`, WIDTH / 2, 1327);

  fillRound(ctx, 126, 1394, 828, 86, 34, PANEL);
  strokeRound(ctx, 126, 1394, 828, 86, 34, '#6F7895', 4);
  ctx.fillStyle = CYAN;
  ctx.font = BODY.replace('1px', '22px');
  ctx.fillText('CEVAPLARINIZ BU STORY KARTINDA GÖSTERİLMEZ', WIDTH / 2, 1437);

  ctx.fillStyle = SUN;
  ctx.font = DISPLAY.replace('1px', '25px');
  ctx.textBaseline = 'top';
  ctx.fillText(
    ellipsize(ctx, `HARFİYEN  ·  ${normalizedUrl(input.url)}`, 820),
    WIDTH / 2,
    1520,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('PNG üretilemedi.')),
      'image/png',
    );
  });
  return new File([blob], 'harfiyen-ayni-anda-soyle.png', { type: 'image/png' });
}
