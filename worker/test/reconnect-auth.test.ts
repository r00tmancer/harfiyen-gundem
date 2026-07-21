import { describe, expect, it } from 'vitest';
import {
  WS_APP_PROTOCOL,
  createPublicPlayerId,
  hashReconnectSecret,
  parseReconnectProtocols,
  resolvePlayerJoin,
} from '../src/reconnect-auth';

const SECRET_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const SECRET_B = 'BBBBBBBBBBBBBBBBBBBBBB';

describe('reconnect websocket protokolu', () => {
  it('uygulama ve tek 128-bit auth protokolunu kabul eder', () => {
    expect(
      parseReconnectProtocols(`${WS_APP_PROTOCOL}, harfiyen.auth.${SECRET_A}`),
    ).toEqual({ ok: true, secret: SECRET_A });
    expect(
      parseReconnectProtocols(`harfiyen.auth.${SECRET_A}, ${WS_APP_PROTOCOL}`),
    ).toEqual({ ok: true, secret: SECRET_A });
  });

  it('eksik, bozuk, yinelenen ve fazladan protokolleri reddeder', () => {
    expect(parseReconnectProtocols(null)).toEqual({ ok: false, reason: 'missing' });
    expect(parseReconnectProtocols(WS_APP_PROTOCOL)).toEqual({ ok: false, reason: 'missing' });
    expect(parseReconnectProtocols(`${WS_APP_PROTOCOL}, harfiyen.auth.short`)).toEqual({
      ok: false,
      reason: 'invalid_auth',
    });
    expect(
      parseReconnectProtocols(
        `${WS_APP_PROTOCOL}, harfiyen.auth.${SECRET_A}, harfiyen.auth.${SECRET_B}`,
      ),
    ).toEqual({ ok: false, reason: 'duplicate' });
    expect(
      parseReconnectProtocols(`${WS_APP_PROTOCOL}, harfiyen.auth.${SECRET_A}, baska.protokol`),
    ).toEqual({ ok: false, reason: 'unexpected_protocol' });
  });
});

describe('reconnect kimligi', () => {
  it('secret yerine deterministik SHA-256 hash saklar', async () => {
    const hash = await hashReconnectSecret(SECRET_A);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(SECRET_A);
    await expect(hashReconnectSecret('short')).rejects.toThrow('invalid reconnect secret');
  });

  it('dogru hash ile reconnect, yanlis hash ile dolu oda karari verir', async () => {
    const hashA = await hashReconnectSecret(SECRET_A);
    const hashB = await hashReconnectSecret(SECRET_B);
    const players = [
      { id: 'public-a', reconnectHash: hashA },
      { id: 'public-b', reconnectHash: hashB },
    ];

    await expect(resolvePlayerJoin(players, hashA)).resolves.toEqual({
      kind: 'reconnect',
      player: players[0],
    });
    await expect(
      resolvePlayerJoin(players, await hashReconnectSecret('CCCCCCCCCCCCCCCCCCCCCC')),
    ).resolves.toEqual({ kind: 'full' });
    await expect(resolvePlayerJoin(players.slice(0, 1), hashB)).resolves.toEqual({ kind: 'new' });
  });

  it('public idyi secret/hash degerinden bagimsiz ve cakismasiz uretir', () => {
    const values = ['public-a', 'public-c'];
    let index = 0;
    expect(
      createPublicPlayerId(
        [{ id: 'public-a' }],
        () => values[index++],
      ),
    ).toBe('public-c');
  });
});
