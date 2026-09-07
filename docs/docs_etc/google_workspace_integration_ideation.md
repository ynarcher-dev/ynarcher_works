# Google Workspace 연동 아이데이션

> 작성일: 2026-09-05  
> 상태: 논의 중인 초안 — 구현 확정 문서가 아님  
> 목적: 와이앤아처 통합 WORKS와 Google Workspace의 역할을 나누고, 이후 연동 범위와 도입 순서를 계속 검토하기 위한 기준점

---

## 1. 논의 배경

현재 하이웍스를 사용하고 있으며, 향후 전사에 Google Workspace를 도입할 가능성이 있다. 이때 WORKS의 모든 기능을 Google 서비스로 교체하기보다는 Google Workspace가 잘하는 협업 영역과 WORKS가 소유해야 할 업무 원장 영역을 구분할 필요가 있다.

현재 검토 중인 주요 질문은 다음과 같다.

* WORKS 전사 캘린더를 Google Calendar로 대체하거나 연동할 수 있는가?
* 사이트 안에서 발생한 알림을 Windows PC와 iPhone에서 실시간 팝업으로 받을 수 있는가?
* Google Shared Drive와 S3는 어떤 관계이며 둘 중 하나만 선택해야 하는가?
* MANAGEMENT의 임직원 계정과 Google Workspace 유료 계정을 어떻게 분리해야 하는가?
* 인력 축소나 퇴사로 Google 라이선스를 회수해도 회사의 기존 업무 데이터가 남게 하려면 어떻게 해야 하는가?

---

## 2. 현재까지의 핵심 방향

Google Workspace와 WORKS의 역할은 다음처럼 나누는 방향이 적절하다.

> **WORKS DB와 S3는 회사 업무 데이터의 정본이며, Google Workspace는 활성 임직원을 위한 선택적 협업 도구이자 알림 채널이다.**

이에 따라 다음 원칙을 둔다.

1. WORKS 계정과 Google Workspace 계정은 분리한다.
2. 임직원 원장과 과거 업무 기록은 Google 계정의 존재 여부와 무관하게 유지한다.
3. Google Workspace 계정은 필요한 재직자에게만 선택적으로 발급한다.
4. Google Chat은 알림의 원장이 아니라 실시간 전달 채널로 사용한다.
5. Google Calendar는 일정 사용자 경험을 담당하되 사업 일정의 원본은 각 WORKS 도메인에 둔다.
6. S3는 서비스 파일 저장소로 유지하고, Shared Drive는 공동 편집이 필요한 내부 문서에 제한적으로 사용한다.
7. 결재, 근태, 자산, 거래처, 스타트업, 전문가, 프로그램 같은 회사 고유 상태와 이력은 WORKS가 소유한다.

---

## 3. 기능별 Google 활용 가능성

| WORKS 기능 | Google 활용 방향 | 현재 판단 |
| :--- | :--- | :--- |
| 내부 로그인 | 선택적으로 Google 로그인 연결 | 계정 분리 전제의 부분 연동 |
| 임직원 디렉토리 | Google Directory의 이메일·사진·상태를 보조 정보로 동기화 | WORKS 인사 원장 유지 |
| 전사 캘린더 | WORKS 사업 일정을 Google Calendar에 자동 발행 | 우선 검토 가치 높음 |
| 회의실 예약 | Google Calendar Resource로 회의실 예약·충돌 검사 | 대부분 대체 가능 |
| 회의록 | Calendar·Meet·Docs 결과를 WORKS의 참석자·사업 원장과 연결 | 부분 대체 |
| 자료실·첨부 | 내부 공동 문서는 Shared Drive, 서비스 파일은 S3 | 병행 운영 |
| 공지사항 | WORKS에 원본 저장 후 Google Chat·Gmail로 전달 | 연동 권장 |
| 게시판 | 빠른 대화는 Chat Space, 공식·누적 게시물은 WORKS | 역할 분리 |
| 전자결재 | Google은 알림·문서 협업만 담당 | WORKS 유지 |
| 간단한 신청 | Forms 또는 AppSheet 적용 가능성 검토 | 제한적 대체 |
| 근태 | 휴가 일정만 Calendar 표시 가능 | WORKS 원장 유지 |
| 자산·반출 | 대여 일정을 Calendar에 표시할 수 있음 | 재고·상태 원장은 WORKS 유지 |
| 거래처·스타트업·전문가 DB | Google Contacts로 대체하지 않음 | WORKS 유지 |
| 재무·KPI | 향후 BigQuery·Looker Studio 분석 연동 검토 | 분석 채널로 활용 |
| GUEST | Google 계정이 없는 외부 사용자를 위해 기존 서비스 유지 | WORKS 유지 |

---

## 4. 계정 모델

### 4.1 WORKS 계정과 Google 계정을 분리한다

MANAGEMENT에서 임직원을 등록하거나 WORKS 계정을 발급한다고 해서 Google Workspace 계정을 자동 생성하지 않는다. Google Workspace는 사용자별 비용이 발생하고 인력 변동 시 라이선스를 회수해야 하기 때문이다.

권장 모델은 다음과 같다.

```text
임직원 원장
└─ WORKS 계정: 회사 업무 기록의 영구 식별자

Google Workspace 계정
└─ 필요한 재직자에게만 붙이는 선택적 유료 협업 계정
```

MANAGEMENT 화면도 아래와 같이 분리한다.

```text
[WORKS 계정 발급]

Google Workspace
상태: 연결되지 않음
[Google 계정 연결] [발급 요청]
```

### 4.2 업무 기록은 WORKS 사용자 ID를 참조한다

결재 기안자, 회의록 작성자, 댓글 작성자, 프로그램 담당자 등은 Google 이메일이나 Google 계정 ID를 직접 참조하지 않는다.

```text
employees / users
├─ id                    WORKS 내부 영구 식별자
├─ employee_status       재직·휴직·퇴사
├─ google_user_id        선택적 연결
├─ google_subject        선택적 로그인 연결
├─ google_email          변경 가능한 보조 정보
└─ google_account_status 미연결·활성·정지·보관·삭제
```

Google 계정이 삭제된 뒤에도 과거 기록에는 작성자의 이름과 당시 소속이 남아야 한다.

### 4.3 Google 계정 상태별 처리

| 상태 | Google 로그인 | 데이터 | 라이선스 관점 |
| :--- | :---: | :--- | :--- |
| 활성 | 가능 | 유지 | 일반 Workspace 라이선스 사용 |
| 정지 | 불가 | 유지 | 일반적으로 활성 라이선스가 계속 필요 |
| 보관 사용자 | 불가 | 유지 | 별도의 Archived User 라이선스 필요 |
| 삭제 | 불가 | 이전·보관하지 않은 개인 귀속 데이터 손실 위험 | 활성 라이선스 회수 가능 |

Archived User는 활성 라이선스를 회수하면서 기존 사용자 데이터를 보존하는 선택지지만 무료 보관이 아니므로, 보존 가치와 비용을 따져 적용해야 한다.

---

## 5. 저장소 전략: S3와 Shared Drive

### 5.1 두 저장소는 대체 관계가 아니다

| 구분 | S3 | Google Shared Drive |
| :--- | :--- | :--- |
| 성격 | 애플리케이션용 오브젝트 스토리지 | 임직원용 공동 문서 공간 |
| 접근 주체 | WORKS 서버와 사용자 | Google 계정을 가진 임직원 |
| 권한 | WORKS RLS·Signed URL 등으로 제어 | Google Group·Drive 권한으로 제어 |
| 공동 편집 | 제공하지 않음 | Docs·Sheets·Slides 공동 편집 |
| 외부 GUEST 파일 | 적합 | 계정·외부 공유 정책 때문에 상대적으로 복잡 |
| 자동 처리 | 썸네일·전사·변환·배치 처리에 적합 | 일반적인 앱 처리 저장소로는 부적합 |
| 소유권 | 서비스/버킷 | Shared Drive는 조직 소유 |

따라서 S3 도입 계획은 유지한다.

### 5.2 권장 저장 위치

```text
S3
├─ GUEST 제출 파일
├─ 스타트업·전문가 업로드
├─ 전자결재 확정본과 첨부
├─ 자산 사진
├─ 회의 녹음 원본
├─ 시스템 생성·변환 파일
└─ 장기 보존이 필요한 업무 기록

Google Shared Drive
├─ 사내 규정과 양식
├─ 회의자료와 공동 회의록
├─ 프로그램 운영 공동 문서
├─ 투자 검토 공동 문서
└─ Docs·Sheets·Slides 협업 문서
```

Shared Drive 파일은 개인이 아니라 조직이 소유하므로 작성자의 계정이 삭제돼도 유지된다. 반면 개인의 `내 드라이브` 파일은 계정 삭제 전에 소유권 이전, Shared Drive 이동 또는 별도 백업이 필요하다.

### 5.3 최종본 보존

Google Docs에서 작성·협업하더라도 업무상 확정된 문서는 PDF 등의 불변 스냅샷으로 S3에 보관하는 방식을 검토한다.

```text
Google Docs에서 작성·협업
        ↓
결재 또는 최종 확정
        ↓
PDF 스냅샷 생성
        ↓
S3 장기 보관
```

이 방식은 Google 문서나 계정이 나중에 정리돼도 확정 당시 문서를 보존하기 위한 것이다.

---

## 6. Google Calendar 연동

### 6.1 캘린더 역할 분리

* AC·PROJECT·FUND 등의 사업 마일스톤은 WORKS가 원본이다.
* WORKS 일정을 임직원이 구독하는 Google 공용 캘린더에 발행한다.
* 개인 회의와 일반 일정은 Google Calendar가 원본이다.
* 회의실 예약은 Google Calendar Resource를 원본으로 삼는 방안을 검토한다.
* 양방향 편집은 충돌과 원본 판정 문제가 있으므로 초기 범위에서 제외한다.

예상 공용 캘린더는 다음과 같다.

```text
전사 일정
AC 프로그램 일정
PROJECT 일정
FUND 일정
지사별 일정(필요 시)
```

각 Google 일정에는 WORKS의 원본 상세 화면으로 돌아오는 딥링크를 넣는다.

### 6.2 알림 구분

Calendar는 정해진 시각을 알려야 하는 항목에 사용한다.

* 회의 시작 10분 전
* 모집·평가 마감
* 자산 반납 예정일
* 계약 갱신일

업무가 발생한 즉시 알려야 하는 결재 요청, 댓글, 담당자 지정 등은 Google Chat이 담당한다.

---

## 7. Google Chat 알림 연동

### 7.1 기본 구조

Google Chat은 WORKS 알림의 실시간 팝업 전달 채널로 사용한다.

```text
WORKS 업무 이벤트 발생
        ↓
WORKS 알림 원장 저장
        ↓
알림 라우터
 ├─ 사이트 내 알림
 ├─ Google Chat 개인 메시지
 ├─ Google Chat 팀 Space
 ├─ Google Calendar
 └─ 필요 시 Gmail
```

Windows에서는 Google Chat 웹/PWA 알림, iPhone과 Android에서는 Google Chat 앱 푸시 알림을 받을 수 있다. 단, 운영체제 알림 설정, 브라우저 권한, 네트워크, 방해금지 모드 등의 영향을 받으므로 절대적인 전달 보장은 아니다.

### 7.2 모든 알림을 Chat으로 보내지 않는다

행동이 필요한 알림은 즉시 Chat으로 보내고, 단순 정보성 알림은 WORKS 안에만 남기거나 요약한다.

| 등급 | 예시 | 전달 방식 |
| :--- | :--- | :--- |
| 긴급 | 서비스 장애, 긴급 공지 | Chat 즉시 + WORKS |
| 행동 필요 | 결재 차례, 담당자 지정, 답변 요청 | Chat 개인 메시지 + WORKS |
| 일정 | 회의, 마감, 반납일 | Calendar + WORKS |
| 공유 | 전사 공지, 프로그램 변경 | Chat Space + WORKS |
| 정보 | 처리 완료, 단순 상태 변경 | WORKS만 |
| 요약 | 읽지 않은 일반 알림 | Chat 일일 요약 검토 |

Google Chat의 읽음 상태를 업무 확인으로 간주하지 않는다. 결재 문서 열람이나 처리 여부는 WORKS에서 실제 상세 화면을 열거나 업무 액션을 수행했을 때만 변경한다.

### 7.3 예상 알림 예시

```text
[WORKS 결재 요청]

법인카드 지출결의서
기안자: 홍길동
금액: 1,250,000원
현재 결재 차례입니다.

[문서 확인하기]
```

---

## 8. 전자결재와 회의록

### 8.1 전자결재

Google Drive의 파일 승인 기능은 문서 파일 검토에는 사용할 수 있지만, 현재 WORKS의 타입 있는 양식, 결재·합의·재무합의, 참조자, 문서번호, 양식 버전, 대표 금액과 집계 기능을 대체하기 어렵다.

따라서 다음 구조를 유지한다.

* 결재 원장과 상태 머신: WORKS
* 결재 요청·승인·반려 알림: Google Chat 또는 Gmail
* 공동 작성이 필요한 초안: Google Docs 선택 가능
* 승인 완료 문서: PDF로 확정해 S3 보관 검토

### 8.2 회의록

* Google Calendar에서 회의와 참석자를 관리한다.
* Google Meet의 전사 및 Gemini 회의 노트를 활용할 수 있다.
* 생성된 Docs를 WORKS 회의록에 연결한다.
* WORKS는 관련 스타트업·전문가·사업·펀드와의 관계 및 최종 결정사항을 소유한다.
* 녹음 원본과 확정 스냅샷은 필요 시 S3에 보관한다.

---

## 9. 퇴사·인력 축소 시 데이터 보존 절차

Google 계정을 즉시 삭제하지 않고 다음 절차를 거친다.

```text
1. Google 계정 로그인 정지
2. 내 드라이브·Gmail·Calendar·Chat 데이터 보존 필요성 확인
3. 내 드라이브 파일을 Shared Drive 또는 다른 관리자 계정으로 이전
4. 중요 업무 기록과 최종본을 S3에 보존
5. 법적·운영상 원본 보존이 필요하면 Archived User 검토
6. 데이터 이전·보존 검증
7. Google 계정 삭제 또는 라이선스 회수
8. WORKS의 Google 연결 상태만 삭제로 변경
9. WORKS 임직원 원장과 과거 업무 기록은 그대로 유지
```

작성자·결재자·담당자 행을 삭제하지 않고 재직 상태만 퇴사로 변경한다.

---

## 10. 예상 도입 순서

### 1단계: 기반 정책

* WORKS 계정과 Google 계정의 분리 모델 확정
* Google 계정 발급 대상 기준 수립
* Google 데이터 보존·퇴사 처리 정책 수립
* Shared Drive와 S3 저장 기준 수립

### 2단계: 체감 효과가 큰 연동

* Google Calendar에 WORKS 일정 단방향 발행
* Google Calendar Resource 기반 회의실 예약 검토
* Google Chat으로 결재·공지·담당자 알림 전송

### 3단계: 문서 협업

* Shared Drive 구조 설계
* WORKS 첨부에 Google Drive 파일 연결 기능 추가
* Google Meet·Docs 회의록 연결
* 확정 문서의 S3 스냅샷 보관

### 4단계: 운영 자동화

* Google 계정 상태·라이선스 현황 조회
* 퇴사자 데이터 이전 체크리스트 자동화
* 알림 채널 및 사용자별 수신 설정
* 분석 데이터의 BigQuery·Looker Studio 연동 검토

---

## 11. 다음 논의에서 결정할 항목

* 어떤 임직원에게 Google Workspace 라이선스를 발급할 것인가?
* Google 로그인 없이 WORKS 로컬 로그인만 사용하는 임직원 범위를 허용할 것인가?
* WORKS 일정 중 Google Calendar로 보낼 일정 종류와 공개 범위는 무엇인가?
* 회의실 예약 원장을 Google Calendar로 완전히 넘길 것인가, WORKS UI를 유지할 것인가?
* Google Chat 즉시 알림과 사이트 내 알림의 세부 분류표는 어떻게 할 것인가?
* Shared Drive의 조직 구조를 부서별, 사업유형별, 프로그램별 중 무엇으로 구성할 것인가?
* Google Docs 확정본을 언제 어떤 형식으로 S3에 보관할 것인가?
* Gmail과 Chat 기록 중 법적·운영상 장기 보존이 필요한 범위는 어디까지인가?
* Archived User 비용과 S3 내보내기 비용을 어떻게 비교할 것인가?
* Google API 장애나 발송 실패 시 재시도·대체 채널 정책은 어떻게 할 것인가?

---

## 12. 참고 자료

* [Google Shared Drive 개요](https://support.google.com/a/users/answer/7212025)
* [Google Calendar 증분 동기화](https://developers.google.com/workspace/calendar/api/guides/sync)
* [Google Calendar 회의실·리소스 예약](https://support.google.com/calendar/answer/143753)
* [Google Chat 메시지 API](https://developers.google.com/workspace/chat/create-messages)
* [Google Chat 알림 설정](https://support.google.com/chat/answer/7655718)
* [Google Chat 데스크톱 앱](https://support.google.com/chat/answer/9455386)
* [Google Meet 전사 기능](https://support.google.com/meet/answer/12849897)
* [Gemini 회의 노트](https://support.google.com/meet/answer/14754931)
* [Google Drive 파일 승인](https://support.google.com/drive/answer/9387535)
* [Google Workspace Archived User 라이선스](https://support.google.com/a/answer/9048232)
* [Google Workspace 라이선스 할당·제거](https://support.google.com/a/answer/1727173)
* [Google OIDC 사용자 식별자](https://developers.google.com/identity/openid-connect/reference)

