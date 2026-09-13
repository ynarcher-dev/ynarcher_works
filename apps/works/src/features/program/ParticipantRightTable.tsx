import { Badge, DataTable, EmptyValue, type Column } from '@ynarcher/ui'
import { PERSONA_LABEL } from '@/features/program/participantPersona'
import type { TransferRightRow } from '@/features/program/guestRoster'

/**
 * 이 사업의 GUEST 명부(우측) — **읽기만 하는 표**다.
 *
 * 입력칸이 있던 자리다(2026-09-13에 걷음). 그때 이 표는 올린 줄마다 성명·이메일·연락처를
 * 받아 **계정을 세웠고**, 그래서 값이 모자란 줄을 붉게 세우고 저장을 막는 판정까지 들고
 * 있었다. 지금 이 창은 이미 있는 계정을 고르기만 하므로 채울 것이 없다 — 값은 계정이 이미
 * 갖고 있고, 고칠 곳은 `/guest-accounts`다.
 *
 * **연결 원장은 곁들이는 표시다.** 계정이 여러 인격을 가질 수 있으므로 **전부** 적고, 화면이
 * 하나를 골라 대표로 세우지 않는다 — 고르면 담당자가 본 자격과 실제 사실이 어긋난다.
 * 연결이 없는 계정은 빈 칸이다(`임직원`이라 적지 않는다).
 */
export function ParticipantRightTable({
  rows,
  checked,
  onCheckedChange,
  disabled = false,
  issues = {},
}: {
  rows: TransferRightRow[]
  /** 지금 체크된 줄(줄 키). 가운데 [빼기]가 옮길 대상이다. */
  checked: string[]
  onCheckedChange: (keys: string[]) => void
  disabled?: boolean
  /** 이번 저장에서 담기지 않았거나 결과를 확인하지 못한 계정별 사유. */
  issues?: Readonly<Record<string, string>>
}) {
  const value = (v: string | null | undefined) => (v?.trim() ? v : <EmptyValue />)

  const columns: Column<TransferRightRow>[] = [
    {
      key: 'name',
      header: '계정명',
      primary: true,
      type: 'name',
      render: (r) => (r.kind === 'staged' ? r.candidate.name : r.row.accountName || '(이름 없음)'),
    },
    {
      key: 'email',
      header: '이메일',
      type: 'long',
      render: (r) => value(r.kind === 'staged' ? r.candidate.email : r.row.accountEmail),
    },
    {
      key: 'phone',
      header: '연락처',
      type: 'phone',
      render: (r) => value(r.kind === 'staged' ? r.candidate.phone : r.row.accountPhone),
    },
    {
      key: 'source',
      header: '연결 원장',
      type: 'text',
      render: (r) => {
        // 후보 계정은 인격 전부를, 명부 줄은 그 줄이 실제로 선 자격 하나를 답한다.
        const labels =
          r.kind === 'staged'
            ? r.candidate.identities.map((i) => `${PERSONA_LABEL[i.masterTable]} · ${i.name ?? '이름 미상'}`)
            : r.row.source
              ? [`${PERSONA_LABEL[r.row.source.masterTable]} · ${r.row.source.name}`]
              : []
        if (labels.length === 0) return <EmptyValue />
        return (
          <div className="space-y-0.5">
            {labels.map((l) => (
              <div key={l} className="truncate" title={l}>
                {l}
              </div>
            ))}
          </div>
        )
      },
    },
    {
      key: 'state',
      header: '상태',
      type: 'badge',
      /*
        이미 명부에 있는 줄은 표시하지 않는다 — 이 기둥에 서 있다는 사실이 곧 '명부에 있음'이고,
        두 갈래 모두에 배지를 달면 이번에 생기는 줄이 그 사이에 묻힌다.
      */
      render: (r) => {
        if (r.kind !== 'staged') return null
        const issue = issues[r.userId]
        if (issue) {
          return (
            <div className="space-y-1">
              <Badge tone="danger">추가 안 됨</Badge>
              <p className="max-w-56 whitespace-normal text-caption text-danger">{issue}</p>
            </div>
          )
        }
        if (!r.candidate.isActive) {
          // 정지된 계정도 명부에는 이을 수 있다(계정 축과 문 축은 다르다). 다만 이어 두어도
          // 들어오지 못하므로, 그 사실을 담기 전에 말한다.
          return <Badge tone="danger">정지된 계정</Badge>
        }
        return <Badge tone="info">추가 예정</Badge>
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      numbered={false}
      standardColumns={false}
      selectable={!disabled}
      selectedKeys={checked}
      onSelectionChange={(keys) => {
        if (!disabled) onCheckedChange(keys)
      }}
      emptyText="왼쪽에서 계정을 고르고 [넣기]를 누르세요."
    />
  )
}
