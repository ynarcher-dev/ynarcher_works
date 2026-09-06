// [AI 작성하기] 최소 ZIP 리더 — 구현은 `_shared/docParse/zip.ts`가 갖는다.
//
// **파일이 옮겨 간 이유는 읽는 쪽이 둘이 되었기 때문이다**(2026-09-06). 자료 분석을 별도
// 단계로 떼면서 오피스 파일은 브라우저 Web Worker가 열고, 캐시가 없는 옛 경로에서는 이
// 함수가 같은 파일을 연다. 두 벌을 두면 파서 버전이 두 곳에서 따로 오르고, 그때 캐시가 어느
// 규칙으로 만들어졌는지 답할 근거가 없어진다.
//
// 이 자리를 재수출로 남기는 이유는 **가리키는 곳을 한 번에 다 고치지 않기 위해서**다.
// `formats.ts`·`parts.ts`·기존 회귀 테스트가 이 경로를 그대로 쓴다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2

export { readZipIndex, readZipText, type ZipEntry } from '../_shared/docParse/zip.ts'
