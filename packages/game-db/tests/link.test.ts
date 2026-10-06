import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_INTENT_TTL_MS,
  InvalidIntentError,
  LINK_SECRET_ENV,
  LinkUnavailableError,
  intentSigningMessage,
  serializeIntentPayload,
  signIntent,
  verifyIntentSignature,
  type EnqueueIntentInput,
  type IntentSignatureFields,
} from '../src';
import { createFixture, type Fixture } from './fixtures/db';
import { ALICE, BOB, HOUR, MINUTE, NOBODY, NOW, SEEDED_INTENT_ID } from './fixtures/seed';

/** Le vecteur de test de `docs/contracts/intents.md`, § 3. Le plugin EnderiumLink vérifie le même. */
const VECTOR_SECRET = 'enderium-link-test-secret-0123456789abcdef';
const VECTOR_FIELDS: IntentSignatureFields = {
  id: '3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f',
  idempotencyKey: 'console:3f1c2a9e',
  kind: 'economy.deposit',
  targetServer: '',
  actorId: 'asc_usr_test',
  actorUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
  createdAt: 1_790_000_000_000,
  expiresAt: 1_790_000_600_000,
  reason: "Remboursement d'un achat perdu",
  payload: '{"playerUuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","amount":2500}',
};
const VECTOR_SIGNATURE = '9390a1b85c0cf260284754df062632a24b6867b1f218d6bf8beceff710f69cf1';

const SECRET = 'un-secret-de-test-assez-long-0123456789';

const deposit = (overrides: Partial<EnqueueIntentInput> = {}): EnqueueIntentInput =>
  ({
    kind: 'economy.deposit',
    payload: { playerUuid: BOB, amount: 2_500 },
    idempotencyKey: 'console:test-1',
    actorId: 'asc_usr_alice',
    actorName: 'Alice',
    actorUuid: ALICE,
    reason: "Remboursement d'un achat perdu",
    ...overrides,
  }) as EnqueueIntentInput;

describe('intent signature', () => {
  it('matches the test vector of the contract', () => {
    expect(signIntent(VECTOR_FIELDS, VECTOR_SECRET)).toBe(VECTOR_SIGNATURE);
  });

  it('builds the signed message field by field, payload last', () => {
    expect(intentSigningMessage(VECTOR_FIELDS)).toBe(
      'v1\n3f1c2a9e-5b7d-4c1a-9e2f-0a1b2c3d4e5f\nconsole:3f1c2a9e\neconomy.deposit\n\nasc_usr_test\n' +
        '069a79f4-44e9-4726-a5be-fca90e38aaf5\n1790000000000\n1790000600000\n' +
        "Remboursement d'un achat perdu\n" +
        '{"playerUuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","amount":2500}',
    );
  });

  it('serialises the payload of the vector exactly as signed', () => {
    const { json } = serializeIntentPayload('economy.deposit', {
      amount: 2500,
      playerUuid: '069A79F4-44E9-4726-A5BE-FCA90E38AAF5',
    });
    // Clés dans l'ordre du contrat, UUID en minuscules, quel que soit l'objet reçu.
    expect(json).toBe(VECTOR_FIELDS.payload);
  });

  it('verifies a signature and rejects any altered field', () => {
    expect(verifyIntentSignature(VECTOR_FIELDS, VECTOR_SIGNATURE, VECTOR_SECRET)).toBe(true);
    expect(
      verifyIntentSignature({ ...VECTOR_FIELDS, reason: 'autre' }, VECTOR_SIGNATURE, VECTOR_SECRET),
    ).toBe(false);
    expect(
      verifyIntentSignature({ ...VECTOR_FIELDS, expiresAt: 1 }, VECTOR_SIGNATURE, VECTOR_SECRET),
    ).toBe(false);
    expect(verifyIntentSignature(VECTOR_FIELDS, VECTOR_SIGNATURE, `${VECTOR_SECRET}x`)).toBe(false);
    expect(verifyIntentSignature(VECTOR_FIELDS, 'abc', VECTOR_SECRET)).toBe(false);
  });
});

describe('intent kinds', () => {
  it('accepts the four actions of version 1', () => {
    expect(
      serializeIntentPayload('perms.member.add', { playerUuid: BOB, groupId: 'hero', expiresAt: 0 })
        .json,
    ).toBe(`{"playerUuid":"${BOB}","groupId":"hero","expiresAt":0}`);
    expect(
      serializeIntentPayload('perms.member.remove', { groupId: 'resp-modo', playerUuid: BOB }).json,
    ).toBe(`{"playerUuid":"${BOB}","groupId":"resp-modo"}`);
    expect(
      serializeIntentPayload('economy.withdraw', { playerUuid: BOB, amount: 1 }).payload,
    ).toEqual({
      playerUuid: BOB,
      amount: 1,
    });
  });

  it.each([
    ['unknown kind', 'economy.burn', { playerUuid: BOB, amount: 1 }],
    ['zero amount', 'economy.deposit', { playerUuid: BOB, amount: 0 }],
    ['negative amount', 'economy.withdraw', { playerUuid: BOB, amount: -5 }],
    ['fractional amount', 'economy.deposit', { playerUuid: BOB, amount: 1.5 }],
    ['amount as text', 'economy.deposit', { playerUuid: BOB, amount: '100' }],
    ['amount beyond the safe range', 'economy.deposit', { playerUuid: BOB, amount: 2 ** 53 }],
    ['malformed uuid', 'economy.deposit', { playerUuid: 'bob', amount: 1 }],
    ['missing field', 'perms.member.add', { playerUuid: BOB, groupId: 'hero' }],
    ['unknown extra field', 'economy.deposit', { playerUuid: BOB, amount: 1, note: 'x' }],
    ['upper-case group', 'perms.member.remove', { playerUuid: BOB, groupId: 'Hero' }],
    ['negative expiry', 'perms.member.add', { playerUuid: BOB, groupId: 'hero', expiresAt: -1 }],
    ['not an object', 'economy.deposit', null],
  ])('refuses a payload with %s', (_label, kind, payload) => {
    expect(() => serializeIntentPayload(kind, payload)).toThrow(InvalidIntentError);
  });
});

describe('link', () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = createFixture({ options: { linkSecret: SECRET } });
  });
  afterEach(() => fixture.cleanup());

  const countIntents = () =>
    fixture.raw((database) =>
      Number(database.prepare('SELECT COUNT(*) AS n FROM link_intents').get()?.n),
    );

  it('reports servers with a computed online flag', async () => {
    expect(await fixture.db.link.available()).toBe(true);
    expect(await fixture.db.link.servers()).toEqual([
      {
        serverId: 'creative',
        startedAt: NOW - 48 * HOUR,
        seenAt: NOW - 10 * MINUTE,
        online: false,
        pluginVersion: '1.3.9',
        minecraftVersion: '26.2',
        onlinePlayers: 7,
        maxPlayers: 20,
        tps: 20,
        mspt: 8,
      },
      {
        serverId: 'survival',
        startedAt: NOW - 6 * HOUR,
        seenAt: NOW - 10_000,
        online: true,
        pluginVersion: '1.4.0',
        minecraftVersion: '26.2',
        onlinePlayers: 3,
        maxPlayers: 100,
        tps: 19.98,
        mspt: 12.34,
      },
    ]);
  });

  it('draws the online line at 45 seconds', async () => {
    const seenAt = (age: number) =>
      fixture.raw((database) =>
        database
          .prepare('INSERT INTO link_servers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(`edge-${age}`, NOW, NOW - age, '1', '26.2', 0, 1, 2000, 100),
      );
    seenAt(44_999);
    seenAt(45_000);
    const servers = await fixture.db.link.servers();
    expect(servers.find((server) => server.serverId === 'edge-44999')?.online).toBe(true);
    expect(servers.find((server) => server.serverId === 'edge-45000')?.online).toBe(false);
  });

  it('reads a finished intent with its decoded payload and result', async () => {
    expect(await fixture.db.link.intents.get(SEEDED_INTENT_ID)).toEqual({
      id: SEEDED_INTENT_ID,
      idempotencyKey: 'console:seeded',
      kind: 'economy.deposit',
      payload: { playerUuid: BOB, amount: 100 },
      payloadText: `{"playerUuid":"${BOB}","amount":100}`,
      targetServer: null,
      actorId: 'asc_usr_alice',
      actorName: 'Alice',
      actorUuid: ALICE,
      reason: 'Geste commercial',
      status: 'done',
      createdAt: NOW - HOUR,
      expiresAt: NOW - HOUR + 10 * MINUTE,
      expired: false,
      claimedAt: NOW - HOUR + 3_000,
      claimedBy: 'survival',
      finishedAt: NOW - HOUR + 3_050,
      resultCode: 'ok',
      resultDetail: { balanceAfter: 1200 },
      signature: 'a'.repeat(64),
    });
    expect(await fixture.db.link.intents.get(NOBODY)).toBeNull();
  });

  it('enqueues a signed, pending intent that expires after ten minutes', async () => {
    const { intent, created } = await fixture.db.link.intents.enqueue(deposit());
    expect(created).toBe(true);
    expect(intent).toMatchObject({
      idempotencyKey: 'console:test-1',
      kind: 'economy.deposit',
      payload: { playerUuid: BOB, amount: 2_500 },
      payloadText: `{"playerUuid":"${BOB}","amount":2500}`,
      targetServer: null,
      actorId: 'asc_usr_alice',
      actorName: 'Alice',
      actorUuid: ALICE,
      reason: "Remboursement d'un achat perdu",
      status: 'pending',
      createdAt: NOW,
      expiresAt: NOW + DEFAULT_INTENT_TTL_MS,
      expired: false,
      claimedAt: null,
      claimedBy: null,
      finishedAt: null,
      resultCode: null,
      resultDetail: null,
    });
    expect(DEFAULT_INTENT_TTL_MS).toBe(10 * MINUTE);
    expect(intent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // Ce qui est en base : exactement les colonnes du contrat, et une signature que le serveur recalcule.
    const row = fixture.raw((database) =>
      database.prepare('SELECT * FROM link_intents WHERE id = ?').get(intent.id),
    );
    expect(row).toEqual({
      id: intent.id,
      idempotency_key: 'console:test-1',
      kind: 'economy.deposit',
      payload: `{"playerUuid":"${BOB}","amount":2500}`,
      target_server: '',
      actor_id: 'asc_usr_alice',
      actor_name: 'Alice',
      actor_uuid: ALICE,
      reason: "Remboursement d'un achat perdu",
      status: 'pending',
      created_at: NOW,
      expires_at: NOW + 600_000,
      claimed_at: 0,
      claimed_by: '',
      finished_at: 0,
      result_code: '',
      result_detail: '',
      signature: intent.signature,
    });
    const signed: IntentSignatureFields = {
      id: String(row?.id),
      idempotencyKey: String(row?.idempotency_key),
      kind: String(row?.kind),
      targetServer: String(row?.target_server),
      actorId: String(row?.actor_id),
      actorUuid: String(row?.actor_uuid),
      createdAt: Number(row?.created_at),
      expiresAt: Number(row?.expires_at),
      reason: String(row?.reason),
      payload: String(row?.payload),
    };
    expect(verifyIntentSignature(signed, String(row?.signature), SECRET)).toBe(true);

    // La connexion de lecture voit aussitôt l'intention déposée par la connexion d'écriture.
    expect(await fixture.db.link.intents.get(intent.id)).toEqual(intent);
  });

  it('is idempotent on the key: a second deposit returns the first intent', async () => {
    const first = await fixture.db.link.intents.enqueue(deposit());
    const again = await fixture.db.link.intents.enqueue(deposit());
    expect(again.created).toBe(false);
    expect(again.sameRequest).toBe(true);
    expect(again.intent).toEqual(first.intent);

    // Même clé, autre demande : rien n'est écrit, et l'appelant le sait.
    const other = await fixture.db.link.intents.enqueue(
      deposit({ payload: { playerUuid: BOB, amount: 9 } }),
    );
    expect(other).toMatchObject({ created: false, sameRequest: false });
    expect(other.intent.id).toBe(first.intent.id);
    expect(other.intent.payload).toEqual({ playerUuid: BOB, amount: 2_500 });

    expect(countIntents()).toBe(2);
  });

  it('keeps a single intent when the same key is deposited concurrently', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => fixture.db.link.intents.enqueue(deposit())),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.intent.id)).size).toBe(1);
    expect(countIntents()).toBe(2);
  });

  it('carries the optional envelope fields', async () => {
    const { intent } = await fixture.db.link.intents.enqueue({
      kind: 'perms.member.add',
      payload: { playerUuid: BOB, groupId: 'hero', expiresAt: NOW + HOUR },
      idempotencyKey: 'console:test-2',
      actorId: 'asc_usr_alice',
      actorName: 'Alice',
      reason: '  Grade offert  ',
      targetServer: 'survival',
      ttlMs: 60_000,
    });
    expect(intent).toMatchObject({
      kind: 'perms.member.add',
      targetServer: 'survival',
      actorUuid: null,
      reason: 'Grade offert',
      expiresAt: NOW + 60_000,
    });
  });

  it.each([
    ['a line break in the reason', { reason: 'ligne 1\nligne 2' }],
    ['a carriage return in the reason', { reason: 'ligne 1\rligne 2' }],
    ['an empty reason', { reason: '   ' }],
    ['an oversized reason', { reason: 'x'.repeat(256) }],
    ['a line break in the actor name', { actorName: 'Alice\nMallory' }],
    ['a line break in the actor id', { actorId: 'asc\nusr' }],
    ['a malformed actor uuid', { actorUuid: 'alice' }],
    ['a space in the idempotency key', { idempotencyKey: 'console test' }],
    ['an oversized idempotency key', { idempotencyKey: 'k'.repeat(65) }],
    ['a line break in the target server', { targetServer: 'survival\n' }],
    ['a lifetime of zero', { ttlMs: 0 }],
    ['an invalid payload', { payload: { playerUuid: BOB, amount: -1 } }],
    ['an unknown kind', { kind: 'economy.burn' }],
  ])('refuses %s and writes nothing', async (_label, overrides) => {
    await expect(
      fixture.db.link.intents.enqueue(deposit(overrides as Partial<EnqueueIntentInput>)),
    ).rejects.toBeInstanceOf(InvalidIntentError);
    expect(countIntents()).toBe(1);
  });

  it('lists intents, most recent first, with filters', async () => {
    await fixture.db.link.intents.enqueue(deposit());
    await fixture.db.link.intents.enqueue(
      deposit({
        idempotencyKey: 'console:test-3',
        actorId: 'asc_usr_bob',
        actorName: 'Bob',
        actorUuid: BOB,
      }),
    );
    const { list } = fixture.db.link.intents;

    const all = await list();
    expect(all.total).toBe(3);
    expect(all.rows.at(-1)?.id).toBe(SEEDED_INTENT_ID);

    expect((await list({ status: 'pending' })).total).toBe(2);
    expect((await list({ status: 'done' })).rows.map((intent) => intent.id)).toEqual([
      SEEDED_INTENT_ID,
    ]);
    expect((await list({ actorId: 'asc_usr_bob' })).rows.map((intent) => intent.actorName)).toEqual(
      ['Bob'],
    );
    expect((await list({ kind: 'perms.member.add' })).total).toBe(0);
    expect((await list({ pageSize: 2, page: 2 })).rows).toHaveLength(1);
    await expect(list({ status: 'bogus' as never })).rejects.toThrow();
  });

  it('flags a pending intent that outlived its deadline', async () => {
    const late = createFixture({ options: { linkSecret: SECRET, now: () => NOW + 11 * MINUTE } });
    try {
      late.raw((database) =>
        database.prepare("UPDATE link_intents SET status = 'pending' WHERE 1 = 1").run(),
      );
      const intent = await late.db.link.intents.get(SEEDED_INTENT_ID);
      expect(intent).toMatchObject({ status: 'pending', expired: true });
    } finally {
      await late.cleanup();
    }
  });
});

describe('link unavailable', () => {
  const previous = process.env[LINK_SECRET_ENV];
  afterEach(() => {
    if (previous === undefined) delete process.env[LINK_SECRET_ENV];
    else process.env[LINK_SECRET_ENV] = previous;
  });

  it('degrades to empty reads and a typed error when the tables are missing', async () => {
    const fixture = createFixture({ withLink: false, options: { linkSecret: SECRET } });
    try {
      const { link, meta } = fixture.db;
      expect(await link.available()).toBe(false);
      expect(await meta.hasModule('link')).toBe(false);
      expect(await link.status()).toEqual({ tables: false, secret: 'ok', canEnqueue: false });
      expect(await link.servers()).toEqual([]);
      expect(await link.intents.list({ status: 'pending' })).toMatchObject({
        rows: [],
        total: 0,
        page: 1,
      });
      expect(await link.intents.get(SEEDED_INTENT_ID)).toBeNull();

      const failure = await link.intents.enqueue(deposit()).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(LinkUnavailableError);
      expect((failure as LinkUnavailableError).reason).toBe('tables-missing');
    } finally {
      await fixture.cleanup();
    }
  });

  it('refuses to enqueue without a secret, or with a short one', async () => {
    delete process.env[LINK_SECRET_ENV];
    const fixture = createFixture();
    try {
      const { link } = fixture.db;
      expect(await link.status()).toEqual({ tables: true, secret: 'missing', canEnqueue: false });
      await expect(link.intents.enqueue(deposit())).rejects.toMatchObject({
        name: 'LinkUnavailableError',
        reason: 'secret-missing',
      });
      await expect(link.intents.enqueue(deposit(), { secret: 'trop-court' })).rejects.toMatchObject(
        {
          reason: 'secret-too-short',
        },
      );
      expect(await link.status({ secret: 'trop-court' })).toMatchObject({
        secret: 'too-short',
        canEnqueue: false,
      });
      expect(
        fixture.raw((database) =>
          Number(database.prepare('SELECT COUNT(*) AS n FROM link_intents').get()?.n),
        ),
      ).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('takes the secret from the call, then the options, then the environment', async () => {
    process.env[LINK_SECRET_ENV] = SECRET;
    const fixture = createFixture();
    try {
      expect(await fixture.db.link.status()).toEqual({
        tables: true,
        secret: 'ok',
        canEnqueue: true,
      });
      const fromEnvironment = await fixture.db.link.intents.enqueue(deposit());
      expect(fromEnvironment.created).toBe(true);

      const explicit = `${SECRET}-explicite`;
      const { intent } = await fixture.db.link.intents.enqueue(
        deposit({ idempotencyKey: 'console:test-4' }),
        {
          secret: explicit,
        },
      );
      expect(intent.signature).not.toBe(fromEnvironment.intent.signature);
      expect(
        verifyIntentSignature(
          {
            id: intent.id,
            idempotencyKey: intent.idempotencyKey,
            kind: intent.kind,
            targetServer: '',
            actorId: intent.actorId,
            actorUuid: intent.actorUuid ?? '',
            createdAt: intent.createdAt,
            expiresAt: intent.expiresAt,
            reason: intent.reason,
            payload: intent.payloadText,
          },
          intent.signature,
          explicit,
        ),
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
