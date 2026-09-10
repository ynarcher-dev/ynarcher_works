import { Badge, DataTable, EmptyValue, Input, cardText, type Column } from '@ynarcher/ui'
import { ledgerPerson, type PersonInput } from '@/features/program/participantPerson'
import type { ParticipantPersona } from '@/features/program/participantPersona'
import type { RightRow } from '@/features/program/participantTransfer'

/**
 * 계정 있음(우측) — **표**로 세운다.
 *
 * 한 줄에 값을 `·`로 이어 붙이던 자리다(2026-09-10 사용자 지정으로 표 전환). 이어 붙이면 빈
 * 값이 자리를 남기지 않고 사라져, `뉴런랩스 대표자 김도현 · contact@…`을 보고도 연락처가
 * 없다는 사실을 알 수 없었다 — 없는 값은 없다고 말해야 하고, 그 말을 하는 것은 **빈 칸**이다.
 * 담당자가 이 창에서 하는 일이 곧 *원장이 계정을 세울 만큼 아는가*를 확인하는 일이라, 무엇이
 * 비었는지가 이 창의 본문이다.
 *
 * **비어 있으면 그 자리에서 채운다 — 자격을 가리지 않는다**(2026-09-10 사용자 지정). 종전에는
 * 입력칸이 줄 단위로 섰다: 이름이나 이메일이 비어야(`needsPerson`) 세 칸이 한꺼번에 열렸고,
 * 그래서 연락처만 빈 줄에서는 아무것도 적을 수 없었다. 전문가 원장은 명의가 이름 자체라 늘
 * 차 있고 기업 원장은 대표자가 자주 비어, 같은 창이 자격에 따라 다르게 동작하는 것처럼
 * 보였다. 규칙은 하나다 — **빈 칸이면 채울 수 있고, 찬 칸은 원장이 답한다.**
 *
 * **이미 계정이 있는 줄은 고치지 않는다.** 그 줄의 명의는 이미 일어난 사실(발급된 계정)이라
 * 여기서 덮어쓰면 화면이 계정을 고치는 자리가 된다 — 계정을 재우고 깨우는 것은 ADMIN이고,
 * 원장 값을 고치는 것은 원장이다.
 */
export function ParticipantRightTable({
  spec,
  rows,
  checked,
  onCheckedChange,
  typed,
  onPerson,
}: {
  spec: ParticipantPersona
  rows: RightRow[]
  /** 지금 체크된 줄(원장 행 id). 가운데 [빼기]가 옮길 대상이다. */
  checked: string[]
  onCheckedChange: (ids: string[]) => void
  /** 담당자가 적어 둔 명의. 원장이 다 아는 줄은 들어 있지 않다. */
  typed: Record<string, PersonInput>
  onPerson: (masterId: string, next: PersonInput) => void
}) {
  /** 그 줄이 지금 들고 있는 명의 — 원장 값이 기본이고 담당자가 적은 값이 이긴다. */
  const personOf = (row: RightRow): PersonInput =>
    row.kind === 'draft'
      ? { ...ledgerPerson(row.candidate), ...(typed[row.masterId] ?? {}) }
      : { name: row.personName ?? '', email: row.personEmail ?? '', phone: row.phone ?? '' }

  /**
   * 값 칸 하나 — 채울 수 있는 자리면 입력칸, 아니면 글자다.
   *
   * 두 갈래가 같은 열에 서지만 담당자가 헷갈릴 자리는 없다. 테두리가 있으면 적는 곳이고
   * 없으면 이미 정해진 값이며, `-`는 적을 수도 없고 아직 없는 값(계정이 선 줄의 빈 연락처)이다.
   */
  const cell = (row: RightRow, key: keyof PersonInput, label: string) => {
    const person = personOf(row)
    const value = person[key]
    if (row.kind === 'existing' || value.trim()) {
      return value.trim() ? <span className="truncate">{value}</span> : <EmptyValue />
    }
    return (
      <Input
        value={value}
        type={key === 'email' ? 'email' : 'text'}
        aria-label={`${row.name} ${label}`}
        onChange={(e) => onPerson(row.masterId, { ...person, [key]: e.target.value })}
      />
    )
  }

  const columns: Column<RightRow>[] = [
    {
      key: 'name',
      header: spec.nameHeader,
      primary: true,
      type: 'name',
      render: (row) => row.name,
    },
    {
      key: 'loginName',
      header: spec.loginNameHeader,
      type: 'person',
      render: (row) => cell(row, 'name', spec.loginNameHeader),
    },
    { key: 'email', header: '이메일', type: 'long', render: (row) => cell(row, 'email', '이메일') },
    { key: 'phone', header: '연락처', type: 'text', render: (row) => cell(row, 'phone', '연락처') },
    {
      key: 'state',
      header: '상태',
      type: 'badge',
      // 이미 선 계정은 표시하지 않는다 — 이 기둥에 서 있다는 사실이 곧 '계정 있음'이고,
      // 두 갈래 모두에 배지를 달면 이번에 생기는 줄이 그 사이에 묻힌다.
      render: (row) => (row.kind === 'draft' ? <Badge tone="info">이번에 생성</Badge> : null),
    },
  ]

  /**
   * 접지 않는 안내다 — 적은 값이 계정에만 머무르지 않고 **원장까지 바꾼다**는 파급 효과
   * 고지이고(CLAUDE.md 안내 규칙의 예외), 그 사실을 모르면 담당자는 이 칸을 '이번 계정에만
   * 쓰는 임시값'으로 읽는다. 줄마다 적던 것을 표 위 한 줄로 모았다 — 같은 문장이 줄마다
   * 반복되면 위계가 아니라 소음이 되고, 표에서는 그 자리가 아예 없다.
   */
  const fillable = rows.some(
    (row) =>
      row.kind === 'draft' &&
      Object.values(personOf(row)).some((v) => !v.trim()),
  )

  return (
    <div className="space-y-2">
      {fillable && (
        <p className={cardText.meta}>
          빈 칸은 여기서 채울 수 있습니다. 적은 값은 계정과 함께{' '}
          <b>{spec.nameHeader} 원장에도 저장</b>됩니다.
        </p>
      )}
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
    </div>
  )
}
