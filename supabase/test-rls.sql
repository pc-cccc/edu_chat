-- ============================================================
-- RLS / 权限自检（在 Supabase SQL Editor 执行，只读，不改数据）
-- 用途：确认 schema.sql 已正确生效；配合下面的「两用户手动测试」验证隔离。
-- ============================================================

-- 1) 所有业务表都应开启 RLS（期望全部 enabled）
select relname as table, relrowsecurity as rls_enabled
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and relname in ('profiles','chat_rooms','room_members','messages','files','user_preferences','presence')
order by relname;

-- 2) 关键策略应存在（期望每张表都有策略）
select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) 助手函数与触发器应存在
select proname from pg_proc
where proname in ('is_room_member','handle_new_user','handle_new_room','touch_room_updated')
order by proname;

-- 4) Realtime 发布应包含 messages 与 presence
select pubname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

-- ============================================================
-- 两用户隔离手动测试（不能用管理员账号代替）
--
-- 1. 用两个普通账号登录（A、B 分别用不同浏览器 / 无痕窗口，邮箱注册）。
-- 2. A 建一个会话、发消息；B 刷新页面：
--    - B 的会话列表应为空，看不到 A 的会话；
--    - B 在浏览器控制台执行
--        supabase.from('messages').select('*')
--      应返回空数组（RLS 拦截）。
-- 3. 未登录（anon）：在 Supabase 控制台 API 文档或 curl 用 anon key、不带 JWT 访问
--    /rest/v1/messages，应返回空数组或 401，而不是数据。
-- 4. 直接插入测试（可选）：用 B 的 JWT 尝试往 A 的 room_id 插入消息，应被 RLS 拒绝。
-- ============================================================
