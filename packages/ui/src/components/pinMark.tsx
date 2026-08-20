/**
 * 상단 고정 행의 No. 칸 표식. `DataTable`의 `meta.rowMark`에 그대로 연결해 쓴다.
 * 고정이 아니면 `undefined`를 돌려 원래 번호가 보이게 한다.
 *
 * 게시판의 공지, 자산의 중요 표시처럼 "정렬을 건너뛰고 맨 위에 서는 행"은 순번이 뜻을
 * 잃으므로 그 자리를 표식에 준다 — 제목 옆 배지로 알리면 제목 읽기를 방해하고, 표식이
 * 붙은 행과 그렇지 않은 행의 첫 칸이 서로 다른 것을 말하게 된다.
 *
 * 크기는 표의 글자 규격(`tableText`, 12px)에 맞춘다 — 이 자리는 No. 칸(`tableText.meta`)이고,
 * 표식만 14px로 서면 같은 칸의 번호와 크기가 갈린다(한 줄 안에서 크기로 위계를 만들지 않는다).
 */
export function pinMark(pinned: boolean | undefined) {
  if (!pinned) return undefined
  return (
    <span role="img" aria-label="상단 고정" title="상단 고정" className="text-caption">
      📌
    </span>
  )
}
