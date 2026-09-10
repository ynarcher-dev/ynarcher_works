import {
  Badge,
  DataTable,
  EmptyValue,
  Input,
  TransferPanes,
  formText,
  type Column,
} from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { PersonField } from '@/features/program/participantPerson'
import {
  PARTICIPANT_PERSONAS,
  type MasterTable,
  type ParticipantPersona,
} from '@/features/program/participantPersona'
import { RosterCandidateList } from '@/features/program/RosterCandidateList'
import type { RosterPick, RosterRightRow } from '@/features/program/rosterPick'

/**
 * 명단 담기 창의 두 기둥 — **왼쪽은 아직 안 담긴 원장 행, 오른쪽은 이 사업 명단**이다.
 *
 * 좌우로 가른 이유는 원장의 크기다(2026-09-10 사용자 지정). 후보 조회는 전사 원장을 검색어로
 * 긁어 50건씩 내려 주는데, 한 목록에서 체크만 하던 동안에는 검색어를 바꾸는 순간 방금 고른
 * 줄이 목록 밖으로 사라졌다 — 원장이 커질수록 담당자가 자기 선택을 되읽을 방법이 저장 버튼의
 * 숫자 하나뿐이 된다. 오른쪽 기둥은 그 숫자를 목록으로 되돌린다.
 *
 * **이미 담긴 줄은 오른쪽에 선다**(2026-09-10 수정) — 왼쪽에 회색으로 세우면 '아직 아닌 것'이라는
 * 축이 거짓을 말하고, 아예 감추면 검색해도 안 나와 담당자가 `새로 등록`으로 가서 중복 원장 행을
 * 만든다. 다만 그 줄은 이 창에서 내리지 못한다 — 빼는 자리는 명단 표와 그 확인창이다.
 *
 * 계정생성 창과 **같은 부품**(`TransferPanes`)을 쓴다. 두 창이 하는 일은 다르지만(저기는
 * 계정을 세우고 여기는 참가 사실을 담는다) 담당자가 하는 손놀림은 같다 — 왼쪽에서 체크하고
 * 가운데로 옮기고 오른쪽을 확인한 뒤 저장한다. 같은 손놀림이 창마다 다르게 생길 이유가 없다.
 */
export function RosterPickPanes({
  master,
  isLoading,
  search,
  onSearchChange,
  pick,
  busy,
  /** 왼쪽 기둥 아래 — '원장에 없나요?'로 시작하는 다른 길들(새로 등록·CSV파일 업로드). */
  footer,
}: {
  master: MasterTable
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  pick: RosterPick
  busy: boolean
  footer?: ReactNode
}) {
  const spec = PARTICIPANT_PERSONAS[master]

  return (
    <TransferPanes
      left={{
        title: `${spec.label} 원장`,
        count: pick.left.length,
        children: (
          <div className="space-y-3">
            <RosterCandidateList
              master={master}
              candidates={pick.left}
              isLoading={isLoading}
              search={search}
              onSearchChange={onSearchChange}
              checked={pick.checkedLeft}
              onToggle={pick.toggleLeft}
            />
            {footer}
          </div>
        ),
      }}
      right={{
        title: '이 사업 명단',
        count: pick.right.length,
        children: (
          <div className="space-y-2">
            {/*
              표로 세운다(2026-09-10 사용자 지정). 값을 `·`로 이어 붙이면 빈 값이 자리를 남기지
              않고 사라져, 담당자가 **원장의 어느 칸이 비었는지** 알 수 없었다 — 명단에 담는 일이
              곧 계정 발급의 앞 단계라, 명의나 이메일이 빈 줄은 지금 눈에 띄어야 한다.

              그리고 **그 빈 칸을 여기서 채운다**(같은 날 후속 지정). 열 자체는 그대로이고,
              원장이 비워 둔 칸만 입력으로 선다 — 표가 무엇이 비었는지 보여 주는 데서 멈추면
              담당자는 그것을 고치러 원장 화면으로 나가야 하고, 나가는 순간 고른 것이 사라진다.
              채운 값은 담을 때 원장에 반영되므로 값의 집은 여전히 원장이다.

              `layout="fixed"`인 이유는 입력 때문이다 — 자동 레이아웃에서는 `<input>`이 요구하는
              기본 폭(약 20자)이 열의 하한이 되어, 종류가 정한 폭 규격을 브라우저가 덮어쓴다.
            */}
            <DataTable
              columns={rightColumns(spec, pick.patch, busy)}
              rows={pick.right}
              rowKey={(row) => row.id}
              layout="fixed"
              numbered={false}
              standardColumns={false}
              selectable
              // 이미 담긴 줄은 이 창에서 내리지 못한다 — 빼는 자리는 명단 표와 그 확인창이고,
              // 여기서 함께 내리면 되돌릴 수 없는 일이 확인 없이 일어난다.
              selectableRow={(row) => row.kind === 'draft'}
              selectedKeys={pick.checkedRight}
              onSelectionChange={pick.setCheckedRight}
              emptyText="왼쪽에서 대상을 고르고 [넣기]를 누르세요."
            />
            {/* 왜 아직 담을 수 없는지 — 차단 안내라 접지 않는다(CLAUDE.md 안내 규칙의 예외). */}
            {pick.pending.length > 0 && (
              <p className={formText.hint}>
                {pendingText(pick.pending)}에 빈 칸이 있습니다 — 명단에 담긴 대상은 계정을 열 수
                있어야 하므로 모두 채워 주세요. 채운 값은 {spec.label} 원장에 함께 반영됩니다.
              </p>
            )}
          </div>
        ),
      }}
      toRight={{
        count: pick.checkedLeft.length,
        onMove: pick.moveRight,
        onMoveAll: pick.moveAllRight,
        allDisabled: pick.left.length === 0,
      }}
      toLeft={{
        count: pick.checkedRight.length,
        onMove: pick.moveLeft,
        onMoveAll: pick.moveAllLeft,
        // 내릴 수 있는 것은 이번에 올린 줄뿐이라, 이미 담긴 줄만 있으면 누를 것이 없다.
        allDisabled: pick.staged.length === 0,
      }}
    />
  )
}

/**
 * 아직 빈 칸이 남은 줄을 부르는 말.
 *
 * 셋까지만 이름을 세우고 나머지는 건수로 접는다 — 스무 곳을 한꺼번에 올린 자리에서 이름을 전부
 * 늘어놓으면 안내가 표보다 길어지고, 그렇게 길어진 안내는 읽히지 않는다.
 */
function pendingText(names: string[]): string {
  const head = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${head} 외 ${names.length - 3}건` : head
}

/**
 * 담긴 기둥의 열 — **원장이 이 대상에 대해 아는 것 전부**다.
 *
 * 머리글이 자격을 그대로 부른다(기업명/대표자, 전문가명/성명) — 표의 머리글은 그 열이 무엇인지
 * 답하는 자리이고, '이름'처럼 뭉뚱그리면 담당자가 화면에서 쓰는 말과 어긋난다.
 *
 * **원장이 비워 둔 칸에만 입력이 선다.** 원장이 답한 칸은 글자로 서고, 여기서 고칠 수 없다 —
 * 값의 집은 원장이고 고치는 자리도 원장 하나다. 이 창이 여는 것은 *비어 있던 자리*뿐이다.
 */
function rightColumns(
  spec: ParticipantPersona,
  patch: (id: string, field: PersonField, value: string) => void,
  busy: boolean,
): Column<RosterRightRow>[] {
  const cell = (field: PersonField, header: string, type: 'email' | 'tel' | 'text' = 'text') =>
    function render(r: RosterRightRow) {
      if (!r.gaps.includes(field)) return r[fieldKey[field]] ?? <EmptyValue />
      return (
        <Input
          type={type}
          value={r[fieldKey[field]] ?? ''}
          onChange={(e) => patch(r.id, field, e.target.value)}
          disabled={busy}
          placeholder="필수"
          aria-label={`${r.name} ${header}`}
        />
      )
    }

  return [
    { key: 'name', header: spec.nameHeader, primary: true, type: 'name', render: (r) => r.name },
    {
      key: 'loginName',
      header: spec.loginNameHeader,
      type: 'person',
      render: cell('name', spec.loginNameHeader),
    },
    { key: 'email', header: '이메일', type: 'long', render: cell('email', '이메일', 'email') },
    { key: 'phone', header: '연락처', type: 'text', render: cell('phone', '연락처', 'tel') },
    {
      key: 'state',
      header: '상태',
      type: 'badge',
      render: (r) =>
        r.kind === 'draft' ? (
          <Badge tone="info">이번에 담기</Badge>
        ) : (
          <span className="text-gray-500">담김</span>
        ),
    },
  ]
}

/** 명의 한 벌의 칸 이름과 표 줄의 칸 이름을 잇는다(명의의 `name`은 줄에서 `loginName`이다). */
const fieldKey: Record<PersonField, 'loginName' | 'email' | 'phone'> = {
  name: 'loginName',
  email: 'email',
  phone: 'phone',
}
