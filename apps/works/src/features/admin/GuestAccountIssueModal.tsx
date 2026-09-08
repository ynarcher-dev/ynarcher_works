import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  cardText,
  cn,
} from '@ynarcher/ui'
import { useState } from 'react'
import { GuestAccountIssueForm } from '@/features/admin/GuestAccountIssueForm'
import { useIssueCandidates, type IssueCandidate } from '@/features/admin/guestAccountHooks'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 게스트 계정 발급 모달 — **대상을 고르고, 그다음 사람을 정한다.**
 *
 * **발급만으로는 아무것도 보이지 않는다.** 사업에 매핑되기 전까지 그 계정으로 로그인해도
 * "접근 가능한 사업이 없습니다"만 뜬다. 그래서 내부 사용자 전원에게 열려 있고, 권한이 걸릴
 * 자리는 발급이 아니라 매핑(그 사업 담당자)이다.
 *
 * 2026-09-08에 단계가 둘로 갈렸다. 계정의 키가 원장 행에서 **사람**으로 옮겨지면서
 * (`3_9_2` §5) 한 회사에 담당자가 여럿일 수 있게 되었고, 원장 행 하나를 고르는 것만으로는
 * 누구의 계정인지가 정해지지 않는다. 목록이 답하는 것은 "몇 명이 이미 들어와 있는가"까지이고,
 * 누가 있는지와 누구를 더할지는 2단계가 답한다.
 *
 * **어느 원장에서 고르는지는 이 창이 묻지 않는다**(2026-09-08 저녁). 종전에는 폼 안에 '원장'
 * 셀렉트가 있었는데, 그 값은 창을 열기 전에 이미 정해져 있다 — 담당자는 계정생성 화면의
 * 원장 탭에 서서 버튼을 누른다. 셀렉트를 남기면 SELLER 탭에서 열고 BUYER를 고를 수 있어,
 * 방금 서 있던 탭과 만든 계정이 어긋난다. 자격은 한 곳에서만 정해져야 한다(명부 추가 모달이
 * 자기 원장 선택을 갖지 않는 것과 같은 규칙).
 *
 * 근거: docs/docs_planning/3_9_2_external_portal_expansion.md §5
 */
export function GuestAccountIssueModal({
  open,
  onClose,
  master,
}: {
  open: boolean
  onClose: () => void
  /** 어느 원장에서 고를 것인가. 화면의 원장 탭이 정한다. */
  master: MasterTable
}) {
  const spec = PARTICIPANT_PERSONAS[master]
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<IssueCandidate | null>(null)
  const { data: candidates, isLoading } = useIssueCandidates(master, search)

  const close = () => {
    setPicked(null)
    onClose()
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={`${spec.label} 계정 발급`}
      help="원장에 이미 있는 대상만 고를 수 있습니다. 발급된 계정은 사업에 연결되기 전까지 아무것도 볼 수 없으며, 연결은 그 사업의 담당자가 참가자 명부에서 합니다."
      size="lg"
      footer={
        <Button variant="ghost" onClick={close}>
          닫기
        </Button>
      }
    >
      {picked ? (
        <GuestAccountIssueForm
          master={master}
          candidate={picked}
          onBack={() => setPicked(null)}
          onDone={close}
        />
      ) : (
        <div className="space-y-3">
          <Field label="검색">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={spec.pickSearchPlaceholder}
            />
          </Field>

          {isLoading && <Spinner />}
          {!isLoading && search.trim() && (candidates ?? []).length === 0 && (
            <EmptyState
              title="검색 결과가 없습니다"
              description="원장에 이미 있는 대상만 고를 수 있습니다. 없으면 원장에 먼저 등록하세요."
            />
          )}

          {/*
            값이 모자란 대상도 고를 수 있다(2026-09-08 개정). 종전에는 원장에 이메일·연락처가
            없으면 줄이 죽어 있었고 안내가 "원장에서 먼저 보완"이었다 — 이메일을 원장이
            정했기 때문이다. 지금은 담당자가 폼에서 적으므로 막을 이유가 없다.
          */}
          <ul className="space-y-1">
            {(candidates ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPicked(c)}
                  className="flex w-full items-center gap-3 rounded-radius-md border border-gray-300 px-3 py-2 text-left hover:border-brand hover:bg-brand/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', cardText.value)}>
                      {c.name}
                    </span>
                    <span className={cn('block truncate', cardText.meta)}>
                      {[
                        c.loginName,
                        c.email,
                        c.accountCount > 0 ? `계정 ${c.accountCount}명` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '원장에 연락처 없음 · 다음 단계에서 입력'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
