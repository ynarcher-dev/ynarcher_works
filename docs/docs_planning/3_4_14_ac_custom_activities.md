# [3-4-14] AC Custom Activity 및 회의록 기획서

본 문서는 Program First 구조 안에서 정형 모듈 밖에서 발생하는 비정형 활동, 회의록, 사진, 첨부 파일을 Program/Module/Session과 연결해 운영 이력으로 보존하는 모듈을 정의합니다.

---

## 1. 목적

Custom Activity는 단순 행사 메모가 아니라 Program 운영 중 발생하는 예외 활동과 현장 기록을 정형 데이터 흐름에 연결하는 보완 장치입니다. 회의록, 결정사항, 후속 조치, 첨부 파일, 공개 범위를 함께 관리합니다.

---

## 2. 이 문서가 다루는 범위

1. 비정형 활동 기록 작성
2. Program/Module/Session 연결
3. 참석자 지정
4. 회의록/결정사항/Action Item 관리
5. 사진/첨부 파일 업로드
6. HUB/GUEST 이력 노출

---

## 3. 핵심 사용자

* **AC 운영자**: 활동 기록과 회의록을 작성합니다.
* **스타트업 GUEST**: 자기 기업과 관련된 공개 활동 이력을 확인합니다.
* **관리자**: Program 운영 이력을 감사하고 후속 조치를 확인합니다.

---

## 4. 정보 구조

```txt
Program
  -> custom_activities
  -> activity_attendees
  -> activity_minutes
  -> activity_attachments
  -> action_items
```

---

## 5. 화면 구성

### 5.1 활동 타임라인

```txt
[활동 기록 작성] [모듈 필터] [참석자 필터] [공개 범위 필터]

Activity Feed Card
  - 활동명
  - 날짜/장소
  - 연결 모듈/세션
  - 참석 스타트업/전문가
  - 회의록 요약
  - 사진/첨부
  - 후속 조치
```

### 5.2 활동 편집 모달

```txt
기본 정보 / 연결 대상 / 참석자 / 회의록 / 첨부 / 공개 범위
```

---

## 6. 주요 기능

### 6.1 활동 기록

* 활동 유형은 `MEETING`, `WORKSHOP`, `SITE_VISIT`, `NETWORKING`, `FOLLOW_UP`, `ETC`로 구분합니다.
* Program 전체, 특정 Module, 특정 Session 중 하나 이상에 연결할 수 있습니다.
* 참석 스타트업과 전문가를 participant pool에서 선택합니다.

### 6.2 회의록

* 회의록은 안건, 논의 내용, 결정사항, 후속 조치, 담당자, 기한을 포함합니다.
* 후속 조치는 Action Item으로 분리해 완료 상태를 추적합니다.
* 내부 전용 메모와 GUEST 공개 요약을 분리합니다.

### 6.3 첨부와 사진

* 사진, PDF, 문서 파일을 첨부할 수 있습니다.
* 공개 범위에 따라 GUEST 노출, HUB 노출, 내부 전용을 구분합니다.
* 이미지 파일은 용량 제한과 리사이징 정책을 적용합니다.

---

## 7. 데이터 모델

```txt
custom_activities
  - id
  - program_id
  - program_module_id
  - session_source_id
  - activity_type
  - title
  - activity_date
  - visibility

activity_minutes
  - id
  - custom_activity_id
  - agenda
  - discussion
  - decisions
  - internal_note

action_items
  - id
  - custom_activity_id
  - title
  - owner_participant_id
  - due_date
  - status

activity_attachments
  - id
  - custom_activity_id
  - file_id
  - visibility
```

---

## 8. 상태 모델

```txt
custom_activities.visibility
  INTERNAL_ONLY
  PARTICIPANTS
  HUB_SUMMARY
  PUBLIC_SUMMARY

action_items.status
  TODO
  IN_PROGRESS
  DONE
  DROPPED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 활동 기록을 작성/수정할 수 있습니다.
* GUEST는 자신이 참석자이거나 자기 기업과 연결된 `PARTICIPANTS` 이상 공개 범위의 기록만 조회합니다.
* 내부 메모와 내부 첨부는 GUEST에 노출하지 않습니다.
* 파일 다운로드는 첨부 visibility와 participant scope를 함께 검증합니다.

---

## 10. API/RPC/서버 액션

```txt
create_custom_activity(program_id, payload)
update_custom_activity(activity_id, payload)
attach_activity_file(activity_id, file_payload)
upsert_activity_minutes(activity_id, minutes_payload)
create_activity_action_item(activity_id, action_payload)
update_action_item_status(action_item_id, status)
publish_activity_summary(activity_id, visibility)
```

---

## 11. GUEST 연동

스타트업 GUEST는 자기 기업이 참석했거나 관련된 활동 이력을 Program 이력에서 확인합니다. 공개 가능한 회의록 요약, 사진, 후속 조치만 노출하며 내부 운영 메모는 숨깁니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* NETWORKS 스타트업 상세에는 활동 이력 요약과 공개 사진을 표시합니다.
* ADMIN 감사 로그에는 활동 삭제, 공개 범위 변경, 첨부 다운로드 이력을 남깁니다.
* Outcomes/KPI는 활동 수, 후속 조치 완료율을 보조 지표로 사용할 수 있습니다.

---

## 13. 예외/오류/운영 리스크

* 공개 범위를 상향 변경할 때 개인정보 또는 민감 정보 포함 여부를 확인합니다.
* 참석자 지정 없이 GUEST 공개를 선택할 수 없도록 제한합니다.
* 활동 삭제는 soft delete로 처리하고 첨부 파일 접근을 즉시 차단합니다.

---

## 14. 완료 기준

1. 비정형 활동과 회의록을 Program/Module/Session에 연결할 수 있다.
2. 참석자와 공개 범위에 따라 GUEST 노출이 제어된다.
3. 사진/첨부와 Action Item이 활동 기록에 함께 관리된다.

---

## 15. 테스트 기준

1. 내부 전용 활동이 GUEST에 노출되지 않는지 검증합니다.
2. 공개 범위 변경 시 감사 로그가 남는지 검증합니다.
3. 삭제된 활동의 첨부 파일 URL이 더 이상 발급되지 않는지 검증합니다.
