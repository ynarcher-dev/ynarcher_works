# Gemini 작업 지시서: matching 레퍼런스 기반 AC/Program First 기획 문서 보강 가이드

본 문서는 Gemini에게 전달할 작업 지시서이다. 목적은 기존 완성 서비스 레퍼런스인 `C:\Users\Admin\Documents\GitHub\.references\matching`의 제품 구조와 운영 감각을 현재 `ynarcher_works` 문서 체계에 반영하도록 지시하는 것이다.

현재 `docs/docs_planning/3_4_*` 문서들은 AC 워크스페이스의 큰 흐름은 담고 있으나, 기존 `matching` 서비스가 실제로 갖고 있던 핵심 제품성인 **Program First 운영 구조, 모집-평가-선발-멘토링-비즈니스 매칭-데모데이-성과 리포트의 모듈형 연결, 외부 참여자 포털, 평가 엔진 재사용, 상담/출석/노쇼/자료/알림/다운로드 운영 디테일**이 충분히 녹아 있지 않다.

Gemini는 아래 지시를 기준으로 문서를 단위별로 나누어 보강한다.

---

## 0. Gemini에게 전달할 최상위 목표

너는 현재 `ynarcher_works`의 AC 기획 문서를 기존 완성 서비스 `matching`의 제품 경험에 맞게 재정렬해야 한다.

단, 기존 `matching` 코드를 그대로 이식하는 문서를 만들지 말고, 다음 원칙을 지켜라.

1. `matching`의 **제품 구조, 업무 흐름, 운영 기능, 사용자 경험**은 최대한 보존한다.
2. 현재 `ynarcher_works`의 **WORKS 통합 앱, HUB, ADMIN, AC, GUEST, 권한/RLS, 디자인 시스템** 구조에 맞게 용어와 경계를 재정렬한다.
3. 현재 `3_4` 문서에 이미 들어간 내용 중 맞는 것은 살리되, `matching` 기준으로 부족하거나 잘못 추상화된 부분은 과감히 보강한다.
4. AC 문서의 중심 개념을 단순 "보육 사업 관리"가 아니라 **Program First 기반의 모듈형 스타트업 프로그램 운영 플랫폼**으로 바꾼다.
5. 기획 문서는 개발자가 실제 DB, 라우트, 화면, 권한, RLS, API 계약, 테스트 케이스를 도출할 수 있을 정도로 구체화한다.

---

## 1. 반드시 먼저 읽어야 할 레퍼런스

### 1.1 기존 완성 서비스 레퍼런스

아래 경로를 우선 기준으로 삼는다.

```txt
C:\Users\Admin\Documents\GitHub\.references\matching
```

특히 다음 문서를 우선 읽고 반영한다.

```txt
C:\Users\Admin\Documents\GitHub\.references\matching\docs\product\program_platform_overview.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\product\overview.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\architecture\db_schema.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\architecture\security_transactions.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\README.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\page_admin_event_detail.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\page_admin_ai_allocation.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\page_startup_booking.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\page_expert_dashboard.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\business_matching\page_survey_customization.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\document_review\document_review_module_spec.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\onsite_evaluation\onsite_evaluation_module_spec.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\mentoring\mentoring_module_spec.md
C:\Users\Admin\Documents\GitHub\.references\matching\docs\modules\demo_day\demo_day_module_spec.md
```

추가로 아래 구현 파일과 마이그레이션은 실제 기능의 단서를 준다. 필요한 경우 확인한다.

```txt
C:\Users\Admin\Documents\GitHub\.references\matching\src\components\admin
C:\Users\Admin\Documents\GitHub\.references\matching\src\components\expert
C:\Users\Admin\Documents\GitHub\.references\matching\src\components\startup
C:\Users\Admin\Documents\GitHub\.references\matching\src\lib
C:\Users\Admin\Documents\GitHub\.references\matching\supabase\migrations
```

### 1.2 현재 works 문서

아래 문서들을 수정/보강 대상으로 삼는다.

```txt
docs/docs_planning/3_4_workspace_ac.md
docs/docs_planning/3_4_1_ac_dashboard.md
docs/docs_planning/3_4_2_ac_overview.md
docs/docs_planning/3_4_3_ac_startups.md
docs/docs_planning/3_4_4_ac_mentoring.md
docs/docs_planning/3_4_5_ac_milestones.md
docs/docs_planning/3_4_6_ac_evaluations.md
docs/docs_planning/3_4_7_ac_custom_events.md
docs/docs_planning/3_9_workspace_guest.md
docs/docs_planning/1_roles_permissions.md
docs/docs_planning/2_business_scenarios.md
docs/docs_dev/2_auth_permissions_architecture.md
docs/docs_dev/3_database_rls_policy_matrix.md
docs/docs_dev/6_api_contracts.md
```

필요하면 아래 문서도 함께 보강한다.

```txt
docs/docs_master/0_service_spec_draft.md
docs/docs_planning/readme_planning.md
docs/docs_dev/readme_dev.md
docs/docs_design/2_app_layout_navigation.md
docs/docs_design/5_component_spec_rules.md
```

---

## 2. 현재 문서의 핵심 문제 진단

Gemini는 아래 진단을 전제로 작업한다.

### 2.1 반영된 것

현재 `3_4` 문서에는 다음 요소가 일부 반영되어 있다.

1. AC 사업/프로그램 단위 개념
2. 참여 스타트업 매핑
3. 서면/대면 평가에 가까운 심사 분과 개념
4. 멘토링 예약 모드
5. 마일스톤/일정 관리
6. Guest 모바일 화면 연동
7. 피드백/만족도
8. 커스텀 활동 기록

### 2.2 부족한 것

그러나 기존 `matching` 기준으로는 아래가 크게 부족하다.

1. **Program First 정보 구조가 약함**
   - 현재 문서는 Program을 말하지만 실제 중심축은 `사업 탭`과 `마일스톤`에 가깝다.
   - `matching`의 핵심은 `Program -> Program Module -> Session/Target/Assignment/Result` 구조다.

2. **기업 모집 랜딩/신청 DB가 없음**
   - 공개 모집 페이지, 신청서 구성, 개인정보 동의, 파일 제출, 지원 상태, 모집 랜딩 공개 URL이 현재 AC 문서에 충분히 없다.
   - `matching`에서는 모집이 Program 데이터의 시작점이다.

3. **평가 엔진이 추상적이다**
   - 현재 문서는 "심사 분과" 정도로 표현하지만, 실제 서비스는 동적 평가표 엔진을 중심으로 한다.
   - `evaluation_forms`, `evaluation_criteria`, `evaluation_targets`, `evaluation_assignments`, `evaluation_submissions`, `evaluation_answers` 같은 재사용 코어가 필요하다.
   - 서면평가, 대면평가, 데모데이는 같은 평가 엔진을 재사용하고, 모듈별 시간표/세션 레이어만 다르다는 점을 명확히 해야 한다.

4. **멘토링과 비즈니스 매칭이 섞여 있다**
   - 현재 `3_4_4_ac_mentoring.md`는 멘토링 스케줄러 중심이다.
   - `matching` 기준에서는 멘토링은 N:N 관계와 회차 기록, 비즈니스 매칭은 1:1 슬롯/예약/AI 배정/출석/상담일지/노쇼/다운로드가 핵심이다.
   - 두 모듈은 분리되어야 한다.

5. **기존 비즈니스 매칭 서비스의 핵심 자산이 약함**
   - 슬롯 자동 생성
   - 식사시간/중단구간 반영
   - 스타트업 자율 예약
   - 관리자/AI 배치
   - 상담 테이블
   - 노쇼 대체 매칭
   - 상담 시작/종료 상태
   - 상담일지
   - 출석 상태
   - 상담 결과/만족도/엑셀 다운로드
   - 알림 설정/발송 로그

6. **외부 참여자 경험이 약함**
   - 스타트업 포털은 "예약 콘솔" 수준이 아니라 Program 통합 타임라인, 자료 제출실, 신청/평가/멘토링/매칭/데모데이 할 일 화면이어야 한다.
   - 전문가 화면은 Split View 기반으로 기업 자료와 평가/상담 폼을 한 화면에서 처리해야 한다.

7. **성과 지표 허브가 약함**
   - Program 단위 KPI, 모듈별 성과, 기업별 누적 타임라인, 맞춤형 통합 엑셀 다운로더가 핵심인데 현재 문서에서는 부수적이다.

8. **운영/보안 디테일이 약함**
   - 상태 전이는 RPC 중심으로 검증되어야 한다.
   - RLS는 Program/Module/Assignment/Participant scope를 반영해야 한다.
   - 외부 참여자는 WORKS 내부 앱이 아니라 GUEST 경유로 자기 scope만 접근해야 한다.

---

## 3. 문서 구조 재편 방향

현재 `3_4_1`부터 `3_4_7`까지만으로는 `matching`의 기능 단위를 담기 어렵다. Gemini는 아래 둘 중 하나를 선택해 작업할 수 있다.

### 3.1 권장안: `3_4` 문서 체계 확장

기존 7개 문서를 유지하되, AC 하위 문서를 늘린다.

권장 문서 구조:

```txt
3_4_workspace_ac.md                      # AC Program First 총괄 인덱스
3_4_1_ac_dashboard.md                    # AC/Program 대시보드 및 KPI 요약
3_4_2_ac_program_overview.md             # Program 기본 정보, 모듈 보드, 설정
3_4_3_ac_recruitment.md                  # 기업 모집 랜딩, 신청서, 신청 DB, 제출 자료
3_4_4_ac_participant_pool.md             # Program 참가자 풀: 스타트업/전문가/운영자
3_4_5_ac_evaluation_engine.md            # 공통 평가 엔진
3_4_6_ac_document_review.md              # 서면평가
3_4_7_ac_onsite_evaluation.md            # 대면평가
3_4_8_ac_orientation_sessions.md         # OT/대규모 피칭/출석
3_4_9_ac_mentoring.md                    # N:N 멘토링 관계 및 회차 기록
3_4_10_ac_business_matching.md           # 1:1 비즈니스 매칭, 슬롯, 예약, AI 배정
3_4_11_ac_demo_day.md                    # 데모데이, 스코어보드, 투자자 관심
3_4_12_ac_program_timeline.md            # 통합 타임라인, 충돌, 이동 버퍼, ICS
3_4_13_ac_outcomes_kpi_export.md         # 성과 지표 허브, 통합 다운로더
3_4_14_ac_custom_activities.md           # 커스텀 활동/회의록/사진/첨부
```

현재 존재하는 파일명을 반드시 유지해야 한다면, 위 내용을 기존 파일에 흡수하되 문서가 너무 커지는 것을 피하기 위해 신규 파일 생성을 권장한다.

### 3.2 최소 변경안: 기존 7개 문서 내부 확장

신규 파일을 만들기 어렵다면 아래처럼 재배치한다.

```txt
3_4_workspace_ac.md
  - Program First 총괄 구조로 전면 개편

3_4_1_ac_dashboard.md
  - Program 목록, KPI, 모듈별 운영 현황, 성과 허브 요약

3_4_2_ac_overview.md
  - Program 기본 정보 + Program Module 보드 + 모듈 활성화/설정

3_4_3_ac_startups.md
  - Recruitment + Participant Pool + Application DB + 자료 제출실까지 확장

3_4_4_ac_mentoring.md
  - 멘토링 N:N 관계/회차 기록으로 개편
  - 1:1 비즈니스 매칭은 별도 섹션을 추가하거나 문서 하단 독립 장으로 분리

3_4_5_ac_milestones.md
  - 단순 마일스톤이 아니라 Program 통합 타임라인, 세션, 충돌 방지, ICS로 확장

3_4_6_ac_evaluations.md
  - 공통 평가 엔진 + 서면평가 + 대면평가 + 데모데이 평가로 전면 확장

3_4_7_ac_custom_events.md
  - OT/대규모 피칭/커스텀 활동/회의록/첨부/사진 기록으로 확장
```

단, 최소 변경안은 문서가 너무 비대해지고 모듈 경계가 흐려질 수 있다. 가능하면 3.1 권장안을 택한다.

---

## 4. Gemini 작업 단위

Gemini는 한 번에 모든 문서를 작성하지 말고 아래 단위로 나누어 작성한다.

각 작업 단위마다 다음을 포함한다.

1. 수정 대상 문서 목록
2. 새로 추가할 섹션
3. 기존 섹션 중 교체/삭제/유지할 항목
4. 화면 요건
5. 데이터 모델 요건
6. 권한/RLS 요건
7. 상태 전이/RPC/API 요건
8. GUEST/외부 사용자 연동
9. 완료 기준
10. 테스트 기준

---

## 5. 작업 단위 A: AC 총괄 인덱스와 Program First 재정의

### 5.1 대상 문서

```txt
docs/docs_planning/3_4_workspace_ac.md
docs/docs_planning/3_0_workspace_overview.md
docs/docs_planning/2_business_scenarios.md
docs/docs_master/0_service_spec_draft.md
```

### 5.2 핵심 보강 방향

현재 AC는 "보육 사업 워크스페이스"로 설명되어 있으나, 이를 다음처럼 재정의한다.

```txt
AC 섹션은 스타트업 보육/육성 사업을 Program 단위로 생성하고,
각 Program 안에 모집, 평가, OT, 멘토링, 비즈니스 매칭,
데모데이, 성과관리 모듈을 조립해 운영하는 Program First 업무 섹션이다.
```

### 5.3 반드시 들어가야 할 개념

1. **Program**
   - 상위 사업 단위
   - 예: A-STREAM 2026, 창업도약패키지, 글로벌 오픈이노베이션 3기

2. **Program Module**
   - Program 내부에서 켜고 끄는 업무 모듈
   - 기본 모듈:
     - Recruitment
     - Document Review
     - Onsite Evaluation
     - Orientation
     - Mentoring
     - Business Matching
     - Demo Day
     - Outcomes/KPI
     - Custom Activity

3. **Participant Pool**
   - Program에 소속된 스타트업, 전문가, 심사위원, 멘토, 투자자, 운영자 풀
   - 모듈은 이 풀에서 대상자를 선택해 운영한다.

4. **Session**
   - 실제 시간표에 올라가는 개별 운영 단위
   - 예: OT 세션, 발표 슬롯, 상담 슬롯, 멘토링 회차, 데모데이 피칭

5. **Assignment**
   - 평가자-대상, 멘토-멘티, 스타트업-상담자, 심사위원-발표 기업 등 배정 관계

6. **Result**
   - 평가 제출, 상담일지, 만족도, 출석, 관심 기업, 후속 미팅, 성과 지표

### 5.4 기존 문서에서 수정할 점

현재 `3_4_workspace_ac.md`의 라이프사이클은 다음처럼 바뀌어야 한다.

현재:

```txt
사업 개설 -> 기업 모집/심사 -> 프로그램 수행 -> 1:1 멘토링 -> 평가 -> 사후 연동
```

개편:

```txt
Program 생성
-> 모듈 구성
-> 모집 랜딩/신청 DB 확보
-> 참가자 풀 확정
-> 서면평가
-> 대면평가/선발
-> OT/필수 세션
-> 멘토링 N:N 관계/회차 운영
-> 비즈니스 매칭 1:1 슬롯/AI 배정/상담일지 운영
-> 데모데이 평가/스코어보드/후속 미팅
-> 만족도/성과/KPI/통합 다운로드
-> HUB 마스터/투자/FUND/M&A 후속 연동
```

### 5.5 완료 기준

Gemini가 이 작업을 완료하면 `3_4_workspace_ac.md`만 읽어도 아래 질문에 답할 수 있어야 한다.

1. AC의 최상위 단위는 왜 Program인가?
2. Program과 Module, Session, Participant Pool의 차이는 무엇인가?
3. 기존 `matching`의 비즈니스 매칭 기능은 AC 안에서 어느 모듈로 들어가는가?
4. 모집부터 성과 리포트까지 데이터가 어떻게 이어지는가?
5. HUB/ADMIN/GUEST와 AC는 각각 어떤 역할을 나눠 가지는가?

---

## 6. 작업 단위 B: Program 대시보드 및 모듈 보드

### 6.1 대상 문서

```txt
docs/docs_planning/3_4_1_ac_dashboard.md
docs/docs_planning/3_4_2_ac_overview.md
```

또는 신규 문서:

```txt
docs/docs_planning/3_4_1_ac_dashboard.md
docs/docs_planning/3_4_2_ac_program_overview.md
```

### 6.2 핵심 보강 방향

기존 대시보드는 단순 보육 현황판이다. 이를 `matching`의 Program 운영 대시보드 감각에 맞게 다음으로 확장한다.

1. Program 목록
2. Program 상태별 필터
3. Program별 활성 모듈 현황
4. 모집/평가/멘토링/매칭/데모데이 진행률
5. 오늘의 운영 이슈
6. 미제출 평가/미작성 상담일지/노쇼/알림 실패/파일 누락
7. Program KPI 요약

### 6.3 Program 상태 모델

Program 자체 상태를 정의한다.

```txt
DRAFT
RECRUITING
SCREENING
OPERATING
DEMO_DAY
FINISHED
CANCELLED
```

단, 상태는 강제 직선 흐름만 허용하면 안 된다. 모듈별 상태가 따로 있으므로 Program 상태는 대표 상태 또는 운영자가 지정하는 상위 상태로 둔다.

### 6.4 Program Module 보드

Program 상세의 첫 화면에는 모듈 카드 보드가 있어야 한다.

각 모듈 카드에는 다음을 표시한다.

```txt
module_type
module_name
enabled 여부
module_status
주요 진행률
미해결 이슈 수
마지막 업데이트 시각
담당 운영자
바로가기 버튼
```

기본 모듈 타입:

```txt
RECRUITMENT
DOC_REVIEW
ONSITE_EVAL
ORIENTATION
MENTORING
BUSINESS_MATCHING
DEMO_DAY
OUTCOMES
CUSTOM_ACTIVITY
```

### 6.5 Program 기본 설정

기존 `3_4_2_ac_overview.md`의 사업 기본 정보는 유지하되 다음을 추가한다.

1. Program 공개명/내부명
2. 주관기관/협력기관
3. Program 기간
4. Program 공개 URL slug
5. Program 담당자/운영자
6. 참가자 풀 정책
7. GUEST 접근 정책
8. 자료 제출 정책
9. 알림 정책
10. 활성 모듈 설정
11. 모듈별 참여 방식

### 6.6 중요한 수정: 참여 방식은 Program 전체 설정이 아니라 Module 설정

현재 문서의 `mentoring_match_mode`처럼 Program 전체 또는 멘토링 하나에만 모드를 두면 안 된다.

`matching` 기준으로 참여 방식은 모듈별로 다르다.

```txt
OPEN_APPLICATION        # 모집
REVIEWER_ASSIGNMENT     # 서면/대면/데모데이 평가
ADMIN_ONLY              # OT, 고정 피칭, 일부 멘토링
STARTUP_FCFS            # 자율 예약 멘토링/상담
AI_ALLOCATION           # 비즈니스 매칭
MANUAL_ALLOCATION       # 운영자 수동 배정
```

따라서 `program_modules` 또는 이에 준하는 설정에 `participation_mode`가 들어가야 한다.

### 6.7 완료 기준

Gemini는 이 작업을 끝내면 다음 산출물을 만들어야 한다.

1. Program 대시보드 화면 구성
2. Program 상세 개요 화면 구성
3. Module 보드 기능 요건
4. Program 상태와 Module 상태 구분
5. 참여 방식이 Module 단위라는 원칙

---

## 7. 작업 단위 C: 기업 모집 랜딩, 신청 DB, 자료 제출실

### 7.1 대상 문서

현재 구조라면:

```txt
docs/docs_planning/3_4_3_ac_startups.md
docs/docs_planning/3_9_workspace_guest.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_3_ac_recruitment.md
docs/docs_planning/3_4_4_ac_participant_pool.md
```

### 7.2 핵심 보강 방향

`matching`에서 Program의 출발점은 기업 모집이다. 현재 문서의 "NETWORKS 스타트업 검색 매핑"은 내부 운영자가 이미 있는 마스터를 붙이는 흐름에 가깝다. 그러나 실제 AC 운영에서는 공개 모집, 신청서 접수, 자료 제출, 동의서 수집이 먼저다.

따라서 다음을 추가한다.

### 7.3 Recruitment Landing

관리자가 Program별 모집 랜딩페이지를 생성한다.

필수 기능:

```txt
모집 공개 URL 생성
공개/비공개 전환
포스터 이미지 업로드
모집 개요
지원 대상
일정 안내
제출 서류 안내
개인정보활용동의 문구
문의처
FAQ
신청 시작/마감 일시
마감 후 제출 차단
미리보기
```

### 7.4 Application Form Builder

운영자가 코딩 없이 신청서 항목을 조정할 수 있어야 한다.

필드 타입:

```txt
text
textarea
number
email
phone
url
single_select
multi_select
checkbox
date
file
agreement
```

필수 설정:

```txt
라벨
설명
필수 여부
placeholder
옵션 목록
파일 허용 확장자
파일 최대 크기
개인정보/민감정보 여부
내부 전용 여부
정렬 순서
```

### 7.5 Application DB

신청 데이터는 Program 참가자 풀의 출발점이다.

신청 상태:

```txt
DRAFT
SUBMITTED
UNDER_REVIEW
SELECTED
WAITLIST
REJECTED
WITHDRAWN
```

신청 목록 필수 컬럼:

```txt
기업명
대표자
담당자
연락처
이메일
제출 완료 여부
동의서 완료 여부
필수 파일 누락 여부
신청 상태
HUB 마스터 연결 상태
제출 시각
최종 수정 시각
```

### 7.6 HUB 마스터 연동

works 구조에서는 `NETWORKS`라고 부르지 말고 현재 문서 체계에 맞게 `HUB 마스터` 또는 `HUB 스타트업 마스터`로 정리한다.

신청이 들어오면 다음 흐름을 명시한다.

```txt
신청 기업명/대표자/사업자번호/연락처 정규화
-> HUB 마스터 검색
-> 기존 마스터 후보 추천
-> 운영자 확인 후 연결
-> 없으면 임시 마스터 생성
-> 추후 병합 후보 생성
```

### 7.7 자료 제출실

스타트업은 GUEST에서 Program별 자료를 제출/교체할 수 있어야 한다.

자료 유형:

```txt
사업소개서 PDF
IR Deck
사업자등록증
개인정보동의서
발표자료
참고 URL
기타 첨부
```

필수 요건:

```txt
파일 업로드 이력
누가 업로드했는지
대행 업로드 여부
최신 버전 표시
평가자/멘토/심사위원에게 최신 자료 반영
이전 버전 보존 정책
민감 파일 접근 제한
다운로드 감사 로그
```

### 7.8 완료 기준

Gemini가 이 작업을 끝내면 문서상으로 아래가 가능해야 한다.

1. 운영자가 모집 페이지를 만든다.
2. 스타트업이 외부 URL에서 신청서를 낸다.
3. 신청 데이터가 Program Application DB에 쌓인다.
4. 신청 기업이 HUB 마스터와 연결되거나 임시 마스터가 된다.
5. 제출 파일이 이후 서면평가/대면평가/멘토링/비즈니스 매칭/데모데이에 재사용된다.

---

## 8. 작업 단위 D: Participant Pool과 역할

### 8.1 대상 문서

```txt
docs/docs_planning/1_roles_permissions.md
docs/docs_planning/3_4_3_ac_startups.md
docs/docs_planning/3_9_workspace_guest.md
docs/docs_dev/2_auth_permissions_architecture.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_4_ac_participant_pool.md
```

### 8.2 핵심 보강 방향

`matching`은 사용자 역할이 단순 계정 role이 아니라 Program/Module 참여 역할에 따라 달라진다.

한 사람이 어떤 Program에서는 멘토, 다른 Program에서는 평가자, 또 다른 Program에서는 심사위원일 수 있다. 따라서 계정 역할과 Program 참여 역할을 분리해야 한다.

### 8.3 역할 구분

계정 차원의 사용자:

```txt
internal_admin
internal_operator
internal_staff
guest_startup
guest_expert
guest_investor
viewer
```

Program 참여 역할:

```txt
PROGRAM_OWNER
PROGRAM_OPERATOR
STARTUP
EXPERT
MENTOR
REVIEWER
JUDGE
INVESTOR
STAFF
OBSERVER
```

Module 참여 역할:

```txt
RECRUITMENT_APPLICANT
DOC_REVIEW_EVALUATOR
ONSITE_EVAL_JUDGE
ORIENTATION_ATTENDEE
MENTORING_MENTOR
MENTORING_MENTEE
MATCHING_STARTUP
MATCHING_EXPERT
DEMO_DAY_JUDGE
DEMO_DAY_INVESTOR
```

### 8.4 Participant Pool 기능

관리자 화면:

```txt
Program 참가 스타트업 풀
Program 전문가/멘토/심사위원 풀
운영자/스태프 풀
CSV 업로드
HUB 마스터 검색 연결
임시 참가자 생성
역할 태그 부여
모듈별 참여 가능 여부 설정
GUEST 접근 권한 발급
초대 링크/OTP/로그인 정보 관리
```

### 8.5 외부 참여자 접근

외부 사용자는 WORKS 내부 앱에 접근하지 않는다. GUEST 앱 또는 GUEST 화면에서 자기 scope만 본다.

scope 예시:

```txt
guest_startup: 자기 회사, 자기 Program, 자기 일정, 자기 제출 자료
guest_expert: 자신에게 배정된 평가/멘토링/상담 대상
guest_judge: 자신에게 배정된 평가 대상 및 평가표
guest_investor: 자신에게 공개된 데모데이 기업/관심 기록 범위
```

### 8.6 완료 기준

문서가 아래를 명확히 설명해야 한다.

1. 계정 역할과 Program 참여 역할의 차이
2. 전문가가 모듈별로 다른 화면을 보게 되는 이유
3. 외부 참여자가 자기 배정 범위만 보는 RLS/scope 원칙
4. Program Participant Pool이 모든 모듈의 공통 기반이라는 점

---

## 9. 작업 단위 E: 공통 평가 엔진

### 9.1 대상 문서

현재 구조라면:

```txt
docs/docs_planning/3_4_6_ac_evaluations.md
docs/docs_dev/3_database_rls_policy_matrix.md
docs/docs_dev/6_api_contracts.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_5_ac_evaluation_engine.md
```

### 9.2 핵심 보강 방향

현재 평가는 멘토링 상호 평가 중심으로 좁게 작성되어 있다. 이를 `matching`의 공통 평가 엔진으로 전면 확장해야 한다.

공통 평가 엔진은 서면평가, 대면평가, 데모데이 평가가 재사용한다.

### 9.3 필수 데이터 모델

아래 모델을 문서에 명시한다. 실제 테이블명은 works의 네이밍 정책에 맞게 조정 가능하지만 개념은 유지한다.

```txt
evaluation_forms
evaluation_criteria
evaluation_targets
evaluation_assignments
evaluation_submissions
evaluation_answers
evaluation_selections
```

각 모델 설명:

```txt
evaluation_forms
  - program_module_id 기준 1개 평가 라운드
  - status: DRAFT / OPEN / CLOSED
  - instructions
  - deadline_at

evaluation_criteria
  - 동적 평가 지표
  - type: SCORE / SINGLE_CHOICE / MULTIPLE_CHOICE / SHORT_ANSWER / LONG_ANSWER
  - max_score
  - weight
  - required
  - options

evaluation_targets
  - 평가 대상 스타트업
  - program_module_id + startup_id
  - Program STARTUP 풀의 부분집합

evaluation_assignments
  - 평가자와 평가 대상 N:N
  - evaluator_id + target_id
  - 배정된 평가자만 대상 자료 열람 가능

evaluation_submissions
  - 평가자별 제출 마스터
  - status: DRAFT / SUBMITTED

evaluation_answers
  - 지표별 답변
  - score/text/selections

evaluation_selections
  - 최종 판정
  - decision: PENDING / SELECTED / WAITLIST / REJECTED
  - next_stage: MENTORING / MATCHING / DEMO_DAY / OTHER
```

### 9.4 평가표 빌더

관리자 화면:

```txt
평가 안내문 설정
제출 마감 설정
평가 지표 추가/수정/삭제
배점 설정
가중치 설정
필수 여부 설정
평가표 미리보기
DRAFT -> OPEN -> CLOSED 전환
제출 존재 시 파괴적 수정 제한
```

### 9.5 평가자 화면

`matching`의 강점인 Split View를 명시한다.

```txt
좌측: 기업 정보, 신청서, 제출 PDF, 참고 URL
우측: 평가표
상단: Program/Module/마감/제출 상태
하단: 임시저장 / 제출 / 제출 취소
모바일: 상하 스택 또는 탭 전환
```

### 9.6 결과 집계

필수 집계:

```txt
배정 수
제출 수
미제출 수
평균 점수
가중 총점
평가자 간 편차
대상별 순위
평가자별 제출 현황
정성 의견 모아보기
CSV/Excel 다운로드
```

### 9.7 RLS/보안

필수 원칙:

```txt
운영자는 Program 권한 범위 내 전체 조회
평가자는 자신에게 배정된 대상만 조회
스타트업은 평가 내부 점수/의견을 기본적으로 조회하지 않음
배정되지 않은 전문가는 대상 기업 자료를 볼 수 없음
평가 제출은 RPC/서버 액션으로만 상태 전이
OPEN 상태에서만 평가 가능
CLOSED 상태에서는 제출 차단
```

### 9.8 완료 기준

이 작업이 완료되면 `3_4_6_ac_evaluations.md`는 단순 만족도 문서가 아니라 works AC의 공통 평가 엔진 명세가 되어야 한다.

---

## 10. 작업 단위 F: 서면평가 모듈

### 10.1 대상 문서

권장 신규 문서:

```txt
docs/docs_planning/3_4_6_ac_document_review.md
```

또는 `3_4_6_ac_evaluations.md` 내부 장으로 작성한다.

### 10.2 핵심 보강 방향

서면평가는 모집 단계에서 확보한 신청 정보와 PDF를 평가자가 검토하는 모듈이다.

### 10.3 필수 기능

관리자:

```txt
서면평가 모듈 활성화
평가표 빌더
평가 대상 편성
평가자 배정
평가 OPEN/CLOSED
제출률 모니터링
미제출자 리마인드
대상별 결과 집계
서면평가 결과 기반 후속 단계 분류
```

평가자:

```txt
배정 대상 목록
PDF/신청서 Split View
평가 임시저장
평가 제출
제출 취소/재편집
마감 이후 읽기 전용
```

스타트업:

```txt
자료 제출 상태 확인
평가 진행 상태는 제한적으로 표시
평가 점수/의견은 기본 비공개
```

### 10.4 완료 기준

서면평가 문서는 아래가 분명해야 한다.

1. 모집 DB와 연결된다.
2. 공통 평가 엔진을 재사용한다.
3. 평가자는 배정된 기업 자료만 본다.
4. 결과는 대면평가/멘토링/매칭/데모데이 대상 선정의 근거가 된다.

---

## 11. 작업 단위 G: 대면평가 모듈

### 11.1 대상 문서

권장 신규 문서:

```txt
docs/docs_planning/3_4_7_ac_onsite_evaluation.md
```

### 11.2 핵심 보강 방향

대면평가는 서면평가와 같은 평가 엔진을 쓰되, 발표/인터뷰 시간표와 현장 진행 상태가 붙는다.

### 11.3 필수 데이터/기능

고유 모델:

```txt
onsite_eval_sessions
  - program_module_id
  - target_startup_id
  - location
  - starts_at
  - ends_at
  - order_no
  - status
  - notes
```

상태:

```txt
SCHEDULED
IN_PROGRESS
DONE
LATE
ABSENT
```

관리자 화면:

```txt
평가 대상 선정
심사위원 배정
발표 순서 편성
장소/시간 설정
현장 상태 변경
평가 제출률 확인
최종 선발/예비/탈락 판정
후속 단계 지정
```

심사위원 화면:

```txt
오늘 평가할 기업 목록
현재 발표 기업 강조
발표 시간/장소
기업 자료 열람
모바일 평가표
임시저장/제출
```

### 11.4 완료 기준

대면평가 문서는 "서면평가와 같은 엔진 + 얇은 시간표/현장 상태 레이어"라는 구조를 명확히 해야 한다.

---

## 12. 작업 단위 H: OT/대규모 피칭/출석 세션

### 12.1 대상 문서

현재 구조라면:

```txt
docs/docs_planning/3_4_5_ac_milestones.md
docs/docs_planning/3_4_7_ac_custom_events.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_8_ac_orientation_sessions.md
```

### 12.2 핵심 보강 방향

OT와 대규모 피칭은 1:N 세션이다. 예약 경쟁이나 N:N 평가보다 "세션 일정 + 참석자 명단 + 출석"이 중요하다.

### 12.3 필수 기능

```txt
세션 생성
세션 장소/시간
참석 대상 스타트업 지정
필수/선택 참석 구분
QR 또는 수동 출석 체크
참석/지각/불참 상태
발표 순서 관리
발표 자료 버전 관리
GUEST 일정 노출
알림 발송
```

상태:

```txt
SCHEDULED
CHECK_IN_OPEN
IN_PROGRESS
DONE
CANCELLED
```

### 12.4 완료 기준

OT/대규모 피칭은 단순 마일스톤이 아니라 실제 운영 가능한 세션 모듈로 작성되어야 한다.

---

## 13. 작업 단위 I: 멘토링 모듈 재정의

### 13.1 대상 문서

```txt
docs/docs_planning/3_4_4_ac_mentoring.md
```

권장 신규 문서명:

```txt
docs/docs_planning/3_4_9_ac_mentoring.md
```

### 13.2 핵심 보강 방향

현재 문서의 멘토링은 1:1 예약 스케줄러에 치우쳐 있다. `matching` 기준으로 멘토링은 여러 멘토와 여러 기업의 N:N 관계, 회차 기록, 진행률 관리가 핵심이다.

### 13.3 필수 모델

```txt
mentoring_relationships
  - program_module_id
  - mentor_id
  - mentee_startup_id

mentoring_sessions
  - relationship_id
  - session_no
  - scheduled_at
  - location
  - content
  - status
```

회차 상태:

```txt
DRAFT
DONE
REOPENED
```

### 13.4 관리자 화면

```txt
멘토 풀 선택
멘티 스타트업 풀 선택
멘티별 멘토 배정
멘토별 담당 기업 요약
기업별 멘토링 진행률
회차 작성률
미작성 상담일지 목록
배정 해제 제한: 기록 있는 관계는 해제 차단 또는 보존 처리
```

### 13.5 멘토 화면

```txt
내 담당 Program 목록
내 담당 기업 목록
기업별 회차 기록
상담일지 작성
임시저장
작성완료 제출
재오픈
기업 자료 열람
이전 회차 히스토리
```

### 13.6 스타트업 화면

```txt
내 멘토 목록
예정 멘토링 일정
작성완료된 상담 히스토리
후속 과제
자료 업데이트
```

### 13.7 주의: 비즈니스 매칭과 분리

멘토링 문서에 1:1 비즈니스 매칭 기능을 섞지 말라.

멘토링:

```txt
관계 중심
회차 중심
누적 히스토리
상담일지
```

비즈니스 매칭:

```txt
슬롯 중심
예약/배정 중심
상담 테이블
노쇼/출석/AI 배정
행사 당일 운영
```

### 13.8 완료 기준

멘토링 문서는 N:N 관계와 회차 기록 중심으로 다시 작성되어야 한다.

---

## 14. 작업 단위 J: 비즈니스 매칭 모듈

### 14.1 대상 문서

권장 신규 문서:

```txt
docs/docs_planning/3_4_10_ac_business_matching.md
```

현재 문서 안에 넣어야 한다면 `3_4_4_ac_mentoring.md` 하단에 별도 독립 장으로 두되, 장기적으로 분리하라.

### 14.2 핵심 보강 방향

기존 완성 서비스 `matching`의 가장 강한 자산은 1:1 비즈니스 매칭이다. 이것을 AC의 Program Module로 재정의한다.

### 14.3 핵심 기능

관리자:

```txt
비즈니스 매칭 모듈 활성화
전문가/파트너/투자자 풀 지정
스타트업 풀 지정
상담 테이블/부스 생성
운영 시간대 설정
식사시간/중단구간 설정
슬롯 자동 생성
스타트업 자율 예약 기간 설정
예약 현황 확인
AI/자동 배정 실행
배정 결과 검토
충돌 슬롯 수정
강제 배정
노쇼 대체 매칭
상담 상태 모니터링
상담일지 제출 현황
만족도 결과
Excel 다운로드
```

스타트업:

```txt
참여 Program 선택
상담 가능 슬롯 조회
전문가/파트너 정보 확인
예약/변경/취소
상담 요청사항 입력
IR/PDF/URL 제출
내 일정 확인
상담 후 만족도 제출
공개 피드백 확인
```

전문가/파트너:

```txt
내 상담 일정 확인
현재/다음 상담 강조
기업 자료 Split View
상담 시작
출석/진행 상태 반영
상담일지 작성
다차원 평가 점수
후속 연계 요청
제출/재편집
```

현장 스태프:

```txt
출석 체크
노쇼 표시
대체 매칭 처리
현장 사진 업로드
상담 진행 상태 보조
```

### 14.4 상태 모델

모듈 상태:

```txt
DRAFT
BOOKING
ALLOCATION
PROGRESS
FINISHED
CANCELLED
```

슬롯 상태:

```txt
OPEN
BOOKED
LOCKED
IN_PROGRESS
COMPLETED
NO_SHOW
CANCELLED
```

상담일지 상태:

```txt
DRAFT
SUBMITTED
REOPENED
```

### 14.5 AI/자동 배정

기존 `matching`의 AI 배치/자동 배정 감각을 문서화한다.

필수 요소:

```txt
스타트업 선호도
전문가/파트너 선호도
분야/카테고리 적합성
시간표 충돌
테이블/부스 제약
최대 상담 수
중복 상담 제한
우선순위 점수
관리자 검토 후 확정
```

### 14.6 상담일지

상담일지는 기존 서비스의 핵심 자산이다.

필수 필드:

```txt
상담 요약
주요 니즈
후속 액션
투자/PoC/협업 가능성
5대 평가 점수
비공개 메모
공개 가능 피드백
후속 연계 요청
```

### 14.7 완료 기준

문서가 아래를 모두 설명해야 한다.

1. 기존 `matching`의 1:1 매칭 행사를 Program Module로 흡수한다.
2. 자율 예약과 관리자/AI 배정이 모두 가능하다.
3. 출석, 노쇼, 대체 매칭, 상담일지, 만족도, 다운로드까지 운영된다.
4. 멘토링과 다른 모듈임이 명확하다.

---

## 15. 작업 단위 K: 데모데이 모듈

### 15.1 대상 문서

권장 신규 문서:

```txt
docs/docs_planning/3_4_11_ac_demo_day.md
```

### 15.2 핵심 보강 방향

데모데이는 공통 평가 엔진을 재사용하면서, 발표 세션, 스코어보드, 투자자 관심/후속 미팅이 붙는 모듈이다.

### 15.3 필수 모델

```txt
demoday_sessions
  - program_module_id
  - startup_id
  - stage
  - order_no
  - starts_at
  - present_minutes
  - qna_minutes
  - status

demoday_interests
  - program_module_id
  - startup_id
  - investor_name
  - investor_org
  - interest_level
  - meeting_status
  - note
```

상태:

```txt
demoday_sessions.status
  SCHEDULED
  PRESENTING
  DONE

demoday_interests.interest_level
  WATCH
  MEETING
  INVEST

demoday_interests.meeting_status
  NONE
  REQUESTED
  SCHEDULED
  DONE
  DECLINED
```

### 15.4 필수 기능

관리자:

```txt
발표 대상 편성
심사위원 배정
발표 순서/스테이지/시간 설정
평가표 설정
발표 진행 상태 변경
실시간 스코어보드
투자자 관심/미팅 기록
결과 다운로드
```

심사위원:

```txt
현재 발표 기업 확인
기업 자료 열람
모바일 심사표 작성
제출/수정
```

투자자/운영자:

```txt
관심 기업 체크
미팅 희망 기록
후속 미팅 상태 관리
```

### 15.5 완료 기준

데모데이는 대면평가와 비슷하지만 스코어보드와 투자자 관심/후속 미팅이 있다는 차이를 명확히 해야 한다.

---

## 16. 작업 단위 L: Program 통합 타임라인, 충돌, 캘린더

### 16.1 대상 문서

현재 구조라면:

```txt
docs/docs_planning/3_4_5_ac_milestones.md
docs/docs_planning/3_9_workspace_guest.md
docs/docs_planning/3_1_workspace_hub.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_12_ac_program_timeline.md
```

### 16.2 핵심 보강 방향

현재 마일스톤 문서는 일정 관리 중심이다. `matching` 기준으로는 모든 모듈의 세션이 하나의 Program 시간축에 올라와야 한다.

### 16.3 통합 타임라인 대상

```txt
모집 시작/마감
서면평가 기간
대면평가 발표 슬롯
OT 세션
멘토링 회차
비즈니스 매칭 상담 슬롯
데모데이 발표 세션
만족도 제출 기간
성과 입력 마감
커스텀 활동
```

### 16.4 충돌 차단

필수 충돌 검사:

```txt
같은 스타트업의 시간 중복
같은 전문가/심사위원/멘토의 시간 중복
같은 장소/테이블/부스의 시간 중복
모듈 간 시간 중복
이동 버퍼 부족
식사시간/중단구간 침범
```

### 16.5 이동 버퍼

장소가 다를 경우 이동 시간을 고려한다.

예:

```txt
3층 상담부스 -> 1층 메인무대: 최소 10분
온라인 세션 -> 오프라인 세션: 최소 5분
동일 장소 연속 세션: 버퍼 0~5분
```

### 16.6 캘린더 연동

1차:

```txt
.ics 다운로드
캘린더에 추가 링크
```

후속:

```txt
Google Calendar OAuth 연동
일정 생성/수정/삭제 동기화
```

### 16.7 완료 기준

문서에서 "마일스톤"은 단순 일정 카드가 아니라 Program 전체 운영 시간축과 충돌 방지의 근거로 재정의되어야 한다.

---

## 17. 작업 단위 M: GUEST 포털 보강

### 17.1 대상 문서

```txt
docs/docs_planning/3_9_workspace_guest.md
docs/docs_dev/2_auth_permissions_architecture.md
docs/docs_dev/3_database_rls_policy_matrix.md
```

### 17.2 핵심 보강 방향

GUEST는 단순 예약/평가 화면이 아니다. 외부 참여자가 Program 안에서 자기 할 일을 처리하는 포털이다.

### 17.3 스타트업 GUEST

필수 화면:

```txt
내 Program 목록
오늘 할 일
모집 신청서 작성/수정
자료 제출실
내 일정 타임라인
대면평가 시간 확인
OT/피칭 참석 정보
멘토링 히스토리
비즈니스 매칭 예약/변경/취소
데모데이 발표 정보
만족도 제출
공개 피드백 확인
```

### 17.4 전문가/멘토/심사위원 GUEST

필수 화면:

```txt
내 Program/Module 역할 목록
배정된 평가 대상
Split View 자료 열람 + 평가표
멘토링 담당 기업
회차별 상담일지
비즈니스 매칭 상담 일정
상담일지 작성
데모데이 심사표
```

### 17.5 모바일 UX

필수 원칙:

```txt
현장 사용 우선
상단에 현재/다음 일정 강조
주요 액션은 큰 버튼
평가/상담 폼은 자동 임시저장
긴 PDF/폼은 Split View 또는 탭 전환
360px 모바일에서도 깨지지 않음
```

### 17.6 인증/접근

`matching`에는 참가자 전용 인증 흐름이 있었다. works에서는 이를 다음처럼 정리한다.

```txt
내부 임직원: WORKS 앱 + Supabase Auth + 도메인 권한
외부 참여자: GUEST 앱/화면 + 제한 scope + 자기 Program/Assignment만 접근
```

외부 로그인 방식 후보:

```txt
이름+휴대전화 기반
OTP
초대 링크
이메일 매직링크
```

문서에는 보안상 장단점과 권장안을 포함한다.

### 17.7 완료 기준

GUEST 문서는 스타트업/전문가가 여러 링크를 오가는 구조가 아니라 Program 포털에서 통합 경험을 갖도록 재작성되어야 한다.

---

## 18. 작업 단위 N: 성과 지표 허브와 통합 다운로더

### 18.1 대상 문서

```txt
docs/docs_planning/3_4_1_ac_dashboard.md
docs/docs_planning/3_4_6_ac_evaluations.md
docs/docs_planning/3_5_workspace_fund.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_13_ac_outcomes_kpi_export.md
```

### 18.2 핵심 보강 방향

`matching`의 최종 가치는 운영 결과를 Program 단위로 모아 보고서와 후속 액션에 쓰는 것이다. 현재 문서의 대시보드/피드백은 너무 좁다.

### 18.3 KPI 블록

모집:

```txt
신청 기업 수
제출 완료율
동의서 완료율
파일 누락 수
분야/업종 분포
```

서면/대면/데모데이 평가:

```txt
평가 대상 수
평가자 수
배정 수
제출률
평균 점수
평가자 간 편차
선발/예비/탈락 수
```

OT:

```txt
대상 수
참석 수
지각/불참 수
참석률
```

멘토링:

```txt
멘토 수
멘티 수
관계 수
회차 완료 수
상담일지 작성률
기업별 멘토 수
```

비즈니스 매칭:

```txt
상담 슬롯 수
예약 수
상담 완료 수
노쇼 수
대체 매칭 수
후속 미팅 희망 수
상담일지 제출률
```

데모데이:

```txt
발표 기업 수
심사 제출률
평균 점수
순위
관심 기업 체크 수
후속 미팅 요청 수
투자검토 수
```

만족도/후속 성과:

```txt
만족도 평균
재참여 의향
후속 미팅
PoC
투자 검토
계약
매출
자사 투자/FUND 연동
M&A 연동
```

### 18.4 기업별 누적 타임라인

Program 안에서 기업별로 아래를 누적 표시한다.

```txt
신청 정보
제출 파일
서면평가 결과
대면평가 결과
선발 상태
OT 참석
멘토링 히스토리
비즈니스 매칭 상담일지
데모데이 결과
투자자 관심
만족도/후속 성과
HUB 마스터/FUND/M&A 연동 이력
```

### 18.5 통합 다운로더

관리자는 원하는 열을 선택해서 Excel로 내려받을 수 있어야 한다.

컬럼 그룹:

```txt
스타트업 기본 정보
신청 정보
제출 파일 상태
서면평가 점수/의견
대면평가 점수/의견
멘토링 내용 요약
비즈니스 매칭 결과
상담일지
데모데이 점수/관심도
만족도
후속 성과
```

보안:

```txt
다운로드 권한 필요
다운로드 감사 로그
민감 필드 마스킹 옵션
개인정보 포함 여부 확인
사유 입력
```

### 18.6 완료 기준

성과 문서는 단순 차트가 아니라 사업 보고서 작성과 후속 투자/M&A 연계를 위한 데이터 허브로 작성되어야 한다.

---

## 19. 작업 단위 O: Custom Activity, 회의록, 첨부, 사진

### 19.1 대상 문서

```txt
docs/docs_planning/3_4_7_ac_custom_events.md
```

권장 신규 문서:

```txt
docs/docs_planning/3_4_14_ac_custom_activities.md
```

### 19.2 핵심 보강 방향

현재 커스텀 활동 문서는 사진/메모 중심으로 괜찮지만, `matching`의 운영 감각을 반영해 Program/Module/Session에 연결되는 가벼운 회의록과 첨부 구조를 추가한다.

### 19.3 필수 기능

```txt
커스텀 활동 생성
Program/Module/Session 연결
참석 스타트업/전문가 지정
회의록 작성
결정사항
후속 조치
첨부파일
사진
공개 범위
HUB 스타트업 상세 활동 이력 연동
GUEST 스타트업 본인 활동 히스토리 노출
```

### 19.4 회의록 필드

```txt
title
agenda
discussion
decisions
action_items
attachments
created_by
created_at
updated_at
visibility
```

### 19.5 완료 기준

커스텀 활동은 단순 예쁜 타임라인이 아니라 정형 모듈 밖에서 발생하는 운영 기록을 Program 데이터에 연결하는 보완 장치로 정의되어야 한다.

---

## 20. 작업 단위 P: 권한, RLS, API 계약 보강

### 20.1 대상 문서

```txt
docs/docs_planning/1_roles_permissions.md
docs/docs_dev/2_auth_permissions_architecture.md
docs/docs_dev/3_database_rls_policy_matrix.md
docs/docs_dev/6_api_contracts.md
docs/docs_dev/4_security_privacy_policy.md
```

### 20.2 핵심 보강 방향

`matching`의 중요한 보안 원칙을 works 문서에 맞게 반영한다.

### 20.3 권한 경계

반드시 구분:

```txt
도메인 권한: ac read/write
Program 권한: 특정 Program 운영 가능 여부
Module 권한: 특정 Program Module 관리 가능 여부
Assignment 권한: 배정된 대상만 열람/작성
Guest scope: 자기 회사/자기 배정/자기 일정
```

### 20.4 RLS 원칙

```txt
내부 운영자는 ac 권한 + Program operator 범위로 조회/수정
외부 스타트업은 자기 회사/Program 데이터만 조회
외부 평가자는 자신에게 배정된 평가 대상만 조회
멘토는 자기 mentoring_relationships 대상만 조회
비즈니스 매칭 전문가는 자기 상담 슬롯 대상만 조회
데모데이 심사위원은 자기 배정 대상만 조회
투자자는 공개된 데모데이 범위 또는 자신에게 부여된 scope만 조회
```

### 20.5 RPC/서버 액션 원칙

상태 전이는 클라이언트 직접 update가 아니라 RPC/서버 액션에서 검증한다.

대상:

```txt
신청 제출
평가 OPEN/CLOSED
평가 저장/제출/재오픈
평가 대상/평가자 배정
대면평가 진행 상태 변경
멘토링 관계 배정
멘토링 회차 제출
비즈니스 매칭 예약/변경/취소
AI 배정 확정
노쇼 처리
상담일지 제출
데모데이 발표 상태 변경
투자자 관심/미팅 기록
성과 다운로드
```

### 20.6 API 계약

각 API 또는 서버 액션 문서에는 다음을 포함한다.

```txt
요청 파라미터
응답 envelope
권한 검증
상태 검증
RLS 관계
에러 코드
감사 로그 여부
테스트 케이스
```

### 20.7 완료 기준

보안 문서에는 AC가 단순 도메인 read/write만으로 보호되지 않고 Program/Module/Assignment/Guest scope가 함께 필요하다는 점이 명확해야 한다.

---

## 21. 작업 단위 Q: 디자인 시스템 재정렬

### 21.1 대상 문서

```txt
docs/docs_design/2_app_layout_navigation.md
docs/docs_design/5_component_spec_rules.md
docs/docs_design/1_ui_ux_mobile.md
```

### 21.2 핵심 보강 방향

사용자가 기존 `matching`을 works와 합치려다 디자인 시스템 관리가 어려워져 재개발하고 있다고 했으므로, Gemini는 기능 문서에 기존 UI를 그대로 복제하라고 쓰면 안 된다.

대신 다음 원칙을 명시한다.

```txt
기능/도메인 모델은 matching에서 가져온다.
화면 구성과 컴포넌트는 works 공통 디자인 시스템에 맞춘다.
각 모듈 화면은 공통 AppShell, PageHeader, Tabs, DataTable, FilterBar, Modal, Drawer, StatusBadge, SegmentedControl, Timeline, SplitView 패턴을 재사용한다.
```

### 21.3 필수 공통 컴포넌트 후보

```txt
ProgramCard
ModuleCard
ParticipantPicker
MasterSearchPicker
EvaluationRubricBuilder
EvaluationSplitView
TimelineBoard
ScheduleSlotGrid
AssignmentMatrix
SessionStatusBadge
SubmissionProgressBar
FileSubmissionPanel
CounselingLogEditor
KpiSummaryPanel
ExportColumnPicker
GuestTaskCard
MobileActionBar
```

### 21.4 완료 기준

디자인 문서는 `matching`의 화면을 그대로 복제하지 않고 works 디자인 시스템 안에서 재구현할 컴포넌트 패턴을 정의해야 한다.

---

## 22. Gemini 작성 시 금지사항

1. `matching`의 기존 UI를 그대로 복붙하라고 쓰지 말 것.
2. Program과 Event, Module, Session을 혼용하지 말 것.
3. 멘토링과 비즈니스 매칭을 하나의 기능으로 뭉개지 말 것.
4. 서면평가, 대면평가, 데모데이에 서로 다른 평가 엔진을 만들라고 쓰지 말 것.
5. 외부 사용자가 WORKS 내부 앱에 직접 접근하는 것처럼 쓰지 말 것.
6. 단순 CRUD 문서로 끝내지 말고 상태 전이, 권한, RLS, 감사 로그, 완료 기준을 포함할 것.
7. "AI"를 마법처럼 쓰지 말고 입력값, 제약, 검토/확정 흐름을 명시할 것.
8. `NETWORKS`라는 용어를 새 works 문서에서 무비판적으로 유지하지 말 것. 현재 구조가 HUB 마스터라면 HUB로 정리할 것.
9. 마일스톤을 모든 기능의 대체 개념으로 쓰지 말 것. 마일스톤은 시간축/일정이고, 모듈은 업무 기능이다.
10. 만족도/피드백만으로 성과 관리를 끝내지 말 것. Program KPI와 통합 다운로더를 별도 핵심으로 둘 것.

---

## 23. Gemini 산출물 포맷

각 문서 수정 시 아래 포맷을 따른다.

```md
# [문서 번호] 문서 제목

## 1. 목적

## 2. 이 문서가 다루는 범위

## 3. 핵심 사용자

## 4. 정보 구조

## 5. 화면 구성

## 6. 주요 기능

## 7. 데이터 모델

## 8. 상태 모델

## 9. 권한/RLS

## 10. API/RPC/서버 액션

## 11. GUEST 연동

## 12. HUB/ADMIN/타 워크스페이스 연동

## 13. 예외/오류/운영 리스크

## 14. 완료 기준

## 15. 테스트 기준
```

문서 성격에 따라 일부 섹션은 합쳐도 되지만, 권한/RLS, 상태 모델, 완료 기준, 테스트 기준은 되도록 생략하지 않는다.

---

## 24. 우선순위

문서 작업은 아래 순서로 진행한다.

### 1순위: 제품 구조 바로잡기

```txt
3_4_workspace_ac.md
3_4_1_ac_dashboard.md
3_4_2_ac_overview.md
```

목표:

```txt
AC = Program First 모듈형 운영 플랫폼
```

### 2순위: 모집/참가자/평가 엔진

```txt
Recruitment
Participant Pool
Evaluation Engine
Document Review
Onsite Evaluation
```

목표:

```txt
신청 DB -> 평가 -> 선발 -> 후속 모듈로 데이터가 이어짐
```

### 3순위: 멘토링/비즈니스 매칭/데모데이

```txt
Mentoring
Business Matching
Demo Day
```

목표:

```txt
기존 matching의 핵심 운영 기능을 AC 모듈로 되살림
```

### 4순위: GUEST/성과/권한/디자인 시스템

```txt
Guest Portal
KPI/Export
RLS/API
Design System
```

목표:

```txt
실제 운영, 외부 사용자, 보안, 재개발 UI 기준까지 완성
```

---

## 25. 최종 검수 체크리스트

Gemini는 전체 보강 후 아래 질문에 모두 "예"라고 답할 수 있어야 한다.

1. AC 문서의 최상위 개념이 Program First로 명확한가?
2. Program 안에 모듈을 켜고 끄는 구조가 있는가?
3. 모집 랜딩과 신청 DB가 Program 데이터의 시작점으로 정의되어 있는가?
4. 신청 기업이 HUB 마스터와 연결/임시 생성/병합 후보로 이어지는가?
5. Participant Pool이 모든 모듈의 공통 기반으로 정의되어 있는가?
6. 계정 역할과 Program/Module 참여 역할이 분리되어 있는가?
7. 서면평가/대면평가/데모데이가 공통 평가 엔진을 재사용하는가?
8. 대면평가는 평가 엔진 + 발표 시간표/현장 상태 레이어로 정의되어 있는가?
9. 멘토링은 N:N 관계와 회차 기록 중심으로 정의되어 있는가?
10. 비즈니스 매칭은 1:1 슬롯, 예약, AI/관리자 배정, 출석, 노쇼, 상담일지 중심으로 정의되어 있는가?
11. 데모데이는 발표 세션, 모바일 심사, 스코어보드, 투자자 관심/후속 미팅을 포함하는가?
12. Program 통합 타임라인과 모듈 간 충돌 방지가 정의되어 있는가?
13. 스타트업 GUEST는 신청/자료/일정/예약/만족도를 한 포털에서 처리하는가?
14. 전문가 GUEST는 배정 기반 Split View로 평가/상담을 처리하는가?
15. Program KPI와 통합 Excel 다운로더가 정의되어 있는가?
16. 다운로드/파일/민감정보에 감사 로그와 마스킹 기준이 있는가?
17. 외부 사용자는 WORKS 내부 앱이 아니라 GUEST scope로 제한되는가?
18. 상태 전이는 RPC/서버 액션에서 검증된다고 명시되어 있는가?
19. 디자인 시스템은 matching UI 복제가 아니라 works 공통 컴포넌트 재구성으로 정리되어 있는가?
20. 개발자가 이 문서를 보고 DB/API/화면/테스트를 도출할 수 있는가?

---

## 26. Gemini에게 주는 마지막 작성 지침

기존 `matching` 서비스는 "잘 돌아가던 기능 덩어리"이고, 현재 works는 "통합 플랫폼으로 다시 세우는 뼈대"다.

이번 문서 보강의 목적은 둘 중 하나를 버리는 것이 아니다.

```txt
matching에서 가져올 것:
  - Program First 운영 감각
  - 실제 행사/보육 운영 기능
  - 평가/상담/예약/출석/노쇼/자료/성과의 디테일
  - 외부 사용자 모바일 경험

works에서 유지할 것:
  - 통합 WORKS 앱 구조
  - HUB 마스터 데이터
  - ADMIN 권한 관리
  - GUEST 외부 접근 경계
  - 공통 디자인 시스템
  - 보안/RLS/API 문서 체계
```

따라서 Gemini는 "기존 서비스를 이식한다"가 아니라, **기존 서비스의 운영 지능을 works의 새 구조에 맞게 재설계한다**는 관점으로 작성해야 한다.

