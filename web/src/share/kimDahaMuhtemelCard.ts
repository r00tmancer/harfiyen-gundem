/**
 * Story katmanı bilerek dar tutulur: bireysel hedefler, oyuncu id'leri,
 * spotlights, oda kodu, aktif/future sorular, history veya RoomSnapshot
 * bu API'ye giremez.
 */
export interface KimDahaMuhtemelShareCardInput {
  playerA: string;
  playerB: string;
  agreements: number;
  samePersonAgreements: number;
  bothAgreements: number;
  jointRounds: number;
  splitRounds: number;
  missedRounds: number;
  agreementPct: number;
  featuredPrompt: string;
  url?: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const NIGHT = '#0B0D18';
const NIGHT_SOFT = '#161A2B';
const PANEL = '#1D2133';
const WHITE = '#FAF8FF';
const MUTED = '#B8BDD0';
const PINK = '#FF6FA9';
const BLUE = '#4FB8FF';
const SUN = '#FFD166';
const MINT = '#54E3B7';
const GRAPE = '#A78BFA';
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
    lines[lines.length - 1] = ellipsize(
      ctx,
      `${lines.at(-1)} ${words.slice(cursor).join(' ')}`,
      maxWidth,
    );
  }
  return lines;
}

function resultCopy(jointRounds: number, agreementPct: number): { title: string; subtitle: string } {
  if (jointRounds < 4) {
    return { title: 'TUR YARIM KALDI', subtitle: 'Birkaç ortak işaret daha gerekiyordu.' };
  }
  if (agreementPct >= 88) {
    return { title: 'PARMAK TELEPATİSİ', subtitle: 'Neredeyse her soruda aynı hedefi gösterdiniz.' };
  }
  if (agreementPct >= 63) {
    return { title: 'ÇOĞUNLUKLA AYNI YÖN', subtitle: 'Spot ışıklarınız sık sık buluştu.' };
  }
  if (agreementPct >= 38) {
    return { title: 'TATLI BİR DENGE', subtitle: 'Hem ortak hem ayrı rolleriniz var.' };
  }
  return { title: 'FARKLI ROL, AYNI TAKIM', subtitle: 'Sorulara kendi pencerenizden baktınız.' };
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const leftSpot = ctx.createRadialGradient(120, 710, 20, 120, 710, 760);
  leftSpot.addColorStop(0, 'rgba(255,111,169,.43)');
  leftSpot.addColorStop(1, 'rgba(255,111,169,0)');
  ctx.fillStyle = leftSpot;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const rightSpot = ctx.createRadialGradient(960, 720, 20, 960, 720, 760);
  rightSpot.addColorStop(0, 'rgba(79,184,255,.37)');
  rightSpot.addColorStop(1, 'rgba(79,184,255,0)');
  ctx.fillStyle = rightSpot;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sharedSpot = ctx.createRadialGradient(WIDTH / 2, 880, 0, WIDTH / 2, 880, 570);
  sharedSpot.addColorStop(0, 'rgba(255,209,102,.17)');
  sharedSpot.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = sharedSpot;
  ctx.fillRect(0, 350, WIDTH, 1100);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  for (let y = 32; y < HEIGHT; y += 56) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = SUN;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(180, 440);
  ctx.lineTo(500, 850);
  ctx.lineTo(900, 420);
  ctx.stroke();
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D) {
  const letters = ['H', 'A', 'R', 'F', 'İ', 'Y', 'E', 'N'];
  const colors = [PINK, BLUE, SUN, MINT, GRAPE, PINK, BLUE, SUN];
  const tile = 64;
  const gap = 9;
  const total = letters.length * tile + (letters.length - 1) * gap;
  const startX = (WIDTH - total) / 2;
  letters.forEach((letter, index) => {
    const x = startX + index * (tile + gap);
    fillRound(ctx, x, 92, tile, tile, 17, colors[index]);
    ctx.fillStyle = NIGHT;
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
  value: number,
  label: string,
) {
  const y = 970;
  const width = 282;
  const height = 170;
  fillRound(ctx, x, y, width, height, 36, PANEL);
  strokeRound(ctx, x, y, width, height, 36, color, 5);
  ctx.fillStyle = color;
  ctx.font = DISPLAY.replace('1px', '70px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + width / 2, y + 64);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText(label, x + width / 2, y + 127);
}

function normalizedUrl(raw?: string): string {
  return cleanText(raw ?? window.location.host, 'Harfiyen', 96)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\s+/g, '');
}

/** Üretim 1080×1920 PNG'si; kart cihazda oluşur ve hiçbir veri yüklenmez. */
export async function createKimDahaMuhtemelShareCard(
  input: KimDahaMuhtemelShareCardInput,
): Promise<File> {
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

  const playerA = cleanText(input.playerA, 'Ben', 24);
  const playerB = cleanText(input.playerB, 'Partnerim', 24);
  const agreements = safeInt(input.agreements, 8);
  const samePersonAgreements = safeInt(input.samePersonAgreements, 8);
  const bothAgreements = safeInt(input.bothAgreements, 8);
  const jointRounds = safeInt(input.jointRounds, 8);
  const splitRounds = safeInt(input.splitRounds, 8);
  const missedRounds = safeInt(input.missedRounds, 8);
  const agreementPct = safeInt(input.agreementPct, 100);
  const featuredPrompt = cleanText(input.featuredPrompt, 'Sence hanginiz bunu yapmaya daha yatkın?', 150);
  const result = resultCopy(jointRounds, agreementPct);

  drawBackground(ctx);
  drawLogo(ctx);

  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '25px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SPOT IŞIKLARI AÇIK', WIDTH / 2, 226);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '62px');
  ctx.fillText('KİM DAHA MUHTEMEL?', WIDTH / 2, 270);

  fillRound(ctx, 156, 354, 768, 82, 41, NIGHT_SOFT);
  strokeRound(ctx, 156, 354, 768, 82, 41, '#69728B', 4);
  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '30px');
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, `${playerA}  +  ${playerB}`, 680), WIDTH / 2, 395);

  const scoreGradient = ctx.createLinearGradient(116, 460, 964, 460);
  scoreGradient.addColorStop(0, PINK);
  scoreGradient.addColorStop(0.5, SUN);
  scoreGradient.addColorStop(1, BLUE);
  fillRound(ctx, 116, 460, 848, 355, 64, PANEL);
  roundedRect(ctx, 116, 460, 848, 355, 64);
  ctx.strokeStyle = scoreGradient;
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '136px');
  ctx.textBaseline = 'middle';
  ctx.fillText(`${agreements}/8`, WIDTH / 2, 578);
  ctx.font = DISPLAY.replace('1px', '46px');
  ctx.fillText('AYNI HEDEF', WIDTH / 2, 682);
  ctx.fillStyle = SUN;
  ctx.font = DISPLAY.replace('1px', '38px');
  ctx.fillText(jointRounds < 4 ? 'ORTAK TUR EKSİK' : `%${agreementPct} AYNI YÖN`, WIDTH / 2, 755);

  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '41px');
  ctx.textBaseline = 'top';
  ctx.fillText(result.title, WIDTH / 2, 850);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '25px');
  ctx.fillText(result.subtitle, WIDTH / 2, 906);

  drawStat(ctx, 78, PINK, samePersonAgreements, 'AYNI KİŞİ');
  drawStat(ctx, 399, SUN, bothAgreements, 'İKİNİZ DE');
  drawStat(ctx, 720, GRAPE, splitRounds, 'AYRI YÖN');

  fillRound(ctx, 126, 1155, 828, 48, 24, '#282D41');
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '21px');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${jointRounds}/8 ortak tur  ·  ${splitRounds} ayrı yön  ·  ${missedRounds} kaçan tur`, WIDTH / 2, 1179);

  fillRound(ctx, 78, 1220, 924, 185, 45, PANEL);
  strokeRound(ctx, 78, 1220, 924, 185, 45, '#68718A', 5);
  ctx.fillStyle = SUN;
  ctx.font = BODY.replace('1px', '24px');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('GECENİN SORUSU', 126, 1250);
  ctx.fillStyle = WHITE;
  ctx.font = DISPLAY.replace('1px', '42px');
  const lines = wrappedLines(ctx, featuredPrompt, 825, 2);
  lines.forEach((line, index) => ctx.fillText(line, 126, 1290 + index * 55));

  ctx.fillStyle = WHITE;
  ctx.font = BODY.replace('1px', '25px');
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('Doğru cevap yok; eğlencelik bir tahmin.', WIDTH / 2, 1432);
  ctx.fillStyle = MUTED;
  ctx.font = BODY.replace('1px', '22px');
  ctx.fillText('Bireysel işaretler bu Story kartında gösterilmez.', WIDTH / 2, 1468);

  ctx.fillStyle = SUN;
  ctx.font = DISPLAY.replace('1px', '25px');
  ctx.fillText(
    ellipsize(ctx, `HARFİYEN  ·  ${normalizedUrl(input.url)}`, 800),
    WIDTH / 2,
    1504,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG üretilemedi.')), 'image/png');
  });
  return new File([blob], 'harfiyen-kim-daha-muhtemel.png', { type: 'image/png' });
}
