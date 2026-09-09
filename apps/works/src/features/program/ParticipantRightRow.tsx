import { Badge, Field, IconButton, Input, cardText, cn } from '@ynarcher/ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ledgerPerson,
  needsPerson,
  type PersonInput,
} from '@/features/program/participantPerson'
import type { ParticipantPersona } from '@/features/program/participantPersona'
import type { RightRow } from '@/features/program/participantTransfer'

/**
 * 계정 있음(우측) 목록의 한 줄.
 *
 * 두 갈래가 **같은 목록에 서면서 서로 다르게 생긴** 이유는 남은 일이 다르기 때문이다. 이미 선
 * 줄은 누구인지가 이미 정해져 그 사실을 되읽기만 하면 되고, 이번에 올린 줄은 원장이 아는
 * 명의를 되읽되 그 값이 비어 있으면 그 자리에서 채워야 한다.
 *
 * **사람을 고르는 축은 없다**(2026-09-09). 명의는 원장이 답하고, 같은 사람에게 계정이 두 벌
 * 생기지 않는 것은 발급의 멱등성이 보장한다 — 근거는 `participantPerson.ts`에 있다.
 */
export function ParticipantRightRow({
  spec,
  row,
  typed,
  onChange,
  onRemove,
}: {
  spec: ParticipantPersona
  row: RightRow
  /** 담당자가 이 줄에 적은 값. 원장이 다 알고 있으면 undefined다. */
  typed: PersonInput | undefined
  onChange: (next: PersonInput) => void
  onRemove: () => void
}) {
  if (row.kind === 'existing') {
    return (
      <RowShell name={row.name} badge={null} onRemove={onRemove} removeLabel={`${row.name} 명부에서 빼기`}>
        <p className={cn('truncate', cardText.meta)}>
          {[row.personName, row.personEmail].filter(Boolean).join(' · ') || '계정 정보 없음'}
        </p>
      </RowShell>
    )
  }

  const c = row.candidate
  const value = typed ?? ledgerPerson(c)

  return (
    <RowShell
      name={c.name}
      badge={<Badge tone="info">이번에 생성</Badge>}
      onRemove={onRemove}
      removeLabel={`${c.name} 빼기`}
    >
      {needsPerson(c) ? (
        <div className="space-y-2">
          {/*
            접지 않는 안내다 — 적은 값이 계정에만 머무르지 않고 **원장까지 바꾼다**는 파급
            효과 고지이고(CLAUDE.md 안내 규칙의 예외), 그 사실을 모르면 담당자는 이 칸을
            '이번 계정에만 쓰는 임시값'으로 읽는다.
          */}
          <p className={cardText.meta}>
            원장에 {spec.loginNameHeader} 정보가 없습니다. 여기 적은 값은 계정과 함께{' '}
            <b>{spec.nameHeader} 원장에도 저장</b>됩니다.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label={spec.loginNameHeader}>
              <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
            </Field>
            <Field label="이메일" hint="로그인 ID">
              <Input
                type="email"
                value={value.email}
                onChange={(e) => onChange({ ...value, email: e.target.value })}
              />
            </Field>
            <Field label="연락처" hint="초기 비밀번호">
              <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
            </Field>
          </div>
        </div>
      ) : (
        // 원장이 다 아는 줄은 값을 되읽기만 한다. 입력칸을 세우면 고칠 수 있는 것처럼 보이고,
        // 고치는 자리는 원장 하나여야 한다.
        <p className={cn('truncate', cardText.meta)}>
          {spec.loginNameHeader} {value.name} · {value.email}
          {value.phone && ` · ${value.phone}`}
        </p>
      )}
    </RowShell>
  )
}

/** 두 갈래가 공유하는 껍데기 — 이름 줄과 빼기 버튼의 자리는 갈리지 않는다. */
function RowShell({
  name,
  badge,
  onRemove,
  removeLabel,
  children,
}: {
  name: string
  badge: ReactNode
  onRemove: () => void
  removeLabel: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2 border-b border-gray-200 px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate font-medium', cardText.value)}>{name}</span>
        {badge}
        <IconButton
          density="table"
          variant="ghost"
          danger
          label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          icon={<X size={14} />}
        />
      </div>
      {children}
    </div>
  )
}
