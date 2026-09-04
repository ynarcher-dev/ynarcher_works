import { Button, Field, Input, Modal, Select, Spinner, cn, useToast } from '@ynarcher/ui'
import { Check } from 'lucide-react'
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
  networks: 'EXPERT',
}

/**
 * 참가자/전문가 '원장에서 추가' 모달.
 *
 * 이 화면에서 신규 등록이나 값 보정을 하지 않는다 — 사업 담당자가 급히 받아적은 값이 마스터를
 * 덮어쓰면 어느 쪽이 정본인지 판정할 근거가 사라진다. 성명·연락처가 없는 대상은 목록에서
 * 빼지 않고 **고를 수 없는 채로 사유와 함께** 남긴다. 빼 버리면 "왜 안 보이지"가 되고,
 * 남기면 "무엇을 보완해야 하는지"가 남는다.
 *
 * 후보 목록의 규격은 회의록 외부 참석자 검색과 같다(체크 원 + 이름·메타 두 줄 + 행 전체 클릭) —
 * 원장에서 골라 담는 화면이 앱 안에서 서로 다르게 생길 이유가 없다.
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
    if (picked.length === 0) return
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
        <div className="flex flex-wrap items-end gap-3">
          <Field label="원장" className="w-36">
            <Select value={master} onChange={(e) => switchMaster(e.target.value as MasterTable)}>
              <option value="startups">기업</option>
              <option value="networks">전문가</option>
            </Select>
          </Field>
          <Field label="역할" className="w-40">
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value)
                setPicked([])
              }}
            >
              {PARTICIPANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="검색" className="min-w-0 flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={master === 'startups' ? '기업명 · 대표자' : '전문가명 · 소속'}
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-radius-md border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : (candidates ?? []).length === 0 ? (
            <p className="py-10 text-center text-body-sm text-gray-500">검색 결과가 없습니다.</p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto">
              {(candidates ?? []).map((c) => {
                const blocked = mapBlockReason(c)
                const selectable = canMapCandidate(c) && !c.alreadyMapped
                const added = picked.includes(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!selectable}
                      onClick={() => toggle(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-fast',
                        !selectable && 'cursor-not-allowed bg-gray-50',
                        selectable && (added ? 'bg-brand/10 hover:bg-brand/15' : 'hover:bg-gray-50'),
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-full border',
                          added
                            ? 'border-brand bg-brand text-white'
                            : 'border-gray-300 text-transparent',
                        )}
                      >
                        <Check className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-gray-900">
                          <span className="font-medium">{c.name}</span>
                          {c.loginName && <span className="text-gray-500"> · {c.loginName}</span>}
                        </span>
                        <span className="block truncate text-caption text-gray-600">
                          {c.email ?? c.phone ?? ''}
                        </span>
                      </span>
                      {blocked && (
                        <span className="shrink-0 text-caption text-gray-500">{blocked}</span>
                      )}
                    </button>
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
