# [3-4-8] AC OT 및 공통 세션 기획서

본 문서는 Program First 구조 안에서 OT, 워크숍, 공통 교육, 출석 확인과 같은 1:N 세션을 운영하는 모듈의 화면, 데이터, 권한, 상태 전이, GUEST 연동 기준을 정의합니다.

---

## 1. 목적

OT 및 공통 세션 모듈은 선발된 참가 스타트업과 외부 참여자에게 일정, 장소, 자료, 출석 상태를 제공하고 운영자가 출석/지각/불참을 기록하는 Program 운영 단위입니다.

---

## 2. 이 문서가 다루는 범위

1. OT/워크숍/공통 교육 세션 생성
2. 참가 대상 지정
3. QR/수동 출석 체크
4. 자료 배포
5. GUEST 모바일 일정 안내
6. 출석 결과 KPI 연동

---

## 3. 핵심 사용자

* **AC 운영자**: 세션을 생성하고 출석을 관리합니다.
* **참여 스타트업(GUEST)**: 일정과 장소를 확인하고 출석 체크를 수행합니다.
* **멘토/강사(GUEST)**: 자신이 담당하는 세션 일정과 자료를 확인합니다.

---

## 4. 정보 구조

```txt
ProgramModule(ORIENTATION)
  -> orientation_sessions
  -> session_attendees
  -> session_materials
  -> attendance_logs
```

---

## 5. 화면 구성

### 5.1 관리자용 세션 운영 화면

```txt
[세션 추가] [출석 QR 발급] [자료 업로드] [출석부 다운로드]

세션 목록
  - 세션명
  - 일시/장소
  - 대상 수
  - 출석/지각/불참 수
  - 자료 배포 상태
```

### 5.2 GUEST 모바일 세션 카드

```txt
[오늘의 세션]
세션명 / 시간 / 장소 / 지도 링크
[출석 체크] [자료 보기]
```

---

## 6. 주요 기능

### 6.1 세션 생성

* 세션 유형은 `ORIENTATION`, `WORKSHOP`, `EDUCATION`, `GRADUATION`, `CUSTOM_SESSION`으로 구분합니다.
* Program Timeline과 연결하여 동일 시간대의 평가/멘토링/매칭 일정과 충돌 여부를 검사합니다.
* 장소가 오프라인인 경우 이동 버퍼와 층/호실 정보를 함께 등록합니다.

### 6.2 출석 체크

* QR 체크인, 운영자 수동 체크인, 사후 보정 입력을 지원합니다.
* QR은 세션 시작 전 지정 시간부터 활성화되며, 만료 후 재사용할 수 없습니다.
* 지각 기준 분(minute)은 Program 또는 세션 단위로 설정합니다.

### 6.3 자료 배포

* 운영자는 PDF, 링크, 안내문을 세션 자료로 배포합니다.
* GUEST는 자기 Program에 배정된 세션 자료만 조회합니다.
* 민감 자료는 다운로드 대신 뷰어 열람만 허용할 수 있습니다.

---

## 7. 데이터 모델

```txt
orientation_sessions
  - id
  - program_module_id
  - session_type
  - title
  - venue
  - starts_at
  - ends_at
  - status

session_attendees
  - id
  - session_id
  - participant_id
  - attendee_role
  - attendance_status

session_materials
  - id
  - session_id
  - file_id
  - link_url
  - visibility

attendance_logs
  - id
  - session_attendee_id
  - method
  - checked_at
  - checked_by
```

---

## 8. 상태 모델

```txt
orientation_sessions.status
  DRAFT
  PUBLISHED
  LIVE
  CLOSED
  CANCELLED

session_attendees.attendance_status
  INVITED
  PRESENT
  LATE
  ABSENT
  EXCUSED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 세션과 출석부를 관리할 수 있습니다.
* GUEST는 자신이 대상자로 등록된 세션만 조회할 수 있습니다.
* 출석 로그 수정은 운영자만 가능하며, 수정 사유와 변경 전 값을 감사 로그에 남깁니다.

---

## 10. API/RPC/서버 액션

```txt
create_orientation_session(program_module_id, payload)
publish_orientation_session(session_id)
generate_attendance_qr(session_id)
check_in_session_attendee(session_id, participant_id, token)
override_attendance_status(session_attendee_id, status, reason)
upload_session_material(session_id, file_payload)
download_attendance_sheet(session_id)
```

---

## 11. GUEST 연동

GUEST 포털은 오늘/다가오는 세션을 상단에 표시하고, 세션 카드에서 출석 체크와 자료 열람을 처리합니다. 모바일 360px에서도 장소, 시간, 출석 버튼이 접히지 않도록 우선순위를 고정합니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* 출석률은 Outcomes/KPI 모듈로 집계됩니다.
* ADMIN에는 출석 보정 이력과 자료 다운로드 이력을 감사 로그로 남깁니다.
* HUB 스타트업 상세에는 Program 참여 이력으로 주요 공통 세션 참석 여부를 요약 표시할 수 있습니다.

---

## 13. 예외/오류/운영 리스크

* QR 중복 사용과 대리 출석을 막기 위해 토큰, 시간, 참가자 scope를 함께 검증합니다.
* 현장 네트워크 장애 시 운영자 수동 체크를 허용하되 사유 입력을 필수로 합니다.
* 세션 취소 시 대상자에게 알림 발송 실패 로그를 남깁니다.

---

## 14. 완료 기준

1. 세션 생성, 발행, 출석 체크, 종료 처리가 가능하다.
2. GUEST 모바일에서 오늘의 세션과 출석 버튼이 명확하게 노출된다.
3. 출석 결과가 KPI와 참가 기업 이력으로 연결된다.

---

## 15. 테스트 기준

1. 만료된 QR로 출석 체크가 차단되는지 검증합니다.
2. 타 Program 참가자가 세션 자료에 접근할 수 없는지 검증합니다.
3. 출석 보정 시 감사 로그가 남는지 검증합니다.
