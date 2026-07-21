/**
 * Story katmani bilerek dar tutulur: bireysel oylar, oyuncu id'leri, oda kodu,
 * aktif/future senaryolar veya tam RoomSnapshot bu API'ye giremez.
 */
export interface KirmiziYesilShareCardInput {
  playerA: string;
  playerB: string;
  matches: number;
  redMatches: number;
  dependsMatches: number;
  greenMatches: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  compatibility: number;
  featuredPrompt: string;
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const NIGHT = '#090C13';
const PANEL = '#151A25';
const PANEL_SOFT = '#202634';
const WHITE = '#F8F7FC';
const MUTED = '#AEB5C3';
const RED = '#FF5D75';
const RED_SOFT = '#3A1B24';
const AMBER = '#FFD166';
const AMBER_SOFT = '#3A311B';
const GREEN = '#4AE297';
const GREEN_SOFT = '#153426';
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
  stroke: string,
  lineWidth: number,
) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function cleanText(value: string, fallback: string, max = 80): string {
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

function wrappedLines(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = cleanText(value, 'Sizin gecenizin sorusu', 150).split(' ');
  const lines: string[] = [];
  let line = '';
  let cursor = 0;
  while (cursor < words.length && lines.length < maxLines) {
    const candidate = line ? `${line} ${words[cursor]}` : words[cursor];
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      cursor += 1;
      continue;
    }
    lines.push(line);
    line = '';
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (cursor < words.length && lines.length > 0) {
    lines[lines.length - 1] = ellipsize(ctx, `${lines.at(-1)} ${words.slice(cursor).join(' ')}`, maxWidth);
  }
  return lines;
}

function resultCopy(jointRounds: number, compatibility: number): { title: string; subtitle: string } {
  if (jointRounds < 4) {
    return { title: 'RADAR YARIM KALDI', subtitle: 'Birkaç ortak seçim daha gerekiyordu.' };
  }
  if (compatibility >= 88) {
    return { title: 'BAYRAK TELEPATİSİ', subtitle: 'Neredeyse her durumda aynı renge baktınız.' };
  }
  if (compatibility >= 63) {
    return { title: 'AYNI FREKANSTASINIZ', subtitle: 'Renkleriniz çoğunlukla aynı yöne dönüyor.' };
  }
  if (compatibility >= 38) {
    return { title: 'TATLI GRİ ALAN', subtitle: 'Konuşacak güzel başlıklar çıktı.' };
  }
  return { title: 'FARKLI RENK, AYNI TAKIM', subtitle: 'Aynı durumlara kendi renginizden bakıyorsunuz.' };
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const redGlow = ctx.createRadialGradient(-60, 690, 0, -60, 690, 740);
  redGlow.addColorStop(0, 'rgba(255,93,117,.42)');
  redGlow.addColorStop(1, 'rgba(255,93,117,0)');
  ctx.fillStyle = redGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const greenGlow = ctx.createRadialGradient(WIDTH + 60, 760, 0, WIDTH + 60, 760, 750);
  greenGlow.addColorStop(0, 'rgba(74,226,151,.36)');
  greenGlow.addColorStop(1, 'rgba(74,226,151,0)');
  ctx.fillStyle = greenGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  for (let x = 24; x < WIDTH; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 24; y < HEIGHT; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 5;
  for (const radius of [100, 170, 240]) {
    ctx.beginPath();
    ctx.arc(WIDTH / 2, 800, radius, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [RED, '#EF86A0', AMBER, GREEN, '#73E9B0', AMBER, RED, GREEN];
  const tile = 64;
  const gap = 9;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const startX = (WIDTH - total) / 2;
  letters.forEach((letter, index) => {
    const x = startX + index * (tile + gap);
    fillRound(ctx, x, 92, tile, tile, 17, colors[index]);
    ctx.fillStyle = '#090C13';
    ctx.font = DISPLAY.replace('1px', '36px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + tile / 2, 126);
  });
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  color: string,
  soft: string,
  value: number,
  label: string,
) {
  const y = 1042;
  const width = 282;
  const height = 205;
  fillRound(ctx, x, y, width, height, 37, soft);
  strokeRound(ctx, x, y, width, height, 37, color, 5);
  ctx.fillStyle = color;
  ctx.font = DISPLAY.replace('1px', '74px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + width / 2, y + 79);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '27px');
  ctx.fillText(label, x + width / 2, y + 151);
}

function normalizedUrl(raw?: string): string {
  return cleanText(raw ?? window.location.host, 'Harfiyen', 96)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '');
}

/** Üretim 1080x1920 PNG'si; kart cihazda oluşur ve hiçbir veri yüklenmez. */
export async function createKirmiziYesilShareCard(input: KirmiziYesilShareCardInput): Promise<File> {
  try {
    await document.fonts?.ready;
  } catch {
    // Sistem fontlariyla devam edilir.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Paylaşım görseli için Canvas başlatılamadı.');

  const playerA = cleanText(input.playerA, 'Ben', 24);
  const playerB = cleanText(input.playerB, 'Partnerim', 24);
  const matches = safeInt(input.matches, 8);
  const redMatches = safeInt(input.redMatches, 8);
  const dependsMatches = safeInt(input.dependsMatches, 8);
  const greenMatches = safeInt(input.greenMatches, 8);
  const jointRounds = safeInt(input.jointRounds, 8);
  const splitRounds = safeInt(input.splitRounds, 8);
  const missedRounds = safeInt(input.missedRounds, 8);
  const compatibility = safeInt(input.compatibility, 100);
  const featuredPrompt = cleanText(input.featuredPrompt, 'Bu davranış sende hangi rengi yakıyor?', 150);
  const result = resultCopy(jointRounds, compatibility);

  drawBackground(ctx);
  drawLogo(ctx);

  ctx.fillStyle = AMBER;
  ctx.font = BODY.replace('1px', '25px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('İLİŞKİ RADARI', WIDTH / 2, 197);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '62px');
  ctx.fillText('KIRMIZI MI YEŞİL Mİ?', WIDTH / 2, 234);

  fillRound(ctx, 156, 328, 768, 82, 41, PANEL_SOFT);
  strokeRound(ctx, 156, 328, 768, 82, 41, '#60697C', 4);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '30px');
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, `${playerA}  +  ${playerB}`, 680), WIDTH / 2, 369);

  const scoreGradient = ctx.createLinearGradient(116, 456, 964, 456);
  scoreGradient.addColorStop(0, RED);
  scoreGradient.addColorStop(.5, AMBER);
  scoreGradient.addColorStop(1, GREEN);
  fillRound(ctx, 116, 456, 848, 420, 64, PANEL);
  roundedRect(ctx, 116, 456, 848, 420, 64);
  ctx.strokeStyle = scoreGradient;
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '138px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${matches}/8`, WIDTH / 2, 606);
  ctx.font = DISPLAY.replace('1px', '48px');
  ctx.fillText('AYNI RENK', WIDTH / 2, 711);
  ctx.fillStyle = AMBER;
  ctx.font = DISPLAY.replace('1px', '39px');
  ctx.fillText(jointRounds < 4 ? 'RADAR EKSİK' : `%${compatibility} UYUM`, WIDTH / 2, 778);

  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '41px');
  ctx.textBaseline = 'top';
  ctx.fillText(result.title, WIDTH / 2, 914);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText(result.subtitle, WIDTH / 2, 967);

  drawStat(ctx, 78, RED, RED_SOFT, redMatches, 'ORTAK KIRMIZI');
  drawStat(ctx, 399, AMBER, AMBER_SOFT, dependsMatches, 'DURUMA BAĞLI');
  drawStat(ctx, 720, GREEN, GREEN_SOFT, greenMatches, 'ORTAK YEŞİL');

  fillRound(ctx, 78, 1292, 924, 322, 45, PANEL);
  strokeRound(ctx, 78, 1292, 924, 322, 45, '#60697C', 5);
  ctx.fillStyle = AMBER;
  ctx.font = BODY.replace('1px', '24px');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('GECENİN SORUSU', 126, 1340);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '42px');
  const lines = wrappedLines(ctx, featuredPrompt, 825, 3);
  lines.forEach((line, index) => ctx.fillText(line, 126, 1392 + index * 55));

  fillRound(ctx, 126, 1541, 828, 48, 24, '#222836');
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '21px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${jointRounds}/8 ortak tur  ·  ${splitRounds} ayrı renk  ·  ${missedRounds} kaçan tur`, WIDTH / 2, 1565);

  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '25px');
  ctx.textBaseline = 'top';
  ctx.fillText('Doğru cevap yok; bu yalnızca sizin bakış açınız.', WIDTH / 2, 1680);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '22px');
  ctx.fillText('Bireysel seçimler bu Story kartında gösterilmez.', WIDTH / 2, 1724);

  ctx.fillStyle = AMBER;
  ctx.font = DISPLAY.replace('1px', '30px');
  ctx.fillText('HARFİYEN  ·  İKİ TELEFON, TEK RADAR', WIDTH / 2, 1795);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '22px');
  ctx.fillText(ellipsize(ctx, normalizedUrl(input.url), 800), WIDTH / 2, 1843);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG üretilemedi.')), 'image/png');
  });
  return new File([blob], 'harfiyen-kirmizi-mi-yesil-mi.png', { type: 'image/png' });
}
