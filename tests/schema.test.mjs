import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applySchema, connectionOptions, safeError } from '../scripts/apply-schema.mjs'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../supabase/migrations/20261119000000_harden_schema.sql', import.meta.url),
  'utf8'
)
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const roomA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const roomB = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
const messageA = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa'

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated, anon;
    create publication supabase_realtime;
  `)
  return db
}
// PGlite exec uses PostgreSQL's multi-statement path, like pg.Client.query(sql).
const clientFor = (db) => ({ query: async (sql) => (await db.exec(sql)).at(-1) })
async function asUser(db, id, run) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}
async function createRoom(db, id) {
  return db.query(
    'insert into public.chat_rooms(id,created_at,updated_at) values($1,now(),now()) returning id',
    [id]
  )
}

test('canonical schema and forward migration stay identical', () => assert.equal(schema, migration))

test('fresh schema, repeated apply, and triggers execute in PostgreSQL', async () => {
  const db = await database()
  try {
    await db.query('insert into auth.users values($1,$2)', [alice, 'a@example.invalid'])
    assert.equal((await applySchema(clientFor(db), schema)).tables, 7)
    await applySchema(clientFor(db), schema)
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 1)
    await db.query('insert into auth.users values($1,$2)', [bob, 'b@example.invalid'])
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 2)
    await asUser(db, alice, async () => {
      assert.equal((await createRoom(db, roomA)).rows[0].id, roomA)
      assert.equal((await db.query('select * from public.room_members')).rows.length, 1)
      await db.query(
        `insert into public.messages(id,room_id,role,created_at,data)
        values($1,$2,'user',now(),'{}')`,
        [messageA, roomA]
      )
    })
    await applySchema(clientFor(db), schema)
    assert.equal((await db.query('select count(*)::int as n from public.messages')).rows[0].n, 1)
  } finally {
    await db.close()
  }
})

test('two real database roles: isolation, forbidden moves, forged files, anonymous access', async () => {
  const db = await database()
  try {
    await applySchema(clientFor(db), schema)
    await db.query('insert into auth.users(id) values($1),($2)', [alice, bob])
    await asUser(db, alice, async () => {
      await createRoom(db, roomA)
      await db.query(
        `insert into public.messages(id,room_id,role,created_at,data)
        values($1,$2,'assistant',now(),'{}')`,
        [messageA, roomA]
      )
    })
    await asUser(db, bob, async () => {
      await createRoom(db, roomB)
      assert.deepEqual((await db.query('select id from public.chat_rooms')).rows, [{ id: roomB }])
      assert.equal((await db.query('select * from public.messages')).rows.length, 0)
      await assert.rejects(
        db.query(
          `insert into public.messages(id,room_id,role,created_at,data)
        values(gen_random_uuid(),$1,'user',now(),'{}')`,
          [roomA]
        ),
        { code: '42501' }
      )
      await assert.rejects(
        db.query('insert into public.room_members(room_id,user_id) values($1,$2)', [roomA, bob]),
        { code: '42501' }
      )
      await assert.rejects(db.query('insert into public.files(id) values($1)', ['forged-id']), {
        code: '42501',
      })
      await assert.rejects(
        db.query('insert into public.presence(user_id,room_id) values($1,$2)', [bob, roomA]),
        { code: '42501' }
      )
      assert.equal(
        (await db.query('delete from public.chat_rooms where id=$1 returning id', [roomA])).rows
          .length,
        0
      )
    })
    await asUser(db, alice, async () => {
      await assert.rejects(
        db.query('update public.messages set room_id=$1 where id=$2', [roomB, messageA]),
        { code: '42501' }
      )
      await assert.rejects(
        db.query('update public.chat_rooms set owner_id=$1 where id=$2', [bob, roomA]),
        { code: '42501' }
      )
    })
    await db.exec('set role service_role')
    await db.query('insert into public.files(id,user_id) values($1,$2)', ['real-file', alice])
    await db.exec('reset role')
    await asUser(db, bob, async () =>
      assert.equal((await db.query('select * from public.files')).rows.length, 0)
    )
    await asUser(db, alice, async () =>
      assert.equal((await db.query('select * from public.files')).rows.length, 1)
    )
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.messages'), { code: '42501' })
    await db.exec('reset role')
  } finally {
    await db.close()
  }
})

test('upgrading the committed initial migration keeps existing conversations', async () => {
  const db = await database()
  try {
    const initial = await readFile(
      new URL('../supabase/migrations/20261118000000_init.sql', import.meta.url),
      'utf8'
    )
    await db.exec(initial)
    await db.query('insert into auth.users(id) values($1)', [alice])
    // The old SELECT policy blocks INSERT RETURNING before the owner trigger fires.
    await asUser(db, alice, () =>
      db.query('insert into public.chat_rooms(id,created_at,updated_at) values($1,now(),now())', [
        roomA,
      ])
    )
    await applySchema(clientFor(db), schema)
    await asUser(db, alice, async () =>
      assert.equal((await db.query('select id from public.chat_rooms')).rows[0].id, roomA)
    )
  } finally {
    await db.close()
  }
})

test('failed migration rolls back all earlier statements', async () => {
  const db = await database()
  try {
    await assert.rejects(
      applySchema(clientFor(db), schema + '\nselect missing_column from public.messages;')
    )
    assert.equal(
      (await db.query("select to_regclass('public.messages') as table_name")).rows[0].table_name,
      null
    )
  } finally {
    await db.close()
  }
})

test('TLS verification cannot be downgraded by connection URI; errors do not disclose secrets', () => {
  const config = connectionOptions(
    'postgres://user:private-password@db.example.invalid/postgres?sslmode=no-verify&ssl=false'
  )
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false)
  assert.equal(new URL(config.connectionString).searchParams.has('ssl'), false)
  assert.doesNotMatch(
    safeError(new Error('postgres://user:private-password@db.example.invalid')),
    /private-password/
  )
})
