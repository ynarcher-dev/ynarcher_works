# [3-3-1] 스타트업 풀 구분·담당자·관리현황 상세 기능 요건서

> [!NOTE]
> 본 문서는 [3_3_workspace_networks.md](./3_3_workspace_networks.md)의 스타트업 마스터를 대상으로, STARTUP 메뉴(투자기업·보육기업·발굴기업·기타기업)의 **구분(분류) 체계**, **담당자 권한 모델**, **관리현황 적용 범위**를 규정하는 세부 요건서입니다. 스타트업 마스터의 SSOT는 NETWORKS이며(마스터 데이터 단일 변경 원칙), 본 문서의 권한 규칙은 UI가 아니라 **서버(RLS/RPC)에서 강제**함을 원칙으로 합니다.

---

## 1. 목적 및 범위

* **목적**: 스타트업을 우리와의 관계 심화 단계에 따라 4개 구분으로 분류하고, 구분에 따라 노출 메뉴·편집 권한·표시 필드를 차등화한다.
* **범위**: `startups` 마스터의 구분(`management_status`), 담당자(`startup_managers`), 관리현황(`pool_status`) 및 이들과 연동되는 목록·상세·등록 화면.
* **제외**: 스타트업의 기본 프로필/성장지표/주주/미디어 등 콘텐츠 필드 자체의 정의(기존 마이그레이션 및 상세 폼에서 관리).

---

## 2. 구분(management_status) 라이프사이클 모델

스타트업의 구분은 **관계가 깊어지는 라이프사이클의 현재 상태 한 개**로 표현합니다. 발굴 → 보육 → 투자는 관계 심화의 승격 경로이며, 기타는 사다리 밖의 별도 버킷입니다. 한 기업은 동시에 여러 구분을 갖지 않습니다(단일값).

| 코드 | 라벨 | 정의 |
| :--- | :--- | :--- |
| `sourced` | 발굴기업 | 우리 관리를 받지 않았으나 미팅한 기업. 담당자 없음. |
| `incubated` | 보육기업 | 우리 사업·활동을 통해 액셀러레이팅/보육을 받은 기업. 담당자 없음. |
| `invested` | 투자기업 | 펀드를 모아 실제 투자를 집행하고, 내부 담당자가 배정된 기업. |
| `other` | 기타기업 | 위 분류에 해당하지 않는 기타. 자유 분류 텍스트(`management_status_etc`) 병기 가능. |

> [!IMPORTANT]
> 라이프사이클·권한 판정이 "투자냐 아니냐"에 직접 의존하므로, `management_status`는 자유 텍스트가 아니라 위 **코드값(UPPER 코드 4종)** 으로 정규화합니다. 한글 라벨은 UI 매핑에서만 관리하며 코드값이 단일 원천입니다. 기존 한글 문자열 데이터는 코드로 이관하고, 매핑 불가값은 `other`로 격리합니다.

---

## 3. 구분 → 메뉴 노출 규칙

STARTUP 워크스페이스의 4개 메뉴는 **구분값으로 사전 필터된 상호 배타적 뷰**입니다. 한 기업은 자신의 현재 구분에 해당하는 메뉴 한 곳에만 노출되며, 승격 시 이전 메뉴에서 빠지고 새 메뉴로 이동합니다.

| 구분 | 노출 메뉴 | 담당자 | 관리현황(pool_status) | 발굴경로 |
| :--- | :--- | :---: | :---: | :---: |
| `sourced` | 발굴기업 | 없음 | 숨김 | 사용 |
| `incubated` | 보육기업 | 없음 | 숨김 | 선택 |
| `invested` | 투자기업 | **필수(지정)** | **사용** | 선택 |
| `other` | 기타기업 | 없음 | 숨김 | 선택 |

* **발굴기업 메뉴 범위**: `management_status = 'sourced'`인 기업만 노출합니다(전체 마스터 디렉토리가 아님).

---

## 4. 담당자 권한 모델

* **원칙**: 투자기업에만 지정 담당자가 존재하며, 지정 담당자와 관리자만 해당 기업 정보를 생성·수정·삭제할 수 있습니다. 담당자가 없는 구분(발굴·보육·기타)은 NETWORKS 쓰기 권한자 누구나 편집할 수 있습니다.
* **담당자 구조(복수)**: 투자기업은 **리드 1명 + 지원 N명**의 담당자를 가질 수 있습니다. 담당자는 전용 조인 테이블 `startup_managers`로 관리하며, 레코드 등록자(`startups.created_by`)와는 별개 개념입니다.
* **재지정 권한**: 담당자 추가·해제·리드 변경은 **관리자 또는 해당 기업의 기존 담당자**만 수행할 수 있습니다.

| 구분 | 생성(INSERT) | 수정(UPDATE) | 삭제(soft delete) |
| :--- | :--- | :--- | :--- |
| 발굴·보육·기타 | NETWORKS 쓰기 권한자 누구나 | NETWORKS 쓰기 권한자 누구나 | NETWORKS 쓰기 권한자 누구나 |
| 투자 | 등록 시 담당자 원자 지정 | 지정 담당자 + 관리자 | 지정 담당자 + 관리자 |

> [!NOTE]
> `super_admin`은 상위 헬퍼(`is_admin()`)에서 항상 우회 통과합니다. 물리 삭제는 금지되며 삭제는 `deleted_at` 소프트 삭제(UPDATE)로만 처리되어 위 수정 권한 규칙에 귀속됩니다.

---

## 5. 등록·승격 흐름

구분은 **신규 등록 시점에 직접 선택**할 수 있습니다(항상 발굴로 시작하지 않음). 투자기업 관련 경로는 담당자 지정과 원자적으로 처리하기 위해 RPC를 경유합니다.

* **비투자 등록(발굴·보육·기타)**: 담당자 없이 생성하며 이후 누구나 편집합니다.
* **투자 등록**: 담당자(리드 최소 1명)를 함께 지정해야 하며, 스타트업 행과 담당자 행을 한 트랜잭션에서 생성합니다. 리드 미지정 시 등록자 본인을 리드로 기본 지정하는 옵션을 둡니다.
* **승격(발굴/보육 → 투자)**: 기존 레코드를 투자로 전환하면서 담당자를 원자적으로 지정합니다.

```
create_startup(payload, management_status, lead_user_id?, support_user_ids[])
  SECURITY DEFINER, 트랜잭션 내:
   1) can_write_workspace('networks') 자격 확인 (미보유 시 거부)
   2) management_status='invested' 인데 lead 없음 → 거부 (리드 필수 검증)
   3) startups INSERT (created_by = 요청자)
   4) invested면 startup_managers INSERT (리드 1 + 지원 N)

promote_to_invested(startup_id, lead_user_id, support_user_ids[])
  SECURITY DEFINER, 트랜잭션 내:
   1) can_write_workspace('networks') 자격 확인
   2) lead 없음 → 거부
   3) startup_managers INSERT → startups.management_status='invested' 세팅
```

> [!IMPORTANT]
> 투자 전환 시점에는 담당자 행이 아직 없어 행 단위 RLS(§7)의 WITH CHECK가 스스로를 막는 치킨에그가 발생합니다. 생성·승격을 위 `SECURITY DEFINER` RPC로 원자 처리하여 이 문제를 제거합니다.

---

## 6. 관리현황(pool_status) 규칙

* **적용 범위**: 관리현황(`pool_status`)은 **`management_status = 'invested'`일 때만** 표시·편집·필터합니다. 비투자 구분에서는 목록 컬럼값을 숨김(N/A) 처리합니다.
* **무결성**: 투자가 아닌 구분에서는 `pool_status`가 NULL이 되도록 트리거로 강제합니다(투자 → 하위 강등 시 자동 클리어).

---

## 7. 권한(RLS) 설계

현행 `startups` 정책은 워크스페이스 단위(`can_write_workspace('networks')`)만 검사하여 행 단위 담당자 잠금이 불가능합니다. UPDATE 정책을 아래로 확장합니다(소프트 삭제 UPDATE도 이 정책에 귀속).

```
-- startups UPDATE : using / with check
can_write_workspace('networks')
AND (
  management_status IS DISTINCT FROM 'invested'      -- 비투자: 누구나
  OR is_admin()
  OR EXISTS (select 1 from startup_managers m
              where m.startup_id = startups.id
                and m.user_id = current_app_user_id())  -- 투자: 담당자만
)
```

```
-- startup_managers INSERT/UPDATE/DELETE (담당자 배정·해제·리드 변경)
is_admin()
OR EXISTS (요청자가 해당 startup의 기존 담당자)          -- 관리자 + 기존 담당자
```

* **SELECT**: 담당자 존재 여부와 무관하게 NETWORKS 읽기 권한자 전원 조회(기존 규칙 유지).
* **INSERT(startups)**: 최초 담당자 부트스트랩은 §5의 생성/승격 RPC가 담당하므로, 직접 INSERT 경로는 비투자 생성에 사용합니다.

---

## 8. 화면 사양

### 8.1 목록(4개 메뉴)

* 각 메뉴는 `management_status` 코드로 사전 필터된 뷰입니다. 현재 발굴 탭만 목록이 존재하고 투자·보육·기타는 빈 화면이므로 **세 목록을 신규 구현**합니다.
* 컬럼은 구분에 따라 조건부로 노출합니다.

| 컬럼 | 발굴 | 보육 | 투자 | 기타 |
| :--- | :---: | :---: | :---: | :---: |
| 담당자 | 등록자 표시 | 등록자 | **지정 담당자(리드 강조)** | 등록자 |
| 관리현황 | — | — | 사용 | — |
| 발굴경로 | 사용 | 선택 | 선택 | 선택 |

### 8.2 상세

* 구분에 따라 카드를 조건부 노출합니다(투자 = 담당자 카드 + 관리현황 카드, 발굴 = 발굴경로).
* 비담당자가 투자기업 상세를 열면 읽기전용으로 표시하되, 최종 차단은 서버(RLS)가 강제하고 UI는 보조 수단으로만 둡니다.

### 8.3 등록

* 등록 폼에 **구분 선택 필드**를 두어 4개 구분 중 하나로 직접 생성할 수 있습니다.
* 투자를 선택하면 담당자(리드/지원) 지정 UI가 필수로 노출되고, 미지정 시 저장을 차단합니다.
* 승격 액션(발굴/보육 상세의 "투자기업으로 전환")은 담당자 지정 모달을 거쳐 `promote_to_invested`를 호출합니다.

---

## 9. 데이터 모델 변경 요약

```sql
-- (1) 구분 코드 정규화
management_status  text  NOT NULL DEFAULT 'sourced'
  CHECK (management_status IN ('sourced','incubated','invested','other'))
management_status_etc  text  -- other 자유 분류 라벨

-- (2) 담당자 조인(복수, 리드 1명)
create table startup_managers (
  startup_id  uuid not null references startups(id),
  user_id     uuid not null references users(id),
  is_lead     boolean not null default false,
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  primary key (startup_id, user_id)
);
create unique index startup_managers_one_lead
  on startup_managers(startup_id) where is_lead;

-- (3) 관리현황 투자 전용 무결성: management_status<>'invested' → pool_status = NULL (트리거)
```

---

## 10. 구현 작업 분해

**DB / 보안**

1. `management_status` 코드화 + CHECK + 한글→코드 데이터 이관 마이그레이션
2. `startup_managers` 테이블 + RLS + 리드 유니크 인덱스
3. `pool_status` 투자 전용 무결성 트리거
4. `startups` UPDATE 정책 교체(행 단위 담당자 잠금)
5. `create_startup` / `promote_to_invested` RPC(SECURITY DEFINER)

**프론트**

6. 4개 메뉴 목록 필터 연결 + 투자·보육·기타 목록 구현
7. 구분별 조건부 컬럼·상세 카드 노출
8. 등록 폼 구분 선택 + 투자 선택 시 담당자 지정 필수 플로우 + 승격 모달
9. 비담당자의 투자기업 읽기전용 게이팅(UI 보조)

---

## 11. 보안 게이트 체크포인트

[11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md) 대상: 신규 테이블(`startup_managers`), 신규 `SECURITY DEFINER` RPC 2종(`create_startup`, `promote_to_invested`), `startups` RLS 변경. 완료 보고에 체크리스트 통과 여부를 포함합니다.

---

## 12. 열린 이슈

* **컬럼명 혼동**: `management_status`(실제 의미 "구분")와 `pool_status`(실제 의미 "관리현황")의 이름이 직관과 어긋남 — 주석/문서로 고정하되 장기 리네이밍을 검토합니다.
* **강등 정책**: 투자 → 하위 강등 시 담당자 이력 보존 범위와 배타 잠금 해제 처리 세부.
* **등록자·리드 동일화**: 투자 등록/승격 시 등록자(`created_by`)와 리드 담당자의 자동 동일 지정 여부.
