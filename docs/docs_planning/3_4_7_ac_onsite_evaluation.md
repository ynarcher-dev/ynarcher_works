# [3-4-7] AC 대면평가 모듈 기획서

본 문서는 Program First 구조 안에서 서면평가 이후 선발 후보 기업을 대상으로 현장 발표/인터뷰 기반 대면평가를 운영하는 모듈의 화면, 데이터, 권한, 상태 전이, GUEST 연동 기준을 정의합니다.

---

## 1. 목적

대면평가는 공통 평가 엔진을 재사용하되, 발표 순서, 발표 시간, 질의응답, 현장 진행 상태, 심사위원 모바일 평가 경험이 결합된 운영 모듈입니다. 본 문서는 대면평가를 단순 평가표가 아니라 `Session + Assignment + Live Status + Result` 구조로 정의합니다.

---

## 2. 이 문서가 다루는 범위

1. 대면평가 세션 생성
2. 발표 기업/순서/시간표 편성
3. 심사위원 배정
4. 현장 진행 상태 관리
5. 모바일 심사표 제출
6. 최종 선발 결과 확정

---

## 3. 핵심 사용자

* **AC 운영자**: 발표 세션과 순서를 편성하고 현장 상태를 관리합니다.
* **심사위원(GUEST)**: 배정된 발표 기업을 확인하고 모바일 평가표를 제출합니다.
* **참여 스타트업(GUEST)**: 발표 순서, 대기 시간, 준비 안내를 확인합니다.

---

## 4. 정보 구조

```txt
ProgramModule(ONSITE_EVAL)
  -> onsite_eval_sessions
  -> onsite_eval_presentations
  -> evaluation_assignments
  -> evaluation_submissions
  -> selection_results
```

대면평가의 평가표는 `evaluation_forms.form_type = ONSITE_EVAL`로 구분하며, 점수 집계는 공통 평가 엔진을 사용합니다.

---

## 5. 화면 구성

### 5.1 관리자용 현장 콘솔

```txt
[세션 선택] [발표 순서 편집] [현장 진행 시작] [결과 집계]

좌측: 발표 순서 Timeline
  - 순번
  - 기업명
  - 발표/질의응답 시간
  - 현재 상태

우측: 현장 제어 패널
  - 다음 발표 호출
  - 발표 시작/종료
  - 지연 사유 기록
  - 심사 제출 현황
```

### 5.2 심사위원 모바일 평가 화면

```txt
상단: 현재 발표 기업 / 남은 시간 / 제출 상태
본문: 기업 요약 자료 + 평가표
하단: 임시저장 / 최종 제출
```

---

## 6. 주요 기능

### 6.1 발표 세션 편성

* 서면평가 후보군 또는 운영자가 직접 선택한 참가 기업을 발표 대상으로 등록합니다.
* 발표 시간, Q&A 시간, 휴식 시간, 이동 버퍼를 포함해 세션 총 소요 시간을 계산합니다.
* 동일 기업의 다른 Program 세션과 시간이 겹치는 경우 충돌 경고를 제공합니다.

### 6.2 현장 진행 상태 관리

* 운영자는 발표 기업별 상태를 `WAITING -> PRESENTING -> QNA -> DONE` 순서로 전환합니다.
* 상태 전이는 현장 타이머와 심사위원 화면을 동시에 갱신합니다.
* 지연 발생 시 사유와 실제 시작/종료 시각을 기록합니다.

### 6.3 최종 선발

* 평가 집계 결과를 기준으로 합격/예비/불합격 후보군을 표시합니다.
* 운영자는 동점 처리, 내부 심의, 결격 사유를 반영해 최종 선발 상태를 확정합니다.
* 확정 결과는 Participant Pool과 후속 모듈의 대상군으로 전달됩니다.

---

## 7. 데이터 모델

```txt
onsite_eval_sessions
  - id
  - program_module_id
  - evaluation_form_id
  - title
  - venue
  - starts_at
  - ends_at
  - status

onsite_eval_presentations
  - id
  - session_id
  - startup_id
  - order_no
  - present_minutes
  - qna_minutes
  - actual_started_at
  - actual_ended_at
  - status

selection_results
  - id
  - program_module_id
  - startup_id
  - decision
  - rank_no
  - reason
  - confirmed_at
```

---

## 8. 상태 모델

```txt
onsite_eval_sessions.status
  DRAFT
  READY
  LIVE
  CLOSED
  AGGREGATED
  CONFIRMED

onsite_eval_presentations.status
  WAITING
  PRESENTING
  QNA
  DONE
  SKIPPED

selection_results.decision
  SELECTED
  WAITLISTED
  REJECTED
  HOLD
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 대면평가 세션과 발표 순서를 관리할 수 있습니다.
* 심사위원 GUEST는 자신이 배정된 발표 기업의 자료와 평가표만 조회/제출할 수 있습니다.
* 스타트업 GUEST는 자기 기업의 발표 일정과 안내 정보만 조회할 수 있습니다.
* 최종 선발 결과는 확정 전까지 운영자와 승인권자에게만 노출합니다.

---

## 10. API/RPC/서버 액션

```txt
create_onsite_eval_session(program_module_id, payload)
set_onsite_presentation_order(session_id, startup_order_payload)
assign_onsite_reviewers(session_id, reviewer_payload)
start_onsite_session(session_id)
transition_presentation_status(presentation_id, next_status)
submit_onsite_evaluation(assignment_id, answers)
aggregate_onsite_results(session_id)
confirm_selection_results(session_id, decision_payload)
```

---

## 11. GUEST 연동

심사위원 GUEST는 모바일 우선 Split View를 통해 발표 기업 자료와 평가표를 처리합니다. 스타트업 GUEST는 발표 순서, 대기 시간, 준비 장소, 발표자료 제출 상태를 확인합니다. 두 유형 모두 WORKS 내부 메뉴가 아니라 GUEST scope로 제한됩니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* 최종 선발 기업은 NETWORKS 스타트업 마스터와 연결하거나 신규 생성 후보로 등록합니다.
* ADMIN 감사 로그에는 발표 순서 변경, 현장 상태 전환, 선발 확정 이력을 남깁니다.
* 후속 OT/멘토링/비즈니스 매칭 모듈은 `SELECTED` 기업만 기본 대상군으로 가져옵니다.

---

## 13. 예외/오류/운영 리스크

* 발표 기업이 불참하면 `SKIPPED` 처리하고 평가 대상에서 제외 또는 0점 처리 여부를 운영자가 선택합니다.
* 현장 네트워크 불안정 시 심사위원 임시저장 데이터를 로컬 캐시 후 재전송합니다.
* 발표 순서 변경은 LIVE 상태에서도 가능하되 변경 사유를 필수로 남깁니다.

---

## 14. 완료 기준

1. 발표 세션과 순서를 구성할 수 있다.
2. 현장 상태 전환이 관리자/심사위원 화면에 반영된다.
3. 모바일 심사표 제출과 집계가 정상 동작한다.
4. 최종 선발 결과가 후속 모듈 대상군으로 전달된다.

---

## 15. 테스트 기준

1. LIVE 상태에서 발표 순서 변경 시 타이머와 GUEST 화면이 갱신되는지 검증합니다.
2. 심사위원별 배정 외 기업 접근이 차단되는지 검증합니다.
3. 동점/예비/불합격 확정 결과가 Participant Pool에 정확히 반영되는지 검증합니다.
