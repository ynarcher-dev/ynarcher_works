# [3-4-2] AC 프로그램 개요 및 모듈 설정 기획서

본 문서는 보육 프로그램의 마스터 데이터(공개명, 기간, 주관기관 등)를 등록하고, 프로그램에 조립되어 가동되는 개별 기능(모듈)들을 활성화/비활성화하며, 각 모듈 단위의 세부 비즈니스 룰 및 접근 정책을 조율하는 '프로그램 개요(Overview) 탭'의 요건을 정의합니다.

---

## 1. 목적
* 단일 보육 프로그램을 설정하고, 프로그램의 개별 성격에 맞추어 기능들을 유연하게 활성화(On/Off) 및 통제할 수 있는 제어판을 제공합니다.
* 비즈니스 참여 방식 및 일정 매칭 방식을 프로그램 전체 단위가 아닌 **개별 모듈 단위**로 최적화하여 구성할 수 있도록 지원합니다.

---

## 2. 이 문서가 다루는 범위
* 프로그램 기본 마스터 정보 입력 및 외부 연동 정보 (URL slug, 주관기관) 명세
* 프로그램 모듈 보드(Module Board)의 UI 구성 및 활성화 제어 규칙
* 모듈 단위의 참여/배정 방식(`participation_mode`) 및 보안 접근 권한 설정
* Supabase RLS 정책 및 설정 변경을 위한 RPC 함수 계약

---

## 3. 핵심 사용자
* **내부 운영자 (PROGRAM_OPERATOR)**: 담당 프로그램의 기본 정보를 수정하고, 진행 중인 모듈들의 실시간 진행률을 추적합니다.
* **프로그램 책임자 (PROGRAM_OWNER)**: 모집, 평가, 비즈니스 매칭 등 핵심 모듈의 동작 방식과 접근 권한을 최종 결정하고 설정합니다.

---

## 4. 정보 구조 (Information Architecture)

```
[프로그램 개요(Overview) 화면]
 ├── 1. 프로그램 기본 정보 수정 폼 (공개명, 내부명, 기간, URL slug, 담당자, 주관/협력기관)
 ├── 2. 게스트 접근 및 보안 정책 설정 (외부 로그인 인증 수단, 개인정보 마스킹 여부)
 └── 3. 프로그램 모듈 카드 보드
      ├── 모집 모듈 (RECRUITMENT): 활성 여부, 모집 기간, 참여 방식(OPEN_APPLICATION)
      ├── 서면평가 모듈 (DOC_REVIEW): 활성 여부, 평가표 폼, 참여 방식(REVIEWER_ASSIGNMENT)
      ├── 대면평가 모듈 (ONSITE_EVAL): 활성 여부, 시간표, 참여 방식(REVIEWER_ASSIGNMENT)
      ├── OT/출석 모듈 (ORIENTATION): 활성 여부, 참석 조건, 참여 방식(ADMIN_ONLY)
      ├── N:N 멘토링 모듈 (MENTORING): 활성 여부, 관계 설정, 참여 방식(MANUAL_ALLOCATION)
      ├── 1:1 비즈니스 매칭 모듈 (BUSINESS_MATCHING): 활성 여부, 참여 방식(AI_ALLOCATION / STARTUP_FCFS / MANUAL)
      ├── 데모데이 모듈 (DEMO_DAY): 활성 여부, 스코어보드, 참여 방식(REVIEWER_ASSIGNMENT)
      ├── 성과 KPI 모듈 (OUTCOMES): 활성 여부, 만족도 폼, 다운로더 세팅
      └── 커스텀 활동 모듈 (CUSTOM_ACTIVITY): 활성 여부, 회의록/사진 아카이브
```

---

## 5. 화면 구성

### 5.1 프로그램 마스터 개요 및 모듈 설정 UI Layout
```
┌────────────────────────────────────────────────────────────────────────┐
│ [탭: 프로그램 개요(Overview) ] [참가자 풀] [일정 타임라인] [성과 KPI]   │
├────────────────────────────────────────────────────────────────────────┤
│ ■ 프로그램 기본 마스터 정보                                             │
│  - 프로그램 공개명: [ A-STREAM 2026 글로벌 Accelerating      ]        │
│  - 프로그램 내부명: [ Y-Glow AC 3기 - 글로벌 트랙             ]        │
│  - 프로그램 기간:   [ 2026-03-01 ] ~ [ 2026-08-31 ]                    │
│  - 공개 URL Slug:   [ https://works.ynarcher.com/guest/a-stream-2026 ] │
│  - 주관/협력 기관:  [ 와이앤아처(주) ] / [ 서울창업허브 ]              │
│  - 담당 책임자:     [ 김민수 선임 심사역 x ] [ 심사역 매핑 + ]           │
├────────────────────────────────────────────────────────────────────────┤
│ ■ 프로그램 모듈 컨트롤 보드 (Module Configuration Board)                │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │ 모집 (RECRUITMENT)       │  │ 서면평가 (DOC_REVIEW)    │            │
│  │ 상태: 모집중 (RECRUITING)│  │ 상태: 대기 (DRAFT)       │            │
│  │ [x] 모듈 활성화          │  │ [x] 모듈 활성화          │            │
│  │ 참여방식: 공개모집       │  │ 참여방식: 심사위원 배정  │            │
│  │ [세부 설정 바로가기]     │  │ [세부 설정 바로가기]     │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │ 비즈니스 매칭 (MATCHING) │  │ N:N 멘토링 (MENTORING)   │            │
│  │ 상태: 대기 (DRAFT)       │  │ 상태: 대기 (DRAFT)       │            │
│  │ [ ] 모듈 활성화          │  │ [x] 모듈 활성화          │            │
│  │ 참여방식: [ AI_ALLOC v ] │  │ 참여방식: [ MANUAL  v ]  │            │
│  │ [세부 설정 바로가기]     │  │ [세부 설정 바로가기]     │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
│  [마스터 설정 저장]                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 주요 기능

### 6.1 프로그램 마스터 정보 관리
* **공개 URL Slug 자동 검증**: 외부 스타트업이 회원가입 없이 모집 신청을 하거나 전문가가 심사 화면에 진입할 때 사용하는 고유의 경로 식별자입니다. (중복 방지 및 영어/숫자/하이픈만 허용하는 클라이언트/서버 유효성 검사 필수)
* **담당자 멀티 매핑**: 프로그램 운영 전반을 통제하는 다수의 심사역을 칩(Chip) 형태로 등록합니다. 담당자로 매핑된 임직원은 AC 대시보드에서 본인 담당 프로그램으로 필터링할 수 있는 권한을 얻습니다.

### 6.2 모듈 활성화 및 상태 제어
* **On/Off 모듈 보드**: 토글 스위치나 체크박스를 이용해 특정 모듈을 활성화하거나 비활성화합니다.
* **종속성 비즈니스 룰**:
  * 서면평가(`DOC_REVIEW`) 또는 대면평가(`ONSITE_EVAL`) 모듈을 가동하려면 모집(`RECRUITMENT`) 모듈이 먼저 또는 함께 활성화되어 있어야 합니다. (평가 대상이 모집 신청서와 연결되므로)
  * 비활성화 처리된 모듈은 외부 GUEST 포털 메뉴 및 내부 상세 대시보드 탭 메뉴에서 완전히 비노출 처리됩니다.

### 6.3 모듈별 참여/배정 방식 (`participation_mode`)
기존의 프로그램 전체 고정 설정 방식에서 탈피하여, 각 업무 모듈의 작동 정책을 개별적으로 설정합니다.
* **OPEN_APPLICATION**: 누구나 공개 URL을 통해 접근하여 서류 제출 및 지원이 가능한 모드 (모집 모듈 기본값).
* **REVIEWER_ASSIGNMENT**: 운영자가 매핑한 심사위원/전문가가 배정된 기업을 채점하는 모드 (서면, 대면, 데모데이 평가 기본값).
* **ADMIN_ONLY**: 일정 등록 및 세션 처리, 출석부 관리를 내부 운영자만 독점 수행하며, 스타트업/전문가는 읽기 전용으로 열람만 하는 모드 (OT 및 공통 세션 기본값).
* **STARTUP_FCFS**: 스타트업 자율 선착순 예약 모드. 전문가가 열어둔 가용 시간 슬롯을 스타트업이 GUEST 포털에서 선착순 터치 예약하는 모드 (비즈니스 매칭 전용. N:N 멘토링은 관계 기반 운영이므로 선착순 예약을 사용하지 않습니다).
* **AI_ALLOCATION**: 선호도 지표 및 부스/시간대 제약조건을 고려한 매칭 배정 알고리즘을 가동하여 일정을 일괄 자동 확정하는 모드 (비즈니스 매칭 지원).
* **MANUAL_ALLOCATION**: 운영자가 관리자 화면에서 특정 전문가와 특정 기업을 직접 1:1 드래그 앤 드롭하여 배정 관계 및 시간을 수동 확정하는 모드 (멘토링, 비즈니스 매칭 지원).

---

## 7. 데이터 모델 (DB Schema)

### 7.1 programs (프로그램 테이블)
```sql
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,              -- 프로그램 공개명
    internal_title VARCHAR(255) NOT NULL,     -- 내부 관리용 명칭
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 프로그램 대표 상태(제안/운영 단계 공용)
    proposal_start_date DATE,                 -- 제안 기간 시작일(제안서 작성~발표)
    proposal_end_date DATE,                   -- 제안 기간 종료일
    start_date DATE NOT NULL,                 -- 운영 기간 시작일(실제 행사 관리)
    end_date DATE NOT NULL,                   -- 운영 기간 종료일
    slug VARCHAR(100) UNIQUE NOT NULL,        -- 공개 URL 경로명
    host_organization VARCHAR(255),           -- 주관 기관
    partner_organization VARCHAR(255),        -- 협력 기관
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 7.2 program_modules (프로그램 모듈 설정 테이블)
```sql
CREATE TABLE program_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    module_type VARCHAR(50) NOT NULL,          -- RECRUITMENT, MENTORING 등
    enabled BOOLEAN NOT NULL DEFAULT FALSE,     -- 모듈 활성화 여부
    participation_mode VARCHAR(50) NOT NULL,   -- AI_ALLOCATION, STARTUP_FCFS 등
    manager_id UUID,                           -- 모듈별 담당 심사역 UUID (MANAGEMENT 임직원 마스터 연동)
    settings JSONB DEFAULT '{}'::jsonb,        -- 모듈별 상세 커스텀 JSON (예산, 마감 시각 등)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(program_id, module_type)
);
```

---

## 8. 상태 모델

* **프로그램 상태(단계 이원화)**: 프로그램 대표 상태는 제안 단계와 운영 단계로 나뉘며, 단계별로 별도의 기간 필드를 가집니다. 등록/편집 폼도 두 섹션으로 분리해 현재 단계에 해당하는 상태만 선택할 수 있습니다.
  * 제안 단계: `PROPOSED`(제안) -> 선정 시 운영 단계로 전환 / 실패 시 `NOT_SELECTED`(미선정, 종결). 기간은 `proposal_start_date` ~ `proposal_end_date`(제안서 작성~발표 기간).
  * 운영 단계: `DRAFT`(준비) -> `OPERATING`(진행중) -> `FINISHED`(종료), 중단 시 `CANCELLED`(취소). 기간은 `start_date` ~ `end_date`(실제 행사 관리 기간).
* **프로그램 모듈 상태**: 개별 모듈은 프로그램 전체 상태와 무관하게 모듈 자체의 라이프사이클을 가집니다.
  * `DRAFT` (대기/준비) -> `OPEN` (모집 개시, 평가 오픈, 예약 오픈 등 실시간 가동) -> `CLOSED` (모집 마감, 평가 마감 등 외부 게스트 제어 차단)

---

## 9. 권한/RLS

* **임직원 및 운영자 (PROGRAM_OWNER, PROGRAM_OPERATOR)**:
  * 본인이 소속된 프로그램의 `programs` 및 `program_modules` 레코드에 대해 읽기/쓰기(`SELECT`, `INSERT`, `UPDATE`) 권한을 가집니다.
* **외부 참여자 (guest_startup, guest_expert 등)**:
  * 프로그램 설정 및 모듈 카드 보드에 대해 접근 및 조회 권한이 원천 차단됩니다. (GUEST API 호출 시 RLS 위반 에러 반환)

---

## 10. API/RPC/서버 액션

* **함수명**: `fn_toggle_program_module(p_program_id uuid, p_module_type text, p_enabled boolean)`
  * **설명**: 특정 프로그램 내에서 모듈 활성화 여부를 전환하는 서버 RPC 함수입니다.
  * **검증 규칙**:
    * 호출한 세션 사용자의 권한이 `PROGRAM_OWNER` 또는 `internal_admin`인지 검증합니다.
    * 모듈 비활성화 시, 해당 모듈 내에 활성화된 세션 또는 외부 게스트의 미완료 결과(`Result`)가 존재할 경우 경고 및 비활성화 잠금 처리를 작동합니다. (파괴적 수정 방지)
    * 변경 사항을 전사 보안 로그(`system_logs` 및 `audit_logs`)에 기록합니다.

---

## 11. GUEST 연동
* GUEST 앱은 주기적으로 `program_modules`의 `enabled` 상태를 fetch하여, 특정 모듈이 Off(비활성화)되면 모바일 GUEST 포털 메뉴 내의 해당 탭(예: 멘토링 예약, 만족도 작성 등)을 즉시 마스킹 및 메뉴 진입 불가 처리합니다.

---

## 12. OFFICE/ADMIN/타 워크스페이스 연동
* **임직원 마스터 연동**: 프로그램 책임자로 등록되는 담당 임직원은 `MANAGEMENT 임직원 마스터` 테이블의 UUID와 매핑 검증을 거칩니다. 참가 스타트업/전문가는 `NETWORKS` 마스터와 매핑합니다.

---

## 13. 예외/오류/운영 리스크
* **모듈 비활성화 시 데이터 유실**: 운영 중 실수로 모듈을 비활성화했을 때 관련 세션 및 배정 정보가 영구 삭제되지 않도록, 모듈 On/Off는 물리적 삭제(`DELETE`)가 아닌 `enabled` 플래그의 논리적 업데이트(`UPDATE`)로 처리하고, 비활성화 시 경고 다이얼로그 팝업을 활성화하여 사유 입력을 받습니다.

---

## 14. 완료 기준 (Definition of Done)
1. 프로그램 상세 정보를 수정하고 저장했을 때 DB의 `programs` 테이블에 정확히 반영되는가?
2. 모듈 스위치를 토글하고 저장했을 때 `program_modules` 테이블의 `enabled`와 `participation_mode` 데이터가 갱신되는가?
3. 모듈별 배정 모드(`participation_mode`)가 다르게 설정 가능한 구조로 UI가 작동하는가?
4. 비활성화된 모듈이 외부 게스트용 API 조회 데이터에서 정상 제외 처리되는가?

---

## 15. 테스트 기준
1. **모듈 토글 정합성 테스트**: 관리자 화면에서 '비즈니스 매칭' 모듈을 비활성화한 후, 외부 게스트용 API를 모킹 호출하여 매칭 모듈 데이터가 노출되지 않음을 검증합니다.
2. **권한 위반 차단 테스트**: `guest_expert` 등급의 계정 토큰으로 `fn_toggle_program_module` 함수를 직접 호출하는 펜테스트를 가동하여, 403 Forbidden 에러가 정상 리턴되는지 확인합니다.
