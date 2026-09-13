# 회의 녹음 자동 저장·AI 회의록 구현

## 동작 구조

사용자 화면에는 회의당 `meeting_recordings` 한 건만 표시한다. 실제 음성은 브라우저가
MediaRecorder(WebM/Opus 우선)로 5분마다 닫아 `meeting_recording_segments`에 순번을 기록하고,
비공개 `meeting-recordings` 버킷에 즉시 업로드한다. 30분 회의는 보통 6개, 60분 회의는 12개
물리 구간이 생기지만 재생은 단기 URL 목록을 이어 재생하므로 사용자는 녹음 한 건으로 다룬다.

각 구간은 `원장 준비 → Storage 업로드 → 업로드 확인 → 서버 전사` 순서로 처리한다. 업로드는
최대 3회 시도하며, 응답만 유실된 경우 완료 RPC가 실제 객체 존재를 확인한다. 녹음 종료 후 모든
구간의 전사가 성공해야만 전체 전사를 합치고 상세 회의록 초안을 생성한다. 실패한 구간이 있으면
부분 전사로 초안을 만들지 않으며, 저장된 세션의 `처리 재개`로 성공 구간은 재사용하고 실패
구간만 다시 처리한다.

## 적용한 보안 통제

- 데이터 등급은 `office / Restricted`다. 두 원장 모두 RLS를 즉시 활성화했다.
- 브라우저는 원장을 직접 수정할 수 없고, 소유자 및 office write를 검사하는 상태 전이 RPC만 호출한다.
- Storage는 비공개이며 준비된 정확한 경로에 대한 INSERT만 허용한다. SELECT/UPDATE/DELETE 정책은 없다.
- 재생은 Edge Function이 호출자 JWT로 DB RLS를 먼저 통과시킨 뒤 60초 signed URL을 발급한다.
- 원본 재생 및 Gemini 전사·초안 전송 전에 `access_logs` 적재가 성공해야 한다.
- `service_role`은 Edge Function 안의 Storage 읽기·처리 결과 저장·감사 로그에만 사용한다.
- AI 호출자는 활성 내부 사용자이면서 office write여야 한다. 외부 계정과 read-only 계정은 거부한다.
- 시간당 전사는 72회, 초안 생성은 20회로 제한하고 구간당 전사 재시도는 3회로 제한한다.
- 세션당 구간은 최대 36개(기본 설정 기준 약 3시간), 구간 파일은 최대 14MiB다.
- 모델이 반환한 HTML은 허용 태그만 남기고 속성을 제거한 뒤 저장한다.
- 녹음 시작 전 참석자 고지 확인을 받고, 녹음 중 페이지 이탈에는 경고를 표시한다.

## 배포 순서

1. `supabase/migrations/20260912012905_meeting_recording_sessions.sql`을 적용한다.
2. `meeting-recording-process`, `meeting-recording-playback`, 변경된 `stt-transcribe`,
   `ai-minute-draft` Edge Function을 배포한다.
3. 운영 secrets에 `GEMINI_API_KEY`, `ALLOWED_ORIGINS`를 설정한다. 모델을 고정하려면
   `GEMINI_TRANSCRIBE_MODEL`, `GEMINI_DRAFT_MODEL`을 별도로 둔다.
4. 로컬 Docker를 켠 환경에서 `pnpm db:reset`, `pnpm exec supabase test db`, DB advisor를 실행한다.
5. 실제 운영 브라우저별로 12분 이상 녹음하여 3개 구간 저장, 자동 초안, 연속 재생, 이탈 후
   처리 재개를 확인한 뒤 배포한다.

## 운영 결정이 필요한 항목

녹음 원본 자동 파기 기간은 업무·법무 정책 확인 없이 코드로 정하지 않았다. 운영 전 보존 기간,
법적 보존 예외, 사용자 삭제 요청 절차를 확정한 뒤 soft delete 및 Storage 파기 배치를 별도
마이그레이션으로 추가해야 한다.

## 적용 상태 (2026-09-12)

- 연결 프로젝트 `alopryrwakfpkgjumhba`에 마이그레이션 `20260912012905` 적용 및 이력 등록 완료
- `meeting-recording-process`, `meeting-recording-playback`, `stt-transcribe`, `ai-minute-draft` 배포 완료
- REST/RPC/Edge Function 경로가 404가 아닌 것과 익명 호출 401 차단 확인
- 실제 `authenticated` 역할로 녹음 세션 생성·소유자 RLS 조회를 트랜잭션 테스트 후 롤백 확인
- 운영 `ALLOWED_ORIGINS`는 운영 도메인 미확정으로 미설정. localhost/127.0.0.1 개발 환경은 허용
