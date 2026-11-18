/**
 * 直接通过连接串执行 supabase/schema.sql（绕过 SQL 编辑器与 CLI）。
 * 用法（PowerShell）：
 *   $env:DATABASE_URL='postgresql://...'   # Supabase 控制台的 Session pooler 连接串
 *   node scripts/apply-schema.mjs
 */
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('请先设置 DATABASE_URL（Supabase 控制台 -> Connect -> Session pooler -> 复制 URI）。')
  process.exit(1)
}

const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ schema.sql 执行成功，建表 / RLS / 授权已完成。')
} catch (error) {
  console.error('❌ 执行失败：', error?.message ?? error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
