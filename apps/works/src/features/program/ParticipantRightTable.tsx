import { Badge, DataTable, EmptyValue, type Column } from '@ynarcher/ui'
import { gapText, ledgerGaps, ledgerPerson } from '@/features/program/participantPerson'
import type { ParticipantPersona } from '@/features/program/participantPersona'
import type { RightRow } from '@/features/program/participantTransfer'

/**
 * 계정 있음(우측) — **표**로 세운다.
 *
 * 한 줄에 값을 `·`로 이어 붙이던 자리다(2026-09-10 사용자 지정으로 표 전환). 이어 붙이면 빈
 * 값이 자리를 남기지 않고 사라져, `뉴런랩스 대표자 김도현 · contact@…`을 보고도 연락처가
 * 없다는 사실을 알 수 없었다 — 없는 값은 없다고 말해야 하고, 그 말을 하는 것은 **빈 칸**이다.
 *
 * **이 창은 원장을 고치지 않는다**(2026-09-10 사용자 결정). 종전에는 값이 빈 줄에 입력칸이
 * 서고, 담당자가 적은 값이 계정과 함께 원장에도 저장됐다. 그러면 **원장을 고치는 자리가 둘**이
 * 되고 그중 하나가 계정을 세우는 창이 된다 — 게다가 원장 쓰기 권한이 없는 담당자에게는 그
 * 저장이 조용히 실패했다. 값의 집은 원장이므로 묻는 자리는 **담는 문 하나**이고(명단 담기가
 * 갖춰지지 않은 대상을 아예 받지 않는다), 여기서는 그 결과를 되읽기만 한다.
 *
 * 그래서 빈 칸이 남은 줄은 게이트가 서기 전에 담긴 줄뿐이다. 그 줄은 감추지 않고 **왜 계정을
 * 세울 수 없는지**를 말한 뒤 저장을 막는다 — 감추면 담당자는 저장 버튼이 왜 안 눌리는지
 * 알 수 없다.
 */
export function ParticipantRightTable({
  spec,
  rows,
  checked,
  onCheckedChange,
}: {
  spec: ParticipantPersona
  rows: RightRow[]
  /** 지금 체크된 줄(원장 행 id). 가운데 [빼기]가 옮길 대상이다. */
  checked: string[]
  onCheckedChange: (ids: string[]) => void
}) {
  /**
   * 그 줄이 들고 있는 명의 — 계정이 섰으면 계정이, 아직이면 원장이 답한다.
   *
   * 두 원천이 한 열에 서지만 물음은 하나다: *이 줄은 누구로 문을 여는가.* 다만 연락처만은
   * 언제나 원장이 답한다(계정에는 연락처 칸이 없다 — 초기 비밀번호가 되는 원장 값이다).
   */
  const personOf = (row: RightRow) =>
    row.kind === 'draft'
      ? ledgerPerson(row.candidate)
      : { name: row.personName ?? '', email: row.personEmail ?? '', phone: row.phone ?? '' }

  const value = (v: string) => (v.trim() ? v : <EmptyValue />)

  const columns: Column<RightRow>[] = [
    { key: 'name', header: spec.nameHeader, primary: true, type: 'name', render: (r) => r.name },
    {
      key: 'loginName',
      header: spec.loginNameHeader,
      type: 'person',
      render: (r) => value(personOf(r).name),
    },
    { key: 'email', header: '이메일', type: 'long', render: (r) => value(personOf(r).email) },
    { key: 'phone', header: '연락처', type: 'phone', render: (r) => value(personOf(r).phone) },
    {
      key: 'state',
      header: '상태',
      type: 'badge',
      /*
        이미 선 계정은 표시하지 않는다 — 이 기둥에 서 있다는 사실이 곧 '계정 있음'이고, 두
        갈래 모두에 배지를 달면 이번에 생기는 줄이 그 사이에 묻힌다. 값이 모자란 줄만 그
        사실을 먼저 말한다(저장을 막는 이유다).
      */
      render: (r) => {
        if (r.kind !== 'draft') return null
        const gaps = ledgerGaps(r.candidate)
        return gaps.length > 0 ? (
          <Badge tone="danger">{gapText(gaps, spec.loginNameHeader)}</Badge>
        ) : (
          <Badge tone="info">이번에 생성</Badge>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.masterId}
      numbered={false}
      standardColumns={false}
      selectable
      selectedKeys={checked}
      onSelectionChange={onCheckedChange}
      emptyText="왼쪽에서 대상을 고르고 [넣기]를 누르세요."
    />
  )
}
