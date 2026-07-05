# [3-4-12] AC Program 통합 타임라인 및 충돌 방지 기획서

본 문서는 Program First 구조 안에서 모든 모듈의 세션과 마감일을 하나의 시간축으로 통합하고, 참가자/전문가/장소/테이블의 충돌을 방지하는 Program Timeline 모듈을 정의합니다.

---

## 1. 목적

Program Timeline은 단순 마일스톤 카드가 아니라 모집, 평가, OT, 멘토링, 비즈니스 매칭, 데모데이, 만족도, 성과 입력 마감까지 Program 운영 전체 일정을 통합하는 시간 기반 운영 계층입니다.

---

## 2. 이 문서가 다루는 범위

1. 모듈별 세션/마감일 통합 조회
2. 일정 충돌 감지
3. 이동 버퍼/중단 구간 관리
4. ICS 다운로드
5. GUEST 일정 노출
6. 캘린더 연동 후보

---

## 3. 핵심 사용자

* **AC 운영자**: Program 전체 시간표를 검토하고 충돌을 해결합니다.
* **스타트업/전문가 GUEST**: 자기 일정과 다음 액션을 확인합니다.
* **관리자**: Program 단위 운영 리스크와 지연 상황을 파악합니다.

---

## 4. 정보 구조

```txt
Program
  -> program_timeline_items
  -> module_sessions
  -> participant_calendar_items
  -> conflict_checks
```

---

## 5. 화면 구성

### 5.1 통합 타임라인 보드

```txt
[월/주/일 보기] [모듈 필터] [충돌만 보기] [ICS 다운로드]

Timeline
  - 모집 시작/마감
  - 평가 기간
  - OT 세션
  - 멘토링 회차
  - 비즈니스 매칭 슬롯
  - 데모데이 발표
  - 성과 입력 마감
```

### 5.2 충돌 해결 Drawer

```txt
충돌 유형 / 대상자 / 겹치는 일정 / 권장 이동 시간 / 수정 액션
```

---

## 6. 주요 기능

### 6.1 통합 일정 수집

* 각 모듈의 세션과 마감일을 `program_timeline_items`로 정규화해 조회합니다.
* 원본 모듈 데이터는 각 모듈 테이블에 남기고, Timeline은 조회/충돌/캘린더용 인덱스 역할을 합니다.
* 원본 일정 변경 시 Timeline item을 동기화합니다.

### 6.2 표준 일정 카테고리 10종 (`item_type` 표준 코드)

Timeline item 등록 및 필터링 시 시스템의 자동 연동을 최적화하기 위해 사전 정의된 표준 카테고리 중 하나를 필수로 선택합니다.

1. **모집/접수 (`recruitment`)**: 보육 기업 모집 공고 및 지원서 온라인 접수 기간.
2. **서면평가 (`document_screening`)**: 서류 심사 평가위원 배정 및 온라인 심사 평가지 제출 기간.
3. **대면평가 (`interview_screening`)**: 발표 평가(피칭) 및 대면 면접 심사 진행 기간.
4. **오리엔테이션 (`orientation`)**: 최종 선정사 킥오프 워크숍 및 일정 공유 행사.
5. **교육/워크숍 (`education_workshop`)**: 비즈니스 고도화, IR 피칭덱 제작 요령 등 그룹 교육 세션.
6. **멘토링 (`mentoring`)**: 멘토-멘티 관계 기반 정기/보강/수시 멘토링 회차 진행 기간.
7. **중간평가 (`midterm_evaluation`)**: 보육 기업의 진척 및 성장 수준 중간 모니터링 심사 (공통 평가 엔진 라운드로 운영).
8. **데모데이 (`demoday`)**: VC, AC 등 외부 투자 심사역 초청 성과 및 투자 피칭 최종 발표회.
9. **수료식 (`graduation`)**: 보육 프로그램 공식 마감 및 수료장 전달식 (OT/공통 세션 모듈의 `GRADUATION` 세션 유형과 연동).
10. **사후관리 (`post_care`)**: 졸업 기업 대상 후속 매칭 모니터링 및 자사 투자 검토 사후 지원 (Outcomes/KPI 모듈의 후속 성과 기록과 연동).

### 6.3 충돌 감지

* 동일 스타트업의 시간 중복
* 동일 전문가/심사위원/멘토의 시간 중복
* 동일 장소/테이블의 시간 중복
* 모듈 간 이동 버퍼 부족
* 중단 구간 또는 행사 운영 불가 시간 침범

### 6.4 캘린더 연동

* 1차 범위는 `.ics` 다운로드와 캘린더 추가 링크입니다.
* 추후 Google Calendar OAuth 연동 시 일정 생성/수정/삭제 동기화를 확장합니다.
* GUEST는 자기 일정만 ICS로 내려받을 수 있습니다.

---

## 7. 데이터 모델

```txt
program_timeline_items
  - id
  - program_id
  - program_module_id
  - source_table
  - source_id
  - title
  - starts_at
  - ends_at
  - item_type
  - visibility

timeline_conflicts
  - id
  - program_id
  - timeline_item_id
  - conflicting_item_id
  - conflict_type
  - severity
  - resolved_at
```

---

## 8. 상태 모델

```txt
timeline_conflicts.severity
  INFO
  WARNING
  BLOCKING

timeline_conflicts.status
  OPEN
  IGNORED
  RESOLVED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 전체 Timeline을 조회/관리할 수 있습니다.
* GUEST는 자기 participant scope에 연결된 Timeline item만 조회할 수 있습니다.
* ADMIN은 전사 일정 감사 목적으로 전체 조회가 가능하되, 민감 메모는 마스킹합니다.

---

## 10. API/RPC/서버 액션

```txt
sync_program_timeline_item(source_table, source_id)
list_program_timeline(program_id, filters)
run_timeline_conflict_check(program_id)
resolve_timeline_conflict(conflict_id, resolution_payload)
export_program_timeline_ics(program_id, scope)
export_guest_timeline_ics(participant_id)
```

---

## 11. GUEST 연동

GUEST 포털은 오늘 일정, 다음 일정, 마감 임박 태스크를 상단에 표시합니다. 스타트업과 전문가 모두 자기 Program/Assignment 범위의 일정만 조회하며, 전체 운영 캘린더는 노출하지 않습니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* HUB 일정 오버뷰에는 전사 공개 가능한 Program 주요 일정만 표시합니다.
* **전사 공통 일정(`system_events`) 동기화**: 부서 간 일정 중복 입력을 막고 경영진 및 타 부서가 전사 이벤트를 공유할 수 있도록, 전사 공개 대상 Timeline item은 저장 즉시 아래 매핑 규칙으로 `system_events`에 동기화합니다.

  | system_events 필드 | 매핑 데이터 및 룰 | 예시 |
  | :--- | :--- | :--- |
  | `event_id` | UUID (생성 시 발급) | `a1b2c3d4-e5f6...` |
  | `source_workspace` | `'AC'` (고정) | `'AC'` |
  | `source_ref_id` | 해당 Timeline item의 고유 ID | `timeline_item_992` |
  | `title` | **`[사업명] + [기수] + [일정 타이틀]`** 조합 | `Y-Glow AC 3기 - 1차 서면 평가` |
  | `start_date` | 일정 시작일 | `2026-06-16` |
  | `end_date` | 일정 종료일 | `2026-06-20` |
  | `owner_id` | 담당 임직원 UUID | `user_user_992` |
  | `category` | `'program_milestone'` (분류 코드) | `'program_milestone'` |

* ADMIN 감사 로그에는 충돌 무시 처리와 일정 강제 변경 이력을 남깁니다.
* 각 모듈은 Timeline 충돌 검사 결과를 저장/확정 전 검증 단계로 사용할 수 있습니다.

---

## 13. 예외/오류/운영 리스크

* Timeline item은 원본 모듈 데이터를 대체하지 않습니다. 원본 삭제/수정 시 동기화 실패가 발생하면 운영자에게 경고합니다.
* 충돌을 강제로 무시할 경우 사유를 필수 입력합니다.
* 외부 캘린더 연동 시 개인정보 포함 여부를 사전에 확인합니다.

---

## 14. 완료 기준

1. 모든 주요 모듈 일정이 통합 Timeline에서 조회된다.
2. 참가자/전문가/장소 충돌이 감지된다.
3. GUEST가 자기 일정만 확인하고 ICS로 내려받을 수 있다.

---

## 15. 테스트 기준

1. 동일 스타트업의 멘토링과 비즈니스 매칭 시간이 겹칠 때 BLOCKING 충돌이 생성되는지 검증합니다.
2. GUEST ICS에 타 참가자 일정이 포함되지 않는지 검증합니다.
3. 원본 모듈 일정 수정 후 Timeline item이 갱신되는지 검증합니다.
