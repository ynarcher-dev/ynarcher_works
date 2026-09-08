import { Badge, Field, Input, Select, Spinner, cardText, cn } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useLedgerAccounts } from '@/features/admin/guestAccountHooks'
import type { MasterCandidate } from '@/features/program/participantHooks'
import type { MasterTable } from '@/features/program/participantPersona'
import type { PersonChoice } from '@/features/program/participantPerson'

/**
 * 대상 한 줄 — 그 원장 행에 이미 선 계정을 읽어 기본값을 정하고, 담당자가 바꾸면 그 값이 이긴다.
 *
 * **기본값이 '기존 계정'인 것이 요점이다.** 같은 회사를 두 번째 사업에 담을 때 새 계정을
 * 만들면 그 사람은 비밀번호를 두 벌 받는다 — 계정을 대상마다 하나에서 **사람마다 하나**로
 * 옮긴 이유가 바로 그것이었다(3_9_2 §5). 그래서 이미 있는 사람이 먼저 서고, 새로 세우는
 * 것은 담당자가 일부러 고르는 일이 된다.
 *
 * 계정이 하나도 없으면 원장 값(대표자·이메일·연락처)을 채워 둔다. 비워 두면 매번 원장을
 * 열어 옮겨 적게 되고, 대부분의 첫 등록은 여전히 그 한 사람이다.
 */
export function ParticipantPersonRow({
  master,
  candidate,
  choice,
  onChange,
}: {
  master: MasterTable
  candidate: MasterCandidate
  choice: PersonChoice | undefined
  onChange: (next: PersonChoice) => void
}) {
  const { data: accounts, isLoading } = useLedgerAccounts(master, candidate.id)

  // 계정 목록이 오면 기본값을 정한다. `choice`가 이미 있으면 손대지 않는다 — 담당자가 고른
  // 값을 조회 한 번에 되돌리면, 바꾼 것이 왜 되돌아왔는지 화면이 답하지 못한다.
  useEffect(() => {
    if (choice || isLoading || !accounts) return
    const live = accounts.filter((a) => a.isActive)
    onChange(
      live.length > 0
        ? { kind: 'existing', userId: live[0]!.userId }
        : {
            kind: 'new',
            name: candidate.loginName ?? '',
            email: candidate.email ?? '',
            phone: candidate.phone ?? '',
          },
    )
  }, [accounts, isLoading, choice, candidate, onChange])

  const live = (accounts ?? []).filter((a) => a.isActive)
  const value = choice?.kind === 'existing' ? choice.userId : 'new'

  return (
    <div className="space-y-2 border-b border-gray-200 px-3 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate font-medium', cardText.value)}>
          {candidate.name}
        </span>
        {live.length > 0 && <Badge tone="neutral">계정 {live.length}명</Badge>}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <Select
            value={value}
            onChange={(e) => {
              const v = e.target.value
              onChange(
                v === 'new'
                  ? {
                      kind: 'new',
                      name: candidate.loginName ?? '',
                      email: candidate.email ?? '',
                      phone: candidate.phone ?? '',
                    }
                  : { kind: 'existing', userId: v },
              )
            }}
          >
            {live.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name ?? '(이름 없음)'} · {a.email ?? '(이메일 없음)'}
              </option>
            ))}
            <option value="new">+ 새 사람 추가</option>
          </Select>

          {choice?.kind === 'new' && (
            // 이메일이 로그인 ID이고 연락처가 초기 비밀번호다. 연락처를 필수로 두지 않는
            // 이유는 이미 그 이메일의 계정이 있으면 서버가 그 계정을 그대로 돌려주기
            // 때문이다(멱등) — 그때는 비밀번호를 새로 만들 일이 없다.
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="이름">
                <Input
                  value={choice.name}
                  onChange={(e) => onChange({ ...choice, name: e.target.value })}
                />
              </Field>
              <Field label="이메일" hint="로그인 ID">
                <Input
                  type="email"
                  value={choice.email}
                  onChange={(e) => onChange({ ...choice, email: e.target.value })}
                />
              </Field>
              <Field label="연락처" hint="초기 비밀번호">
                <Input
                  value={choice.phone}
                  onChange={(e) => onChange({ ...choice, phone: e.target.value })}
                />
              </Field>
            </div>
          )}
        </>
      )}
    </div>
  )
}
