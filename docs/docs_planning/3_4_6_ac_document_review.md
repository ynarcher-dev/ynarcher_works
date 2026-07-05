# [3-4-6] AC 서면평가 모듈 기획서

본 문서는 Program First 구조 안에서 모집 신청 DB와 제출 자료를 기반으로 서면평가를 운영하는 모듈의 화면, 데이터, 권한, 상태 전이, GUEST 연동 기준을 정의합니다.

---

## 1. 목적

서면평가는 `Recruitment` 모듈에서 접수된 신청 기업을 대상으로, 외부 심사위원이 신청서와 첨부 자료를 한 화면에서 확인하며 공통 평가 엔진([3_4_5_ac_evaluation_engine.md](./3_4_5_ac_evaluation_engine.md))의 평가표를 작성하는 업무 단계입니다.

본 모듈은 단순 파일 열람 기능이 아니라 `Program -> Program Module -> Evaluation Form -> Target -> Assignment -> Submission` 흐름으로 평가 데이터를 남기고, 이후 대면평가/선발/성과 리포트로 이어지는 근거 데이터를 생성합니다.

---

## 2. 이 문서가 다루는 범위

1. 서면평가 라운드 개설 및 평가표 연결
2. 신청 기업 평가 대상 확정
3. 심사위원 배정
4. 신청서/첨부자료 Split View 평가 화면
5. 점수 제출, 회수, 집계
6. 선발 후보군 산출 및 다음 모듈 전달

---

## 3. 핵심 사용자

* **AC 운영자**: 평가 라운드를 만들고 대상 기업과 심사위원을 배정합니다.
* **외부 심사위원(GUEST)**: 배정된 기업의 신청서와 자료를 열람하고 평가표를 제출합니다.
* **관리자/의사결정자**: 집계 결과와 심사 의견을 검토하고 대면평가 대상군을 확정합니다.

---

## 4. 정보 구조

```txt
Program
  -> ProgramModule(DOC_REVIEW)
    -> EvaluationForm(type=DOC_REVIEW)
      -> EvaluationTarget(application_submission_id)
      -> EvaluationAssignment(reviewer_id, target_id)
      -> EvaluationSubmission
      -> EvaluationAnswer
```

서면평가 대상은 HUB 마스터의 기업이 아니라 `application_submissions`를 기준으로 확정합니다. HUB 마스터 연결은 신청 기업이 선발되거나 운영자가 매핑을 확정한 이후에 수행할 수 있습니다.

---

## 5. 화면 구성

### 5.1 관리자용 서면평가 운영 화면

```txt
[Program Header] [DOC_REVIEW 상태 배지]
[평가 라운드 선택] [대상 기업 가져오기] [심사위원 배정] [제출 마감 설정]

좌측: 신청 기업 목록/DataTable
  - 접수번호
  - 기업명
  - 제출 상태
  - 자료 누락 여부
  - 배정 심사위원 수
  - 평균 점수

우측: 라운드 상세 Drawer
  - 평가표
  - 배정 규칙
  - 마감 시각
  - 제출 현황
```

### 5.2 심사위원용 Split View 평가 화면

```txt
상단: Program/라운드명/마감 D-Day/제출 상태
좌측 60%: 신청서 답변, 첨부 PDF, 발표자료, 사업계획서 탭
우측 40%: 평가 기준, 점수 입력, 의견 입력, 임시저장/제출 버튼
```

모바일에서는 자료 영역과 평가표 영역을 탭 전환 방식으로 제공하며, 제출 버튼은 `MobileActionBar`에 고정합니다.

---

## 6. 주요 기능

### 6.1 평가 대상 확정

* `application_submissions.status = SUBMITTED` 이상인 신청만 평가 대상으로 가져올 수 있습니다.
* 서류 미비 기업은 `MISSING_FILES` 플래그를 표시하되, 운영자가 강제 포함할 수 있습니다.
* 대상 확정 이후 신청자가 제출 내용을 수정하면 평가 대상의 스냅샷 버전을 별도로 보존합니다.

### 6.2 심사위원 배정

* 수동 배정과 라운드로빈 자동 배정을 모두 지원합니다.
* 심사위원별 최대 배정 수, 이해상충 제외 기업, 분야별 전문성 태그를 배정 조건에 포함합니다.
* 배정 확정은 서버 액션에서 처리하며, 확정 후 GUEST 초대 또는 알림을 발송합니다.

### 6.3 제출 및 집계

* 심사위원은 임시저장과 최종 제출을 구분합니다.
* 최종 제출 이후 수정은 운영자 회수 처리 후에만 가능합니다.
* 집계는 평가 기준의 가중치를 반영하여 기업별 평균/중앙값/분산을 제공합니다.

---

## 7. 데이터 모델

```txt
document_review_rounds
  - id
  - program_module_id
  - evaluation_form_id
  - title
  - opens_at
  - closes_at
  - status

document_review_snapshots
  - id
  - round_id
  - application_submission_id
  - snapshot_json
  - file_manifest_json
  - created_at
```

평가 제출 본문은 공통 평가 엔진의 `evaluation_submissions`, `evaluation_answers`를 사용합니다.

---

## 8. 상태 모델

```txt
document_review_rounds.status
  DRAFT
  ASSIGNING
  OPEN
  CLOSED
  AGGREGATED
  CONFIRMED
  CANCELLED
```

`OPEN -> CLOSED`, `CLOSED -> AGGREGATED`, `AGGREGATED -> CONFIRMED` 전이는 서버 액션에서만 수행합니다.

---

## 9. 권한/RLS

* AC 운영자는 담당 Program 범위의 라운드와 배정을 조회/수정할 수 있습니다.
* 심사위원 GUEST는 자신에게 배정된 `evaluation_assignments`와 연결된 신청 스냅샷만 조회할 수 있습니다.
* 다른 심사위원의 점수와 의견은 집계 공개 전까지 조회할 수 없습니다.
* 첨부 파일은 signed URL로만 열람하며, URL 발급 시 assignment scope를 검증합니다.

---

## 10. API/RPC/서버 액션

```txt
create_document_review_round(program_module_id, evaluation_form_id, payload)
import_document_review_targets(round_id, application_submission_ids)
assign_document_reviewers(round_id, assignment_payload)
open_document_review_round(round_id)
submit_evaluation_assignment(assignment_id, answers)
reopen_evaluation_submission(submission_id, reason)
aggregate_document_review_results(round_id)
confirm_document_review_shortlist(round_id, target_ids)
```

---

## 11. GUEST 연동

심사위원 GUEST 포털에는 `배정된 서면평가` 목록, 마감 시각, 제출 상태, 임시저장 표시, 자료 열람 이력이 노출됩니다. 심사위원은 WORKS 내부 AC 메뉴에 접근하지 않으며, 초대 링크 또는 OTP 인증 이후 자신의 배정 건만 처리합니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* HUB에는 선발 확정 전까지 신청 기업을 임시 후보로만 연결합니다.
* ADMIN 감사 로그에는 심사위원 배정, 회수, 재제출, 결과 확정 이력을 남깁니다.
* 대면평가 모듈은 `confirm_document_review_shortlist` 결과를 평가 대상으로 이어받습니다.

---

## 13. 예외/오류/운영 리스크

* 마감 이후 제출 시도는 차단하고 운영자에게 지연 제출 요청 이력을 남깁니다.
* PDF 변환 실패 파일은 원본 다운로드 링크와 오류 배지를 함께 표시합니다.
* 이해상충 기업이 배정된 경우 배정 확정 전에 경고하고 강제 배정 사유 입력을 요구합니다.

---

## 14. 완료 기준

1. 신청 DB에서 서면평가 대상을 확정할 수 있다.
2. 심사위원별 Split View 평가 화면에서 자료 열람과 평가 제출이 가능하다.
3. 공통 평가 엔진의 점수/의견 데이터가 기업별로 집계된다.
4. 선발 후보군을 대면평가 모듈로 전달할 수 있다.

---

## 15. 테스트 기준

1. 심사위원 A가 심사위원 B의 배정 기업 자료에 접근할 수 없는지 검증합니다.
2. 마감 전/후 제출 가능 여부와 회수 후 재제출 흐름을 검증합니다.
3. 첨부 파일 signed URL이 만료 후 재사용되지 않는지 검증합니다.
4. 서면평가 집계 결과가 가중치 기준과 일치하는지 검증합니다.
