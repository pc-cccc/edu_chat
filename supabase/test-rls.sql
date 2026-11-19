-- 只读结构检查；管理员看到结果不代表普通用户隔离已通过。
-- 这是多条 SELECT，请在 SQL Editor 中运行，或分别选中一条执行。
-- Windows 推荐 npm run db:setup：自动应用并核对结构。
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
and c.relname in ('profiles','chat_rooms','room_members','messages','files','user_preferences','presence')
order by c.relname;
-- 期望：7 行，rls_enabled 全部 true。

select tablename, policyname, roles, cmd from pg_policies
where schemaname='public'
and tablename in ('profiles','chat_rooms','room_members','messages','files','user_preferences','presence')
order by tablename, policyname;

select
  has_table_privilege('authenticated','public.files','INSERT') as user_can_forge_files,
  has_table_privilege('authenticated','public.files','DELETE') as user_can_forget_files,
  has_table_privilege('service_role','public.files','INSERT') as worker_can_record_files;
-- 期望：false / false / true。

select tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
and tablename in ('messages','presence');
-- 期望：messages / presence。

-- 真实环境验收：
-- A 登录、聊天；B 在无痕窗口登录，不能看到 A 的历史。
-- 使用 B 的用户 JWT 调用 REST API 读 A 的会话，返回空数组；
-- B 向 A 的 room_id 插入消息、把自己的消息移到 A 的 room_id 都应失败。
-- 不要将 JWT 粘贴到聊天、提交到 Git；不要用 service_role 代替普通用户测试。
-- 本地自动角色测试在 npm test 中运行，不需要真实账号。
