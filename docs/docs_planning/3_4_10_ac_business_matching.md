# [3-4-10] AC 1:1 비즈니스 매칭 기획서

본 문서는 Program First 구조 안에서 스타트업과 외부 전문가/투자자/바이어 간 1:1 상담 테이블을 생성하고, 예약, AI/관리자 배정, 출석, 노쇼, 상담일지, 만족도, 다운로드까지 운영하는 비즈니스 매칭 모듈을 정의합니다.

---

## 1. 목적

비즈니스 매칭은 멘토링 관계 관리와 다르게 단기 1:1 상담 슬롯과 테이블 운영을 중심으로 합니다. 핵심은 행사 시간표와 중단 구간을 반영해 상담 슬롯을 만들고, 참여자가 예약 또는 배정된 상담을 정확히 수행하도록 관리하는 것입니다.

---

## 2. 이 문서가 다루는 범위

1. 상담 슬롯/테이블 생성
2. 전문가 가용 시간 등록
3. 스타트업 자유 예약
4. 관리자 수동 배정
5. AI 추천/자동 배정
6. 현장 출석, 노쇼, 대체 매칭
7. 상담일지/만족도/다운로드

---

## 3. 핵심 사용자

* **AC 운영자**: 슬롯과 배정을 관리하고 현장 진행을 통제합니다.
* **스타트업 GUEST**: 예약 가능한 상담 슬롯을 선택하거나 배정 결과를 확인합니다.
* **전문가/투자자 GUEST**: 자신의 상담 시간표와 상담 대상 자료를 확인하고 일지를 작성합니다.

---

## 4. 정보 구조

```txt
ProgramModule(BUSINESS_MATCHING)
  -> matching_events
  -> matching_tables
  -> matching_slots
  -> matching_bookings
  -> counseling_logs
  -> matching_feedbacks
```

---

## 5. 화면 구성

### 5.1 관리자용 매칭 운영 콘솔

```txt
[행사 시간 설정] [중단 구간] [슬롯 자동 생성] [AI 배정] [현장 체크인]

좌측: 시간대/테이블 Grid
우측: 배정 상세 Drawer
  - 스타트업
  - 상담 전문가
  - 상태
  - 출석/노쇼
  - 상담일지 제출 여부
```

### 5.2 GUEST 예약/상담 화면

```txt
스타트업: 예약 가능한 시간대 목록 -> 예약 확정/변경/취소
전문가: 오늘의 상담 목록 -> 기업 자료 Split View -> 상담일지 작성
```

---

## 6. 주요 기능

### 6.1 슬롯 자동 생성

* 행사 시작/종료 시각, 상담 단위 시간, 휴식 시간, 점심/중단 구간, 테이블 수를 입력하면 슬롯을 자동 생성합니다.
* 동일 스타트업 또는 동일 전문가가 같은 시간대에 중복 배정되지 않도록 검증합니다.
* 장소 이동 버퍼가 필요한 경우 슬롯 사이에 최소 이동 시간을 반영합니다.

### 6.2 예약/배정 방식

* `STARTUP_FCFS`: 스타트업이 선착순으로 예약합니다.
* `MANUAL_ALLOCATION`: 운영자가 직접 배정합니다.
* `AI_ALLOCATION`: 선호 분야, 산업, 투자 단계, 상담 목적, 가용 시간 제약을 입력값으로 추천안을 생성하고 운영자가 확정합니다.

AI는 최종 확정 주체가 아니며, 배정 확정은 운영자 승인 서버 액션으로만 완료됩니다.

### 6.3 현장 운영

* 상담별 상태는 체크인, 진행중, 완료, 노쇼, 대체 매칭으로 관리합니다.
* 노쇼가 발생하면 운영자는 대기 스타트업 또는 예비 전문가를 대체 매칭할 수 있습니다.
* 상담 종료 후 전문가 상담일지와 양측 만족도 평가를 요청합니다.

---

## 7. 데이터 모델

```txt
matching_events
  - id
  - program_module_id
  - title
  - starts_at
  - ends_at
  - slot_minutes
  - status

matching_tables
  - id
  - matching_event_id
  - table_no
  - venue

matching_slots
  - id
  - matching_event_id
  - table_id
  - starts_at
  - ends_at
  - status

matching_bookings
  - id
  - slot_id
  - startup_id
  - expert_participant_id
  - allocation_type
  - status

counseling_logs
  - id
  - booking_id
  - summary
  - next_steps
  - follow_up_requested
  - submitted_at
```

---

## 8. 상태 모델

```txt
matching_slots.status
  AVAILABLE
  HELD
  BOOKED
  BLOCKED
  CLOSED

matching_bookings.status
  RESERVED
  CHECKED_IN
  IN_PROGRESS
  DONE
  NO_SHOW
  REPLACED
  CANCELLED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 매칭 이벤트, 슬롯, 예약을 관리할 수 있습니다.
* 스타트업 GUEST는 자기 기업의 예약 가능 슬롯과 자기 예약 건만 조회/변경할 수 있습니다.
* 전문가 GUEST는 자신에게 배정된 상담과 대상 기업 자료만 조회할 수 있습니다.
* 상담일지는 작성자와 운영자만 수정할 수 있으며, 공유 범위에 따라 스타트업 열람 여부를 제어합니다.

---

## 10. API/RPC/서버 액션

```txt
create_matching_event(program_module_id, payload)
generate_matching_slots(event_id, slot_policy)
reserve_matching_slot(slot_id, startup_id)
cancel_matching_booking(booking_id, reason)
run_matching_allocation(event_id, constraints)
confirm_matching_allocation(event_id, allocation_payload)
check_in_matching_booking(booking_id, participant_role)
mark_matching_no_show(booking_id, reason)
replace_matching_booking(booking_id, replacement_payload)
submit_counseling_log(booking_id, log_payload)
export_matching_results(event_id)
```

---

## 11. GUEST 연동

스타트업 GUEST는 예약/변경/취소 가능한 슬롯을 확인합니다. 전문가 GUEST는 상담 일정과 기업 자료, 상담일지 작성 화면을 사용합니다. 모든 GUEST 접근은 booking 또는 participant scope로 제한됩니다.

---

## 12. OFFICE/ADMIN/타 워크스페이스 연동

* NETWORKS 스타트업 상세에는 상담 이력과 후속 미팅 요청 여부가 표시됩니다.
* FUND/M&A는 투자 또는 인수 검토로 이어진 상담 결과를 후속 파이프라인 후보로 참조할 수 있습니다.
* ADMIN 감사 로그에는 AI 추천 실행, 배정 확정, 예약 변경, 노쇼 처리, 다운로드 이력을 남깁니다.

---

## 13. 예외/오류/운영 리스크

* 동시 예약은 낙관적 잠금 또는 DB 유니크 제약으로 하나만 성공시킵니다.
* AI 배정 결과는 제약 조건 위반 항목을 표시하고 운영자 확정 전에는 실제 예약으로 반영하지 않습니다.
* 노쇼 대체 매칭은 원 예약과 대체 예약을 모두 보존해 이력 추적이 가능해야 합니다.

---

## 14. 완료 기준

1. 상담 슬롯 자동 생성과 중단 구간 반영이 가능하다.
2. 자유 예약, 수동 배정, AI 추천 배정이 모두 동작한다.
3. 출석, 노쇼, 대체 매칭, 상담일지, 만족도까지 한 흐름으로 기록된다.
4. 결과 다운로드와 감사 로그가 제공된다.

---

## 15. 테스트 기준

1. 동일 슬롯 동시 예약 시 하나만 성공하는지 검증합니다.
2. 동일 스타트업/전문가 시간 중복 배정이 차단되는지 검증합니다.
3. AI 배정 추천안이 운영자 확정 전 실제 예약으로 노출되지 않는지 검증합니다.
4. 노쇼 대체 매칭 후 원 예약 이력이 보존되는지 검증합니다.
