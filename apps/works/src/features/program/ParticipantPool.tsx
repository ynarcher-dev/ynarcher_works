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
  useSendPasswordReset,
  type ParticipantRow,
} from '@/features/program/participantHooks'
import { AccessWindowModal } from '@/features/program/AccessWindowModal'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 한 페이지에 세우는 행 수 — 페이징 훅과 표 페이저가 같은 값을 봐야 한다. */
const PAGE_SIZE = 10

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
 * 게스트 로그인은 세 사업 워크스페이스 모두 열려 있다(2026-09-03 — 명부·게스트 원장 통합).
 * 문을 여는 판정은 사업이 속한 원장의 담당자 표를 보는 app.is_program_manager()가 한다.
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
  const [windowTarget, setWindowTarget] = useState<ParticipantRow | null>(null)

  const { data, isLoading, isError } = useProgramParticipants(program.id)
  const open = useOpenGuestAccess(program.id)
  const close = useCloseGuestAccess(program.id)
  const resetPw = useSendPasswordReset()

  const rows = useMemo(() => data ?? [], [data])
  const isManager = useMemo(
    () => (program.managers ?? []).some((m) => m.user_id === myId),
    [program.managers, myId],
  )
  const canOpenDoor = isManager

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

  // 명부는 사업이 굴러갈수록 길어지는 목록이라 페이저를 단다. 카드 안이지만 미니 페이저가
  // 아니라 원장 목록과 같은 번호줄 페이저다 — 자리가 아니라 쓰임이 갈라서다. 이 표는 상세를
  // 받치는 보조 목록이 아니라 행을 골라 로그인을 여닫는 그 탭의 작업 대상이고(그래서 선택
  // 체크박스도 선다), 작업 대상인 표는 몇 페이지가 있고 지금 어디인지를 번호로 펴 보여야 한다.
  // 한 페이지뿐이어도 페이저는 그대로 선다(공용 `Pagination`의 기본 동작) — 명부가 짧다는
  // 이유로 페이저가 사라지면 행이 늘어난 순간 표 아래에서 줄 하나가 솟는다.
  // 선택(selected)은 페이지를 넘겨도 유지된다 — 일괄 처리는 화면에 보이는 행이 아니라 고른 행이
  // 대상이고, 페이지를 넘겼다는 이유로 방금 고른 건이 빠지면 그것이 더 놀라운 동작이다.
  const { pageItems, page, setPage } = usePaged(filtered, PAGE_SIZE)

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

  /**
   * 비밀번호 재설정 **안내 발송**. 담당자가 값을 되돌리는 경로는 없다 — 계정 하나가 여러
   * 사업을 열게 되어, 값을 쥔 사람은 그 게스트의 다른 팀 사업까지 들어갈 수 있다.
   * 대상은 계정이라 명부 행이 아니라 계정 id를 보낸다(같은 계정을 두 번 보내지 않는다).
   */
  const runResetPassword = () => {
    const accountIds = [
      ...new Set(
        rows.filter((r) => selected.includes(r.id) && r.accountId).map((r) => r.accountId!),
      ),
    ]
    if (accountIds.length === 0) {
      toast.show('계정이 있는 대상을 선택하세요.', 'warning')
      return
    }
    void Promise.allSettled(accountIds.map((id) => resetPw.mutateAsync(id))).then((results) => {
      setSelected([])
      const sent = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - sent
      if (failed > 0) {
        toast.show(`재설정 안내 ${sent}건 발송 · ${failed}건 실패`, 'warning')
      } else {
        toast.show(`재설정 안내 ${sent}건을 본인 연락처로 보냈습니다.`, 'success')
      }
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
        subtitle={`사업 코드 ${program.code || '미발급'}`}
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
                    {/* 버튼은 하나다 — 계정이 있으면 이 사업을 그 계정에 붙이고, 없으면
                        만들어 붙인다. 담당자가 신규·기존을 구분할 필요가 없다. */}
                    <Button
                      variant="secondary"
                      disabled={selected.length === 0 || open.isPending}
                      onClick={runOpen}
                    >
                      연결
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={selected.length !== 1}
                      onClick={() =>
                        setWindowTarget(rows.find((r) => r.id === selected[0]) ?? null)
                      }
                    >
                      접근 기간
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={selected.length === 0 || resetPw.isPending}
                      onClick={runResetPassword}
                    >
                      재설정 안내 보내기
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
            // 좌측 건수는 '필터 반영 / 전체'로 읽힌다 — 검색·역할로 좁힌 뒤에도 명부 총량을 잃지 않는다.
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: filtered.length,
              totalAll: rows.length,
              onChange: setPage,
            }}
          />
        </div>
      </Card>

      <ParticipantAddModal open={addOpen} onClose={() => setAddOpen(false)} programId={program.id} />
      <AccessWindowModal
        programId={program.id}
        row={windowTarget}
        onClose={() => setWindowTarget(null)}
      />
    </>
  )
}
