import { Badge, DataTable, PanelCard, usePaged, type Column } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useDepartmentLabels } from '@/features/management/departmentOptions'
import type { StartupManagerRow } from '@/features/startup/startupPoolHooks'

/** 값이 없는 칸의 표기 — 표 안에서 '비어 있음'은 문장이 아니라 기호 하나로 답한다. */
const Dash = () => <span className="text-gray-400">-</span>

/** 카드 안 목록의 한 장 크기. 참여 목록 카드·우측 패널 목록과 같은 5건이다. */
const PAGE_SIZE = 5

/**
 * 관리 현황 최상단의 담당자 카드 — **관리 주체만 답한다.**
 *
 * 생성자(레코드를 만든 사람)는 권한을 주지 않는 별개 축이라 여기 오지 않는다(기본 데이터
 * 카드의 기록 정보에 있다).
 *
 * 투자기업만 지정 담당자(리드/지원)를 갖고, 비투자는 공동관리다 — 그쪽은 표가 아니라 문장으로
 * 답한다. 빈 표를 세우면 "아직 아무도 지정되지 않았다"로 읽히지만, 공동관리는 지정을 기다리는
 * 상태가 아니라 그 자체로 완결된 관리 방식이다.
 *
 * 담당자·생성자는 내부 임직원이라 민감정보 마스킹 대상이 아니다(외부 기업 정보만 가린다).
 */
export function StartupManagerCard({
  invested,
  managers,
}: {
  invested: boolean
  managers: StartupManagerRow[]
}) {
  // 부서 표기는 상위 경로가 필요해 조직도 원장을 경유한다(임베드로는 자기 이름까지만 온다).
  const { pathLabelOf } = useDepartmentLabels()
  const { pageItems, page, setPage } = usePaged(managers, PAGE_SIZE)

  const columns = useMemo<Column<StartupManagerRow>[]>(
    () => [
      {
        key: 'name',
        header: '이름',
        type: 'name',
        render: (r) => r.user?.name ?? <Dash />,
      },
      {
        // 리드는 이 기업의 관리 책임자다. 한 기업에 리드는 하나뿐이며 DB 부분 유니크 인덱스가
        // 강제한다(uq_startup_managers_one_lead) — 표에서도 색으로 하나만 도드라진다.
        key: 'is_lead',
        header: '역할',
        type: 'badge',
        render: (r) => (
          <Badge tone={r.is_lead ? 'success' : 'neutral'}>{r.is_lead ? '리드' : '지원'}</Badge>
        ),
      },
      {
        key: 'department',
        header: '부서',
        type: 'text',
        render: (r) => {
          const label = pathLabelOf(r.user?.department_id ?? null)
          return label ? <span title={label}>{label}</span> : <Dash />
        },
      },
      {
        key: 'email',
        header: '이메일',
        type: 'long',
        render: (r) =>
          r.user?.email ? <span title={r.user.email}>{r.user.email}</span> : <Dash />,
      },
      {
        key: 'assigned_at',
        header: '지정일',
        type: 'date',
        render: (r) => r.assigned_at?.slice(0, 10) ?? <Dash />,
      },
      {
        // 누가 이 사람을 붙였는가. 담당자 변경은 원장 트리거가 남기는 변동 이력에 잡히지 않으므로
        // (기여 로그는 startups 원장에 붙는다) 이 열이 그 자리를 대신한다.
        key: 'assigner',
        header: '지정자',
        type: 'person',
        render: (r) => r.assigner?.name ?? <Dash />,
      },
    ],
    [pathLabelOf],
  )

  return (
    <PanelCard title="담당자" count={invested ? managers.length : undefined}>
      {invested ? (
        <DataTable
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.user_id}
          layout="fixed"
          standardColumns={false}
          emptyText="지정된 담당자가 없습니다."
          // 카드 안 보조 목록이라 번호줄 없는 미니 페이저를 쓴다(우측 패널 목록과 같은 규격).
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: managers.length,
            onChange: setPage,
            compact: true,
          }}
        />
      ) : (
        <p className="text-body text-gray-600">
          공동관리 — STARTUP 쓰기 권한자 누구나 수정할 수 있습니다.
        </p>
      )}
    </PanelCard>
  )
}
