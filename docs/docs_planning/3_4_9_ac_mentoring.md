# [3-4-9] AC N:N 멘토링 관계 및 회차 관리 기획서

본 문서는 Program First 구조 안에서 정규 멘토링을 N:N 관계와 회차 기록 중심으로 운영하는 모듈의 화면, 데이터, 권한, 상태 전이, GUEST 연동 기준을 정의합니다.

---

## 1. 목적

멘토링 모듈은 비즈니스 매칭의 1:1 예약/상담 테이블과 구분됩니다. 본 모듈의 핵심은 Program 기간 동안 멘토와 멘티 스타트업 사이의 지속 관계를 만들고, 회차별 상담 기록과 성장 진단을 누적하는 것입니다.

---

## 2. 이 문서가 다루는 범위

1. 멘토-멘티 관계 생성
2. 회차별 멘토링 세션 등록
3. 상담일지 작성
4. 스타트업별 멘토링 이력 누적
5. GUEST 멘토/스타트업 화면
6. 만족도 및 성과 연동

---

## 3. 핵심 사용자

* **AC 운영자**: 멘토 풀과 스타트업을 매핑하고 회차를 관리합니다.
* **멘토(GUEST)**: 담당 스타트업과 회차별 상담일지를 작성합니다.
* **스타트업(GUEST)**: 자기 멘토링 일정과 일지, 피드백 요청을 확인합니다.

---

## 4. 정보 구조

```txt
ProgramModule(MENTORING)
  -> mentoring_relationships
  -> mentoring_sessions
  -> mentoring_logs
  -> mentor_feedback_records
```

---

## 5. 화면 구성

### 5.1 관리자용 멘토링 관계 보드

```txt
[멘토 배정] [회차 생성] [일지 미작성 필터] [성과 다운로드]

좌측: 스타트업 목록
우측: 배정 멘토, 회차 수, 마지막 상담일, 일지 제출률
```

### 5.2 멘토 GUEST 상담일지 화면

```txt
[담당 기업] [회차 선택]
기업 요약 / 이전 상담 이력 / 이번 상담일지 작성
```

---

## 6. 주요 기능

### 6.1 N:N 관계 생성

* 하나의 스타트업에 여러 멘토를 배정할 수 있고, 하나의 멘토도 여러 스타트업을 담당할 수 있습니다.
* 관계에는 전문 분야, 담당 회차, 우선순위, 운영 메모를 저장합니다.
* 관계 생성 시 멘토와 스타트업 모두 GUEST 포털에서 해당 관계를 확인할 수 있습니다.

### 6.2 회차 관리

* 회차는 Program Timeline의 멘토링 기간 안에서만 생성할 수 있습니다.
* 회차는 정기 회차, 보강 회차, 수시 상담으로 구분합니다.
* 회차 종료 후 멘토 상담일지와 스타트업 만족도 평가를 요청합니다.

### 6.3 상담일지

* 상담일지는 현황, 이슈, 조언, 액션아이템, 후속 일정으로 구성합니다.
* 운영자는 미작성 일지를 모니터링하고 알림을 재발송할 수 있습니다.
* 상담일지는 HUB 스타트업 상세의 성장 이력으로 요약 연동됩니다.

---

## 7. 데이터 모델

```txt
mentoring_relationships
  - id
  - program_module_id
  - startup_id
  - mentor_participant_id
  - specialty_tags
  - status

mentoring_sessions
  - id
  - relationship_id
  - round_no
  - scheduled_at
  - session_type
  - status

mentoring_logs
  - id
  - mentoring_session_id
  - summary
  - issues
  - advice
  - action_items
  - next_steps
  - submitted_at
```

---

## 8. 상태 모델

```txt
mentoring_relationships.status
  ACTIVE
  PAUSED
  ENDED

mentoring_sessions.status
  SCHEDULED
  DONE
  NO_SHOW
  CANCELLED
  LOG_SUBMITTED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 관계와 회차를 관리할 수 있습니다.
* 멘토 GUEST는 자신이 배정된 관계와 회차, 상담일지만 조회/작성할 수 있습니다.
* 스타트업 GUEST는 자기 기업의 멘토링 일정과 공유 가능한 상담일지만 조회할 수 있습니다.
* 내부 운영 메모는 GUEST에 노출하지 않습니다.

---

## 10. API/RPC/서버 액션

```txt
create_mentoring_relationship(program_module_id, startup_id, mentor_id)
bulk_assign_mentors(program_module_id, assignment_payload)
create_mentoring_session(relationship_id, payload)
submit_mentoring_log(session_id, log_payload)
mark_mentoring_no_show(session_id, reason)
request_mentor_feedback(session_id)
```

---

## 11. GUEST 연동

멘토 GUEST는 담당 기업 목록과 회차별 상담일지 작성 태스크를 확인합니다. 스타트업 GUEST는 자기 멘토링 이력과 다음 회차, 후속 액션아이템을 확인합니다. 양측 모두 Program/Assignment scope로 제한됩니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* HUB 스타트업 상세에는 멘토링 회차 수, 주요 액션아이템, 최근 상담 요약을 표시합니다.
* Outcomes/KPI는 멘토링 완료율, 일지 제출률, 멘토별 담당 기업 수를 집계합니다.
* ADMIN 감사 로그에는 관계 생성/종료, 상담일지 수정 이력을 남깁니다.

---

## 13. 예외/오류/운영 리스크

* 멘토 교체 시 기존 상담일지는 보존하고 새 관계를 생성합니다.
* 민감 상담 내용은 공개 범위를 `INTERNAL_ONLY`, `SHARED_WITH_STARTUP`으로 구분합니다.
* 회차 일정이 Business Matching 상담과 충돌하면 Program Timeline에서 경고합니다.

---

## 14. 완료 기준

1. N:N 멘토-멘티 관계를 구성할 수 있다.
2. 회차별 상담일지와 만족도 평가가 누적된다.
3. 스타트업별 멘토링 이력이 HUB와 KPI에 연결된다.

---

## 15. 테스트 기준

1. 멘토가 배정되지 않은 기업의 상담일지에 접근할 수 없는지 검증합니다.
2. 상담일지 공개 범위에 따라 스타트업 GUEST 노출 여부가 달라지는지 검증합니다.
3. 멘토 교체 후 이전 일지가 삭제되지 않는지 검증합니다.
