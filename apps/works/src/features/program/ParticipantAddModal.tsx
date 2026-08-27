import { Button, Checkbox, Input, Modal, Select, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { PARTICIPANT_ROLES } from '@/features/program/config'
import {
  canMapCandidate,
  mapBlockReason,
  useAddParticipants,
  useMasterCandidates,
  type MasterTable,
} from '@/features/program/participantHooks'

/** 역할 기본값은 원장에 따라 갈린다 — 기업은 참가사, 전문가는 전문가 풀에서 출발한다. */
const DEFAULT_ROLE: Record<MasterTable, string> = {
  startups: 'STARTUP',
  experts: 'EXPERT',
}

/**
 * 연동 DB '원장에서 추가' 모달.
 *
 * 이 화면에서 신규 등록이나 값 보정을 하지 않는다 — 사업 담당자가 급히 받아적은 값이 마스터를
 * 덮어쓰면 어느 쪽이 정본인지 판정할 근거가 사라진다. 성명·연락처가 없는 대상은 목록에서
 * 빼지 않고 **고를 수 없는 채로 사유와 함께** 남긴다. 빼 버리면 "왜 안 보이지"가 되고,
 * 남기면 "무엇을 보완해야 하는지"가 남는다.
 */
export function ParticipantAddModal({
  open,
  onClose,
  programId,
}: {
  open: boolean
  onClose: () => void
  programId: string
}) {
  const toast = useToast()
  const [master, setMaster] = useState<MasterTable>('startups')
  const [role, setRole] = useState<string>(DEFAULT_ROLE.startups)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const { data: candidates, isLoading } = useMasterCandidates(programId, master, role, search)
  const add = useAddParticipants(programId)

  const switchMaster = (next: MasterTable) => {
    setMaster(next)
    setRole(DEFAULT_ROLE[next])
    setPicked([])
  }

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  const submit = () => {
    if (picked.length === 0) {
      toast.show('추가할 대상을 선택하세요.', 'warning')
      return
    }
    add.mutate(
      { master, role, ids: picked },
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
      open={open}
      onClose={onClose}
      title="원장에서 추가"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-gray-600">
            명부에 올리기만 합니다. 로그인은 목록에서 따로 엽니다.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button onClick={submit} disabled={add.isPending || picked.length === 0}>
              {add.isPending ? '추가 중…' : `명부에 추가 (${picked.length})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={master}
            onChange={(e) => switchMaster(e.target.value as MasterTable)}
            className="w-32"
          >
            <option value="startups">기업</option>
            <option value="experts">전문가</option>
          </Select>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPicked([]) }} className="w-36">
            {PARTICIPANT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={master === 'startups' ? '기업명 · 대표자 검색' : '전문가명 · 소속 검색'}
            className="flex-1"
          />
        </div>

        <div className="max-h-96 overflow-y-auto rounded-radius-md border border-gray-300">
          {isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : (candidates ?? []).length === 0 ? (
            <p className="p-6 text-center text-caption text-gray-600">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {(candidates ?? []).map((c) => {
                const blocked = mapBlockReason(c)
                const selectable = canMapCandidate(c) && !c.alreadyMapped
                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-3 px-3 py-2 ${selectable ? '' : 'bg-gray-50'}`}
                  >
                    <Checkbox
                      checked={picked.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={!selectable}
                      aria-label={`${c.name} 선택`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-gray-900">{c.name}</p>
                      <p className="truncate text-caption text-gray-600">
                        {c.loginName ?? '성명 없음'} · {c.email ?? c.phone ?? '연락처 없음'}
                      </p>
                    </div>
                    {blocked && <span className="shrink-0 text-caption text-gray-500">{blocked}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
