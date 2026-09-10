-- =====================================================================
-- [MANAGEMENT] 근무 기준에 연차 기준과 '근무 요건 무시'를 더한다
-- 기획: docs/docs_planning/3_7_3_management_attendance.md
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=management / 등급=Personal / 접근=내부 임직원(게스트 전면 차단)
--   - 기존 테이블 1종에 컬럼만 더한다. 새 테이블·새 정책·새 함수·Storage 없음.
--   - attendance_policies의 RLS와 SELECT/INSERT/UPDATE 정책은 종전 그대로 적용된다
--     (20260803190000 + 20260803200000). 정책 표현식이 컬럼을 가리지 않으므로 손대지 않는다.
--   - 감사 로그: 근무 기준은 개인정보 원본이 아니라 판정 기준이라 access_logs 대상이 아니다.
--
-- 설계 메모:
--   - 반차를 '길이'가 아니라 '시각 구간'으로 받는다. 길이만 두면 오전 반차를 쓴 사람의
--     출근 기준선을 세울 수 없다(09:00 지각선에 걸려 오후 출근자가 전원 지각이 된다).
--     구간으로 받으면 오전 반차의 출근선은 구간의 끝, 오후 반차의 퇴근선은 구간의 시작으로
--     절대 시각이 곧바로 선다.
--   - 반반차만 길이(분)다. 쉬는 자리가 하루 중 어디로도 갈 수 있어 구간으로 고정할 수 없고,
--     기준은 '소정 근무시간에서 이만큼을 뺀다' 하나로 충분하다.
--   - 기본값은 전사 기본(09:00 출근·9시간)과 앞뒤가 맞는 값이다: 오전 09:00~14:00,
--     오후 14:00~18:00. 두 구간의 합이 소정 근무시간과 같아야 반차 둘이 하루가 된다.
--   - ignore_schedule은 임직원 예외에서 켜는 값이지만 CHECK로 전사 기본을 막지 않는다.
--     전원 자유출퇴근이 뜻 없는 설정이 아니라 지금 쓰지 않을 뿐이고, 제약은 데이터 무결성을
--     지키는 자리이지 화면 정책을 박제하는 자리가 아니다(폼은 예외에만 이 칸을 세운다).
--   - 이 값들을 실제로 판정에 먹이는 것은 근태 상태 판정 개편(다음 단계)이다. 지금은
--     기준이 사는 자리만 만든다 — 판정 함수는 그때 통째로 다시 쓰이므로 두 번 쓰지 않는다.
-- =====================================================================

alter table public.attendance_policies
  add column if not exists half_am_start   time    not null default '09:00',
  add column if not exists half_am_end     time    not null default '14:00',
  add column if not exists half_pm_start   time    not null default '14:00',
  add column if not exists half_pm_end     time    not null default '18:00',
  add column if not exists quarter_minutes integer not null default 120,
  add column if not exists ignore_schedule boolean not null default false;

comment on column public.attendance_policies.half_am_start is
  '오전 반차 시작 시각(이 구간은 근무하지 않는다)';
comment on column public.attendance_policies.half_am_end is
  '오전 반차 종료 시각 — 오전 반차를 쓴 날의 출근 기준선';
comment on column public.attendance_policies.half_pm_start is
  '오후 반차 시작 시각 — 오후 반차를 쓴 날의 퇴근 기준선';
comment on column public.attendance_policies.half_pm_end is
  '오후 반차 종료 시각(이 구간은 근무하지 않는다)';
comment on column public.attendance_policies.quarter_minutes is
  '반반차 길이(분). 그날의 소정 근무시간에서 이만큼을 뺀다';
comment on column public.attendance_policies.ignore_schedule is
  '근무 요건 무시 — 켜면 출퇴근을 자유롭게 찍고 지각·조기퇴근을 판정하지 않는다';

-- 구간은 뒤 시각이 앞 시각보다 늦어야 한다. 뒤집힌 값은 저장되는 순간
-- 출근선이 퇴근선보다 늦어져 그날의 판정이 답을 낼 수 없다.
alter table public.attendance_policies
  drop constraint if exists attendance_policies_half_am_order,
  add  constraint attendance_policies_half_am_order check (half_am_start < half_am_end),
  drop constraint if exists attendance_policies_half_pm_order,
  add  constraint attendance_policies_half_pm_order check (half_pm_start < half_pm_end),
  drop constraint if exists attendance_policies_quarter_minutes,
  add  constraint attendance_policies_quarter_minutes check (quarter_minutes between 30 and 480);
