# [3-4-13] AC 성과 지표 및 통합 다운로드 기획서

본 문서는 Program First 구조 안에서 모집부터 데모데이 이후 후속 성과까지 Program 단위 KPI를 집계하고, 기업별 전적 타임라인과 통합 Excel 다운로드를 제공하는 모듈을 정의합니다.

---

## 1. 목적

성과 모듈은 단순 만족도 차트가 아니라 Program 운영 결과를 보고서와 후속 투자/M&A 연계에 사용할 수 있도록 구조화하는 데이터 허브입니다.

---

## 2. 이 문서가 다루는 범위

1. Program KPI 요약
2. 모듈별 운영 성과 집계
3. 스타트업별 전적 타임라인
4. 만족도/후속 성과 입력
5. 통합 Excel 다운로드
6. 다운로드 감사 로그와 마스킹

---

## 3. 핵심 사용자

* **AC 운영자**: Program 성과를 점검하고 보고 자료를 다운로드합니다.
* **관리자/경영진**: Program 단위 KPI와 후속 성과를 확인합니다.
* **FUND/M&A 담당자**: 후속 투자 또는 인수 검토 후보를 참조합니다.

---

## 4. 정보 구조

```txt
Program
  -> module_kpi_snapshots
  -> startup_program_timelines
  -> outcome_records
  -> export_jobs
  -> export_audit_logs
```

---

## 5. 화면 구성

### 5.1 KPI 대시보드

```txt
[Program 선택] [기간 필터] [모듈 필터] [다운로드]

KPI Summary
  - 신청 수 / 제출 완료 수 / 선발 수
  - 평가 제출률 / 평균 점수
  - OT 출석률
  - 멘토링 완료율 / 일지 제출률
  - 비즈니스 매칭 완료 수 / 노쇼 수 / 후속 미팅
  - 데모데이 관심 투자자 수
  - 만족도 평균 / 후속 성과
```

### 5.2 기업별 전적 타임라인

```txt
신청 -> 서면평가 -> 대면평가 -> 선발 -> OT -> 멘토링 -> 매칭 -> 데모데이 -> 후속성과
```

---

## 6. 주요 기능

### 6.1 KPI 집계

* 모듈별 원천 테이블에서 Program 기준 KPI를 집계합니다.
* 집계 결과는 조회 성능을 위해 snapshot으로 저장할 수 있습니다.
* 운영자는 집계 기준 시각과 원천 데이터 마지막 갱신 시각을 확인합니다.

### 6.2 후속 성과 입력

* 후속 미팅, PoC, 투자 검토, 계약, 매출, FUND 연동, M&A 연동 상태를 기록합니다.
* 성과 기록은 스타트업별로 누적하며, 공개/내부 전용 범위를 구분합니다.

### 6.3 통합 다운로드

* 운영자는 컬럼 그룹을 선택해 Excel을 생성합니다.
* 개인정보와 민감 평가 의견은 권한에 따라 마스킹하거나 제외합니다.
* 다운로드 시 사유 입력과 감사 로그를 필수로 남깁니다.

---

## 7. 데이터 모델

```txt
module_kpi_snapshots
  - id
  - program_id
  - module_type
  - metric_key
  - metric_value
  - calculated_at

outcome_records
  - id
  - program_id
  - startup_id
  - outcome_type
  - status
  - amount
  - note
  - visibility

export_jobs
  - id
  - program_id
  - requested_by
  - column_groups
  - masking_policy
  - status
  - file_id
```

---

## 8. 상태 모델

```txt
export_jobs.status
  REQUESTED
  PROCESSING
  READY
  FAILED
  EXPIRED

outcome_records.status
  LEAD
  IN_PROGRESS
  DONE
  DROPPED
```

---

## 9. 권한/RLS

* AC 운영자는 담당 Program의 KPI와 다운로드를 사용할 수 있습니다.
* 민감 평가 의견, 개인정보, 투자 관련 금액은 별도 권한이 없으면 마스킹합니다.
* 다운로드 권한은 `export` 권한과 사유 입력을 요구합니다.
* GUEST는 내부 KPI와 다운로드 기능에 접근할 수 없습니다.

---

## 10. API/RPC/서버 액션

```txt
calculate_program_kpi(program_id)
get_program_kpi_summary(program_id, filters)
get_startup_program_timeline(program_id, startup_id)
upsert_outcome_record(program_id, startup_id, payload)
request_program_export(program_id, column_groups, reason)
generate_program_export(export_job_id)
download_program_export(export_job_id)
```

---

## 11. GUEST 연동

GUEST는 자기 제출물, 상담일지, 공개 피드백 등 개별 결과만 확인합니다. Program 전체 KPI, 타 기업 점수, 통합 다운로드는 제공하지 않습니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동

* HUB 스타트업 상세에는 Program 참여 전적과 후속 성과 요약이 표시됩니다.
* FUND/M&A는 투자 검토 또는 인수 검토 성과 상태를 참조합니다.
* ADMIN은 다운로드 사유, 컬럼 그룹, 마스킹 정책, 파일 접근 이력을 감사합니다.

---

## 13. 예외/오류/운영 리스크

* 원천 데이터가 변경되면 snapshot의 기준 시각을 명확히 표시합니다.
* Excel 생성 실패 시 재시도 가능 상태와 오류 사유를 제공해야 합니다.
* 개인정보 포함 다운로드는 만료 시간을 두고 재다운로드를 제한합니다.

---

## 14. 완료 기준

1. Program 단위 KPI와 모듈별 KPI가 집계된다.
2. 기업별 전적 타임라인이 확인된다.
3. 컬럼 그룹 선택형 Excel 다운로드가 가능하다.
4. 다운로드 감사 로그와 마스킹 정책이 적용된다.

---

## 15. 테스트 기준

1. 권한 없는 사용자가 민감 컬럼을 다운로드할 수 없는지 검증합니다.
2. 다운로드 사유 없이 export job이 생성되지 않는지 검증합니다.
3. KPI snapshot이 원천 데이터 변경 후 재계산되는지 검증합니다.
