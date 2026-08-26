-- =====================================================================
-- 결재 양식 분류(대분류) 추가
-- 선행: 20260826130000_approval_forms_docboxes.sql
--
-- 배경
--   기존 결재 시스템의 문서 종류는 한 단이 아니라 두 단이다 — `지출결의서 > 법인카드
--   지출결의서`처럼 묶음을 고른 뒤 그 안의 양식을 고른다. 양식이 늘어날수록 한 줄짜리
--   선택 목록은 훑기 어려워지고, 실제로 같은 성격의 양식(지출결의서·법인카드 지출결의서·
--   인건비 지출결의서)이 이름만 길어진 채 나란히 늘어선다.
--
-- 결정
--   양식 원장에 분류 컬럼 하나를 더한다. **별도 분류 원장을 만들지 않는다** — 분류는
--   이름 말고 가진 속성이 없고(설명·정책·권한이 없다), 원장을 만들면 아무 양식도 딸리지
--   않은 빈 분류가 남아 선택 목록에 유령 항목이 생긴다. 선택지는 "지금 살아 있는 양식들이
--   실제로 쓰는 분류"에서 파생하는 것이 언제나 정확하다.
--   표시 순서도 같은 이유로 분류가 따로 갖지 않고, 그 분류에 속한 양식의 표시 순서를 따른다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(사용) / 쓰기는 admin(양식 관리). 변경 없음.
--   · 데이터 등급: Internal(분류명). 개인정보 없음.
--   · 접근 주체: 조회=내부 사용자, 쓰기=admin. 기존 approval_forms 정책 그대로.
--   · Scope: global(전사 공통 양식 메타).
--   · 감사 로그: 해당 없음.
--   · RLS: 정책 변경 없음(컬럼 추가). SELECT/INSERT/UPDATE 분리와 DELETE 부재 유지.
--   · SECURITY DEFINER: 신규 없음.
--   · 시드/더미: 기존 시드 5종의 분류만 채운다(실개인정보·토큰 없음).
-- =====================================================================

alter table public.approval_forms
  add column if not exists category text not null default '공통';

comment on column public.approval_forms.category is
  '양식 대분류(예: 지출결의서·품의서·공통). 기안 화면에서 분류를 고른 뒤 그 안의 양식을 고른다. '
  '별도 원장을 두지 않고 살아 있는 양식들이 쓰는 값에서 선택지를 파생한다 — 빈 분류가 남지 않는다.';

create index if not exists idx_approval_forms_category
  on public.approval_forms (category, sort_order);

-- 초기 시드 5종의 분류 배치. 기본값('공통')인 행만 건드려 운영자가 이미 손댄 값은 보존한다.
update public.approval_forms
   set category = '지출결의서'
 where abbrev in ('지결', '법카')
   and category = '공통';

update public.approval_forms
   set category = '품의서'
 where abbrev = '품의'
   and category = '공통';

update public.approval_forms
   set category = '인사'
 where abbrev = '휴가'
   and category = '공통';
