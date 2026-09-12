import {
  Badge,
  ColumnUnit,
  DataTable,
  EmptyValue,
  ListToolbar,
  MultiSelectFilter,
  Spinner,
  TagCell,
  type Column,
} from '@ynarcher/ui'
import { LockKeyhole } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import { LedgerBulkDeactivateBar } from '@/features/master/LedgerBulkDeactivateBar'
import {
  DECISION_UNSET,
  MA_DECISIONS,
  MA_DECISION_LABEL,
  MA_DECISION_UNSET_LABEL,
  decisionBadge,
  toMillion,
  type MaPartyConfig,
  type MaPartyRow,
} from '@/features/mna/parties/config'
import { useMaPartyListPage } from '@/features/mna/parties/hooks'

/** 목록 페이지당 행 수 — 다른 원장 목록과 같다. */
const PAGE_SIZE = 30

/**
 * 진행여부 필터 선택지.
 *
 * '미결정'을 끝에 둔다 — 결정 셋 다음에 서야 "아직 안 정한 것"이 결정의 한 종류가 아니라
 * 그 축의 나머지로 읽힌다. 이 값이 있어야 정할 것이 남은 건을 골라 볼 수 있고, 그것이
 * 이 필터를 만든 첫 번째 쓰임이다.
 */
const DECISION_OPTIONS = [
  ...MA_DECISIONS.map((value) => ({ value, label: MA_DECISION_LABEL[value] })),
  { value: DECISION_UNSET, label: MA_DECISION_UNSET_LABEL },
]

/**
 * 진행여부 열. 기업명 바로 옆이다 — 이 열로 좁혀 보려고 필터를 만들었으므로, 세로로 훑을 때
 * 이름과 결정이 붙어 있어야 "무엇을 진행하기로 했나"가 한 눈에 읽힌다.
 *
 * 결정이 없는 행도 '미결정' 배지로 선다: 빈 칸으로 두면 아직 안 정한 것인지 이 열이 그 행에
 * 해당하지 않는 것인지 표가 답하지 못한다.
 */
const decisionColumn: Column<MaPartyRow> = {
  key: 'decision',
  header: '진행여부',
  type: 'badge',
  render: (r) => {
    if (r.can_read === false) return <EmptyValue />
    const { label, tone } = decisionBadge(r.decision)
    return <Badge tone={tone}>{label}</Badge>
  },
}

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
    {
      key: 'name',
      header: '기업명',
      type: 'name',
      render: (r) =>
        r.can_read === false ? (
          <span className="inline-flex items-center gap-1.5 text-gray-500">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            열람 권한이 없는 게시글
          </span>
        ) : (
          r.name
        ),
    },
    ...(cfg.hasDecision ? [decisionColumn] : []),
    {
      key: 'industries',
      header: '분야',
      type: 'tags',
      // 나열·상한(외 N)·말줄임·전체 값 title은 화면이 조립하지 않고 `TagCell`이 소유한다
      // (STARTUP·FUND·사업 목록의 분야 열과 같은 부품) — 손으로 이으면 표마다 규격이 갈린다.
      render: (r) => <TagCell items={r.industries ?? []} />,
    },
    { key: 'wish', header: '희망사항', type: 'long', render: (r) => r.wish || <EmptyValue /> },
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
 * 필터 축은 진행여부 하나이고 **그 축을 쓰는 원장(셀러)에서만** 선다(2026-09-08). 셀러는
 * 딜보다 먼저 쌓이므로 목록에 아직 볼지 정하지 않은 건과 정한 건이 섞여 서고, 그 둘을 가르는
 * 것이 이 목록에서 가장 자주 하는 일이다. 바이어에는 그 축이 없다(config 주석 참조).
 * 분야는 여전히 축이 아니다 — 값이 태그라 선택지가 원장에서 자라고, 실제로 좁히는
 * 일은 검색어가 먼저 한다(건수가 쌓이면 그때 연다. 요약 카드도 같은 조건이다).
 *
 * 범위 토글(내 것/전체)도 없다. 생성자는 비활성화 권한만 가지며 목록 범위를 가르는 축은 아니다.
 */
export function MaPartyListTab({ config }: { config: MaPartyConfig }) {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const canWrite = hasWorkspaceWrite(authUser, 'mna')
  const [keyword, setKeyword] = useState('')
  const [decisions, setDecisions] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const columns = useMemo(() => columnsOf(config), [config])

  // 좁힘 조건을 바꾸면 첫 페이지로 되돌린다(3페이지를 보던 중 필터를 걸면 빈 페이지가 선다).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, decisions])
  // 원장을 옮겨도 컴포넌트는 그대로 서므로(같은 화면 한 벌) 검색어·필터·페이지를 함께 되돌린다.
  useEffect(() => {
    setKeyword('')
    setDecisions([])
    setPage(0)
    setSelected([])
  }, [config])

  useEffect(() => setSelected([]), [page])

  const { data, isLoading, isError } = useMaPartyListPage(
    config,
    keyword,
    decisions,
    page,
    PAGE_SIZE,
  )
  const rows = data?.rows ?? []
  const canDeactivate = (row: MaPartyRow) =>
    canWrite && row.can_read !== false && row.created_by === authUser?.id
  const showSelection = rows.some(canDeactivate)

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="기업명·희망사항 검색"
        filters={
          // 축을 운용하지 않는 원장에서는 필터 자체를 감춘다 — 걸어도 아무것도 답하지 않는
          // 컨트롤은 고를 수 있다고 말하는 거짓 신호다(사업구분 필터와 같은 판정).
          config.hasDecision ? (
            <MultiSelectFilter
              label="진행여부"
              options={DECISION_OPTIONS}
              selected={decisions}
              onChange={setDecisions}
            />
          ) : undefined
        }
        actions={
          <ListActions
            createLabel={`${config.noun} 등록`}
            onCreate={() => navigate(`${config.basePath}/new`)}
          />
        }
      />

      <LedgerBulkDeactivateBar
        ledger={config.table}
        noun={config.noun}
        selectedIds={selected}
        onDone={() => {
          if (selected.length === rows.length && page > 0) setPage((p) => p - 1)
          setSelected([])
        }}
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable<MaPartyRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          selectable={showSelection}
          selectableRow={canDeactivate}
          onRowClick={(r) => {
            if (r.can_read !== false) navigate(`${config.basePath}/${r.id}`)
          }}
          // 조회 실패와 실제 0건을 구분한다. RPC 누락·권한 오류를 빈 원장으로 보이면
          // 사용자는 데이터가 사라졌다고 판단하게 된다.
          emptyText={
            isError
              ? `${config.noun} 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`
              : `등록된 ${config.noun}이(가) 없습니다.`
          }
          // 생성자 값은 uuid가 아니라 임베드한 이름이 답한다(기본 추론은 created_by 원값을 읽는다).
          meta={{ author: (r) => r.creator?.name ?? <EmptyValue /> }}
          // 비활성화는 생성자 전용 체크박스와 선택 액션이 맡으므로 별도 관리 열은 내린다.
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
