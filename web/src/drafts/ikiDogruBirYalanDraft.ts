export type IkiDogruBirYalanLieIndex = 0 | 1 | 2;

export interface IkiDogruBirYalanDraft {
  statements: [string, string, string];
  lieIndex: IkiDogruBirYalanLieIndex | null;
}

interface StoredDraft extends IkiDogruBirYalanDraft {
  version: 1;
  roomCode: string;
  playerId: string;
}

const PREFIX = 'harfiyen:iki-dogru-bir-yalan:draft:v1:';
const MAX_STATEMENT_LENGTH = 72;

function normalizedRoom(code: string): string {
  return code.trim().toUpperCase();
}

function keyFor(code: string, playerId: string): string {
  return `${PREFIX}${normalizedRoom(code)}:${playerId}`;
}

function validStatements(value: unknown): value is [string, string, string] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((statement) => (
      typeof statement === 'string' && statement.length <= MAX_STATEMENT_LENGTH
    ));
}

function validLieIndex(value: unknown): value is IkiDogruBirYalanLieIndex | null {
  return value === null || value === 0 || value === 1 || value === 2;
}

/**
 * Taslak yalnız bu sekmenin sessionStorage alanında yaşar. Sunucuya yazılmaz,
 * global store'a taşınmaz ve Story katmanıyla hiçbir bağı yoktur.
 */
export function readIkiDogruBirYalanDraft(
  code: string,
  playerId: string,
): IkiDogruBirYalanDraft | null {
  try {
    const raw = sessionStorage.getItem(keyFor(code, playerId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      value.version !== 1
      || value.roomCode !== normalizedRoom(code)
      || value.playerId !== playerId
      || !validStatements(value.statements)
      || !validLieIndex(value.lieIndex)
    ) {
      sessionStorage.removeItem(keyFor(code, playerId));
      return null;
    }
    return { statements: [...value.statements], lieIndex: value.lieIndex };
  } catch {
    return null;
  }
}

export function writeIkiDogruBirYalanDraft(
  code: string,
  playerId: string,
  draft: IkiDogruBirYalanDraft,
): void {
  if (!validStatements(draft.statements) || !validLieIndex(draft.lieIndex)) return;
  const value: StoredDraft = {
    version: 1,
    roomCode: normalizedRoom(code),
    playerId,
    statements: [...draft.statements],
    lieIndex: draft.lieIndex,
  };
  try {
    sessionStorage.setItem(keyFor(code, playerId), JSON.stringify(value));
  } catch {
    // Safari gizli mod/depolama kotası oyun akışını engellememeli.
  }
}

export function clearIkiDogruBirYalanDraft(code: string, playerId: string): void {
  try {
    sessionStorage.removeItem(keyFor(code, playerId));
  } catch {
    // Depolama engelliyse temizlenecek kalıcı bir taslak da yoktur.
  }
}

/** Bilerek odadan çıkışta o odanın bu sekmedeki tüm oyuncu taslaklarını siler. */
export function clearIkiDogruBirYalanDraftsForRoom(code: string): void {
  const roomPrefix = `${PREFIX}${normalizedRoom(code)}:`;
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(roomPrefix)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Depolama engelliyse temizlenecek kalıcı bir taslak da yoktur.
  }
}
