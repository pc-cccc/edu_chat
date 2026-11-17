-- ============================================================
-- Edu_chat Serverless 版 · Supabase 建表脚本
-- 在 Supabase 控制台 -> SQL Editor 里整段粘贴执行即可。
-- 说明：用户身份用 auth.uid() 判定，数据行级安全（RLS）保证
--       每个用户只能读写自己的数据；Realtime 用于多人协作同步。
-- ============================================================

-- 1) 用户资料（注册时自动创建）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- 2) 聊天室（多人协作：一个房间多名成员）
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default '新聊天室',
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3) 房间成员（多人）
create table if not exists public.room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 4) 聊天消息（历史记录；assistant 的富文本放在 blocks 里，含深度思考/公式/代码等）
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text,                    -- 用户文本 / 助手纯文本兜底
  blocks jsonb,                    -- 助手富文本块（深度思考、Markdown、公式、代码块等）
  parent_id uuid references public.messages (id) on delete set null,
  model text,
  thinking boolean not null default false,
  search boolean not null default false,
  files jsonb,                     -- 附件元数据列表
  status text not null default 'done',
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created_idx on public.messages (room_id, created_at);

-- 5) 用户偏好（勾选的学习组件列表）
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  components jsonb not null default '[]',   -- 例如 ["reading","math","science"]
  updated_at timestamptz not null default now()
);

-- 6) 在线状态（Realtime 多人协作）
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
alter table public.user_preferences  enable row level security;
alter table public.presence          enable row level security;

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

-- chat_rooms：房间成员可读；登录用户可创建（owner 是自己）
drop policy if exists "rooms_select_member" on public.chat_rooms;
create policy "rooms_select_member" on public.chat_rooms
  for select using (
    exists (select 1 from public.room_members m where m.room_id = id and m.user_id = auth.uid())
  );

drop policy if exists "rooms_insert_own" on public.chat_rooms;
create policy "rooms_insert_own" on public.chat_rooms
  for insert with check (owner_id = auth.uid());

-- room_members：房间成员可读；房主可加人
drop policy if exists "members_select" on public.room_members;
create policy "members_select" on public.room_members
  for select using (
    exists (select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid())
  );

drop policy if exists "members_insert_owner" on public.room_members;
create policy "members_insert_owner" on public.room_members
  for insert with check (
    exists (select 1 from public.chat_rooms r where r.id = room_id and r.owner_id = auth.uid())
  );

-- messages：房间成员可读、可写（更新/删除仅限自己发的消息）
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages
  for select using (
    exists (select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid())
  );

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages
  for insert with check (
    user_id = auth.uid() and
    exists (select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid())
  );

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update using (user_id = auth.uid());

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
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

-- presence：房间成员可读；自己可写
drop policy if exists "presence_select_member" on public.presence;
create policy "presence_select_member" on public.presence
  for select using (
    exists (select 1 from public.room_members m where m.room_id = room_id and m.user_id = auth.uid())
  );

drop policy if exists "presence_insert_own" on public.presence;
create policy "presence_insert_own" on public.presence
  for insert with check (user_id = auth.uid());

drop policy if exists "presence_update_own" on public.presence;
create policy "presence_update_own" on public.presence
  for update using (user_id = auth.uid());

-- ============================================================
-- 注册时自动写入 profiles（触发器）
-- ============================================================
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

-- ============================================================
-- Realtime：开启 messages 与 presence 的实时同步
-- ============================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.presence;
