-- NETWORKS에 스타트업 대표·임직원 등 사람을 담는 `startup` 구분을 다시 연다.
-- 이 값은 분류일 뿐 public.startups 행과의 연결이나 NETWORKS 행 자동 생성을 뜻하지 않는다.
-- 새 표·정책·함수·권한·개인정보 경로는 없고 기존 CHECK의 허용값만 넓힌다.

begin;

alter table public.networks
  drop constraint if exists networks_category_chk;

alter table public.networks
  add constraint networks_category_chk check (
    category is null or category in (
      'experts', 'van', 'exp', 'investors', 'startup',
      'corporates', 'institutions', 'universities', 'etc', 'vendors'
    )
  );

comment on column public.networks.category is
  '구분 코드(experts|van|exp|investors|startup|corporates|institutions|universities|etc|vendors). null = 미분류. startup은 스타트업 대표·임직원 등 사람의 분류이며 startups 원장 연결을 뜻하지 않는다. 라벨은 화면 상수가 소유한다.';

commit;
