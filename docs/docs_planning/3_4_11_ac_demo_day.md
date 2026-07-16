# [3-4-11] AC 데모데이 및 투자자 관심 관리 기획서

본 문서는 Program First 구조 안에서 데모데이 발표 세션, 모바일 심사, 실시간 스코어보드, 투자자 관심 기업 체크, 후속 미팅 상태를 관리하는 모듈을 정의합니다.

---

## 1. 목적

데모데이는 대면평가와 유사하게 공통 평가 엔진을 사용하지만, 발표 세션 운영과 투자자 관심/후속 미팅 관리가 결합된 성과 연결 모듈입니다.

---

## 2. 이 문서가 다루는 범위

1. 발표 세션 구성
2. 발표 순서와 시간 관리
3. 심사위원 모바일 평가
4. 스코어보드 집계
5. 투자자 관심 기업 체크
6. 후속 미팅 상태 관리

---

## 3. 핵심 사용자

* **AC 운영자**: 발표 순서와 현장 진행, 결과 집계를 관리합니다.
* **심사위원/투자자 GUEST**: 발표 기업 평가 또는 관심 표시를 수행합니다.
* **스타트업 GUEST**: 발표 일정과 자료 제출 상태를 확인합니다.

---

## 4. 정보 구조

```txt
ProgramModule(DEMO_DAY)
  -> demoday_sessions
  -> demoday_presentations
  -> evaluation_assignments
  -> demoday_interests
  -> follow_up_meetings
```

---

## 5. 화면 구성

### 5.1 운영자용 데모데이 콘솔

```txt
[발표 순서 편집] [현장 시작] [스코어보드] [관심 기업 내보내기]

발표 Timeline
  - 순번
  - 기업명
  - 발표 상태
  - 평균 점수
  - 관심 투자자 수
```

### 5.2 투자자/심사위원 모바일 화면

```txt
현재 발표 기업
[자료 보기] [평가하기] [관심 기업 체크] [후속 미팅 요청]
```

---

## 6. 주요 기능

### 6.1 발표 세션 관리

* 발표 시간, Q&A 시간, 전환 시간을 반영해 발표 순서를 생성합니다.
* 발표 상태는 현장 콘솔에서 전환되며 모바일 화면에 즉시 반영됩니다.
* 발표자료 최종본은 스타트업 GUEST가 제출하고 운영자가 승인합니다.

### 6.2 평가와 스코어보드

* 심사위원 평가는 공통 평가 엔진을 사용합니다.
* 운영자는 공개 스코어보드와 내부 스코어보드를 분리해 설정할 수 있습니다.
* 순위, 평균 점수, 가중치 반영 점수, 제출률을 제공합니다.

### 6.3 투자자 관심 및 후속 미팅

* 투자자는 기업별 관심 수준을 `WATCH`, `MEETING`, `INVEST`로 표시합니다.
* 후속 미팅 요청은 운영자 검토 후 `REQUESTED -> SCHEDULED -> DONE`으로 관리합니다.
* 투자자 관심 데이터는 FUND/M&A 후속 검토 후보로 연결할 수 있습니다.

---

## 7. 데이터 모델

```txt
demoday_sessions
  - id
  - program_module_id
  - evaluation_form_id
  - title
  - starts_at
  - ends_at
  - status

demoday_presentations
  - id
  - demoday_session_id
  - startup_id
  - order_no
  - present_minutes
  - qna_minutes
  - status

demoday_interests
  - id
  - demoday_session_id
  - startup_id
  - investor_participant_id
  - interest_level
  - note

follow_up_meetings
  - id
  - demoday_interest_id
  - meeting_status
  - scheduled_at
  - outcome_note
```

---

## 8. 상태 모델

```txt
demoday_sessions.status
  DRAFT
  READY
  LIVE
  CLOSED
  PUBLISHED

demoday_presentations.status
  WAITING
  PRESENTING
  QNA
  DONE

demoday_interests.interest_level
  WATCH
  MEETING
  INVEST

follow_up_meetings.meeting_status
  NONE
  REQUESTED
  SCHEDULED
  DONE
  DECLINED
```

---

## 9. 권한/RLS

* 운영자는 담당 Program의 데모데이 전체 데이터를 관리합니다.
* 심사위원은 배정된 평가 대상만 평가할 수 있습니다.
* 투자자는 자신이 표시한 관심 기록과 공개 허용된 기업 자료만 조회할 수 있습니다.
* 스타트업은 자기 발표 일정과 자료 제출 상태만 조회합니다.

---

## 10. API/RPC/서버 액션

```txt
create_demoday_session(program_module_id, payload)
set_demoday_presentation_order(session_id, order_payload)
transition_demoday_presentation(presentation_id, next_status)
submit_demoday_evaluation(assignment_id, answers)
mark_demoday_interest(session_id, startup_id, interest_payload)
request_follow_up_meeting(interest_id)
update_follow_up_meeting_status(meeting_id, status, note)
publish_demoday_scores(session_id)
export_demoday_results(session_id)
```

---

## 11. GUEST 연동

심사위원/투자자 GUEST는 발표 진행에 맞춰 현재 기업 정보를 확인하고 평가 또는 관심 표시를 수행합니다. 스타트업 GUEST는 발표 일정, 제출 자료 승인 상태, 공개 피드백을 확인합니다.

---

## 12. OFFICE/ADMIN/타 워크스페이스 연동

* NETWORKS 스타트업 상세에는 데모데이 발표 결과와 투자자 관심 현황을 표시합니다.
* FUND/M&A는 `INVEST` 또는 후속 미팅 완료 기업을 후보 파이프라인으로 참조할 수 있습니다.
* ADMIN은 관심 기록 수정, 스코어보드 공개, 결과 다운로드 이력을 감사 로그로 남깁니다.

---

## 13. 예외/오류/운영 리스크

* 공개 스코어보드는 운영자 승인 전까지 외부에 노출하지 않습니다.
* 투자자 관심 기록은 민감 영업 정보이므로 다운로드 권한과 마스킹 기준을 적용합니다.
* 발표 순서가 현장에서 변경되면 GUEST 화면 캐시를 즉시 무효화합니다.

---

## 14. 완료 기준

1. 발표 세션과 순서를 구성할 수 있다.
2. 모바일 심사와 투자자 관심 체크가 가능하다.
3. 스코어보드와 후속 미팅 상태가 관리된다.
4. 결과가 OFFICE/FUND/M&A 후속 흐름으로 연결된다.

---

## 15. 테스트 기준

1. 스코어보드 공개 전 외부 GUEST에게 결과가 노출되지 않는지 검증합니다.
2. 투자자가 자기 관심 기록만 수정할 수 있는지 검증합니다.
3. 발표 상태 전환이 모바일 화면에 반영되는지 검증합니다.
