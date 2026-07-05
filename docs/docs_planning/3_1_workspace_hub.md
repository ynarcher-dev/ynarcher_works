# [3-1] HUB (통합 데이터 센터) 워크스페이스 상세 기능 요건서

본 문서는 전사 임직원이 공통으로 열람해야 하는 중요 비즈니스 데이터, 부서 간 통합 일정, 외부 전문가 만족도 랭킹 등을 하나로 취합하여 정보의 격차를 해소하고 전사 모니터링 효율을 극대화하는 화면 요건과 비즈니스 흐름을 정의합니다. 본 워크스페이스는 독립적인 통합 데이터베이스 설계 사상에 따라 동작합니다.

---

## 1. 주요 화면 및 기능 명세

### 1.1 통합 검색 엔진 대시보드 (Global Search Portal)
* **일반 검색 / AI 검색 듀얼 탭 통합 검색창**
  * **기능**: 검색 옵션을 '일반 검색(키워드)'과 'AI 검색(Gemini)'으로 분리하여 작동시키는 듀얼 탭 검색 입력창을 화면 중앙에 배치합니다.
  * **[Mode 1] 일반 키워드 검색**
    * **검색 방식**: 전통적인 SQL LIKE 패턴 매칭 및 인덱스 기반 키워드 검색.
    * **검색 범위 및 검색어 매칭 정책**:
      * `NETWORKS` (협력사 및 전문가):
        * 협력 파트너사 정보: `public.partners` 테이블의 파트너명(`name`), 담당자명(`contact_person`), 이메일(`email`) 검색.
        * 외부 전문가 정보: `public.experts` 테이블의 전문가명(`name`), 소속 기관(`company`), 전문 분야(`specialties`) 검색.
      * `AC` (보육 사업):
        * 보육 프로그램 정보: `public.programs` 테이블의 프로그램명(`name`), 설명(`description`) 검색.
      * `FUND` (투자 및 스타트업):
        * 포트폴리오 기업 정보: `public.startups` 테이블의 스타트업명(`name`), 대표자명(`ceo_name`), 설명(`description`) 검색.
      * `PROJECT` (프로젝트 및 딜):
        * 프로젝트 정보: `public.projects` 테이블의 프로젝트명(`name`), 설명(`description`) 검색.
      * `PEOPLE` (임직원):
        * 임직원 정보: `public.managers` 테이블의 이름(`name`), 이메일(`email`), 직급(`position`), 담당 전문분야(`specialties`) 검색.
        * 소속 부서 정보: `public.departments` 테이블의 부서명(`name`)과 연계하여 소속 부서 검색.
  * **[Mode 2] AI 스마트 자연어 검색 (Gemini API 연동 예정)**
    * **기능**: 자연어 서술형 질의(예: *"최근 1년간 만족도 4.5점 이상인 전문가와 연결된 스타트업들의 매출 현황은?"* 또는 *"경영실에서 공지한 다음 달 전사 행사 일정과 투자실의 캐피탈 콜 기한을 모아줘"*)를 완벽히 해석하여 전체 HUB의 통합 데이터를 시맨틱(Semantic)하게 조회 및 분석합니다.
    * **연동 요건**: 
      * 구글 제미나이(Gemini) API를 연동하여 사용자의 자연어 쿼리를 임베딩 및 분석.
      * RAG(Retrieval-Augmented Generation) 패턴을 적용하여 전사 DB 구조를 LLM에 컨텍스트로 제공하거나, 사용자 쿼리를 기반으로 Supabase DB의 Dynamic SQL을 생성/조회하여 최신 데이터를 반영한 분석 답변을 제공합니다.
      * 생성된 답변 내에 해당 정보의 상세 페이지로 연결되는 딥링크(Deep Link) 배지 카드를 자동으로 첨부합니다.
* **구분별 검색 결과 리스트**
  * **기능**: 일반 검색 결과는 도메인별(NETWORKS, AC, FUND, PROJECT, PEOPLE)로 그룹화하여 테이블 형태로 노출하며, AI 검색 결과는 Gemini가 요약 작성한 종합 보고서 및 추천 연관 카드 형태로 연출합니다.
  * **연출**: 검색 결과의 모든 개별 객체(스타트업, 전문가, 프로젝트 등)나 추천 카드를 클릭하면 해당 데이터가 속한 원래 워크스페이스의 상세 화면으로 매끄럽게 연결됩니다.
  * **접근 제어 및 권한 예외 규칙**:
    * M&A 딜 정보 등 중요 프로젝트 정보 중 읽기 권한이 비활성화된 부서나 직원의 데이터는 검색 결과 노출에서 완전히 제외됩니다. (`ADMIN` 권한 설정과 `public.projects` 조회 시 사용자 역할 `public.current_user_role()` 및 RLS 정책을 준수하여 필터링)

### 1.2 전사 통합 일정 캘린더 (Global overlay Calendar)
* **다차원 일정 캘린더 뷰**
  * **기능**: 각 워크스페이스에서 개별적으로 관리되는 마일스톤 및 주요 이벤트를 단일 달력 화면에 오버레이(Overlay)하여 제공합니다.
  * **일정 레이어 구성 및 매핑**:
    1. **AC(사업) 일정 레이어**:
       * 데이터 소스: `public.program_events` 테이블 및 `public.system_events` (source_type = 'program')
       * 포함 일정: 보육 사업 모집 마감(`recruitment`), 데모데이(`demoday`), 네트워킹(`networking`), 미팅(`meeting`), IR(`ir`) 등 주요 공식 행사 일정.
    2. **M&A 딜 및 프로젝트 일정 레이어**:
       * 데이터 소스: `public.projects` 테이블의 시작일(`start_date`), 종료일(`end_date`) 및 프로젝트 마일스톤/간트 일정 데이터 (`public.gantt_milestones`).
       * 포함 일정: M&A 딜 클로징 계약 예정일 및 주요 마일스톤 데드라인.
    3. **펀드 캐피탈 콜 일정 레이어**:
       * 데이터 소스: `public.capital_calls` 테이블
       * 포함 일정: 각 펀드별 캐피탈 콜 차수(`call_round`)에 따른 납입 요청 기한(`requested_date`). 미완료(`is_completed = false`) 일정을 강조하여 표시.
    4. **조직 공식 행사 및 사내 결재 일정 레이어**:
       * 데이터 소스: `public.system_events` 중 수동 등록 일정(`source_type = 'manual'`)
       * 포함 일정: 경영실 조직 공식 행사 및 전사 결재 기한 일정.
* **필터 체크박스**
  * **기능**: 사용자는 우측 체크박스(AC 사업, 프로젝트, 펀드, 사내 일정 등)를 통해 필요한 레이어를 선택하여 캘린더 뷰를 유연하게 필터링할 수 있습니다.

### 1.3 전문가 만족도 분석 보드 (Expert Satisfaction Board)
* **누적 평균 만족도 랭킹 차트**
  * **기능**: 스타트업들이Guest 전용 화면에서 작성 제출한 전문가 멘토링 만족도 점수를 가공하여 실시간 랭킹 순위표를 노출합니다.
  * **집계 요건**:
    * 대상 테이블: `public.experts` (전문가 마스터), `public.expert_mentorings` (멘토링 이력)
    * 주요 항목:
      * 전문가 정보: 전문가명(`public.experts.name`), 소속 기관(`public.experts.company`), 직함(`public.experts.position`)
      * 총 자문 횟수: `public.expert_mentorings` 테이블에서 특정 `expert_id`를 기준으로 집계한 총 매칭 횟수 (`COUNT(*)`)
      * 누적 평균 만족도 평점: `public.expert_mentorings.rating` (1.0~5.0) 필드의 평균값 (`AVG(rating)`)
    * 정렬 요건: 누적 평균 만족도 평점을 기준으로 **내림차순 정렬**.
    * 미세 필터링 슬라이더: 상단에 총 자문 횟수 최소 기준(예: 3회 이상 자문을 진행한 전문가만 노출)을 조절할 수 있는 슬라이더 필터를 배치하여 노이즈를 제어합니다.
* **전문가 상세 프로필 및 평가지 의견 피드백 카드**
  * **기능**: 랭킹 목록에서 전문가를 클릭하면, 해당 전문가의 상세 정보와 함께 스타트업의 주관식 피드백 의견을 아코디언 방식으로 펼쳐서 볼 수 있습니다.
  * **노출 데이터**:
    * 전문 분야: `public.experts.specialties` (TEXT[] 타입 배열 데이터를 해시태그 형태로 시각화)
    * 정성 피드백: `public.expert_mentorings.feedback`에 등록된 주관식 코멘트 목록을 최신 날짜 순으로 정렬하여 피드백 카드로 노출.

### 1.4 임직원 프로필 조회 (Staff Directory)
* **전사 임직원 검색/조회 메뉴**
  * **기능**: 전사 임직원(심사역 포함)의 상세 이력, 전문 분야 및 연락처를 한눈에 서칭하고 조회할 수 있는 내부 디렉토리 뷰를 제공합니다.
  * **정보 업데이트 정책**:
    * 임직원(심사역 포함) 마스터 정보는 `MANAGEMENT` 워크스페이스에서 관리합니다. 본인의 프로필(연락처, 사진, 이력, 전문 분야 등)은 로그인 후 **개인 계정(마이페이지) 설정**에서 직접 실시간 업데이트할 수 있습니다.
    * 백엔드 정책에 따라 `public.managers.id = auth.uid()` 조건으로 RLS UPDATE 정책이 설정되어 있어, 타인의 임의 수정을 완벽히 차단하고 본인 계정에 대한 쓰기 권한을 보장합니다.
  * **검색 및 필터링 요건**:
    * 부서별 필터: `public.departments` 목록을 드롭다운으로 노출하여 특정 부서 소속 임직원만 필터링.
    * 전문 분야 검색: `public.managers.specialties` 배열 데이터에 매칭되는 키워드(예: 바이오, SaaS 등)로 임직원 검색.
    * 임직원명/이메일 텍스트 검색 기능.
  * **프로필 상세 카드 및 관계형 활동 이력 탭 (SST 연동)**:
    * **기본 인적 정보**: 프로필 이미지(`profile_image_url`), 이름(`name`), 직급(`position`), 이메일(`email`), 연락처(`phone`), 소속 부서명(`departments.name`).
    * **이력 정보**: `public.managers.biography` JSONB(education, career) 데이터를 파싱하여 학력 및 경력 타임라인을 가독성 높게 노출.
    * **전사 활동 참가 이력 (관계형 DB 연동 조회)**:
      * **참여 사업 이력**: `public.program_managers` 조인 조회. 담당한 보육 프로그램명 및 직무 역할(`role`: `lead` 또는 `operator`) 노출.
      * **참여 프로젝트 이력**: `public.project_managers` 조인 조회. 소속된 M&A 딜/오픈 이노베이션 프로젝트 목록 노출.
      * **담당 스타트업 이력**: `public.startup_managers` 조인 조회. 해당 임직원이 담당(PM)으로 연계되어 후속 관리 중인 스타트업 목록 노출.
      * **담당 펀드 이력**: `public.fund_managers` 조인 조회. 관리역(GP)으로 지정된 운용 펀드 목록 노출.
      * **자문 매칭 이력**: `public.expert_mentorings` 조인 조회. 임직원이 입회 또는 예약 매칭을 중개한 외부 전문가 멘토링 상세 히스토리 노출.

### 1.5 전사 공지사항 및 자료실 (Notice & Resource Center)
* **공지사항 (Notices)**
  * **기능**: 전사 임직원에게 중요한 사내 규정 변경, 행사 등의 공지글을 게시하고 조회하는 화면을 제공합니다.
  * **데이터 소스**: `public.system_notices` (제목, 본문, 작성자, 작성일, 중요도 배지 등)
* **자료실 (Files)**
  * **기능**: 공통 비즈니스 문서 템플릿(서식), 사내 브로셔 등의 전사 공유 파일을 다운로드할 수 있는 아카이브를 제공합니다.
  * **데이터 소스**: Supabase Storage (`resource-files` 버킷) 및 `public.system_resources` 테이블 연동.

### 1.6 도메인별 현황 및 실적 정보 (Domain Summary Board)
* **사업 현황 (AC Summary)**: 기수별 보육 사업 운영 통계 및 스타트업 매핑 현황의 요약 뷰.
* **M&A 현황 (M&A Summary)**: 진행 중인 딜 수 및 딜 소싱 파이프라인의 핵심 진행 단계 현황 요약 뷰.
* **프로젝트 현황 (Project Summary)**: 부서별 활성 태스크 진척도 및 주요 마일스톤 데드라인 모니터링 뷰.
* **투자현황 (Fund Summary)**: 전사 운용 펀드(AUM) 규모 및 총 투자 집행액 집계 실시간 지표 요약 뷰.
* **경영현황 (Management Summary)**: 재무 실적 및 결재 문서 처리 현황 요약 뷰.

---

## 2. 데이터 연동 규격 (Database Schema Mapping)

| 화면 영역 | UI 구성 요소 | 참조 테이블 (public) | 주요 연동 컬럼 | 비즈니스 룰 및 계산식 |
| :--- | :--- | :--- | :--- | :--- |
| **통합 검색** | 일반 검색 결과 목록 | `partners`, `experts`, `programs`, `startups`, `projects`, `managers`, `departments` | `name`, `ceo_name`, `contact_person`, `specialties`, `description`, `position`, `email` | `current_user_role()`에 따른 RLS 정책 적용, 권한 비활성화 데이터 필터링 |
| **통합 검색** | AI 스마트 자연어 검색 | `Gemini API`, 전사 테이블 전체 | 전체 텍스트 컬럼 및 메타데이터 | Gemini API 자연어 해석, RAG 또는 Text-to-SQL 패턴 적용, 딥링크 배지 컴포넌트 자동 생성 |
| **통합 일정** | AC 사업 일정 레이어 | `program_events` (또는 `system_events`) | `title`, `event_type`, `event_date`, `source_type` | `source_type = 'program'` 조건으로 필터링하여 캘린더에 매핑 |
| **통합 일정** | 프로젝트 일정 레이어 | `projects`, `gantt_milestones` | `name`, `start_date`, `end_date`, `project_type` | `project_type = 'm_and_a'` 우선 필터링, 완료되지 않은 딜 클로징 기한 강조 |
| **통합 일정** | 펀드 일정 레이어 | `capital_calls` | `fund_id`, `call_round`, `requested_amount`, `requested_date`, `is_completed` | `is_completed = false` 일정을 데드라인으로 캘린더에 표시 |
| **통합 일정** | 사내 공식 일정 레이어 | `system_events` | `title`, `event_type`, `event_date`, `source_type` | `source_type = 'manual'` 조건으로 필터링하여 캘린더에 매핑 |
| **만족도 보드** | 만족도 랭킹 차트 | `experts` inner join `expert_mentorings` | `id`, `name`, `company`, `rating` | `AVG(rating)` 계산 후 내림차순 정렬, 슬라이더 값에 따라 `COUNT(mentoring_id)` 필터링 |
| **만족도 보드** | 피드백 아코디언 카드 | `experts`, `expert_mentorings` | `specialties`, `feedback`, `mentoring_date` | `specialties` 배열 파싱, `feedback` 이 비어있지 않은 항목을 최신순으로 정렬 |
| **임직원 조회** | 인물 카드 및 상세 이력 | `managers`, `departments` | `name`, `position`, `email`, `phone`, `specialties`, `biography`, `profile_image_url`, `department_id` | `managers` 와 `departments` 조인하여 소속명 출력, `biography` JSONB 구조(학력/경력) 파싱 |
| **임직원 조회** | 전사 활동 참가 이력 | `program_managers`, `project_managers`, `startup_managers`, `fund_managers`, `expert_mentorings` | `program_id`, `project_id`, `startup_id`, `fund_id`, `role`, `manager_id` | `manager_id`를 외래키로 관계형 조인하여 임직원의 사업/프로젝트/스타트업/펀드/멘토링 매칭 이력을 실시간 집계 |

---

## 3. 전사 통합 Works 네비게이션 메뉴 맵 (Navigation Menu Map)

전사 임직원이 사용하는 Works 플랫폼의 GNB(Global Navigation Bar) 메뉴 구성은 아래와 같이 체계적으로 구조화됩니다. 각 메뉴의 접근성은 로그인한 임직원의 권한(ADMIN 통제)에 따라 동적으로 제어됩니다.

### 3.1 메뉴 트리 및 데이터 원천 매핑

*   **[1] HUB (허브 - 전사 인포메이션 포털)**
    *   **그룹 1 (메인)**
        *   **대시보드**: 전사 데이터 통합 조회 및 검색 포털 (`Global Search Portal`)
        *   **AI 검색**: Gemini 연동 자연어 스마트 검색 (`AI Search Engine`)
        *   **전사 캘린더**: 부서 간 일정 오버레이 뷰 (`Global overlay Calendar`)
        *   **공지사항**: 전사 공식 소식 및 전파사항 공유
        *   **자료실**: 공통 서식 및 전사 공유 문서 보관소
    *   **그룹 2 (마스터 정보)**
        *   **심사역 정보**: 전사 구성원 및 담당 심사역 디렉토리 (`Staff Directory`)
        *   **스타트업 정보**: 전사 포트폴리오 스타트업 DB 정보 열람
        *   **전문가 정보**: 외부 자문 및 심사위원 전문가 DB 정보 열람 (`Expert Satisfaction Board` 연동)
        *   **협력사 정보**: 자문/교육/용역 연계 파트너사 정보 열람
    *   **그룹 3 (현황 정보)**
        *   **사업 현황**: 기수별 보육/육성 사업 운영 현황 모니터링
        *   **M&A 현황**: 소싱 및 진행 중인 딜 파이프라인 실시간 관측
        *   **프로젝트 현황**: 부서별 활성 프로젝트 진척 현황 관측
    *   **그룹 4 (실적 정보)**
        *   **투자현황**: 운용 펀드 규모 및 총 투자 집행 현황 요약
        *   **경영현황**: 전사 실적, 재무 KPI 및 결재 현황 요약
*   **[2] NETWORKS (네트워크)**
    *   **스타트업 DB 관리**: `public.startups` & `public.startup_metrics` (등록/수정/관리)
    *   **전문가 DB 관리**: `public.experts` & `public.expert_mentorings` (등록/수정/관리)
    *   **협력사 DB 관리**: `public.partners` (등록/수정/관리)
*   **[3] AC (보육)**
    *   **보육 사업 관리**: 기수별 보육 프로그램 개설 및 멘토링 매칭 (`public.programs` & `public.program_startups`)
*   **[4] FUND (투자)**
    *   **투자 펀드 관리**: 조합 결성, LP 비율, 캐피탈 콜 (`public.funds` & `public.capital_calls`)
*   **[5] M&A**
    *   **딜 및 매칭 관리**: M&A 딜 소싱 파이프라인 및 NDA 검토 (`public.projects` `project_type='m_and_a'`)
*   **[6] PROJECT (프로젝트)**
    *   **업무 프로젝트 관리**: 신사업 및 글로벌 사업부 통합 프로젝트 및 태스크 보드 (`public.projects` `project_type='general'`)
*   **[7] MANAGEMENT (매니지먼트)**
    *   **경영 관리**: 인사 관리(HRD/HRM), 재무 실적, 경영 성과 지표 대시보드 및 전자결재
*   **[8] ADMIN (관리자)**
    *   **시스템 제어**: 사용자 역할 설정, 페이지/데이터 접근 권한 제어 토글, 전사 보안 감사 로그 (`Audit Log`)
*   **[9] GUEST (외부 파트너 채널 - 서브도메인 독립 앱)**
    *   **외부 지원 포털**: WORKS 내부 GNB가 아닌 별도 서브도메인에서 운영되는 스타트업/전문가용 대시보드, 미팅 예약, 평가지 작성 폼
