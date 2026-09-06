// [AI 작성하기] 오피스 파일 읽기 — 구현은 `_shared/docParse/officeText.ts`가 갖는다.
//
// 브라우저(자료 분석 단계)와 이 함수(캐시 없는 옛 경로)가 **같은 파서**를 써야 캐시가 있을
// 때와 없을 때의 초안이 달라지지 않는다. 옮긴 이유와 재수출로 남긴 이유는 `zip.ts`와 같다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2

export {
  isOfficeMime,
  officeChunks,
  officeText,
  OFFICE_MIMES,
} from '../_shared/docParse/officeText.ts'
