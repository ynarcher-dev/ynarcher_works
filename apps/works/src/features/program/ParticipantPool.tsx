import {
  Button,
  Card,
  DataTable,
  ListToolbar,
  MultiSelectFilter,
  Spinner,
  usePaged,
  useToast,
} from '@ynarcher/ui'
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
  useResetGuestPassword,
  type ParticipantRow,
} from '@/features/program/participantHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 검색이 걸리는 축 — 대상명과 로그인 계정(성명·연락처). 명부에서 사람을 찾는 길은 이 넷뿐이다. */
function matches(row: ParticipantRow, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return [row.targetName, row.loginName, row.email, row.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(kw))
}

/**
 * 사업 상세 개요 좌측 '참가자/전문가' 탭.
 *
 * 명부에 올리는 일과 로그인을 여는 일이 갈려 있다 — 참여 후보를 쌓아 두더라도 확정 전에는
 * 문이 열리지 않는다. 문을 여닫을 수 있는 사람은 그 사업의 담당자(PM·MEMBER)뿐이며,
 * 화면의 숨김은 편의일 뿐 실제 강제는 서버(RPC)가 한다.
 *
 * 게스트 로그인 개방은 AC만 열려 있다(ProgramWorkspaceConfig.guestAccess).
 * M&A·PROJECT는 같은 화면을 공유하므로 명부까지만 동작하고 개방 영역은 서지 않는다.
 *
 * 셸·툴바·표는 전부 공용 규격이다 — 카드는 형제 탭(프로그램)과 같은 `Card`, 검색·필터·액션
 * 한 줄은 원장 목록과 같은 `ListToolbar`, 역할은 손수 만든 칩 나열이 아니라 목록 필터와 같은
 * `MultiSelectFilter`이며 건수는 그 선택지가 함께 답한다. 총 건수는 카드 제목 옆 한자리다.
 */
export function ParticipantPool({ program }: { program: Program }) {
  const config = useProgramWorkspace()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const masked = useMaskPolicy(participantContentKey(config.key))

  const [keyword, setKeyword] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading, isError } = useProgramParticipants(program.id)
  const open = useOpenGuestAccess(program.id)
  const close = useCloseGuestAccess(program.id)
  const resetPw = useResetGuestPassword(program.id)

  const rows = useMemo(() => data ?? [], [data])
  const isManager = useMemo(
    () => (program.managers ?? []).some((m) => m.user_id === myId),
    [program.managers, myId],
  )
  const canOpenDoor = config.guestAccess && isManager

  const roleOptions = useMemo(
    () =>
      PARTICIPANT_ROLES.map((role) => ({
        value: role,
        label: `${role} ${rows.filter((r) => r.role === role).length}`,
      })),
    [rows],
  )

  const filtered = useMemo(
    () => rows.filter((r) => (roles.length === 0 || roles.includes(r.role)) && matches(r, keyword)),
    [rows, roles, keyword],
  )

  // 명부는 사업이 굴러갈수록 길어지는 목록이라 페이저를 단다. 카드 안이므로 번호줄이 아니라
  // 미니 페이저(compact)이며, 이는 형제 탭의 관련 목록이 쓰는 것과 같은 규격이다.
  // 선택(selected)은 페이지를 넘겨도 유지된다 — 일괄 처리는 화면에 보이는 행이 아니라 고른 행이
  // 대상이고, 페이지를 넘겼다는 이유로 방금 고른 건이 빠지면 그것이 더 놀라운 동작이다.
  const { pageItems, page, setPage } = usePaged(filtered, 10)

  const columns = useMemo(
    () => participantColumns(masked, program.status),
    [masked, program.status],
  )

  const runOpen = () => {
    open.mutate(selected, {
      onSuccess: (res) => {
        setSelected([])
        if (res.failed > 0) {
          toast.show(`로그인 ${res.opened}건 개방 · 안내 발송 ${res.failed}건 실패`, 'warning')
        } else {
          toast.show(`로그인 ${res.opened}건을 열고 안내를 보냈습니다.`, 'success')
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
        toast.show(`로그인 ${n}건을 닫았습니다.`, 'success')
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '로그인 차단에 실패했습니다.', 'danger'),
    })
  }

  const runResetPassword = () => {
    resetPw.mutate(selected, {
      onSuccess: (n) => {
        setSelected([])
        toast.show(`비밀번호 ${n}건을 초기화했습니다.`, 'success')
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '초기화에 실패했습니다.', 'danger'),
    })
  }

  if (isLoading) {
    return (
      <Card title="참가자/전문가">
        <Spinner />
      </Card>
    )
  }

  return (
    <>
      <Card
        title="참가자/전문가"
        count={rows.length}
        subtitle={config.guestAccess ? `사업 코드 ${program.code || '미발급'}` : undefined}
      >
        <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            searchPlaceholder="대상 · 로그인 계정 검색"
            filters={
              <MultiSelectFilter
                label="역할"
                options={roleOptions}
                selected={roles}
                onChange={setRoles}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                {canOpenDoor && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={selected.length === 0 || open.isPending}
                      onClick={runOpen}
                    >
                      로그인 허용
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={selected.length === 0 || resetPw.isPending}
                      onClick={runResetPassword}
                    >
                      비밀번호 초기화
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
                <Button onClick={() => setAddOpen(true)}>원장에서 추가</Button>
              </div>
            }
          />

          <DataTable
            columns={columns}
            rows={pageItems}
            rowKey={(r) => r.id}
            selectable={canOpenDoor}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            // 조회 실패와 빈 명부는 다른 사실이다 — 한 문장으로 뭉뚱그리면 원인을 짚을 수 없다.
            emptyText={isError ? '명부를 불러오지 못했습니다.' : '명부가 비어 있습니다.'}
            pagination={{ page, pageSize: 10, total: filtered.length, onChange: setPage, compact: true }}
          />
        </div>
      </Card>

      <ParticipantAddModal open={addOpen} onClose={() => setAddOpen(false)} programId={program.id} />
    </>
  )
}
