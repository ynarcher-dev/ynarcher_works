import {
  ColumnUnit,
  DataTable,
  EmptyValue,
  ListToolbar,
  PersonCell,
  Spinner,
  TagCell,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { toMillion, type MaPartyConfig, type MaPartyRow } from '@/features/mna/parties/config'
import { useMaPartyListPage } from '@/features/mna/parties/hooks'

/** 목록 페이지당 행 수 — 다른 원장 목록과 같다. */
const PAGE_SIZE = 30

/**
 * 목록 도메인 열.
 *
 * 생성자·수정일 두 열은 여기 적지 않는다 — `DataTable`의 표준 컬럼이 이미 소유하고 있어
 * (`standardColumns`) 도메인 열로 다시 적으면 같은 값이 두 번 선다.
 *
 * 폭·정렬·수치서식은 열마다 손으로 조합하지 않고 `type` 한 단어가 정한다(ColumnType).
 * 희망사항이 `long`인 것은 값 길이의 상한을 모르는 서술이기 때문이고, 금액이 `money`라
 * 우측 정렬·`tabular-nums`가 따라온다.
 *
 * 단위는 값에도 표 위 단서 줄에도 붙이지 않고 **머리글에 병기한다**(공용 `ColumnUnit`,
 * FUND 목록과 같은 규격) — 단서 줄은 머리글에서 눈을 한 번 떼야 읽힌다.
 *
 * 금액 열의 이름만 원장이 정한다(BUYER: 가용자금 / SELLER: 희망 매각가) — 저장 컬럼은
 * 하나이고 뜻만 갈린다. 나머지 열은 두 원장이 같은 자리에 같은 순서로 세운다.
 */
function columnsOf(cfg: MaPartyConfig): Column<MaPartyRow>[] {
  return [
    { key: 'name', header: '기업명', type: 'name' },
    {
      key: 'industries',
      header: '분야',
      type: 'tags',
      // 나열·상한(외 N)·말줄임·전체 값 title은 화면이 조립하지 않고 `TagCell`이 소유한다
      // (STARTUP·FUND·사업 목록의 분야 열과 같은 부품) — 손으로 이으면 표마다 규격이 갈린다.
      render: (r) => <TagCell items={r.industries ?? []} />,
    },
    { key: 'wish', header: '희망사항', type: 'long', render: (r) => r.wish || <EmptyValue /> },
    // 상대 쪽 창구다 — 우리 쪽 관리 주체가 아니다(표준 컬럼의 '생성자'와 다른 축).
    // 이메일은 열로 세우지 않는다: 목록에서 견주는 값이 아니라 한 건을 열어 꺼내 쓰는 값이고,
    // 개인정보라 마스킹까지 걸리면 열의 대부분이 가려진 글자가 된다.
    {
      key: 'contact_name',
      header: '담당자',
      type: 'person',
      render: (r) => <PersonCell names={[r.contact_name]} />,
    },
    {
      key: 'available_funds',
      header: (
        <>
          {cfg.fundsLabel} <ColumnUnit>백만</ColumnUnit>
        </>
      ),
      type: 'money',
      render: (r) =>
        r.available_funds == null ? <EmptyValue /> : toMillion(r.available_funds),
    },
  ]
}

/**
 * M&A BUYER·SELLER 목록.
 *
 * 필터 축을 두지 않는다. 축이 될 만한 값이 분야 하나뿐인데 그 하나를 위해 필터 줄을 세우면
 * 검색창 옆이 늘 절반 비고, 실제로 좁히는 일은 검색어가 먼저 한다 — 건수가 쌓여 분야로
 * 좁혀 보는 일이 생기면 그때 축을 연다(요약 카드도 같은 조건이다).
 *
 * 범위 토글(내 것/전체)도 없다. 이 원장들은 담당자 원장을 두지 않은 공동관리라 '내 바이어'
 * 라는 것이 성립하지 않는다 — 생성자는 권한 축이 아니므로 범위가 되지 못한다.
 */
export function MaPartyListTab({ config }: { config: MaPartyConfig }) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const columns = useMemo(() => columnsOf(config), [config])

  // 검색어를 바꾸면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => setPage(0), [keyword])
  // 원장을 옮겨도 컴포넌트는 그대로 서므로(같은 화면 한 벌) 검색어·페이지를 함께 되돌린다.
  useEffect(() => {
    setKeyword('')
    setPage(0)
  }, [config])

  const { data, isLoading } = useMaPartyListPage(config, keyword, page, PAGE_SIZE)

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="기업명·희망사항 검색"
        actions={
          <ListActions
            createLabel={`${config.noun} 등록`}
            onCreate={() => navigate(`${config.basePath}/new`)}
          />
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable<MaPartyRow>
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`${config.basePath}/${r.id}`)}
          emptyText={`등록된 ${config.noun}이(가) 없습니다.`}
          // 생성자 값은 uuid가 아니라 임베드한 이름이 답한다(기본 추론은 created_by 원값을 읽는다).
          meta={{ author: (r) => r.creator?.name ?? <EmptyValue /> }}
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
