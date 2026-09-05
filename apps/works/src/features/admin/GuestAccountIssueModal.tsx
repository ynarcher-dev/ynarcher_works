import { Button, Field, Input, Modal, Select, Spinner, cn, useToast } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useState } from 'react'
import {
  issueBlockReason,
  useIssueCandidates,
  useIssueGuestAccount,
  type IssueCandidate,
} from '@/features/admin/guestAccountHooks'

const MASTER_LABEL: Record<'startups' | 'networks', string> = {
  startups: '기업',
  networks: '전문가·기관',
}

/**
 * 게스트 계정 발급 모달.
 *
 * **발급만으로는 아무것도 보이지 않는다.** 사업에 매핑되기 전까지 그 계정으로 로그인해도
 * "접근 가능한 사업이 없습니다"만 뜬다. 그래서 내부 사용자 전원에게 열려 있고, 권한이 걸릴
 * 자리는 발급이 아니라 매핑(그 사업 담당자)이다.
 *
 * 계정의 키는 이메일이 아니라 **원장 행**이라 같은 행을 두 번 눌러도 계정은 하나다(멱등).
 * 그래서 이미 계정이 있는 대상도 목록에 남고, 누르면 그 계정을 그대로 돌려받는다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §4, §9
 */
export function GuestAccountIssueModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const [master, setMaster] = useState<'startups' | 'networks'>('startups')
  const [search, setSearch] = useState('')
  const { data: candidates, isLoading } = useIssueCandidates(master, search)
  const issue = useIssueGuestAccount()

  const run = (c: IssueCandidate) => {
    issue.mutate(
      { masterTable: master, masterId: c.id },
      {
        onSuccess: () => {
          toast.show(
            c.hasAccount
              ? `${c.name}은(는) 이미 계정이 있어 그대로 사용합니다.`
              : `${c.name} 계정을 발급했습니다.`,
            'success',
          )
          onClose()
        },
        onError: (e: unknown) =>
          toast.show(e instanceof Error ? e.message : '발급에 실패했습니다.', 'danger'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="게스트 계정 발급"
      help="원장에 이미 있는 대상만 고를 수 있습니다. 발급된 계정은 사업에 연결되기 전까지 아무것도 볼 수 없으며, 연결은 그 사업의 담당자가 참가자 명부에서 합니다."
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <Field label="원장" className="w-40">
            <Select
              value={master}
              onChange={(e) => setMaster(e.target.value as 'startups' | 'networks')}
            >
              {(['startups', 'networks'] as const).map((m) => (
                <option key={m} value={m}>
                  {MASTER_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="검색" className="flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={master === 'startups' ? '기업명' : '전문가·기관명'}
            />
          </Field>
        </div>

        {isLoading && <Spinner />}
        {!isLoading && search.trim() && (candidates ?? []).length === 0 && (
          <p className="text-body text-gray-500">검색 결과가 없습니다.</p>
        )}

        <ul className="space-y-1">
          {(candidates ?? []).map((c) => {
            const blocked = issueBlockReason(c)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={Boolean(blocked) || issue.isPending}
                  onClick={() => run(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-radius-md border px-3 py-2 text-left',
                    blocked
                      ? 'cursor-not-allowed border-gray-200 opacity-60'
                      : 'border-gray-200 hover:border-brand hover:bg-brand/5',
                  )}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-gray-300">
                    {c.hasAccount && <Check aria-hidden className="size-3 text-success" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-gray-900">
                      {c.name}
                    </span>
                    <span className="block truncate text-caption text-gray-500">
                      {blocked ??
                        [c.loginName, c.email, c.hasAccount ? '계정 있음' : null]
                          .filter(Boolean)
                          .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
