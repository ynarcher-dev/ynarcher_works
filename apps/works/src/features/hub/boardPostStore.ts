/**
 * 공지사항 뷰의 고정 라우트 키. 게시판 slug가 아니므로 레지스트리와 충돌하지 않는다.
 * (게시글·공지 집계는 실데이터 훅 boardPostsApi로 이관됨 — 이 파일은 라우팅 상수만 소유한다.)
 */
export const NOTICE_TAB = 'notices'
