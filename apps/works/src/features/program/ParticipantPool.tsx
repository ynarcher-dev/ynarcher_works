import { Button, DataTable, Spinner, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { participantContentKey } from '@/features/admin/sensitiveContents'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { PARTICIPANT_ROLES } from '@/features/program/config'
import type { Program } from '@/features/program/hooks'
import { ParticipantAddModal } from '@/features/program/ParticipantAddModal'
import { participantColumns } from '@/features/program/participantColumns'
import {
  useCloseGuestAccess,
  useOpenGuestAccess,
  useProgramParticipants,
} from '@/features/program/participantHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 상세 개요 좌측 '연동 DB' 탭.
 *
 * 명부에 올리는 일과 로그인을 여는 일이 갈려 있다 — 참여 후보를 쌓아 두더라도 확정 전에는
 * 문이 열리지 않는다. 문을 여닫을 수 있는 사람은 그 사업의 담당자(PM·MEMBER)뿐이며,
 * 화면의 숨김은 편의일 뿐 실제 강제는 서버(RPC)가 한다.
 *
 * 게스트 로그인 개방은 AC만 열려 있다(ProgramWorkspaceConfig.guestAccess).
 * M&A·PROJECT는 같은 화면을 공유하므로 명부까지만 동작하고 개방 영역은 안내로 대체한다.
 */
export function ParticipantPool({ program }: { program: Program }) {
  const config = useProgramWorkspace()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const masked = useMaskPolicy(participantContentKey(config.key))

  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading } = useProgramParticipants(program.id)
  const open = useOpenGuestAccess(program.id)
  const close = useCloseGuestAccess(program.id)

  const rows = data ?? []
  const isManager = useMemo(
    () => (program.managers ?? []).some((m) => m.user_id === myId),
    [program.managers, myId],
  )
  const canOpenDoor = config.guestAccess && isManager
  const filtered = roleFilter ? rows.filter((r) => r.role === roleFilter) : rows

  const columns = useMemo(
    () => participantColumns(masked, program.status),
    [masked, program.status],
  )

  const runOpen = () => {
    open.mutate(selected, {
      onSuccess: (res) => {
        setSelected([])
        if (res.failed > 0) {
          toast.show(
            `${res.opened}건의 로그인을 열었습니다. 안내 발송 ${res.failed}건 실패 — 사업 코드를 직접 안내하세요.`,
            'warning',
          )
        } else {
          toast.show(`${res.opened}건의 로그인을 열고 안내를 보냈습니다.`, 'success')
        }
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '로그인 개방에 실패했습니다.', 'danger'),
    })
  }

  const runClose = () => {
    close.mutate(selected, {
      onSuccess: (n) => {
        setSelected([])
        toast.show(`${n}건의 로그인을 닫았습니다. 접속 중이던 세션도 끊겼습니다.`, 'success')
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '로그인 차단에 실패했습니다.', 'danger'),
    })
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* 사업 코드: 참가자 전원이 같은 코드로 들어오므로 현장 안내의 출발점이다. */}
      {config.guestAccess && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2">
          <span className="text-caption text-gray-600">
            사업 코드{' '}
            <span className="font-mono text-body font-medium tracking-wider text-gray-900">
              {program.code || '미발급'}
            </span>
          </span>
          <span className="text-caption text-gray-500">
            참가자는 이 코드와 성명·연락처로 GUEST 포털에 로그인합니다.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {PARTICIPANT_ROLES.map((role) => {
          const count = rows.filter((r) => r.role === role).length
          const active = roleFilter === role
          return (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(active ? null : role)}
              className={`rounded-radius-md border px-3 py-1.5 text-caption transition-colors ${
                active ? 'border-brand bg-brand/5 text-brand' : 'border-gray-300 bg-white text-gray-600'
              }`}
            >
              {role} <span className="font-medium tabular-nums text-gray-900">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAddOpen(true)}>
          + 원장에서 추가
        </Button>
        {canOpenDoor && (
          <>
            <Button
              variant="secondary"
              disabled={selected.length === 0 || open.isPending}
              onClick={runOpen}
            >
              로그인 허용 ({selected.length})
            </Button>
            <Button
              variant="ghost"
              disabled={selected.length === 0 || close.isPending}
              onClick={runClose}
            >
              차단
            </Button>
          </>
        )}
        {config.guestAccess && !isManager && (
          <span className="text-caption text-gray-600">
            로그인 개방·차단은 이 사업의 담당자(PM·MEMBER)만 할 수 있습니다.
          </span>
        )}
        {!config.guestAccess && (
          <span className="text-caption text-gray-600">
            게스트 로그인 개방은 AC 사업에서 지원합니다(추후 지원).
          </span>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        selectable={canOpenDoor}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        emptyText="명부가 비어 있습니다. [원장에서 추가]로 NETWORKS 기업·전문가를 올리세요."
      />

      <ParticipantAddModal open={addOpen} onClose={() => setAddOpen(false)} programId={program.id} />
    </div>
  )
}
