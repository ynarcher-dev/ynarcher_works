import { EmptyValue } from '../components/EmptyValue'
import type { Column } from '../components/DataTable'
import type { DocumentPickerItem } from './documentPickerState'

/**
 * 고르는 표의 **값 열 넷**(문서 번호·제목·기안자·문서 종류).
 *
 * 밖으로 내는 이유는 고른 뒤의 요약이 같은 칸으로 서야 하기 때문이다. 창에서는 네 칸으로
 * 읽던 것이 닫고 나면 뱃지 하나와 제목 한 줄로 줄어들면, 담당자는 자기가 방금 고른 것이
 * 맞는지(같은 이름의 품의가 둘일 때 어느 쪽인지) 다시 창을 열어 확인해야 한다.
 *
 * 고르는 열(라디오)은 여기 없다 — 그것은 값이 아니라 **창 안에서만 하는 조작**이다.
 */
export function documentPickerValueColumns(
  kindHeader = '문서 종류',
): Column<DocumentPickerItem>[] {
  return [
    {
      key: 'docNo',
      header: '문서 번호',
      // 숫자가 아니라 **식별 코드**다(`품의-20260915-0001`). 크기를 견주는 값이 아니므로
      // 자릿수를 맞출 이유도, 오른쪽으로 보낼 이유도 없다 — 좌측 정렬·한 줄·고정폭으로 서고
      // 기준 모서리를 옆 열과 공유한다(§3.1). 길이의 상한을 알지만 `code`(5rem)로는 잘려
      // 폭만 직접 준다(`widthRem`과 `w-44`는 반드시 같은 값이어야 한다 — 11rem = 176px).
      widthRem: 11,
      className: 'w-44 whitespace-nowrap',
      render: (row) => row.docNo ?? <EmptyValue />,
    },
    {
      key: 'title',
      header: '제목',
      type: 'name',
      primary: true,
      // 순서는 서버가 정한다(최신순). 표가 스스로 정렬하면 **지금 페이지만** 다시 늘어서,
      // 목록 전체가 정렬된 것처럼 보이면서 실제로는 20건만 줄을 바꾼다.
      sortable: false,
      // 제목은 길이의 상한이 없다. 폭은 종류가 정하고 넘치는 글자는 말줄임으로 끊으며,
      // 전문은 `title`이 받는다 — 줄바꿈을 허용하면 그 행만 높이가 두 배가 된다(§3.1).
      render: (row) => (
        <span className="block truncate" title={row.title}>
          {row.title}
        </span>
      ),
    },
    {
      key: 'drafter',
      header: '기안자',
      type: 'person',
      render: (row) => row.drafter ?? <EmptyValue />,
    },
    {
      key: 'kind',
      header: kindHeader,
      type: 'text',
      render: (row) => row.kind ?? <EmptyValue />,
    },
  ]
}
