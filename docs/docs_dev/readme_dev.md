# 📂 Developer Documents Index (readme_dev.md)

본 문서는 와이앤아처 통합 Works 플랫폼의 **물리 데이터베이스 설계, API 컨벤션, 인프라 배포 및 테크니컬 스펙(Dev)**에 관한 문서들을 인덱싱하고 진행 상태를 추적하는 관리 파일입니다.

---

## 📄 개발 문서 목록 및 진행 상태

| 문서명 | 파일 링크 | 설명 | 상태 |
| :--- | :--- | :--- | :---: |
| **기술 스택 및 아키텍처 의견서** | [1_development_stack.md](./1_development_stack.md) | 사용자가 확정한 React, TS, AWS S3/CloudFront 기반 설계 의견서 | **검토 중** |
| **인증 및 권한 아키텍처 설계서** | [2_auth_permissions_architecture.md](./2_auth_permissions_architecture.md) | 사용자 역할, 워크스페이스 권한 단계, 데이터 Scope 및 감사 로그 설계서 | **작성 완료** |
| **데이터베이스 RLS 정책 매트릭스** | [3_database_rls_policy_matrix.md](./3_database_rls_policy_matrix.md) | Supabase/PostgreSQL RLS 기본 원칙 및 테이블별 RLS 정책표 | **작성 완료** |
| **보안 및 개인정보 보호 정책서** | [4_security_privacy_policy.md](./4_security_privacy_policy.md) | 개인 식별 정보(PII) 마스킹, Secret 및 파일/Export 보안 가이드 | **작성 완료** |
| **백업, 보존 및 개인정보 파기 기준** | [5_backup_retention_privacy.md](./5_backup_retention_privacy.md) | RPO/RTO 기준, 데이터 보존 및 7단계 개인정보 파기 운영 기준 | **작성 완료** |
| **API 계약 및 서버 보안 기준서** | [6_api_contracts.md](./6_api_contracts.md) | API 공통 규격 및 에러 코드, 입력 유효성 검증 표준 명세서 | **작성 완료** |
| **데이터베이스 설계 및 테이블 통합 가이드라인** | [7_database_design_guidelines.md](./7_database_design_guidelines.md) | 테이블 단편화 방지 원칙, 1:1 관계 통합, 다형적 공통 테이블 및 JSONB 설계 규칙 | **작성 완료** |
| **Git 브랜치 전략 및 커밋 컨벤션** | [8_git_branch_commit_convention.md](./8_git_branch_commit_convention.md) | 트렁크 기반 브랜치 운영, 커밋 메시지 형식, PR 절차 및 커밋 전 검증 체크리스트 | **작성 완료** |
| **데이터베이스 물리 스키마 정의** | [9_database_physical_schema.md](./9_database_physical_schema.md) | Phase 2 공통/NETWORKS 테이블, 열거형, RLS 헬퍼/정책, 감사 트리거 및 ERD | **작성 완료** |
| **개발 규칙 및 컨벤션** | _(작성 예정)_ | 코딩 표준 규칙, 폴더링 및 파일당 제한 규정 가이드 | **대기 중** |
| **배포 및 CI/CD 가이드** | [10_deployment_cicd_guide.md](./10_deployment_cicd_guide.md) | S3/CloudFront 정적 호스팅, SPA 폴백, GitHub Actions CI/CD, 롤백·알림 채널 | **작성 완료** |
| **Supabase 마이그레이션 보안 게이트** | [11_migration_security_gate.md](./11_migration_security_gate.md) | 신규 테이블/RLS/RPC/Storage/SECURITY DEFINER 변경 시 반드시 통과할 보안 체크리스트 | **작성 완료** |

---

## ✍️ 히스토리 및 진행 예정 사항

### 2026-07-08
* **Supabase 마이그레이션 보안 게이트 추가**: Claude/Codex/사람이 작성하는 모든 마이그레이션에 대해 RLS, 권한 Scope, 감사 로그, Storage, `SECURITY DEFINER` 함수 기준을 사전 점검하도록 [11_migration_security_gate.md](./11_migration_security_gate.md)를 추가함.

### 2026-07-05 (최신)
* **Git 브랜치 전략 및 커밋 컨벤션 정의서 작성 완료**: 트렁크 기반 브랜치 운영과 `<type>(<scope>): <제목>` 커밋 규칙, PR 절차를 규격화한 [8_git_branch_commit_convention.md](./8_git_branch_commit_convention.md) 추가.
* **데이터베이스 설계 및 테이블 통합 가이드라인 작성 완료**: 테이블 무분별 분리 방지 및 마이그레이션 파일 관리 수칙을 포함한 [7_database_design_guidelines.md](./7_database_design_guidelines.md) 추가.
* **보안 및 운영 상세 가이드라인 분할 작성 완료**: `gemini_security_docs_master_guide.md` 지시에 의거하여, 실제 구현 및 운영 단계 통제를 위한 5대 상세 개발 명세서(2 ~ 6번 문서)를 쪼개어 세부 기술함.
* **기술 스택 및 아키텍처 의견서 작성**: 사용자가 제안한 React, TS, AWS S3/CloudFront 호스팅 결정을 기반으로 한 분석 및 스타일링/라이브러리 추천 의견서([1_development_stack.md](./1_development_stack.md))를 추가함.
* **개발 문서 폴더 생성 및 초기화**: 본 `readme_dev.md`를 신규 생성하여 기획 단계 이후 시작될 본격적인 개발 명세를 누적할 수 있도록 공간 준비 완료.

### 진행 예정
* 기획 단계 및 세부 비즈니스 룰 정의 정교화 진행 상태에 맞춰 데이터베이스 물리 스키마 정의 문서 구체화 착수.
