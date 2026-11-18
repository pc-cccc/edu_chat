-- ============================================================
-- Edu_chat Serverless 版 · Supabase 建表脚本（可重复执行）
-- 在 Supabase 控制台 -> SQL Editor 里整段粘贴执行即可。
--
-- 设计要点：
--   - 用户身份用 auth.uid() 判定，行级安全（RLS）保证每个用户只能读写自己的数据；
--   - 个人「会话」= 一条 chat_rooms 记录（owner 即本人），创建后自动把自己加为成员；
--   - files 表记录 DeepSeek 文件归属，供 Worker 在共享 Key 下校验上传/引用/删除归属；
--   - room_members 用 security definer 助手函数避免 RLS 递归；
--   - 所有策略/触发器/发布均幂等，可重复执行。
-- ============================================================

-- 1) 用户资料（注册时自动创建）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- 2) 会话（个人：owner 即本人；未来多人时通过 room_members 增加成员）
create table if not exists public.chat_rooms (
  id uuid primary key,                              -- 稳定 ID，由前端生成（沿用本地会话 ID）
  name text not null default '新会话',
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  root_message_id uuid,                             -- 当前分支根消息 ID（空会话为 null）
  created_at timestamptz not null,                  -- 由前端传入（跨设备一致）
  updated_at timestamptz not null
);

-- 3) 会话成员（个人会话里只有 owner；多人协作时增加成员）
create table if not exists public.room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 4) 聊天消息（每条消息完整存于 data jsonb，含分支/思考/引用/状态/错误等；
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

-- 5) DeepSeek 文件归属（id 为 DeepSeek 的 file_id，供 Worker 校验归属）
create table if not exists public.files (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 6) 用户偏好（勾选的学习组件列表）
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  components jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- 7) 在线状态（Realtime 多人协作）
create table if not exists public.presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  online boolean not null default true,
  last_seen timestamptz not null default now()
);

-- ============================================================
-- 开启行级安全（RLS）
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.chat_rooms        enable row level security;
alter table public.room_members      enable row level security;
alter table public.messages          enable row level security;
alter table public.files             enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.presence          enable row level security;

-- ============================================================
-- 助手函数：当前用户是否是某会话成员。
-- 用 security definer 绕过 RLS，避免「room_members 策略查询自身」造成的递归。
-- ============================================================
create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS 策略
-- ============================================================

-- profiles：只能看/改自己
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- chat_rooms：成员可读；登录用户可建；owner 可改名/删除
drop policy if exists "rooms_select_member" on public.chat_rooms;
create policy "rooms_select_member" on public.chat_rooms
  for select using (public.is_room_member(id));

drop policy if exists "rooms_insert_own" on public.chat_rooms;
create policy "rooms_insert_own" on public.chat_rooms
  for insert with check (owner_id = auth.uid());

drop policy if exists "rooms_update_owner" on public.chat_rooms;
create policy "rooms_update_owner" on public.chat_rooms
  for update using (owner_id = auth.uid());

drop policy if exists "rooms_delete_owner" on public.chat_rooms;
create policy "rooms_delete_owner" on public.chat_rooms
  for delete using (owner_id = auth.uid());

-- room_members：同会话成员可读（经助手函数，无递归）；owner 可加人
drop policy if exists "members_select" on public.room_members;
create policy "members_select" on public.room_members
  for select using (public.is_room_member(room_id));

drop policy if exists "members_insert_owner" on public.room_members;
create policy "members_insert_owner" on public.room_members
  for insert with check (
    exists (select 1 from public.chat_rooms r where r.id = room_id and r.owner_id = auth.uid())
  );

-- messages：成员可读；本人可写/改/删
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages
  for select using (public.is_room_member(room_id));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages
  for insert with check (user_id = auth.uid() and public.is_room_member(room_id));

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

-- presence：同会话成员可读；自己可写
drop policy if exists "presence_select_member" on public.presence;
create policy "presence_select_member" on public.presence
  for select using (public.is_room_member(room_id));
drop policy if exists "presence_insert_own" on public.presence;
create policy "presence_insert_own" on public.presence
  for insert with check (user_id = auth.uid());
drop policy if exists "presence_update_own" on public.presence;
create policy "presence_update_own" on public.presence
  for update using (user_id = auth.uid());

-- ============================================================
-- 触发器
-- ============================================================

-- 注册时自动写入 profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 创建会话后，把 owner 自动加为成员
create or replace function public.handle_new_room()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (room_id, user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_room_created on public.chat_rooms;
create trigger on_room_created
  after insert on public.chat_rooms
  for each row execute function public.handle_new_room();

-- 有新消息时，更新会话的 updated_at（用于按最近活动排序）
create or replace function public.touch_room_updated()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chat_rooms set updated_at = now() where id = new.room_id;
  return new;
end;
$$;
drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row execute function public.touch_room_updated();

-- 补齐历史会话缺失的 owner 成员（幂等）
insert into public.room_members (room_id, user_id, role)
select id, owner_id, 'owner' from public.chat_rooms
on conflict (room_id, user_id) do nothing;

-- ============================================================
-- Realtime：开启 messages 与 presence 的实时同步（幂等）
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'presence'
  ) then
    alter publication supabase_realtime add table public.presence;
  end if;
end $$;
