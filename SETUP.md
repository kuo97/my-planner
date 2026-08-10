# 플래너 설정 (1회만 하면 됨)

## 1. Supabase 테이블 만들기

[Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 선택 (gpt-image-automation 때 쓰던 프로젝트 그대로 써도 됨)
→ 왼쪽 메뉴 **SQL Editor** → 아래 전체를 붙여넣고 **Run**:

```sql
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  title text not null,
  project text,
  due date,
  repeat_days int[],
  done_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists repeat_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  task_id uuid not null references tasks on delete cascade,
  done_on date not null
);

alter table tasks enable row level security;
alter table repeat_log enable row level security;

create policy "own tasks" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own repeat_log" on repeat_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 1-2. 일기 기능 테이블 (추가 SQL)

일기 탭을 쓰려면 아래도 SQL Editor에서 한 번 실행:

```sql
create table if not exists diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  on_date date not null,
  content text,
  weather_note text,
  weather jsonb,
  city_notes jsonb,
  created_at timestamptz default now(),
  unique (user_id, on_date)
);

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  sort int default 0
);

alter table diary enable row level security;
alter table cities enable row level security;

create policy "own diary" on diary for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own cities" on cities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

날씨는 Open-Meteo 무료 API(키 불필요)를 쓰므로 별도 가입이 필요 없음.

## 2. 프로젝트 키 확인

대시보드 → **Settings → API** 에서 두 값을 복사:

- **Project URL** (https://xxxx.supabase.co)
- **anon public** 키

이 두 값을 Claude에게 알려주면 `index.html`에 넣어줌.
(anon 키는 공개되어도 되는 키라 — RLS로 본인 데이터만 접근 가능 — 정적 사이트에 넣어도 안전함)

## 3. 배포 (GitHub Pages)

GitHub에 `my-planner` 저장소를 만들어 푸시하고,
저장소 Settings → Pages → Branch: main 선택 → 저장.
몇 분 후 `https://kuo97.github.io/my-planner/` 로 접속 가능.

## 4. 폰 홈 화면에 추가

- **안드로이드**: Chrome으로 접속 → 메뉴(⋮) → "홈 화면에 추가"
- **아이폰**: Safari로 접속 → 공유 버튼 → "홈 화면에 추가"

앱처럼 아이콘으로 열림.
