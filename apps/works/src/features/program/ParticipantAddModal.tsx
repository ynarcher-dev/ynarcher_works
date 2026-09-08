import {
  Button,
  Field,
  Input,
  Modal,
  PickList,
  PickMark,
  PickRow,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useCallback, useState } from 'react'
import {
  mapBlockReason,
  useAddParticipants,
  useMasterCandidates,
  type MasterCandidate,
} from '@/features/program/participantHooks'
import { ParticipantPersonRow } from '@/features/program/ParticipantPersonStep'
import { isChoiceReady, type PersonChoice } from '@/features/program/participantPerson'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 참가자 명부에 담기 — **대상을 고르고, 그다음 그 대상의 누구인가를 정한다.**
 *
 * 이 화면에서 원장을 고치지 않는다. 사업 담당자가 급히 받아적은 값이 마스터를 덮어쓰면
 * 어느 쪽이 정본인지 판정할 근거가 사라진다 — 사람을 새로 적는 것은 **계정**을 세우는
 * 일이지 원장 행을 바꾸는 일이 아니다.
 *
 * 담을 대상이 어느 원장에서 오는지는 탭이 정한다 — 모달이 자기 원장 선택을 따로 갖고 있으면
 * 담당자가 'SELLER' 탭에서 열고 BUYER를 담을 수 있고, 그러면 그 사람이 볼 화면이 열려 있던
 * 탭과 어긋난다. 자격은 한 곳에서만 정해져야 한다(3_9_1 §4).
 *
 * **2단계가 생긴 이유**(2026-09-08 사용자 지정 "실제 생성은 프로젝트 상세에서").
 *   계정을 세우는 자리가 사이드바 창구에서 여기로 옮겨 왔다. 창구에 있던 시절에도 발급만으로는
 *   아무것도 보이지 않았다 — 사업에 매핑되기 전까지 그 계정으로 로그인해도 "접근 가능한 사업이
 *   없습니다"만 떴다. 즉 사업 없이 만드는 계정은 **아무 일도 하지 않는 버튼**이었고, 그 버튼을
 *   없애면 계정은 언제나 "어느 사업에 들이려고" 만들어진다.
 *
 *   그리고 사람을 여기서 정하지 않으면 한 회사에 담당자를 여럿 둘 수 없다. 종전 경로
 *   (`로그인 열기`)는 원장 행에서 한 명을 자동으로 꺼내므로, A딜엔 김이사·B딜엔 박상무 같은
 *   구분이 표현되지 않는다.
 *
 * 후보 목록의 규격은 회의록 외부 참석자 검색과 같다(체크 원 + 이름·메타 두 줄 + 행 전체 클릭) —
 * 원장에서 골라 담는 화면이 앱 안에서 서로 다르게 생길 이유가 없다.
 */
export function ParticipantAddModal({
  open,
  onClose,
  programId,
  master,
}: {
  open: boolean
  onClose: () => void
  programId: string
  /** 어느 자격으로 담을 것인가. 명부의 자격 탭이 정한다. */
  master: MasterTable
}) {
  const toast = useToast()
  const spec = PARTICIPANT_PERSONAS[master]
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<MasterCandidate[]>([])
  const [people, setPeople] = useState<Record<string, PersonChoice>>({})
  const [step, setStep] = useState<'pick' | 'people'>('pick')

  const { data: candidates, isLoading } = useMasterCandidates(programId, master, search)
  const add = useAddParticipants(programId)

  const close = () => {
    setPicked([])
    setPeople({})
    setStep('pick')
    onClose()
  }

  const toggle = (c: MasterCandidate) =>
    setPicked((prev) =>
      prev.some((p) => p.id === c.id) ? prev.filter((p) => p.id !== c.id) : [...prev, c],
    )

  // 행이 기본값을 정할 때마다 불린다. 참조가 매 렌더 바뀌면 그 행의 effect가 다시 돌아
  // 방금 고친 값을 되돌리므로 여기서 고정한다.
  const setChoice = useCallback(
    (id: string, next: PersonChoice) => setPeople((prev) => ({ ...prev, [id]: next })),
    [],
  )

  const ready = picked.length > 0 && picked.every((c) => isChoiceReady(people[c.id]))

  const submit = () => {
    add.mutate(
      { master, rows: picked.map((c) => ({ masterId: c.id, choice: people[c.id]! })) },
      {
        onSuccess: (res) => {
          if (res.failed.length > 0) {
            toast.show(
              `${res.added}건을 담았습니다. ${res.failed.length}건 실패: ${res.failed[0]}`,
              'warning',
            )
          } else {
            toast.show(`${res.added}건을 명부에 담았습니다.`, 'success')
          }
          if (res.added > 0) close()
        },
        onError: (e: unknown) =>
          toast.show(
            e instanceof Error ? e.message : '명부 추가에 실패했습니다. 권한을 확인하세요.',
            'danger',
          ),
      },
    )
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={`${spec.label} 추가`}
      help={
        step === 'pick'
          ? spec.pickHelp
          : '이미 계정이 있으면 그 사람을 고릅니다. 새로 적으면 계정이 하나 세워지고, 같은 이메일이 이미 있으면 그 계정을 그대로 씁니다.'
      }
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          {step === 'people' ? (
            <>
              <Button variant="ghost" onClick={() => setStep('pick')}>
                뒤로
              </Button>
              <Button onClick={submit} disabled={add.isPending || !ready}>
                {add.isPending ? '담는 중…' : `명부에 담기 (${picked.length})`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                취소
              </Button>
              <Button onClick={() => setStep('people')} disabled={picked.length === 0}>
                다음 ({picked.length})
              </Button>
            </>
          )}
        </div>
      }
    >
      {step === 'people' ? (
        <div className="overflow-hidden rounded-radius-md border border-gray-200">
          {picked.map((c) => (
            <ParticipantPersonRow
              key={c.id}
              master={master}
              candidate={c}
              choice={people[c.id]}
              onChange={(next) => setChoice(c.id, next)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="검색">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={spec.pickSearchPlaceholder}
            />
          </Field>

          <div className="overflow-hidden rounded-radius-md border border-gray-200">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner />
              </div>
            ) : (
              <PickList isEmpty={(candidates ?? []).length === 0} empty="검색 결과가 없습니다.">
                {(candidates ?? []).map((c) => {
                  // 막는 것은 '이미 담김' 하나다(2026-09-08). 종전에는 원장에 성명·이메일·
                  // 연락처가 없으면 고를 수 없었는데, 그것은 계정 값을 **원장이 정하던**
                  // 시절의 규칙이다. 지금은 다음 단계에서 담당자가 적으므로 막을 이유가 없다.
                  const blocked = mapBlockReason(c)
                  const added = picked.some((p) => p.id === c.id)
                  return (
                    <PickRow
                      key={c.id}
                      selected={added}
                      disabled={Boolean(blocked)}
                      onClick={() => toggle(c)}
                    >
                      <PickMark checked={added}>
                        <Check className="size-3.5" />
                      </PickMark>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-gray-900">
                          <span className="font-medium">{c.name}</span>
                          {c.loginName && <span className="text-gray-500"> · {c.loginName}</span>}
                        </span>
                        <span className="block truncate text-body-sm text-gray-600">
                          {c.email ?? c.phone ?? '원장에 연락처 없음 · 다음 단계에서 입력'}
                        </span>
                      </span>
                      {blocked && (
                        <span className="shrink-0 text-body-sm text-gray-500">{blocked}</span>
                      )}
                    </PickRow>
                  )
                })}
              </PickList>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
