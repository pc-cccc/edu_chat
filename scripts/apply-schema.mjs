/** Apply schema atomically, or inspect it with --check. Never log connection strings. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

export function connectionOptions(value, ca) {
  if (!value) throw new Error('CONFIG_MISSING')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('CONFIG_INVALID')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.password) {
    throw new Error('CONFIG_INVALID')
  }
  // pg otherwise allows sslmode=require in the URI to replace our verified TLS settings.
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    url.searchParams.delete(key)
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 15_000,
    application_name: 'edu-chat-schema',
  }
}

export function safeError(error) {
  // Do not print error.message/detail: server errors can contain SQL data or credentials.
  const code = String(error?.code ?? error?.message ?? '')
  const safeCode = String(error?.code ?? '')
  const messages = {
    CONFIG_MISSING: '未设置连接串。Windows 用户请运行 npm run db:setup。',
    CONFIG_INVALID: '连接串格式不正确。请使用 Connect → Session pooler 的 PostgreSQL URI。',
    '28P01': '数据库密码不正确，请重试；这里需要数据库密码，不是 Supabase 登录密码。',
    ENOTFOUND: '无法找到数据库地址，请核对 Session pooler 地址和网络。',
    ETIMEDOUT: '连接超时，请检查网络、项目是否暂停，以及是否使用 Session pooler。',
    ECONNREFUSED: '数据库拒绝连接，请检查项目状态和连接端口。',
    SELF_SIGNED_CERT_IN_CHAIN:
      '证书未被信任。请下载项目数据库 CA 证书，并设置 DATABASE_CA_CERT_PATH；不要关闭证书校验。',
    DEPTH_ZERO_SELF_SIGNED_CERT: '证书未被信任，请配置 DATABASE_CA_CERT_PATH。',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: '无法验证数据库证书，请配置 DATABASE_CA_CERT_PATH。',
    42501: '当前数据库账号权限不足，请使用 Connect 提供的数据库管理员连接串。',
    42703: '现有表结构与本版本不同。已回滚，请先核查旧表字段，不要删除数据。',
    SCHEMA_CHECK_FAILED: '数据库结构或权限检查未通过；应用操作已回滚，请检查迁移版本。',
  }
  return (
    messages[code] ??
    `操作失败${/^[A-Z0-9_]{3,45}$/.test(safeCode) ? `（代码 ${safeCode}）` : ''}。未输出敏感错误详情；请检查连接、证书和数据库结构。`
  )
}

export async function inspectSchema(client) {
  const { rows } = await client.query(`
    select c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
    and c.relname in ('profiles','chat_rooms','room_members','messages','files','user_preferences','presence')
    order by c.relname`)
  const { rows: permissions } = await client.query(`select
    has_table_privilege('authenticated','public.files','INSERT') as can_forge_files,
    has_table_privilege('authenticated','public.files','DELETE') as can_forget_files,
    has_table_privilege('service_role','public.files','INSERT') as worker_can_record`)
  const { rows: functions } = await client.query(`select count(*)::int as count
    from pg_trigger where not tgisinternal
    and tgname in ('on_auth_user_created','on_room_created','on_message_inserted')`)
  const { rows: publication } = await client.query(`select count(*)::int as count
    from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
    and tablename in ('messages','presence')`)
  if (
    rows.length !== 7 ||
    rows.some((row) => !row.rls) ||
    permissions[0].can_forge_files ||
    permissions[0].can_forget_files ||
    !permissions[0].worker_can_record ||
    functions[0].count !== 3 ||
    publication[0].count !== 2
  )
    throw new Error('SCHEMA_CHECK_FAILED')
  // Detect older incompatible table definitions rather than reporting a false success.
  await client.query('select root_message_id, owner_id from public.chat_rooms limit 0')
  await client.query('select data, parent_id, user_id from public.messages limit 0')
  return { tables: rows.length, triggers: functions[0].count, realtimeTables: publication[0].count }
}

export async function applySchema(client, sql) {
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '10s'")
    await client.query("SET LOCAL statement_timeout = '60s'")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('edu-chat-schema'))")
    await client.query(sql)
    const summary = await inspectSchema(client)
    await client.query('COMMIT')
    return summary
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

async function main() {
  let client
  try {
    const ca = process.env.DATABASE_CA_CERT_PATH
      ? await readFile(process.env.DATABASE_CA_CERT_PATH, 'utf8')
      : undefined
    client = new pg.Client(connectionOptions(process.env.DATABASE_URL, ca))
    // Background connection errors must not print raw driver objects.
    client.on('error', () => {})
    await client.connect()
    const checkOnly = process.argv.includes('--check')
    const summary = checkOnly
      ? await inspectSchema(client)
      : await applySchema(
          client,
          await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
        )
    console.log(
      `${checkOnly ? '检查通过' : '建表 / 升级成功'}：${summary.tables} 张表、RLS、${summary.triggers} 个触发器、${summary.realtimeTables} 张 Realtime 表及文件写入权限均已检查。`
    )
    console.log(
      '下一步：部署 Worker，再用两个普通账号验证聊天与隔离。此结果不代表真实聊天已经通过。'
    )
  } catch (error) {
    console.error(safeError(error))
    process.exitCode = 1
  } finally {
    await client?.end().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
