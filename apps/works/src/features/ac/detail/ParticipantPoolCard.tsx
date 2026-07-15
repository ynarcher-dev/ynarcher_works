import {
  Badge,
  Card,
  DataTable,
  Input,
  Spinner,
  Tabs,
  type Column,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useParticipantPool, type PoolMember } from '@/features/ac/detail/detailHooks'

interface PoolTab {
  key: string
  label: string
  roles: string[]
}

/** 역할 그룹 탭 정의(참가자 풀 카드). program_participant_role 7종을 4그룹으로 묶는다. */
const STARTUP_TAB: PoolTab = { key: 'startup', label: '보육기업', roles: ['STARTUP'] }
const POOL_TABS: PoolTab[] = [
  STARTUP_TAB,
  { key: 'expert', label: '전문가', roles: ['EXPERT', 'MENTOR', 'JUDGE'] },
  { key: 'investor', label: '투자/기관', roles: ['INVESTOR', 'OBSERVER'] },
  { key: 'staff', label: '담당인력', roles: ['STAFF'] },
]

const columns: Column<PoolMember>[] = [
  { key: 'name', header: '이름', render: (r) => r.name },
  {
    key: 'detail',
    header: '대표자·소속',
    render: (r) => r.detail || <span className="text-gray-400">-</span>,
  },
  {
    key: 'email',
    header: '이메일',
    render: (r) => r.email || <span className="text-gray-400">-</span>,
  },
  {
    key: 'status',
    header: '상태',
    render: (r) =>
      r.linked ? (
        <Badge tone="success" size="sm">
          {r.status}
        </Badge>
      ) : (
        <Badge tone="neutral" size="sm">
          미연결
        </Badge>
      ),
  },
]

/**
 * 참가자 풀(상세 개요 우측 카드).
 * 역할 그룹 탭(건수 칩) + 검색 + 컴팩트 테이블. 깊은 관리(초대·CSV)는 참가자 풀 탭이 담당한다.
 */
export function ParticipantPoolCard({ programId }: { programId: string }) {
  const { data, isLoading } = useParticipantPool(programId)
  const [tab, setTab] = useState('startup')
  const [keyword, setKeyword] = useState('')

  const rows = useMemo(() => data ?? [], [data])
  const activeTab = POOL_TABS.find((t) => t.key === tab) ?? STARTUP_TAB
  const filtered = useMemo(() => {
    const inTab = rows.filter((r) => activeTab.roles.includes(r.role))
    const q = keyword.trim().toLowerCase()
    if (!q) return inTab
    return inTab.filter((r) =>
      [r.name, r.detail, r.email].some((v) => v.toLowerCase().includes(q)),
    )
  }, [rows, activeTab, keyword])

  return (
    <Card title="참가자 풀">
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <Tabs
            size="sm"
            items={POOL_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: rows.filter((r) => t.roles.includes(r.role)).length,
            }))}
            value={tab}
            onChange={setTab}
          />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={`${activeTab.label} 이름·소속·이메일 검색`}
          />
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            standardColumns={false}
            emptyText="해당 역할의 참가자가 없습니다."
          />
        </div>
      )}
    </Card>
  )
}
