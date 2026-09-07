import { ColumnUnit, DataTable, ListToolbar, Spinner, type Column } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import {
  MA_BUYER_BASE_PATH,
  MA_BUYER_NOUN,
  toMillion,
  type MaBuyerRow,
} from '@/features/mna/buyers/config'
import { useMaBuyerListPage } from '@/features/mna/buyers/hooks'

/** 목록 페이지당 행 수 — 다른 원장 목록과 같다. */
const PAGE_SIZE = 30

/**
 * 목록 도메인 열.
 *
 * 생성자·수정일 두 열은 여기 적지 않는다 — `DataTable`의 표준 컬럼이 이미 소유하고 있어
 * (`standardColumns`) 도메인 열로 다시 적으면 같은 값이 두 번 선다.
 *
 * 폭·정렬·수치서식은 열마다 손으로 조합하지 않고 `type` 한 단어가 정한다(ColumnType).
 * 희망사항이 `long`인 것은 값 길이의 상한을 모르는 서술이기 때문이고, 가용자금이 `money`라
 * 우측 정렬·`tabular-nums`가 따라온다.
 *
 * 단위는 값에도 표 위 단서 줄에도 붙이지 않고 **머리글에 병기한다**(공용 `ColumnUnit`,
 * FUND 목록과 같은 규격) — 단서 줄은 머리글에서 눈을 한 번 떼야 읽힌다.
 */
const COLUMNS: Column<MaBuyerRow>[] = [
  { key: 'name', header: '기업명', type: 'name' },
  {
    key: 'industries',
    header: '분야',
    type: 'tags',
    render: (r) => (r.industries?.length ? r.industries.join(', ') : '-'),
  },
  { key: 'wish', header: '희망사항', type: 'long', render: (r) => r.wish || '-' },
  {
    key: 'available_funds',
    header: (
      <>
        가용자금 <ColumnUnit>백만</ColumnUnit>
      </>
    ),
    type: 'money',
    render: (r) => toMillion(r.available_funds),
  },
]

/**
 * M&A BUYER 목록.
 *
 * 필터 축을 두지 않는다. 축이 될 만한 값이 분야 하나뿐인데 그 하나를 위해 필터 줄을 세우면
 * 검색창 옆이 늘 절반 비고, 실제로 좁히는 일은 검색어가 먼저 한다 — 건수가 쌓여 분야로
 * 좁혀 보는 일이 생기면 그때 축을 연다(요약 카드도 같은 조건이다).
 *
 * 범위 토글(내 것/전체)도 없다. 이 원장은 담당자 원장을 두지 않은 공동관리라 '내 바이어'라는
 * 것이 성립하지 않는다 — 생성자는 권한 축이 아니므로 범위가 되지 못한다.
 */
export function MaBuyerListTab() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  // 검색어를 바꾸면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => setPage(0), [keyword])

  const { data, isLoading } = useMaBuyerListPage(keyword, page, PAGE_SIZE)

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="기업명·희망사항 검색"
        actions={
          <ListActions
            createLabel={`${MA_BUYER_NOUN} 등록`}
            onCreate={() => navigate(`${MA_BUYER_BASE_PATH}/new`)}
          />
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable<MaBuyerRow>
          columns={COLUMNS}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`${MA_BUYER_BASE_PATH}/${r.id}`)}
          emptyText={`등록된 ${MA_BUYER_NOUN}이(가) 없습니다.`}
          // 생성자 값은 uuid가 아니라 임베드한 이름이 답한다(기본 추론은 created_by 원값을 읽는다).
          meta={{ author: (r) => r.creator?.name ?? '-' }}
          // 삭제는 목록이 아니라 상세에서 한다 — 빈 관리 열이 남지 않게 열 자체를 내린다.
          showManageColumn={false}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalAll: data?.totalAll,
            onChange: setPage,
          }}
        />
      )}
    </div>
  )
}
