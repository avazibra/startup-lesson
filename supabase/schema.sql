create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'student' check (role in ('admin', 'student')),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  youtube_video_id text not null,
  lesson_order integer not null default 1,
  passing_score integer not null default 4,
  is_published boolean not null default false,
  provides_certificate boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.lessons
  add column if not exists archived_at timestamptz,
  add column if not exists provides_certificate boolean not null default false;

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  prompt text not null,
  choice_type text not null check (choice_type in ('single', 'multiple')),
  options jsonb not null default '[]'::jsonb,
  correct_answers jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  question_order integer not null default 1,
  created_at timestamptz not null default now()
);

drop view if exists public.lesson_quiz_questions;

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  video_progress_percent integer not null default 0,
  video_completed boolean not null default false,
  quiz_passed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  score integer not null,
  total_questions integer not null,
  passed boolean not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  recipient_name text not null,
  lesson_title text not null,
  course_title text not null,
  verification_code text not null unique default encode(gen_random_bytes(12), 'hex'),
  issued_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    new.email,
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.update_video_progress(
  p_lesson_id uuid,
  p_video_progress_percent integer,
  p_video_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_percent integer := greatest(0, least(100, p_video_progress_percent));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.lesson_progress (
    user_id,
    lesson_id,
    video_progress_percent,
    video_completed,
    updated_at
  )
  values (
    auth.uid(),
    p_lesson_id,
    safe_percent,
    p_video_completed,
    now()
  )
  on conflict (user_id, lesson_id) do update
  set video_progress_percent = greatest(public.lesson_progress.video_progress_percent, excluded.video_progress_percent),
      video_completed = public.lesson_progress.video_completed or excluded.video_completed,
      updated_at = now();
end;
$$;

grant execute on function public.update_video_progress(uuid, integer, boolean) to authenticated;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "courses_public_read" on public.courses;
create policy "courses_public_read"
  on public.courses for select
  using (true);

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write"
  on public.courses for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "lessons_public_read_published" on public.lessons;
create policy "lessons_public_read_published"
  on public.lessons for select
  using ((is_published and archived_at is null) or public.is_admin());

drop policy if exists "lessons_admin_write" on public.lessons;
create policy "lessons_admin_write"
  on public.lessons for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "questions_public_read_published_lesson" on public.quiz_questions;
drop policy if exists "questions_admin_read" on public.quiz_questions;
create policy "questions_admin_read"
  on public.quiz_questions for select
  using (public.is_admin());

drop policy if exists "questions_admin_write" on public.quiz_questions;
create policy "questions_admin_write"
  on public.quiz_questions for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "progress_read_own_or_admin" on public.lesson_progress;
create policy "progress_read_own_or_admin"
  on public.lesson_progress for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "progress_update_own" on public.lesson_progress;
drop policy if exists "progress_write_own" on public.lesson_progress;

drop policy if exists "attempts_read_own_or_admin" on public.quiz_attempts;
create policy "attempts_read_own_or_admin"
  on public.quiz_attempts for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "attempts_insert_own" on public.quiz_attempts;

drop policy if exists "certificates_public_read" on public.certificates;
drop policy if exists "certificates_read_own_or_admin" on public.certificates;
create policy "certificates_read_own_or_admin"
  on public.certificates for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "certificates_admin_write" on public.certificates;
create policy "certificates_admin_write"
  on public.certificates for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.courses (id, title, description)
values (
  '11111111-1111-1111-1111-111111111111',
  'Startup Fundamentals',
  'A practical course for early-stage founders.'
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description;

insert into public.lessons (
  id,
  course_id,
  title,
  description,
  youtube_video_id,
  lesson_order,
  passing_score,
  is_published,
  provides_certificate
)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'How Great Startup Founders Think',
  'Learn the mindset, decision-making style, and execution habits of strong startup founders.',
  'jnqSezTbEb8',
  1,
  4,
  true,
  true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    youtube_video_id = excluded.youtube_video_id,
    lesson_order = excluded.lesson_order,
    passing_score = excluded.passing_score,
    is_published = excluded.is_published,
    provides_certificate = excluded.provides_certificate;

insert into public.lessons (
  id,
  course_id,
  title,
  description,
  youtube_video_id,
  lesson_order,
  passing_score,
  is_published,
  provides_certificate
)
values (
  '22222222-2222-2222-2222-222222222223',
  '11111111-1111-1111-1111-111111111111',
  'Finding Your First Customers',
  'Learn how early founders use warm introductions, narrow customer segments, and fast conversations to find first customers.',
  'jnqSezTbEb8',
  2,
  4,
  true,
  false
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    youtube_video_id = excluded.youtube_video_id,
    lesson_order = excluded.lesson_order,
    passing_score = excluded.passing_score,
    is_published = excluded.is_published,
    provides_certificate = excluded.provides_certificate;

insert into public.quiz_questions (
  id,
  lesson_id,
  prompt,
  choice_type,
  options,
  correct_answers,
  explanation,
  question_order
)
values
  (
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222222',
    'Networking orqali startap qanday resurslarni jalb qila oladi?',
    'single',
    '["Faqat moliyaviy investitsiya", "Birinchi mijozlar, investorlar, xodimlar va hamkorlar", "Faqat texnik bilim va kod", "Faqat ijtimoiy media kontent"]',
    '[1]',
    'Networking startap uchun birinchi mijozlar, investorlar, xodimlar va hamkorlarni topishga yordam beradi.',
    1
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '22222222-2222-2222-2222-222222222222',
    'LinkedIn profilingizni 10 soniyada tushunarli qilish uchun eng muhim element qaysi?',
    'single',
    '["Ko''p sertifikatlar va kurslar ro''yxati", "Aniq sarlavha (headline) va professional foto", "Maksimal darajada to''ldirilgan tajriba bo''limi", "Ko''p ko''nikmalar (skills) qo''shish"]',
    '[1]',
    'Aniq headline va professional foto profil kim uchun va nima haqida ekanini tez anglatadi.',
    2
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'Qaysi networking yondashuvi uzoq muddatda eng ko''p foyda keltiradi?',
    'single',
    '["Imkon qadar tez pitch qilish va foyda so''rash", "Katta tadbirlarda ko''proq vizitka tarqatish", "Avval boshqalarga qiymat yaratib, keyin ishonch qurish", "Faqat yuqori lavozimli odamlar bilan tanishish"]',
    '[2]',
    'Uzoq muddatli networking avval qiymat yaratish, so''ng ishonch qurish orqali kuchayadi.',
    3
  ),
  (
    '33333333-3333-3333-3333-333333333334',
    '22222222-2222-2222-2222-222222222222',
    'Offline tadbirlarda samarali networking uchun to''g''ri tartib qaysi?',
    'single',
    '["Tadbirda ko''proq odam bilan suhbatlashish, vizitka berish, unutish", "Avval kimlar borligini aniqlash, sifatli suhbat, 24 soat ichida aloqa", "Tadbir tugagandan keyin LinkedIn''da hammani qo''shish", "Faqat o''z sohasidagi odamlar bilan gaplashish"]',
    '[1]',
    'Tayyorgarlik, sifatli suhbat va tez follow-up offline networking natijasini oshiradi.',
    4
  ),
  (
    '33333333-3333-3333-3333-333333333335',
    '22222222-2222-2222-2222-222222222222',
    '''Connector'' bo''lish strategiyasi nima uchun kuchli hisoblanadi? Ikkita to''g''ri javobni tanlang.',
    'multiple',
    '["Ko''proq kontakt yig''ishning o''zi asosiy maqsad bo''lgani uchun", "Foydali odamlarni tanishtirish orqali ishonch va obro'' yaratilgani uchun", "Qaytib keladigan yangi imkoniyatlar paydo bo''lgani uchun", "LinkedIn algoritmida doimiy yuqori ko''rinish kafolatlangani uchun"]',
    '[1, 2]',
    'Connector foydali tanishtiruvlar orqali ishonch, obro'' va kelajakdagi imkoniyatlarni yaratadi.',
    5
  )
on conflict (id) do update
set prompt = excluded.prompt,
    choice_type = excluded.choice_type,
    options = excluded.options,
    correct_answers = excluded.correct_answers,
    explanation = excluded.explanation,
    question_order = excluded.question_order;
