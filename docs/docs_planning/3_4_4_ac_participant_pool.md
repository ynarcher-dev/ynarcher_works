# [3-4-4] AC 참가자 풀 및 역할 관리 기획서

본 문서는 특정 보육 프로그램에 배정되는 모든 인적 자원(스타트업, 전문가, 멘토, 심사위원, 운영자)을 아우르는 **프로그램 참가자 풀(Participant Pool)**의 관리 기능과, 사용자의 계정 기본 권한에 얽매이지 않고 유연하게 비즈니스 권한을 조정하는 다차원 역할(Role) 설정 및 게스트 권한 발급 정책을 정의합니다.

---

## 1. 목적
* 한 사용자가 특정 프로그램에서는 '심사위원'이고, 다른 프로그램에서는 '멘토'인 복합적 운영 시나리오를 지원하기 위해 계정 권한과 프로그램 역할을 분리합니다.
* 프로그램 내의 모든 개별 기능 모듈(평가, 멘토링, 매칭 등)이 일관되게 참조할 수 있는 참가자 데이터 코어(SSOT)를 구축합니다.
* 외부 참여자(스타트업, 외부 전문가 등)가 WORKS 내부 망에 침범하지 않고 `GUEST` 경유로 본인의 일감에만 즉시 안전하게 접근할 수 있도록 보안 scope를 보장합니다.

---

## 2. 이 문서가 다루는 범위
* 계정 역할, 프로그램 참여 역할, 모듈 참여 역할의 다차원 계층 정의
* 프로그램 참가자 풀 관리 콘솔 및 일괄 CSV 임포터 스펙
* HUB 스타트업/전문가 마스터와 참가자 풀의 데이터 매핑 관계
* GUEST 포털 접근을 위한 인증 발급(OTP, Magiclink) 및 보안 권한 Scope 정의

---

## 3. 핵심 사용자
* **내부 운영자 (PROGRAM_OPERATOR)**: 프로그램에 참여할 스타트업 목록을 확정하고, 외부 전문가 풀을 구성하여 초대 정보를 발급합니다.
* **외부 전문가 및 스타트업 (GUEST_EXPERT, GUEST_STARTUP)**: 부여받은 로그인 토큰 또는 매직링크를 통해 GUEST 포털에 접속하여 자신의 역할에 맞는 일감(평가, 예약 등)을 처리합니다.

---

## 4. 정보 구조 (Information Architecture)

```
[다차원 역할 구조]
 ├── 1. 전역 계정 역할 (Account Role): 시스템 로그인 및 라우팅 경계 제어
 ├── 2. 프로그램 역할 (Program Role): 특정 프로그램 내부의 관리/운영/참여 구분
 └── 3. 모듈 역할 (Module Role): 개별 프로그램 모듈 내에서의 배정/동작 타겟 구분
```

---

## 5. 화면 구성

### 5.1 관리자용 프로그램 참가자 풀 관리 (Participant Pool Console)
```
┌────────────────────────────────────────────────────────────────────────┐
│ [A-STREAM 2026] > [참가자 풀 관리]                                     │
├────────────────────────────────────────────────────────────────────────┤
│ [탭: 스타트업 풀 (12) ] [탭: 전문가/멘토 풀 (24) ] [탭: 운영 스태프 (4) ] │
├────────────────────────────────────────────────────────────────────────┤
│ [검색: 이름/기업명]  [+ CSV 일괄 업로드]  [+ HUB 마스터에서 추가]      │
├────────────────────────────────────────────────────────────────────────┤
│ 이름/기업명 | 원본 마스터 | 부여된 프로그램 역할   | 활성 모듈 범위     | │
│ ────────────────────────────────────────────────────────────────────── │
│ 홍길동      | HUB 전문가  | MENTOR, REVIEWER       | 멘토링, 서면평가   | │
│ 스타트업A   | HUB 스타트업| STARTUP                | 모집, 멘토링, 매칭 | │
│ 이순신      | HUB 임직원  | PROGRAM_OPERATOR       | 전 모듈            | │
│ ────────────────────────────────────────────────────────────────────── │
│ [선택자 일괄 권한 발급] [초대 매직링크 발송]                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 주요 기능

### 6.1 계정 역할, 프로그램 역할, 모듈 역할의 다차원 계층 정의
AC 워크스페이스는 한 명의 외부/내부 사용자가 다수의 프로그램에서 서로 다른 위상으로 작동할 수 있도록 다음과 같은 3계층 역할 모델을 가집니다.

1. **계정 역할 (Account Role)**:
   * 시스템 테이블(`users.role`) 수준에서 부여되는 가장 거친 권한입니다.
   * `internal_admin`(최고관리자), `internal_operator`(내부 운영 심사역), `internal_staff`(현장 스태프), `guest_startup`(외부 스타트업 계정), `guest_expert`(외부 전문가 계정), `viewer`(읽기전용 임직원).
2. **프로그램 참여 역할 (Program Role)**:
   * 특정 프로그램 단위(`program_participants.role`)로 지정되는 역할입니다.
   * `PROGRAM_OWNER` (프로그램 책임 임직원 - 모든 설정 변경 가능)
   * `PROGRAM_OPERATOR` (운영 임직원 - 세션 생성 및 배정 가능)
   * `STARTUP` (참가 스타트업 - GUEST 포털 메인 사용 대상)
   * `EXPERT` / `MENTOR` (전문가/멘토 풀 - 상담 및 멘토링 일지 피드백 제공)
   * `REVIEWER` / `JUDGE` (서면/대면/데모데이 심사위원 - 평가 엔진 작성자)
   * `STAFF` (현장 진행 요원 - 출석, 노쇼 처리 보조)
3. **모듈 참여 역할 (Module Role)**:
   * 프로그램 활성 모듈 내에서 구체적으로 어떤 타겟인지 규정하는 세부 관계입니다.
   * 예: `DOC_REVIEW_EVALUATOR`(서면평가자), `MENTORING_MENTEE`(멘토링 수혜 스타트업), `MATCHING_EXPERT`(비즈니스 매칭 상담 위원).

### 6.2 참가자 풀 관리 및 마스터 연동
* **CSV 일괄 업로드**: 다수의 전문가 및 스타트업을 CSV 파일로 일괄 업로드하여 풀에 적재할 수 있습니다. 이때 등록된 이메일과 전화번호를 기준으로 `HUB 마스터`를 자동 검색하여 매핑 관계를 수립합니다.
* **역할 태그**: 한 명의 전문가에게 `MENTOR`, `REVIEWER`, `JUDGE` 다중 프로그램 역할을 태그 형태로 자유롭게 부여할 수 있습니다.

### 6.3 외부 참여자 접근 권한(Scope) 및 인증 발급 정책
* **외부 게스트 로그인 방식**:
  * 외부 참여자(스타트업, 전문가)는 WORKS 내부 도메인 웹에 직접 로그인할 수 없으므로, GUEST 전용 인증방식을 적용합니다.
  * **Magiclink (매직링크)**: 이메일로 발행되는 1회용 로그인 링크입니다. 링크를 클릭하면 즉시 GUEST 포털에 토큰이 발급되어 진입합니다.
  * **OTP (1회용 비번)**: 휴대전화 번호로 발송되는 6자리 번호를 입력하여 로그인합니다. (현장 모바일 사용 시 매우 유용)
* **보안적 권한 Scope 원칙**:
  * GUEST 앱에서 데이터를 호출하는 모든 API는 Supabase RLS 정책에 따라 **"로그인한 사용자 ID가 해당 프로그램의 참가자 풀(`program_participants`)에 존재하고, 본인에게 배정(`Assignment`)된 세션 데이터에만 해당할 것"**이라는 규칙을 강제 적용합니다.
  * 배정되지 않은 타인의 기업 정보, 타인의 평가 점수, 타 프로그램의 캘린더 호출을 원천 차단합니다.

---

## 7. 데이터 모델 (DB Schema)

### 7.1 program_participants (프로그램 참가자 테이블)
```sql
CREATE TABLE program_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,                       -- Supabase auth.users ID 연동
    role VARCHAR(50) NOT NULL,                   -- PROGRAM_OPERATOR, STARTUP, EXPERT, MENTOR, REVIEWER 등
    hub_master_id UUID,                          -- HUB 스타트업 마스터 또는 전문가 마스터의 ID 연동
    role_tags TEXT[] DEFAULT '{}',               -- ['MENTOR', 'REVIEWER'] 등 복합역할 태그
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(program_id, user_id, role)
);
```

### 7.2 guest_invitations (게스트 초대 및 토큰 테이블)
```sql
CREATE TABLE guest_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,          -- 매직링크용 암호화 토큰
    otp_code VARCHAR(10),                        -- SMS 인증용 OTP 번호
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

---

## 8. 상태 모델

* **게스트 초대 상태 (`guest_invitations.status`)**:
  * `PENDING` (초대장 발송됨) -> `OTP_SENT` (인증번호 발송됨) -> `VERIFIED` (로그인 완료/인증됨) -> `EXPIRED` (기간 만료)

---

## 9. 권한/RLS

* **임직원 및 내부자 (PROGRAM_OPERATOR 이상)**:
  * 본인 담당 프로그램의 `program_participants` 및 `guest_invitations` 테이블에 대해 모든 CRUD 권한을 가집니다.
* **외부 게스트 (guest_startup, guest_expert 등)**:
  * 자신의 참여 정보 레코드(`program_participants`)에 대해서만 오직 조회(`SELECT`) 권한만 가집니다.
  * RLS Policy: `auth.uid() = user_id`

---

## 10. API/RPC/서버 액션

* **함수명**: `fn_generate_guest_magiclink(p_participant_id uuid)`
  * **설명**: 특정 참가자에게 발송할 매직링크 고유 토큰 및 접속 URL을 생성하고 SMS/메일 전송 큐에 적재합니다.
  * **검증 규칙**:
    * 호출자의 권한이 해당 프로그램의 `PROGRAM_OPERATOR` 이상인지 확인합니다.
    * 이미 완료(`joined_at`이 채워진)된 참가자일 경우 재초대 예외 처리 및 갱신 처리를 지원합니다.
    * 감사 로그에 발송 대상 이메일/번호와 발송 심사역 정보를 기록합니다.

---

## 11. GUEST 연동
* 외부 전문가/스타트업이 매직링크나 OTP로 로그인하면, GUEST 앱은 Supabase 세션을 활성화하고 `fn_get_my_program_roles`를 호출하여 현재 본인이 수행해야 할 역할(예: 심사위원 모드 vs 멘토 모드)을 탭 메뉴에 동적으로 반영합니다.

---

## 12. HUB/ADMIN/타 워크스페이스 연동
* **HUB 전문가/스타트업 마스터**: 참가자 풀에 전문가를 등록할 때, `hub_experts` 테이블의 마스터 식별자 `hub_master_id`를 연결하여 성명, 주요 분야, 소속 정보를 마스터에서 끌어다 표출합니다. (중복 기입 방지)

---

## 13. 예외/오류/운영 리스크
* **외부 전문가의 다중 역할 수행에 따른 화면 혼선**: 한 사람이 오전에는 대면 심사를 하고 오후에는 멘토링 상담을 할 때 화면 구성이 꼬일 수 있습니다. GUEST 앱 우측 상단에 **[역할 전환 스위치]**를 제공하여, 본인의 역할을 명시적으로 '심사위원' 혹은 '멘토'로 전환하고 그에 맞춰 Split View 및 시간표가 리렌더링되도록 설계하여 운영 리스크를 예방합니다.

---

## 14. 완료 기준 (Definition of Done)
1. 프로그램 참가자에게 다중 역할 태그가 성공적으로 부여되고 저장되는가?
2. 매직링크 토큰을 통해 외부 사용자가 GUEST 포털에 로그인하여 세션을 확보할 수 있는가?
3. RLS 정책을 통해 외부 전문가가 자기가 속하지 않은 프로그램 참가자 풀을 조회하려 할 때 완벽하게 에러 차단되는가?
4. CSV 대량 임포트 시 누락된 이메일 또는 휴대폰 번호에 대해 적절한 파싱 오류를 뱉어내는가?

---

## 15. 테스트 기준
1. **역할 분리 RLS 검증**: `guest_startup` 테스트 계정으로 로그인한 상태에서 타 스타트업의 `program_participants` 레코드 조회를 시도하여 결과가 0건(또는 Permission Denied)이 나옴을 검증합니다.
2. **매직링크 만료 테스트**: `guest_invitations` 테이블에서 `expires_at`을 10초 뒤로 조작하여 링크 만료 후 진입 시 로그인이 정상 거부되는지 테스트합니다.
3. **CSV 포맷 예외 테스트**: 비정상적인 이메일 포맷(골뱅이 누락 등)이 포함된 CSV 파일을 업로드하여, 롤백 트랜잭션이 작동하고 에러가 발생한 행 번호가 알림창에 상세히 리턴되는지 확인합니다.
