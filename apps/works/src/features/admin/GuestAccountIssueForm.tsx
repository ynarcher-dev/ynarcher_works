import { Badge, Button, Field, Input, cardText, cn, useToast } from '@ynarcher/ui'
import type { MasterTable } from '@/features/program/participantPersona'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import {
  useIssueGuestAccount,
  useLedgerAccounts,
  type IssueCandidate,
} from '@/features/admin/guestAccountHooks'

/**
 * 발급 2단계 — **누구에게 세울 것인가.**
 *
 * 1단계(대상 고르기)와 갈라 둔 이유는 계정의 단위가 사람이기 때문이다(2026-09-08). 원장 행을
 * 고르는 것으로 발급이 끝나던 시절에는 화면이 한 단계였고, 그때 이메일을 정한 것은 원장이었다.
 * 지금은 **한 회사에 담당자가 여럿**일 수 있으므로 "어느 회사인가" 다음에 "그 회사의 누구인가"를
 * 물어야 한다.
 *
 * 원장 연락처는 지우지 않고 **기본값으로 채운다** — 대부분의 발급은 여전히 대표 한 사람이고,
 * 비워 두면 매번 원장을 열어 옮겨 적게 된다. 담당자가 고치면 그 값이 이긴다.
 *
 * 근거: docs/docs_planning/3_9_2_external_portal_expansion.md §5
 */
export function GuestAccountIssueForm({
  master,
  candidate,
  onBack,
  onDone,
}: {
  master: MasterTable
  candidate: IssueCandidate
  onBack: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const issue = useIssueGuestAccount()
  const { data: existing } = useLedgerAccounts(master, candidate.id)

  const [name, setName] = useState(candidate.loginName ?? '')
  const [email, setEmail] = useState(candidate.email ?? '')
  const [phone, setPhone] = useState(candidate.phone ?? '')

  const trimmedEmail = email.trim().toLowerCase()
  // 이미 선 계정과 같은 주소면 발급이 아니라 그 계정을 그대로 돌려받는다(서버가 멱등).
  // 막지 않고 미리 말해 준다 — 담당자가 의도한 것일 수 있고(인격 추가), 아니라면 여기서 알아챈다.
  const dup = (existing ?? []).find((a) => (a.email ?? '').toLowerCase() === trimmedEmail)

  const canSubmit = Boolean(name.trim() && trimmedEmail) && !issue.isPending

  const run = () => {
    issue.mutate(
      { masterTable: master, masterId: candidate.id, name, email, phone },
      {
        onSuccess: () => {
          toast.show(
            dup
              ? `${name.trim()}은(는) 이미 계정이 있어 그대로 사용합니다.`
              : `${name.trim()} 계정을 발급했습니다.`,
            'success',
          )
          onDone()
        },
        onError: (e: unknown) =>
          toast.show(e instanceof Error ? e.message : '발급에 실패했습니다.', 'danger'),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" density="card" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          대상 다시 고르기
        </Button>
        <span className={cn('min-w-0 truncate font-medium', cardText.value)}>{candidate.name}</span>
      </div>

      {(existing ?? []).length > 0 && (
        <div className="rounded-radius-md border border-gray-300 p-3">
          <p className={cn('mb-2', cardText.subhead)}>
            이미 들어와 있는 사람 {(existing ?? []).length}명
          </p>
          <ul className="space-y-1">
            {(existing ?? []).map((a) => (
              <li key={a.userId} className="flex items-center gap-2">
                <span className={cn('min-w-0 truncate', cardText.value)}>{a.name ?? '(이름 없음)'}</span>
                <span className={cn('min-w-0 truncate', cardText.meta)}>{a.email}</span>
                {!a.isActive && <Badge tone="danger">정지</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="이름" required className="col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="담당자 성명" />
        </Field>
        <Field
          label="이메일"
          required
          hint="로그인 ID입니다. 이 주소로 이미 게스트 계정이 있으면 새로 만들지 않고 그 계정에 이 소속을 더합니다."
        >
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </Field>
        <Field
          label="연락처"
          hint="새 계정일 때 초기 비밀번호로 쓰입니다. 이미 계정이 있는 사람은 자기 비밀번호로 들어오므로 비워도 됩니다."
        >
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
        </Field>
      </div>

      {dup && (
        <p className={cn(cardText.meta)}>
          이 주소는 위 목록에 이미 있습니다. 발급하면 새 계정이 생기지 않고 그 계정을 그대로
          씁니다.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={run} disabled={!canSubmit}>
          {issue.isPending ? '발급 중…' : '계정 발급'}
        </Button>
      </div>
    </div>
  )
}
