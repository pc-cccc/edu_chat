-- ============================================================
-- Edu_chat Serverless 版 · Supabase 建表脚本（可重复执行）
--
-- 说明：
--  - 不使用自定义函数 / 触发器（兼容 Supabase SQL Editor 的解析器限制）；
--  - 个人「会话」= 一条 chat_rooms 记录（owner 即本人），消息按 room_id 归属；
--  - 行级安全（RLS）保证每个用户只能读写自己的数据；
--  - files 表记录 DeepSeek 文件归属，供 Worker 在共享 Key 下校验上传/引用/删除归属；
--  - room_members / Realtime 为未来多人协作预留，本版不依赖。
-- ============================================================

-- 清理旧版本可能遗留的函数与触发器（幂等，不存在则跳过）
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_room_created on public.chat_rooms;
drop trigger if exists on_message_inserted on public.messages;
drop function if exists public.is_room_member(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.handle_new_room();
drop function if exists public.touch_room_updated();
drop table if exists public.profiles;

-- 1) 会话（个人：owner 即本人）
create table if not exists public.chat_rooms (
  id uuid primary key,                              -- 稳定 ID，由前端生成（沿用本地会话 ID）
  name text not null default '新会话',
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  root_message_id uuid,                             -- 当前分支根消息 ID（空会话为 null）
  created_at timestamptz not null,                  -- 由前端传入（跨设备一致）
  updated_at timestamptz not null
);

-- 2) 会话成员（本版不使用，为未来多人协作预留）
create table if not exists public.room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 3) 聊天消息（每条消息完整存于 data jsonb，含分支/思考/引用/状态/错误等；
--     id 为稳定前端 ID，幂等 upsert；parent_id 记录分支，无外键约束以允许乱序写入）
create table if not exists public.messages (
  id uuid primary key,                              -- 稳定 ID，由前端生成（沿用本地消息 ID）
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  parent_id uuid,                                   -- 分支父节点
  created_at timestamptz not null,                  -- 由前端传入，用于稳定排序与分页
  data jsonb not null                               -- 完整消息对象
);
create index if not exists messages_room_created_idx on public.messages (room_id, created_at, id);

-- 4) DeepSeek 文件归属（id 为 DeepSeek 的 file_id，供 Worker 校验归属）
create table if not exists public.files (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 5) 用户偏好（勾选的学习组件列表）
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  components jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- 6) 在线状态（多人协作预留）
create table if not exists public.presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  online boolean not null default true,
  last_seen timestamptz not null default now()
);

-- ============================================================
-- 开启行级安全（RLS）
-- ============================================================
alter table public.chat_rooms        enable row level security;
alter table public.room_members      enable row level security;
alter table public.messages          enable row level security;
alter table public.files             enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.presence          enable row level security;

-- ============================================================
-- RLS 策略（不用自定义函数：跨表子查询不会递归，因为被查表自己的策略只比对 auth.uid()）
-- ============================================================

-- chat_rooms：只有 owner 能读写自己的会话
drop policy if exists "rooms_select_own" on public.chat_rooms;
create policy "rooms_select_own" on public.chat_rooms
  for select using (owner_id = auth.uid());

drop policy if exists "rooms_insert_own" on public.chat_rooms;
create policy "rooms_insert_own" on public.chat_rooms
  for insert with check (owner_id = auth.uid());

drop policy if exists "rooms_update_own" on public.chat_rooms;
create policy "rooms_update_own" on public.chat_rooms
  for update using (owner_id = auth.uid());

drop policy if exists "rooms_delete_own" on public.chat_rooms;
create policy "rooms_delete_own" on public.chat_rooms
  for delete using (owner_id = auth.uid());

-- room_members：只能看/写自己的成员记录（预留）
drop policy if exists "members_select_own" on public.room_members;
create policy "members_select_own" on public.room_members
  for select using (user_id = auth.uid());

drop policy if exists "members_insert_own" on public.room_members;
create policy "members_insert_own" on public.room_members
  for insert with check (user_id = auth.uid());

drop policy if exists "members_delete_own" on public.room_members;
create policy "members_delete_own" on public.room_members
  for delete using (user_id = auth.uid());

-- messages：会话 owner 可读；本人发的消息可改/删
drop policy if exists "messages_select_room_owner" on public.messages;
create policy "messages_select_room_owner" on public.messages
  for select using (
    exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and r.owner_id = auth.uid()
    )
  );

drop policy if exists "messages_insert_room_owner" on public.messages;
create policy "messages_insert_room_owner" on public.messages
  for insert with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and r.owner_id = auth.uid()
    )
  );

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update using (user_id = auth.uid());

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete using (user_id = auth.uid());

-- files：只能看/写/删自己的文件归属
drop policy if exists "files_select_own" on public.files;
create policy "files_select_own" on public.files
  for select using (user_id = auth.uid());

drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own" on public.files
  for insert with check (user_id = auth.uid());

drop policy if exists "files_delete_own" on public.files;
create policy "files_delete_own" on public.files
  for delete using (user_id = auth.uid());

-- user_preferences：只能看/改自己
drop policy if exists "prefs_select_own" on public.user_preferences;
create policy "prefs_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "prefs_insert_own" on public.user_preferences;
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "prefs_update_own" on public.user_preferences;
create policy "prefs_update_own" on public.user_preferences
  for update using (auth.uid() = user_id);

-- presence：会话 owner 可读；本人可写
drop policy if exists "presence_select_room_owner" on public.presence;
create policy "presence_select_room_owner" on public.presence
  for select using (
    exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and r.owner_id = auth.uid()
    )
  );

drop policy if exists "presence_insert_own" on public.presence;
create policy "presence_insert_own" on public.presence
  for insert with check (user_id = auth.uid());

drop policy if exists "presence_update_own" on public.presence;
create policy "presence_update_own" on public.presence
  for update using (user_id = auth.uid());

-- ============================================================
-- Data API 访问授权（幂等；RLS 仍控制具体行可见性，anon 无登录看不到任何行）
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant select, usage on all sequences in schema public to anon, authenticated;
