-- =====================================================================
-- 투자기업(management_status='invested')은 INSERT 로 만들 수 없다 — 승격 게이트의 뒷문 차단
--
-- 배경
--   20260724190000 이 "미투자 → 투자 전환은 자사 펀드 투자 집행이 있을 때만"을 서버에서 강제했다.
--   그런데 그 게이트는 `promote_to_invested`(UPDATE 경로)에만 걸려 있고, `startups_insert` 정책은
--   워크스페이스 쓰기만 본다. 그래서 **처음부터 invested 로 등록**하면 게이트를 통째로 지나간다.
--   대용량 업로드(upload_insert_entities)가 그 경로를 실제로 열어 주면서 우회가 현실화됐다.
--
--   더 나쁜 것은 그렇게 들어온 행의 뒤처리다. 담당자(startup_managers)가 비어 있는 invested 행은
--   `startups_update` 의 투자기업 잠금(관리자 또는 지정 담당자)에 걸려 **ADMIN 말고는 아무도 고칠 수
--   없는 행**이 된다. 등록은 쉽고 수습은 관리자만 가능한 비대칭이라, 입구에서 막는 것이 맞다.
--
--   등록 폼은 이미 같은 이유로 '투자' 선택지를 빼 두었다(StartupDetailForm). UI 에서 숨기는 것은
--   보안이 아니므로(CLAUDE.md) 같은 규칙을 정책으로 내린다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup (스타트업 원장)
--   · 데이터 등급: Internal
--   · 접근 주체: 내부 사용자만(외부 게스트는 startup 권한 없음 — 종전과 동일)
--   · Scope: global (워크스페이스 단위 판정. 행단위 담당자 잠금은 UPDATE 정책이 계속 소유)
--   · 감사 로그: 권한 경계 축소이며 신규 데이터 조작 경로가 아니라 적재 경로 변경 없음.
--     레코드 변동 이력은 기존 트리거(app.log_entity_contribution)가 그대로 남긴다
--   · 운영 영향: 신규 스타트업을 invested 로 직접 INSERT 하던 경로가 막힌다. 정상 경로
--     (등록 → FUND 투자 집행 → promote_to_invested)는 UPDATE 라 영향이 없고, 관리자는
--     브레이크글라스로 남긴다(오등록 수습·데이터 이관 시 필요).
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블·RPC·SECURITY DEFINER 함수 없음. 기존 INSERT 정책의 WITH CHECK 만 강화
--   · SELECT/INSERT/UPDATE 정책 분리 유지, DELETE 정책 신설 없음(soft delete 유지)
--   · 판정은 app.can_write_workspace()/app.is_admin() 헬퍼 경유(auth.jwt() 직접 파싱 없음)
--   · UPDATE 정책의 USING/WITH CHECK 는 20260731140000 그대로 보존
--   · 개인정보 원본·다운로드·Export 경로 변경 없음, 멱등(정책 재생성)
--
-- 근거: 20260724190000(승격 게이트), 20260731140000(startups 정책 startup 키 이전),
--       20260721160000(upload_insert_entities), docs/docs_dev/11_migration_security_gate.md
-- =====================================================================

drop policy if exists startups_insert on public.startups;
create policy startups_insert on public.startups for insert
  with check (
    app.can_write_workspace('startup')
    -- 투자기업은 등록으로 만들지 않는다 — 자사 투자 집행을 근거로 promote_to_invested 가 승격시킨다.
    -- 관리자는 오등록 수습·이관을 위해 남긴다(브레이크글라스).
    and (management_status is distinct from 'invested' or app.is_admin())
  );

comment on policy startups_insert on public.startups is
  '스타트업 등록: startup 쓰기 권한자. 단 invested 로의 직접 등록은 관리자만 — 투자기업 전환은 자사 투자 집행을 근거로 하는 promote_to_invested 의 몫이다.';
