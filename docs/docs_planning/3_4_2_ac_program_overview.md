# [3-4-2] AC 프로그램 개요 및 모듈 설정 기획서

본 문서는 보육 프로그램의 마스터 데이터(공개명, 기간, 주관기관 등)를 등록하고, 프로그램에 조립되어 가동되는 개별 기능(모듈)을 **템플릿에서 인스턴스로 꺼내 배치**하며, 각 인스턴스 단위의 세부 비즈니스 룰 및 접근 정책을 조율하는 '프로그램 개요(Overview) 탭'의 요건을 정의합니다.

---

## 1. 목적
* 단일 보육 프로그램을 설정하고, 프로그램의 개별 성격에 맞추어 기능(모듈)을 유연하게 조립·통제할 수 있는 제어판을 제공합니다.
* 9종의 기능을 **모듈 템플릿(정의)**으로 두고, 프로그램에는 그 템플릿에서 파생한 **운영 모듈 인스턴스**를 배치합니다. 동일 템플릿을 여러 번 꺼내 쓸 수 있어 "1차 멘토링", "후속 멘토링"처럼 회차·성격이 다른 운영을 각각 독립 관리합니다.
* 비즈니스 참여 방식 및 일정 매칭 방식을 프로그램 전체 단위가 아닌 **개별 모듈 인스턴스 단위**로 최적화하여 구성할 수 있도록 지원합니다.

---

## 2. 이 문서가 다루는 범위
* 프로그램 기본 마스터 정보 입력 및 외부 연동 정보 (URL slug, 주관기관) 명세
* 프로그램 모듈 보드(Module Board)의 UI 구성 및 **2단계 모듈 추가 마법사(템플릿 선택 → 인스턴스 세팅)** 규칙
* 모듈 인스턴스 단위의 이름·담당자·일정·공유 범위·참여/배정 방식(`participation_mode`) 및 보안 접근 정책 설정
* Supabase RLS 정책 및 인스턴스 생성/수정을 위한 RPC 함수 계약

> [!NOTE]
> 성과/KPI(`OUTCOMES`) 모듈은 프로그램 전체를 교차 집계하는 성격이므로 다중 인스턴스 대상에서 제외하며, 프로그램당 1개만 두는 단일 인스턴스로 유지합니다. 본 문서의 인스턴스 다중화 규칙은 나머지 8종에 적용됩니다.

---

## 3. 핵심 사용자
* **내부 운영자 (PROGRAM_OPERATOR)**: 담당 프로그램의 기본 정보를 수정하고, 배치한 모듈 인스턴스들의 실시간 진행률을 추적합니다.
* **프로그램 책임자 (PROGRAM_OWNER)**: 모집, 평가, 비즈니스 매칭 등 핵심 모듈 인스턴스의 이름·담당자·동작 방식·접근 권한을 최종 결정하고 설정합니다.

---

## 4. 정보 구조 (Information Architecture)

```
[프로그램 개요(Overview) 화면]
 ├── 1. 프로그램 기본 정보 수정 폼 (공개명, 내부명, 기간, URL slug, 담당자, 주관/협력기관)
 ├── 2. 게스트 접근 및 보안 정책 설정 (외부 로그인 인증 수단, 개인정보 마스킹 여부)
 └── 3. 운영 모듈 보드 (배치된 인스턴스 목록 + '모듈 추가' 2단계 마법사)
      · 각 인스턴스: 모듈명 + 파생 템플릿 배지 + 상태 + 공유범위 + 기간 + 담당자(다중)
      · 배치 가능한 템플릿(9종 중 8종, OUTCOMES 제외):
        ├── 모집 (RECRUITMENT): 참여 방식 OPEN_APPLICATION
        ├── 서면평가 (DOC_REVIEW): 참여 방식 REVIEWER_ASSIGNMENT
        ├── 대면평가 (ONSITE_EVAL): 참여 방식 REVIEWER_ASSIGNMENT
        ├── OT/공통세션 (ORIENTATION): 참여 방식 ADMIN_ONLY
        ├── N:N 멘토링 (MENTORING): 참여 방식 MANUAL_ALLOCATION
        ├── 1:1 비즈니스 매칭 (BUSINESS_MATCHING): 참여 방식 STARTUP_FCFS / AI_ALLOCATION / MANUAL
        ├── 데모데이 (DEMO_DAY): 참여 방식 REVIEWER_ASSIGNMENT
        └── 커스텀 활동 (CUSTOM_ACTIVITY): 참여 방식 ADMIN_ONLY
      · 단일 인스턴스 모듈(별도 취급): 성과/KPI (OUTCOMES)
```

> [!NOTE]
> **템플릿과 인스턴스의 구분**: `module_type`(예: `MENTORING`)은 코드에 고정된 기능 정의(템플릿)이며, 프로그램에 실제로 배치되는 것은 그 템플릿에서 파생한 인스턴스(`program_modules` 행)입니다. 인스턴스는 사업별 자율 이름(모듈명)을 가지되, 어느 템플릿에서 나왔는지 배지로 항상 표시합니다.

---

## 5. 화면 구성

### 5.1 프로그램 마스터 개요 및 운영 모듈 보드 Layout
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
│ ■ 운영 모듈 보드                            [목록][칸반][간트] [크게보기] │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │ 1차 멘토링           〔N:N 멘토링〕 [진행] [비공개]   ✎ ✕ │          │
│  │ 상담일지 기반 초기 진단 멘토링                             │          │
│  │ 2026-03-10 ~ 2026-04-20 · 담당 김민수, 박서준             │          │
│  └──────────────────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │ 후속 멘토링          〔N:N 멘토링〕 [준비] [비공개]   ✎ ✕ │          │
│  │ IR 집중 후속 멘토링                                        │          │
│  │ 2026-06-01 ~ 2026-07-15 · 담당 박서준                     │          │
│  └──────────────────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │           + 모듈 추가 (템플릿에서 새 인스턴스 배치)         │          │
│  └──────────────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 모듈 추가 2단계 마법사
```
[1단계] 템플릿 선택                    [2단계] 인스턴스 세팅
┌─────────────────────────┐          ┌───────────────────────────────────┐
│ ○ 모집/신청서            │   →      │ 모듈명* [ 1차 멘토링            ]  │ 템플릿: N:N 멘토링
│ ● N:N 멘토링             │          │   └ (동일 프로그램 내 모듈명 중복 불가) │
│ ○ 1:1 비즈니스 매칭       │          │ 상태   [ 준비 ▾ ]  공유 [ 비공개 ▾ ] │
│ ○ 데모데이               │          │ 시작일 [ ____ ]  종료일 [ ____ ]    │
│ ○ 커스텀 활동            │          │ 담당자 [◉김민수][◉박서준] [＋추가]  │ ← 프로그램 담당자 풀
│ ...                     │          │ 설명   [                        ]  │
└─────────────────────────┘          └───────────────────────────────────┘
   (템플릿 1개 선택)                    [취소]                    [추가]
```

> [!NOTE]
> 2단계 세팅 폼과 기존 인스턴스의 '설정(✎)' 편집 폼은 필드 구성이 동일하므로 동일 컴포넌트를 추가/편집 겸용으로 사용합니다. 배정 방식(`participation_mode`)은 템플릿 기본값으로 자동 적용되며, 비즈니스 매칭 인스턴스에서만 선택형으로 노출됩니다.

---

## 6. 주요 기능

### 6.1 프로그램 마스터 정보 관리
* **공개 URL Slug 자동 검증**: 외부 스타트업이 회원가입 없이 모집 신청을 하거나 전문가가 심사 화면에 진입할 때 사용하는 고유의 경로 식별자입니다. (중복 방지 및 영어/숫자/하이픈만 허용하는 클라이언트/서버 유효성 검사 필수)
* **담당자 멀티 매핑**: 프로그램 운영 전반을 통제하는 다수의 심사역을 칩(Chip) 형태로 등록합니다. 담당자로 매핑된 임직원은 AC 대시보드에서 본인 담당 프로그램으로 필터링할 수 있는 권한을 얻으며, 이 풀은 각 모듈 인스턴스의 담당자 선택 후보가 됩니다.

### 6.2 운영 모듈 인스턴스 배치 및 관리
* **템플릿에서 인스턴스 배치**: '모듈 추가' 마법사로 템플릿(8종) 하나를 고른 뒤 세팅을 입력하면 `program_modules`에 새 인스턴스 1건이 생성됩니다. 동일 템플릿을 여러 번 배치할 수 있어 회차·성격이 다른 운영을 각각 독립 관리합니다.
* **모듈명(자율 입력) 및 템플릿 배지**: 인스턴스 이름은 사업별로 자유롭게 짓되(예: "1차 멘토링"), 카드에는 파생 템플릿을 배지로 항상 함께 표시합니다. 모듈명 미입력 시 템플릿 라벨을 폴백으로 사용합니다.
  * **모듈명 중복 금지**: 동일 프로그램 내에서 모듈명은 유일해야 합니다(앞뒤 공백 제거 및 대소문자 무시로 정규화 비교). 마법사에서 실시간 검증하고, 서버에서 유니크 인덱스로 최종 강제합니다.
* **인스턴스 세팅**: 각 인스턴스는 `상태 · 공유 범위(visibility) · 시작일 · 종료일 · 담당자(다중) · 설명(메모)`을 개별 보유합니다.
  * **담당자 다중 지정**: 해당 프로그램의 담당자 풀(`program_managers`)에 존재하는 임직원 중에서 다중 선택합니다. 풀 밖의 사용자는 선택할 수 없도록 서버에서 강제합니다(대표 담당자 구분 없이 전원 동등).
* **인스턴스 끄기(soft off)**: 카드의 '끄기(✕)'는 물리 삭제가 아니라 `enabled` 플래그를 내리는 논리적 비활성화입니다. 데이터는 보존되며 GUEST 및 상세 탭에서 비노출 처리됩니다.
* **종속성 비즈니스 룰**: 서면평가(`DOC_REVIEW`)·대면평가(`ONSITE_EVAL`) 인스턴스는 모집 신청서와 연결되므로, 프로그램에 활성화된 모집(`RECRUITMENT`) 인스턴스가 최소 1개 존재하는 것을 전제로 운영합니다.

### 6.3 모듈별 참여/배정 방식 (`participation_mode`)
기존의 프로그램 전체 고정 설정 방식에서 탈피하여, 각 모듈 인스턴스의 작동 정책을 개별적으로 설정합니다. 값은 템플릿 기본값으로 자동 지정되며, 비즈니스 매칭만 운영자 선택형입니다.
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

### 7.2 program_modules (운영 모듈 인스턴스 테이블)
```sql
CREATE TABLE program_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    module_type module_type NOT NULL,          -- 파생 템플릿(RECRUITMENT, MENTORING 등)
    title VARCHAR(120),                        -- 모듈명(자율 입력). NULL이면 템플릿 라벨로 폴백
    enabled BOOLEAN NOT NULL DEFAULT TRUE,      -- 인스턴스 논리적 활성 플래그(끄기=soft off)
    status module_status NOT NULL DEFAULT 'DRAFT',   -- DRAFT/OPEN/CLOSED/CANCELLED
    participation_mode participation_mode,     -- 템플릿 기본값 자동(매칭만 선택형)
    visibility module_visibility NOT NULL DEFAULT 'INTERNAL_ONLY', -- 공유 범위
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,-- 일정(start_date/end_date)·설명(memo) 등
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    -- (구) UNIQUE(program_id, module_type) 제거 — 동일 템플릿 다중 인스턴스 허용
);

-- 모듈명은 프로그램 내에서 유일(정규화: 공백 제거 + 소문자). NULL 제목은 제약 대상 아님.
CREATE UNIQUE INDEX uq_program_modules_title
    ON program_modules (program_id, lower(btrim(title)))
    WHERE title IS NOT NULL;

-- OUTCOMES는 프로그램당 1개만 허용(단일 인스턴스 유지).
CREATE UNIQUE INDEX uq_program_modules_outcomes_singleton
    ON program_modules (program_id)
    WHERE module_type = 'OUTCOMES';
```

### 7.3 program_module_assignees (모듈 인스턴스 담당자 — 다중)
```sql
CREATE TABLE program_module_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_module_id UUID NOT NULL REFERENCES program_modules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id), -- 반드시 해당 프로그램 담당자 풀(program_managers)에 존재
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(program_module_id, user_id)
);
```
* `user_id`가 해당 인스턴스가 속한 프로그램의 `program_managers`에 존재하는지 여부는 쓰기 RPC에서 강제 검증합니다(풀 밖 사용자 배정 차단).
* 기존 `program_modules.manager_id`(단일 담당 심사역) 컬럼은 본 다중 담당자 테이블로 대체하며 폐기합니다.

---

## 8. 상태 모델

* **프로그램 상태(단계 이원화)**: 프로그램 대표 상태는 제안 단계와 운영 단계로 나뉘며, 단계별로 별도의 기간 필드를 가집니다. 등록/편집 폼도 두 섹션으로 분리해 현재 단계에 해당하는 상태만 선택할 수 있습니다.
  * 제안 단계: `PROPOSED`(제안) -> 선정 시 운영 단계로 전환 / 실패 시 `NOT_SELECTED`(미선정, 종결). 기간은 `proposal_start_date` ~ `proposal_end_date`(제안서 작성~발표 기간).
  * 운영 단계: `DRAFT`(준비) -> `OPERATING`(진행중) -> `FINISHED`(종료), 중단 시 `CANCELLED`(취소). 기간은 `start_date` ~ `end_date`(실제 행사 관리 기간).
  * **기간 제약**: 제안 기간과 운영 기간은 서로 겹칠 수 없습니다(양쪽 모두 시작·종료일이 입력된 경우 등록/편집 시 검증). 운영 모듈 인스턴스의 기간(`program_modules.settings.start_date`~`end_date`)은 반드시 제안 기간 또는 운영 기간 중 한 구간 안에 완전히 포함되어야 하며, 인스턴스 설정 저장 시 검증합니다.
* **모듈 인스턴스 상태**: 각 인스턴스는 프로그램 전체 상태 및 다른 인스턴스와 무관하게 자체 라이프사이클을 가집니다.
  * `DRAFT`(준비) -> `OPEN`(모집 개시, 평가 오픈, 예약 오픈 등 실시간 가동) -> `CLOSED`(모집 마감, 평가 마감 등 외부 게스트 제어 차단), 중단 시 `CANCELLED`(취소).
  * `enabled` 플래그는 상태와 별개 축으로, 인스턴스 자체의 노출/비노출(soft off)을 제어합니다.

---

## 9. 권한/RLS

* **임직원 및 운영자 (PROGRAM_OWNER, PROGRAM_OPERATOR)**:
  * 본인이 소속된 프로그램의 `programs`, `program_modules`, `program_module_assignees` 레코드에 대해 읽기/쓰기(`SELECT`, `INSERT`, `UPDATE`) 권한을 가집니다.
* **외부 참여자 (guest_startup, guest_expert 등)**:
  * 프로그램 설정 및 운영 모듈 보드에 대해 접근 및 조회 권한이 원천 차단됩니다. (GUEST API 호출 시 RLS 위반 에러 반환)
  * GUEST 포털에는 `visibility`가 `GUEST_ONLY`/`PUBLIC`이고 `enabled`가 참인 인스턴스의 운영 데이터만 노출됩니다.

---

## 10. API/RPC/서버 액션

* **함수명**: `set_program_module(p_program_id uuid, p_module_id uuid, p_module_type text, p_title text, p_status text, p_visibility text, p_participation_mode text, p_settings jsonb, p_assignee_user_ids uuid[])`
  * **설명**: 모듈 인스턴스 1건과 담당자 목록을 원자적으로 생성/수정하는 서버 RPC입니다(`p_module_id`가 NULL이면 신규 생성, 있으면 수정). 담당자는 전량 교체 방식으로 반영합니다.
  * **검증 규칙**:
    * 호출한 세션 사용자의 권한이 `PROGRAM_OWNER` 또는 `internal_admin`인지 검증합니다.
    * **모듈명 유일성**: 동일 프로그램 내 정규화된 `title` 중복 시 거부합니다.
    * **담당자 풀 검증**: `p_assignee_user_ids`의 모든 사용자가 해당 프로그램의 `program_managers`에 존재하는지 검증하고, 미존재 시 거부합니다.
    * **기간 검증**: `settings`의 기간이 제안 기간 또는 운영 기간 한 구간에 완전히 포함되는지 검증합니다.
    * **OUTCOMES 단일성**: `OUTCOMES` 신규 생성 시 이미 존재하면 거부합니다.
* **함수명**: `fn_toggle_program_module(p_module_id uuid, p_enabled boolean)`
  * **설명**: 특정 인스턴스의 `enabled` 플래그를 전환(soft off/on)합니다.
  * **검증 규칙**: 비활성화 시 해당 인스턴스에 미완료 결과(`Result`)가 존재하면 경고 및 잠금 처리하며, 변경 사항을 보안 로그(`system_logs`, `audit_logs`)에 기록합니다. 물리 삭제는 수행하지 않습니다.

---

## 11. GUEST 연동
* GUEST 앱은 주기적으로 `program_modules`의 `enabled` 및 `visibility` 상태를 fetch하여, 인스턴스가 Off(비활성화)되거나 공유 범위에서 벗어나면 모바일 GUEST 포털 메뉴 내의 해당 항목(예: 멘토링 예약, 만족도 작성 등)을 즉시 마스킹 및 진입 불가 처리합니다.
* 인스턴스별로 이름과 기간이 다르므로, GUEST 포털 메뉴는 템플릿명이 아니라 **인스턴스 모듈명**으로 노출합니다(예: "1차 멘토링", "후속 멘토링").

---

## 12. OFFICE/ADMIN/타 워크스페이스 연동
* **임직원 마스터 연동**: 프로그램 책임자 및 모듈 인스턴스 담당자로 등록되는 임직원은 `MANAGEMENT 임직원 마스터` 테이블의 UUID와 매핑 검증을 거칩니다. 참가 스타트업/전문가는 `NETWORKS` 마스터와 매핑합니다.

---

## 13. 예외/오류/운영 리스크
* **인스턴스 비활성화 시 데이터 유실 방지**: 운영 중 실수로 인스턴스를 비활성화했을 때 관련 세션 및 배정 정보가 영구 삭제되지 않도록, 모듈 On/Off는 물리적 삭제(`DELETE`)가 아닌 `enabled` 플래그의 논리적 업데이트(`UPDATE`)로 처리하고, 비활성화 시 경고 다이얼로그를 노출합니다.
* **모듈명 충돌**: 동일 프로그램에서 같은 모듈명을 배치하려 하면 마법사 단계에서 즉시 차단하고, 서버 유니크 인덱스로 최종 방어합니다.
* **담당자 풀 이탈**: 프로그램 담당자 풀에서 제외된 임직원이 특정 인스턴스 담당자로 남아 있을 수 있으므로, 담당자 풀 재편(`set_program_staffing`) 시 잔여 배정을 정리하거나 경고하는 후속 정합성 규칙을 둡니다.

---

## 14. 완료 기준 (Definition of Done)
1. 프로그램 상세 정보를 수정하고 저장했을 때 DB의 `programs` 테이블에 정확히 반영되는가?
2. '모듈 추가' 2단계 마법사로 동일 템플릿을 2회 배치했을 때 `program_modules`에 서로 다른 인스턴스 2건이 생성되는가?
3. 인스턴스 세팅(모듈명·상태·공유범위·기간·담당자·설명)이 저장되고, 담당자는 `program_module_assignees`에 다중으로 반영되는가?
4. 동일 프로그램 내 모듈명 중복 저장이 마법사·서버 양쪽에서 차단되는가?
5. 프로그램 담당자 풀 밖의 사용자를 인스턴스 담당자로 지정하려는 요청이 서버에서 거부되는가?
6. 비활성화된 인스턴스가 외부 게스트용 API 조회 데이터에서 정상 제외 처리되는가?

---

## 15. 테스트 기준
1. **다중 인스턴스 정합성 테스트**: 동일 프로그램에 `MENTORING` 인스턴스 2건("1차 멘토링", "후속 멘토링")을 만들고, 각 인스턴스의 하위 데이터(상담일지 등)가 `program_module_id`로 분리 저장·조회되는지 검증합니다.
2. **모듈명 중복 차단 테스트**: 이미 존재하는 모듈명(공백·대소문자만 다른 변형 포함)으로 인스턴스 생성 시 서버가 거부하는지 검증합니다.
3. **담당자 풀 검증 테스트**: 담당자 풀에 없는 `user_id`를 `set_program_module`에 전달하여 거부(에러 리턴)되는지 검증합니다.
4. **권한 위반 차단 테스트**: `guest_expert` 등급의 계정 토큰으로 `set_program_module`/`fn_toggle_program_module`을 직접 호출하는 펜테스트를 가동하여 403 Forbidden 에러가 정상 리턴되는지 확인합니다.
