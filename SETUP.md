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

## 1-3. 사진 첨부 기능 (추가 SQL + 버킷 생성)

일기에 사진을 첨부하려면 아래 SQL을 SQL Editor에서 한 번 실행:

```sql
alter table diary add column if not exists photos jsonb default '[]'::jsonb;

create policy "diary photos - own insert" on storage.objects for insert
  with check (bucket_id = 'diary-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "diary photos - own delete" on storage.objects for delete
  using (bucket_id = 'diary-photos' and auth.uid()::text = (storage.foldername(name))[1]);
```

그리고 사진 저장용 버킷을 만들어야 함:

1. 대시보드 왼쪽 메뉴 **Storage** → **New bucket**
2. 이름: `diary-photos` (정확히 이 이름이어야 함)
3. **Public bucket** 옵션을 **켜기** (사진을 `<img src>`로 바로 보여주기 때문에 필요)
4. Create bucket

이렇게 하면 사진은 로그인한 본인만 업로드/삭제할 수 있고(Storage 정책), 저장된 사진은 공개 URL로 조회 가능함(개인 식별 정보가 아닌 일반 사진이라 안전함).

## 1-4. 운동 체크 기능 (추가 SQL)

일기에 운동 체크박스를 쓰려면 아래 SQL을 SQL Editor에서 한 번 실행:

```sql
alter table diary add column if not exists exercised boolean default false;
alter table diary add column if not exists exercise_note text;
```


## 1-5. 발행 탭 (찬작 발행 일정·예약 트래킹) — 추가 SQL

발행 탭에서 칩을 눌러 예약됨/발행됨을 저장하려면 SQL Editor 에서 한 번 실행:

```sql
create table if not exists publish_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  slot_id text not null,
  channel text not null,
  status text not null default 'todo',
  at timestamptz,
  note text,
  updated_at timestamptz default now(),
  unique (user_id, slot_id, channel)
);

alter table publish_status enable row level security;

create policy "own publish_status" on publish_status for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 찬작 세션(Claude)이 anon 키로 상태를 읽어 발행_일정.md 에 반영한다. 값은 슬롯 id·채널·상태뿐이라 공개돼도 무방.
create policy "anon read publish_status" on publish_status for select
  to anon using (true);
```


※ 실행 후 앱에서 "저장 실패" 또는 세션 쪽에서 401(42501 permission denied) 이 나면 **권한 부여가 빠진 것** — 아래 두 줄을 한 번 더 실행:

```sql
grant select, insert, update, delete on public.publish_status to authenticated;
grant select on public.publish_status to anon;
```

발행 일정 자체(`publish.json`)는 세션이 `개인\찬작스튜디오\발행_일정.json` 에서 만들어 이 저장소에 push 한다(`실험\영상편집자동화\publish_sync.py`). 앱은 그 파일만 읽는다.

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
