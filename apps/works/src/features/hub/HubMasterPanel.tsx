import { Input, PageHeader } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HUB_MASTER_TABS,
  type HubEntityConfig,
  type HubMasterTab,
  type HubMasterTabKey,
} from '@/features/hub/masterConfig'
import { useMasterList, useMergedMasterList } from '@/features/hub/hooks'
import { isProfileEntity, type EntityKey } from '@/features/networks/config'
import { MasterListView } from '@/features/master/MasterListView'
import { MasterDetailModal } from '@/features/master/MasterDetailModal'
import type { MasterColumn, MasterRow } from '@/features/master/types'

interface HubMasterPanelProps {
  masterKey: HubMasterTabKey
}

/** HUB 목록 페이지당 행 수(NETWORKS 디렉토리와 동일). */
const PAGE_SIZE = 30

/**
 * 클라이언트 사이드 페이지네이션(HUB 조회 센터 공용). HUB는 읽기 전용이라 전체 rows를 받아
 * 페이지 구간만 잘라 공용 페이저(DataTable pagination)에 넘긴다. 검색어 변경 시 첫 페이지로 되돌린다.
 */
function usePagedRows(rows: MasterRow[], keyword: string) {
  const [page, setPage] = useState(0)
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // 검색 등으로 total이 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 보정한다.
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = useMemo(() => {
    const start = safePage * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [rows, safePage])

  return {
    pageRows,
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      onChange: setPage,
    },
  }
}

/**
 * HUB 마스터 정보 조회 패널. 단일 네트워크 탭은 해당 컬럼 그대로,
 * 복수 네트워크를 묶는 탭(투자/전문가·협력사)은 하나의 공용 리스트에 구분 배지(태그)로 노출한다.
 * NETWORKS 디렉토리와 동일한 공용 리스트뷰를 공유하되 HUB는 조회 센터이므로 읽기 전용([보기]만).
 * 근거: 확정 아키텍처 결정(HUB=조회 센터).
 */
export function HubMasterPanel({ masterKey }: HubMasterPanelProps) {
  const tab = HUB_MASTER_TABS[masterKey]
  const [keyword, setKeyword] = useState('')
  const [single] = tab.entities

  return (
    <div className="space-y-5">
      <PageHeader
        title={tab.label}
        search={
          <Input
            placeholder="이름 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />

      {tab.entities.length === 1 && single ? (
        <SingleNetworkList entity={single} keyword={keyword} />
      ) : (
        <MergedNetworkList tab={tab} keyword={keyword} />
      )}
    </div>
  )
}

/** 단일 네트워크 조회(엔티티 컬럼 그대로). */
function SingleNetworkList({
  entity,
  keyword,
}: {
  entity: HubEntityConfig
  keyword: string
}) {
  const navigate = useNavigate()
  const [viewing, setViewing] = useState<MasterRow | null>(null)
  const { data, isLoading } = useMasterList(entity.key, keyword)
  const { pageRows, pagination } = usePagedRows(data ?? [], keyword)

  // 프로필 엔티티(전문가·VAN·투자사)는 HUB 내 읽기 전용 상세로 이동, 그 외는 조회 모달을 연다.
  const hasDetailPage = isProfileEntity(entity.key as EntityKey)
  const openRow = (r: MasterRow) =>
    hasDetailPage ? navigate(`/hub/${entity.key}/${r.id}`) : setViewing(r)

  return (
    <>
      <MasterListView
        label={entity.label}
        columns={entity.columns}
        hasStatus={entity.hasStatus}
        rows={pageRows}
        isLoading={isLoading}
        onView={(r) => setViewing(r)}
        onRowClick={openRow}
        manageable={false}
        pagination={pagination}
      />
      <MasterDetailModal
        label={entity.label}
        columns={entity.columns}
        row={viewing}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      />
    </>
  )
}

/** 복수 네트워크 병합 조회(구분 배지 + 공통 컬럼). 상세는 행의 원본 엔티티 컬럼으로 노출. */
const MERGED_COLUMNS: MasterColumn[] = [
  { name: '_tag', label: '구분', kind: 'tag' },
  { name: 'name', label: '이름' },
]

function MergedNetworkList({
  tab,
  keyword,
}: {
  tab: HubMasterTab
  keyword: string
}) {
  const navigate = useNavigate()
  const [viewing, setViewing] = useState<MasterRow | null>(null)
  const { rows, isLoading } = useMergedMasterList(tab.entities, keyword)
  const { pageRows, pagination } = usePagedRows(rows, keyword)

  const detailEntity = viewing
    ? tab.entities.find((e) => e.key === viewing._entityKey)
    : undefined

  // 행의 원본 엔티티가 프로필 엔티티(전문가·VAN·투자사)면 HUB 내 읽기 전용 상세로 이동, 그 외는 조회 모달.
  const openRow = (r: MasterRow) => {
    const key = r._entityKey as EntityKey | undefined
    if (key && isProfileEntity(key)) navigate(`/hub/${key}/${r.id}`)
    else setViewing(r)
  }

  return (
    <>
      <MasterListView
        label={tab.label}
        columns={tab.listColumns ?? MERGED_COLUMNS}
        hasStatus
        rows={pageRows}
        isLoading={isLoading}
        onView={(r) => setViewing(r)}
        onRowClick={openRow}
        manageable={false}
        pagination={pagination}
      />
      <MasterDetailModal
        label={detailEntity?.label ?? tab.label}
        columns={detailEntity?.columns ?? MERGED_COLUMNS}
        row={viewing}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      />
    </>
  )
}
