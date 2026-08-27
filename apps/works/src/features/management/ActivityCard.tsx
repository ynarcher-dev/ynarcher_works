import { EmptyValue, PanelCard } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import type { WorkspaceKey } from '@/auth/types'
import { MiniPager, usePaged } from '@ynarcher/ui'
import { MiniTable, td, tdL, tdP, th, thL } from '@/features/startup/MiniTable'

/**
 * 활동 이력 카드의 열 정의. 표 규격(머리글·본문 위계, 식별 열)은 STARTUP 성장 지표가 쓰는
 * 공용 소형 표(MiniTable)를 그대로 재사용하므로 여기서는 "무엇을 적을지"만 정한다.
 */
export interface ActivityColumn<T> {
  header: string
  /** 우측 정렬(숫자). 날짜·기간은 좌측에 두고 nowrap만 준다. */
  align?: 'right'
  /** 행을 식별하는 열 — 행마다 하나만. 없으면 모든 열이 같은 무게로 읽힌다. */
  primary?: boolean
  /** 셀 추가 클래스(폭·줄바꿈 제어). */
  className?: string
  render: (row: T) => ReactNode
}

/** 빈 값('-') 표기. 실제 값과 구분되도록 한 단계 흐리게 둔다. */
export function Dash() {
  return <EmptyValue />
}

interface ActivityCardProps<T> {
  title: string
  columns: ActivityColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /**
   * 행 클릭 시 이동할 원장 상세 경로. 목록 화면(DataTable)과 같은 규약 — 진입점은 행 전체이지
   * 첫 열의 글자가 아니다(링크를 열에 걸면 표 안에 클릭 가능한 영역이 둘로 갈린다).
   */
  rowTo: (row: T) => string
  /** 이동 대상 워크스페이스. 읽기 권한이 없으면 행을 클릭 불가로 둔다. */
  workspace: WorkspaceKey
  isLoading?: boolean
  emptyText: string
}

/**
 * 활동 이력 카드 하나 = 카드 헤더(제목 + 건수) + 소형 데이터 표 + 5건 단위 미니 페이저.
 *
 * 표에 적는 값은 그 레코드의 **근원 목록 화면이 이미 보여 주는 것들의 부분집합**이다 —
 * 이 카드가 답할 질문은 "이 사람이 무엇을 맡아 왔는가"이지 개별 사업·펀드의 내막이 아니므로,
 * 상세로 가야 뜻이 서는 값(금액·부서·분야 등)은 행 클릭 너머로 넘긴다.
 *
 * 보는 사람에게 그 워크스페이스 읽기 권한이 없으면 행이 클릭되지 않는다 — 눌러 봐야 접근 거부
 * 화면이 나오므로 헛걸음을 막는 것이고, 실제 통제는 라우트 가드와 RLS가 한다.
 */
export function ActivityCard<T>({
  title,
  columns,
  rows,
  rowKey,
  rowTo,
  workspace,
  isLoading,
  emptyText,
}: ActivityCardProps<T>) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canOpen = hasWorkspaceRead(user, workspace)
  const { pageItems, page, setPage, pageCount } = usePaged(rows)
  return (
    <PanelCard title={title} count={isLoading ? undefined : rows.length}>
      {isLoading ? (
        <p className="text-body text-gray-600">불러오는 중입니다.</p>
      ) : rows.length === 0 ? (
        <p className="text-body text-gray-600">{emptyText}</p>
      ) : (
        <>
          <MiniTable
            head={columns.map((c) => (
              <th key={c.header} className={`${c.align === 'right' ? th : thL} ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          >
            {pageItems.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={canOpen ? () => navigate(rowTo(row)) : undefined}
                // 행 강조는 목록 표(DataTable)와 같은 톤을 쓴다 — 같은 동작에 같은 반응.
                className={
                  canOpen ? 'cursor-pointer transition-colors duration-fast hover:bg-gray-25' : undefined
                }
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`${c.primary ? tdP : c.align === 'right' ? td : tdL} ${c.className ?? ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </MiniTable>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </PanelCard>
  )
}
