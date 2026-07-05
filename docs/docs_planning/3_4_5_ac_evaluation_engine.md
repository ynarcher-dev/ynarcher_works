# [3-4-5] AC 공통 평가 엔진 기획서

본 문서는 AC 프로그램 내에서 가동되는 서면평가(Document Review), 대면평가(Onsite Evaluation), 데모데이(Demo Day) 심사 모듈이 통합 공유 및 재사용하는 **공통 평가 엔진(Common Evaluation Engine)**의 아키텍처, 데이터 모델, 동적 평가지 빌더 및 채점 집계 요건을 정의합니다.

---

## 1. 목적
* 각 심사 라운드마다 별도의 평가 모듈을 중복 개발하지 않고, 하나의 동적 평가지 빌더 엔진을 재사용하여 개발 및 운영 효율을 극대화합니다.
* 지표별 점수, 배점, 가중치를 유연하게 셋업하여 복잡한 심사 비즈니스 룰을 수용합니다.
* 심사위원 전용 Split View UI 표준을 명세하여 심사위원이 기업의 제출 자료와 평가표를 한 화면에서 쾌적하게 다루도록 지원합니다.

---

## 2. 이 문서가 다루는 범위
* 공통 평가 엔진 핵심 데이터 모델 설계 (Forms, Criteria, Assignments, Answers, Selections)
* 관리자용 동적 평가표 폼 빌더 기능 스펙
* 심사위원용 Split View 평가판 구성 스펙
* 다차원 결과 집계 수식 및 편차 분석 요건
* RLS 기반의 심사 배정별 데이터 보호 정책 및 상태 전이 RPC 명세

---

## 3. 핵심 사용자
* **내부 운영자 (PROGRAM_OPERATOR)**: 평가 라운드를 신설하고, 평가지 지표와 배점을 빌드하며, 배정(매칭) 후 결과를 집계/엑셀 다운로드합니다.
* **심사위원 및 전문가 (GUEST_JUDGE / GUEST_REVIEWER)**: GUEST 포털에 진입하여 Split View를 통해 배정된 스타트업의 서류를 읽고 채점 의견을 작성/제출합니다.

---

## 4. 정보 구조 (Information Architecture)

```
[공통 평가 엔진 데이터 릴레이션]
 ├── evaluation_forms (라운드 마스터: DRAFT -> OPEN -> CLOSED)
 ├── evaluation_criteria (지표 빌더: 유형, 배점, 가중치, 필수여부)
 ├── evaluation_targets (평가 대상 기업 풀)
 ├── evaluation_assignments (평가자 - 대상 매핑 매트릭스)
 ├── evaluation_submissions (평가자별 최종 제출 상태 및 타임스탬프)
 ├── evaluation_answers (지표별 답변 값)
 └── evaluation_selections (최종 선정 여부 판정 테이블)
```

---

## 5. 화면 구성

### 5.1 심사위원용 Split View 평가 화면 (Evaluation Split View UX)
```
┌────────────────────────────────────────────────────────────────────────┐
│ [A-STREAM 2026 서면심사]  [평가 대상 기업: 스타트업A (1/5)]    [제출하기]│
├───────────────────────────────────────┬────────────────────────┤
│ (좌측) 기업 자료 및 지원서 뷰어       │ (우측) 동적 평가표     │
│ ┌───────────────────────────────────┐ │ 1. 기술성 및 혁신성 [필수]       │
│ │ [신청서 기본 정보]                │ │   (o) 매우우수 (10점)          │
│ │ 대표자: 김철수 | 설립: 2024-01-01 │ │   ( ) 우수 (8점)   ( ) 보통 (6점)  │
│ │                                   │ │                                │
│ │ [제출 사업소개서.pdf]             │ │ 2. 사업 성장 BM [필수]         │
│ │ ┌───────────────────────────────┐ │ │   [ 85 ] 점 (최대 100점, 가중:x2)│
│ │ │ IR Deck 슬라이드 #1            │ │ │                                │
│ │ │ 서비스 핵심 BM 개요 및 아키텍...│ │ 3. 심사 종합 의견 [필수]       │
│ │ └───────────────────────────────┘ │ │   [ 시장성이 매우 우수하여... ]│
│ └───────────────────────────────────┘ │ [ 임시저장 ] [ 제출 ]          │
└───────────────────────────────────────┴────────────────────────┘
```

---

## 6. 주요 기능

### 6.1 동적 평가표 빌더 (Evaluation Form & Criteria Builder)
* **평가 라운드 관리**: 운영자는 단일 모듈 내에 복수의 평가 라운드(예: 1차 예선 서면평가, 2차 본선 대면평가)를 생성할 수 있습니다.
* **지표 필드 유형**:
  * `SCORE` (직접 점수 입력형, 최대 배점 검증 기능 탑재)
  * `SINGLE_CHOICE` (별점 또는 정량 선택지 - 예: 매우우수10, 우수8, 보통6)
  * `MULTIPLE_CHOICE` (체크박스형 지표)
  * `SHORT_ANSWER` / `LONG_ANSWER` (서술형 의견 기술란)
* **배점 및 가중치**: 각 지표마다 가중치(`weight`)를 다르게 지정하여 종합 점수 계산 식에 반영되도록 구조화합니다. (가중 총점 계산: `SUM(지표점수 * 가중치)`)
* **수정 방지 규칙**: 해당 평가 라운드에서 심사위원이 임의로 제출(`SUBMITTED`)한 답변이 1건이라도 존재할 경우, 평가지 지표의 파괴적 변경(삭제, 지표타입 변경, 배점 축소)은 자동으로 잠금 및 수정 차단됩니다.

### 6.2 심사위원 Split View 인터페이스
* **1화면 통합 UX**: 좌측 영역에는 스타트업이 제출한 PDF 사업소개서 및 신청서 기본 내용이 렌더링되는 가변 뷰어 영역을 배치하고, 우측 영역에는 실시간 입력 및 자동 임시저장이 작동하는 동적 평가표를 매핑합니다.
* **자동 임시저장(Auto-Save)**: 심사위원이 점수나 텍스트를 입력하고 포커스를 잃을 때(OnBlur), 또는 30초 주기로 백그라운드 API를 호출해 `evaluation_answers`에 자동 세이브를 진행하여 네트워크 오류에 의한 답변 날림을 예방합니다.

### 6.3 다차원 결과 집계
* **평가자 간 편차 분석**: 동일 기업에 대해 심사위원들이 채점한 점수들의 표준편차를 실시간 계산하여, 지나치게 편차가 크거나 담합이 의심되는 심사 결과를 시각적 하이라이트(예: 경고 노란색 로우 표시) 처리합니다.
* **정성 의견 취합**: 스타트업별로 각 심사위원이 남긴 서술형 심사평 및 피드백 코멘트를 한눈에 필터링해 모아볼 수 있는 리포팅 뷰를 제공합니다.

---

## 7. 데이터 모델 (DB Schema)

### 7.1 evaluation_forms (평가 라운드 마스터 테이블)
```sql
CREATE TABLE evaluation_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_module_id UUID NOT NULL REFERENCES program_modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    instructions TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, OPEN, CLOSED
    deadline_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 7.2 evaluation_criteria (동적 평가 지표 테이블)
```sql
CREATE TABLE evaluation_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES evaluation_forms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    criterion_type VARCHAR(50) NOT NULL,        -- SCORE, SINGLE_CHOICE, LONG_ANSWER 등
    max_score NUMERIC(5,2),
    weight NUMERIC(3,2) DEFAULT 1.00,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    options JSONB,                              -- 선택지 데이터 배열
    sort_order INT NOT NULL DEFAULT 0
);
```

### 7.3 evaluation_targets (평가 대상 기업 테이블)
```sql
CREATE TABLE evaluation_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES evaluation_forms(id) ON DELETE CASCADE,
    startup_id UUID NOT NULL,                   -- HUB 스타트업 마스터 ID 연동
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(form_id, startup_id)
);
```

### 7.4 evaluation_assignments (평가자 배정 테이블)
```sql
CREATE TABLE evaluation_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES evaluation_forms(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL,                 -- program_participants UUID (REVIEWER/JUDGE 역할자)
    target_id UUID NOT NULL REFERENCES evaluation_targets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(form_id, evaluator_id, target_id)
);
```

### 7.5 evaluation_submissions (평가자별 제출 마스터 테이블)
```sql
CREATE TABLE evaluation_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES evaluation_forms(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(form_id, evaluator_id)
);
```

### 7.6 evaluation_answers (평가 지표별 답변 테이블)
```sql
CREATE TABLE evaluation_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES evaluation_submissions(id) ON DELETE CASCADE,
    criterion_id UUID NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
    score_value NUMERIC(5,2),
    text_value TEXT,
    json_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(submission_id, criterion_id)
);
```

---

## 8. 상태 모델

* **평가 라운드 상태 (`evaluation_forms.status`)**:
  * `DRAFT` (지표 기획 및 배정 준비) -> `OPEN` (심사 개시, 외부 게스트 평가 작성 가능) -> `CLOSED` (평가 마감, 채점 기능 차단 및 읽기 전용)

---

## 9. 권한/RLS

* **외부 심사위원 (guest_reviewer, guest_judge)**:
  * 본인에게 배정된 평가 대상 기업 목록(`evaluation_assignments`) 및 이에 해당하는 지원 정보, 자료만 조회할 수 있습니다.
  * RLS Policy: `auth.uid() = (SELECT user_id FROM program_participants WHERE id = evaluator_id)`
  * 본인의 `evaluation_submissions` 및 `evaluation_answers`에 대해서만 읽기/쓰기 권한을 가집니다.
* **내부 운영자 (PROGRAM_OPERATOR 이상)**:
  * 해당 라운드 내의 모든 심사위원 제출 점수 및 정성 코멘트를 집계 조회할 수 있습니다.

---

## 10. API/RPC/서버 액션

* **함수명**: `fn_submit_evaluation_sheet(p_submission_id uuid)`
  * **설명**: 심사위원이 작성한 평가지 일체를 일괄 검증하고 최종 제출(`SUBMITTED`) 상태로 변경하는 트랜잭션 함수입니다.
  * **검증 규칙**:
    * 라운드 상태가 `OPEN`인지 검증합니다.
    * 필수(`is_required = true`)로 지정된 모든 평가 지표에 대해 답변(`evaluation_answers`)이 누락 없이 채워졌는지 무결성을 체크합니다.
    * 제출 완료 시점에 타임스탬프(`submitted_at`)를 기록하고, 이후에는 임의 수정을 전면 차단(Lock) 처리합니다.

---

## 11. GUEST 연동
* 외부 심사위원은 GUEST 모바일/웹 UI를 통해 진입하며, 본인 전용 메뉴에 접근하여 배정된 목록을 리스트로 확인합니다.
* Split View UI를 통해 심사를 수행하고, 제출을 누르면 `fn_submit_evaluation_sheet` API가 동작하여 채점을 제출 완료 처리합니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동
* **HUB 전문가**: 전문가 만족도 분석 랭킹 보드 연동 시, 공통 평가 엔진의 집계 API는 반영되지 않고 본인 멘토링/상담 평가 점수만 사용하도록 설계하여, 스타트업 심사 점수가 전문가 본인의 전사 자문 랭킹에 영향을 주지 않도록 시스템을 격리합니다.

---

## 13. 예외/오류/운영 리스크
* **심사위원의 실수에 의한 오제출**: 심사위원이 미완성 채점 상태에서 실수로 '제출'을 눌렀을 경우, GUEST 화면에서는 자체 복구할 수 없습니다. 대신, 내부 관리자 화면에서 해당 심사위원 건에 대해 **[평가 재오픈(Reopen)]** 버튼을 클릭하여 `evaluation_submissions.status`를 `DRAFT`로 역전이시켜주는 수동 복구 RPC를 구성하여 운영 리스크에 대응합니다.

---

## 14. 완료 기준 (Definition of Done)
1. 동적으로 지표를 빌드하고 배점을 다르게 설정했을 때 종합 점수가 `SCORE * 가중치` 공식으로 정확하게 취합되는가?
2. 심사위원 RLS에 의해 본인 배정 이외의 기업 평가표를 조회하려 할 때 에러를 뿜는가?
3. 평가 라운드 마감(`CLOSED`) 시점에 심사위원의 평가지 작성 및 수정 제출 요청이 API 단에서 완벽히 거부되는가?
4. 심사 답변이 존재하는 상태에서 평가지 구조 변경 시 수정 차단 경고가 정상 작동하는가?

---

## 15. 테스트 기준
1. **평가 합산 및 가중치 테스트**: 10점 만점 지표(가중치 1.5)와 20점 만점 지표(가중치 2.0)가 있을 때 각각 8점, 15점을 준 경우 가중합산점수가 `(8*1.5 + 15*2.0) = 42점`으로 정확하게 계산 집계되는지 검증합니다.
2. **평가 재오픈 감사로그 테스트**: 관리자가 특정 심사의 제출을 강제 해제(DRAFT로 복구)할 때, 감사로그 테이블에 'Reopened' 로그가 등록되고 실행자 정보가 남는지 확인합니다.
