/**
 * 공용 리치텍스트(RichTextEditor)가 내는 HTML 문자열에 대한 판정 유틸.
 * 에디터 컴포넌트 파일에 두지 않는 이유는 비컴포넌트 export가 Fast Refresh를 깨기 때문이다.
 */

/**
 * TipTap이 내는 빈 본문(`<p></p>`)을 걸러낸다 — 이미지 한 장만 있는 본문은 빈 것이 아니다.
 * 저장 전에 "내용이 있는가"를 묻는 화면(NOTICE·사업개요)이 공유한다.
 */
export function isEmptyRichText(html: string): boolean {
  return !html.includes('<img') && html.replace(/<[^>]*>/g, '').trim() === ''
}
