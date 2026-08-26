import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, DataTable, EmptyState, Skeleton, cardText, type Column } from '@ynarcher/ui'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import {
  LEDGERS,
  UNCLASSIFIED_PATH,
  useMyDatabaseStats,
  type LedgerStat,
} from './myDatabaseHooks'

const n = (value: number) => value.toLocaleString('ko-KR')

/** 전사 대비 내 비중. 전사가 0이면 비율 자체가 성립하지 않아 적지 않는다. */
function share(row: LedgerStat): string | null {
  if (row.total <= 0) return null
  return `${Math.round((row.mine / row.total) * 100)}%`
}

const columns: Column<LedgerStat>[] = [
  { key: 'label', header: '원장', type: 'name', primary: true, render: (row) => row.label },
  { key: 'mine', header: '내 보유', type: 'count', render: (row) => n(row.mine) },
  // 늘어난 것만 초록으로 든다. 0을 '0'으로 적으면 성적표처럼 읽히므로 '–'로 비워 둔다 —
  // 이 열이 답하는 것은 "이번 달에 늘었나"이지 "이번 달에 얼마나 못 했나"가 아니다.
  {
    key: 'monthAdded',
    header: '이번 달',
    type: 'count',
    render: (row) =>
      row.monthAdded > 0 ? <span className="text-success">+{n(row.monthAdded)}</span> : '–',
  },
  // 전사 보유와 내 비중을 한 칸에 둔다. 비중은 두 수에서 따라 나오는 값이라 열을 따로 세울
  // 만큼의 축이 아니고, 같은 칸에 두면 '무엇 중 얼마'가 눈에서 한 번에 이어진다.
  // 크기는 가르지 않고 색으로만 물린다(한 줄 안에서 크기로 위계를 만들지 않는다).
  {
    key: 'total',
    header: '전사 보유',
    type: 'money',
    render: (row) => {
      const ratio = share(row)
      return (
        <>
          {n(row.total)}
          {ratio && <span className="text-gray-500"> ({ratio})</span>}
        </>
      )
    },
  },
]

/**
 * 나의 업로드 DB — 내가 쌓아 놓은 데이터 원장 셋의 보유·증감을 한 카드에 세운다.
 *
 * 이 자리에는 원래 '참여 중인 운영' 목록이 있었다. 바로 위 「나의 워크스페이스」 타일이 이미
 * "내가 몇 건 맡았나"를 세고 각 워크스페이스의 내 목록으로 보내 주므로, 같은 목록을 아래에
 * 펼치면 한 카드가 위 카드의 각주가 된다 — 같은 물음에 두 번 답하는 자리였다.
 *
 * 그래서 이 카드는 **다른 물음**에 답한다: 내가 쌓아 놓은 데이터가 지금 얼마고, 이번 달에
 * 얼마나 늘었는가. 사업(운영)이 아니라 원장(자산)이 축이라 위 카드와 겹치지 않는다.
 *
 * 표를 쓰는 것은 위가 타일 넉 장이기 때문이다. 타일을 또 세우면 두 카드가 같은 그림이 되고,
 * 표는 한 줄에 축 셋(내 보유·이번 달·전사 대비)을 담으면서 위와 다른 결로 선다.
 */
export function MyDatabaseCard() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  // 볼 수 있는 원장만 센다 — RLS는 권한 없는 조회에 오류가 아니라 0을 돌려주므로, 함께 세면
  // "안 보이는 것"이 "없는 것"과 같은 모양으로 카드에 적힌다.
  const keys = useMemo(
    () => LEDGERS.filter((l) => hasWorkspaceRead(user, l.workspace)).map((l) => l.key),
    [user],
  )
  const { data, isLoading, isError } = useMyDatabaseStats(userId, keys)

  // 셋 다 못 보는 사람에게는 카드를 세우지 않는다. 빈 표를 남기면 "내 데이터가 0건"으로 읽힌다.
  if (keys.length === 0) return null
  if (isLoading) return <Skeleton className="h-52 rounded-radius-lg" />
  if (isError) {
    return (
      <Card title="나의 업로드 DB">
        <EmptyState title="데이터 현황을 불러오지 못했습니다." description="잠시 후 다시 시도해주세요." />
      </Card>
    )
  }

  const unclassified = data?.unclassified ?? null

  return (
    <Card title="나의 업로드 DB" subtitle="내가 등록·기여한 데이터 원장의 보유량과 이번 달 증가분입니다.">
      {/* 한 화면 분량(원장 셋) 자리를 미리 잡아 둔다 — 권한에 따라 줄 수가 달라져도 좌측 열
          높이가 출렁이지 않게. 값의 근거: 머리글 36px + 행 36px × 3 = 144px. */}
      <div className="min-h-[9rem] overflow-hidden">
        <DataTable
          columns={columns}
          rows={data?.ledgers ?? []}
          rowKey={(row) => row.key}
          numbered={false}
          selectable={false}
          standardColumns={false}
          emptyText="집계할 원장이 없습니다."
          // 줄을 누르면 그 원장의 '내 목록'으로 간다 — 건수를 세어 놓고 누를 수 없으면 다음에
          // 할 일이 사이드바를 다시 찾아가는 일밖에 남지 않는다(위 타일과 같은 규칙).
          onRowClick={(row) => navigate(row.path)}
        />
      </div>
      {/* 미분류는 카테고리가 아니라 분류 전 임시 저장소라 위 셋과 층이 다르다. 그래서 줄이
          아니라 카드 바닥의 안내 한 줄로 둔다 — 여기만 '보아라'가 아니라 '치워라'를 말한다.
          0건일 때도 자리를 지켜 카드 높이가 고정된다. */}
      {unclassified !== null && (
        <div className={`mt-3 flex items-center justify-between border-t border-gray-200 pt-3 ${cardText.meta}`}>
          <span>미분류 정리 대기</span>
          {unclassified > 0 ? (
            <button
              type="button"
              onClick={() => navigate(UNCLASSIFIED_PATH)}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              {n(unclassified)}건 정리하기
              <ArrowRight aria-hidden className="size-3.5" strokeWidth={1.8} />
            </button>
          ) : (
            <span className="text-gray-500">없음</span>
          )}
        </div>
      )}
    </Card>
  )
}
