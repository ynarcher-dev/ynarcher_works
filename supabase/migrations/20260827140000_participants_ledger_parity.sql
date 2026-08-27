-- =====================================================================
-- 참가자 원장 3종의 스키마 정합 — M&A·PROJECT에도 명부 축을 세운다
--
-- 배경: 20260827130000이 AC 원장(program_participants)에만 master_table·login_status를
--   더했다. 그런데 연동 DB 화면은 세 워크스페이스가 공유하는 공용 모듈이라 select 문자열이
--   한 곳에서 조립된다 — 한 원장만 컬럼이 없으면 그 워크스페이스의 명부 조회가 통째로
--   깨진다("column does not exist"). 원장은 물리적으로 분리하되 스키마 형태는 동일하게
--   유지한다는 규칙(CLAUDE.md 사업 공용 모듈)을 이 마이그레이션이 되돌린다.
--
-- 게스트 로그인 개방은 여전히 AC만이다. 여기서 세우는 것은 명부의 형태뿐이며,
--   문을 여닫는 RPC·게스트 정책은 AC 원장만 바라본다(추후 개방 시 그 쪽을 넓힌다).
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 대상 아님에 가깝다: 새 테이블·뷰·정책·함수·Storage 없음. 기존 두 표에 컬럼 4개와
--     CHECK 1개, 부분 유니크 인덱스 1개를 더하는 것이 전부다.
--   · 가시성 불변: ma/project 참가자 정책(can_read/write_workspace + 사업 스코프)을 건드리지
--     않는다. 컬럼 추가는 못 보던 행을 보이게 하지 않는다.
--   · 데이터 등급 변화 없음(추가 컬럼은 상태값과 원장 출처 문자열, 개인정보 아님).
--   · 운영 영향: 신규 컬럼은 nullable 또는 기본값을 가지므로 기존 쓰기 경로가 깨지지 않는다.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['ma_program_participants', 'project_program_participants']
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice '건너뜀(테이블 없음): %', t;
      continue;
    end if;

    execute format(
      'alter table public.%I
         add column if not exists master_table    text,
         add column if not exists login_status    public.participant_login_status not null default ''NOT_ALLOWED'',
         add column if not exists login_opened_by uuid references public.users(id),
         add column if not exists login_opened_at timestamptz',
      t
    );

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_master_table_chk');
    execute format(
      'alter table public.%I add constraint %I
         check (master_table is null or master_table in (''startups'', ''experts''))',
      t, t || '_master_table_chk'
    );

    -- 어느 원장에서 온 행인지 되짚어 채운다(유니크 인덱스가 성립하려면 필요하다).
    execute format(
      'update public.%I p set master_table = ''startups''
        where p.master_table is null and p.master_id is not null
          and exists (select 1 from public.startups s where s.id = p.master_id)',
      t
    );
    execute format(
      'update public.%I p set master_table = ''experts''
        where p.master_table is null and p.master_id is not null
          and exists (select 1 from public.experts e where e.id = p.master_id)',
      t
    );

    -- 마스터 없이 계정으로만 잡힌 행(내부 인원)은 문을 열 대상이 아니다.
    execute format(
      'update public.%I set login_status = ''NOT_APPLICABLE''
        where master_id is null and login_status = ''NOT_ALLOWED''',
      t
    );

    execute format(
      'create unique index if not exists %I
         on public.%I (program_id, master_table, master_id, role)
         where master_id is not null',
      'uq_' || t || '_master', t
    );
  end loop;
end $$;
