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
import { useState } from 'react'
import {
  canMapCandidate,
  mapBlockReason,
  useAddParticipants,
  useMasterCandidates,
} from '@/features/program/participantHooks'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 참가자 명부 원장 추가 모달(참여 기업 · 참여 전문가).
 *
 * 이 화면에서 신규 등록이나 값 보정을 하지 않는다 — 사업 담당자가 급히 받아적은 값이 마스터를
 * 덮어쓰면 어느 쪽이 정본인지 판정할 근거가 사라진다. 성명·연락처가 없는 대상은 목록에서
 * 빼지 않고 **고를 수 없는 채로 사유와 함께** 남긴다. 빼 버리면 "왜 안 보이지"가 되고,
 * 남기면 "무엇을 보완해야 하는지"가 남는다.
 *
 * 담을 대상이 어느 원장에서 오는지는 탭이 정한다 — 참여 기업은 STARTUP 원장(startups),
 * 참여 전문가는 NETWORKS 원장(networks)이다. 2026-09-05에 역할 선택(STARTUP·EXPERT·MENTOR…)을
 * 걷었다: 자격은 이미 탭이 답하고 있었고, 남은 역할 값은 그 답의 사본이라 서로 어긋날 수만
 * 있었다(전문가 탭에서 담으며 역할을 STARTUP으로 고를 수 있었다).
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
  /**
   * 어느 자격으로 담을 것인가. 명부의 탭이 정한다 — 모달이 자기 원장 선택을 따로 갖고
   * 있으면 담당자가 '참여 전문가' 탭에서 열고도 기업을 담을 수 있고, 그러면 그 사람이 볼
   * 화면이 열려 있던 탭과 어긋난다. 자격은 한 곳에서만 정해져야 한다(3_9_1 §4).
   */
  master: MasterTable
}) {
  const toast = useToast()
  // 제목·안내·검색 문구의 소유자는 이 화면이 아니라 자격 설정이다 — 자격을 하나 더 여는 일이
  // 이 모달의 삼항 셋을 고치는 일이 되어서는 안 된다.
  const spec = PARTICIPANT_PERSONAS[master]
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const { data: candidates, isLoading } = useMasterCandidates(programId, master, search)
  const add = useAddParticipants(programId)

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  const submit = () => {
    if (picked.length === 0) return
    add.mutate(
      { master, ids: picked },
      {
        onSuccess: () => {
          toast.show(`${picked.length}건을 명부에 추가했습니다.`, 'success')
          setPicked([])
          onClose()
        },
        onError: () => toast.show('명부 추가에 실패했습니다. 권한을 확인하세요.', 'danger'),
      },
    )
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={onClose}
      title={`${spec.label} 추가`}
      help={spec.pickHelp}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={add.isPending || picked.length === 0}>
            {add.isPending ? '추가 중…' : `추가 (${picked.length})`}
          </Button>
        </div>
      }
    >
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
                const blocked = mapBlockReason(c)
                const selectable = canMapCandidate(c) && !c.alreadyMapped
                const added = picked.includes(c.id)
                return (
                    <PickRow
                      key={c.id}
                      selected={added}
                      disabled={!selectable}
                      onClick={() => toggle(c.id)}
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
                          {c.email ?? c.phone ?? ''}
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
    </Modal>
  )
}
