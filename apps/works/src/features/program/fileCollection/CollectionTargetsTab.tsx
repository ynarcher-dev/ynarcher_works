import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  EmptyValue,
  Input,
  Modal,
  Skeleton,
  cardText,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { type FileCollectionAssignmentDto, type FileCollectionDto } from '@ynarcher/master-data'
import { useMemo, useState } from 'react'
import {
  useAssignTargets,
  useRevokeAssignment,
} from '@/features/program/fileCollection/fileCollectionHooks'
import { useProgramParticipants, type ParticipantRow } from '@/features/program/participantHooks'
import { failureText } from '@/lib/failureText'

/** 명부에서 고를 수 있는 대상 한 줄. */
interface TargetCandidate {
  participantId: string
  userId: string
  name: string
  email: string | null
  /** 지금 배정되어 있는가(회수되지 않은 배정). */
  assigned: boolean
  /** 회수된 배정이 있으면 그 id — 다시 고르면 같은 행이 되살아나 이력이 이어진다. */
  revokedAssignmentId: string | null
}

/**
 * 받는 사람 탭 — 유효한 게스트를 골라 배정하고, 필요하면 회수한다.
 *
 * **고를 수 있는 대상은 그 사업 명부의 유효한 개별 게스트 계정뿐이다**(로그인이 열린 ACTIVE
 * 게스트). 서버 트리거가 같은 조건을 다시 보므로 화면의 필터는 편의이고 인가가 아니다.
 *
 * **같은 계정이 명부에 여러 줄로 있어도 한 번만 선다.** 배정의 유일성 축은 계정이므로
 * (`uq_fc_assignment_live_user`) 두 줄을 함께 고르면 둘째가 거절되거나 첫째를 덮는다 —
 * 목록에서 미리 하나로 접어 그 상황 자체를 만들지 않는다.
 */
export function CollectionTargetsTab({
  programId,
  moduleId,
  collection,
  assignments,
  loading,
  canWrite,
}: {
  programId: string
  moduleId: string
  collection: FileCollectionDto
  assignments: FileCollectionAssignmentDto[]
  loading: boolean
  canWrite: boolean
}) {
  const toast = useToast()
  const participantsQuery = useProgramParticipants(programId)
  const assign = useAssignTargets(moduleId)
  const revoke = useRevokeAssignment(moduleId)

  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [revoking, setRevoking] = useState<FileCollectionAssignmentDto | null>(null)

  const live = assignments.filter((a) => !a.revoked_at)
  const revoked = assignments.filter((a) => a.revoked_at)

  const candidates = useMemo<TargetCandidate[]>(() => {
    const liveUsers = new Set(
      assignments.filter((a) => !a.revoked_at).map((a) => a.guest_user_id),
    )
    const revokedByUser = new Map(
      assignments.filter((a) => a.revoked_at).map((a) => [a.guest_user_id, a.id]),
    )
    const seen = new Set<string>()
    const out: TargetCandidate[] = []
    for (const row of participantsQuery.data ?? []) {
      if (!isEligible(row)) continue
      const userId = row.user_id as string
      if (seen.has(userId)) continue
      seen.add(userId)
      out.push({
        participantId: row.id,
        userId,
        name: row.accountName || row.targetName,
        email: row.accountEmail ?? row.email,
        assigned: liveUsers.has(userId),
        revokedAssignmentId: revokedByUser.get(userId) ?? null,
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [participantsQuery.data, assignments])

  const keyword = search.trim().toLowerCase()
  const filtered = keyword
    ? candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(keyword) ||
          (c.email ?? '').toLowerCase().includes(keyword),
      )
    : candidates
  // 이미 배정된 줄은 고를 수 없으므로 선택 목록에서도 즉시 걸러 낸다(배정 직후의 잔류 방지).
  const pickable = filtered.filter((c) => !c.assigned)
  const pickedLive = picked.filter((id) => pickable.some((c) => c.participantId === id))

  const assignedColumns: Column<FileCollectionAssignmentDto>[] = [
    {
      key: 'name',
      header: '대상',
      type: 'name',
      primary: true,
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">
          {row.guest_name || <EmptyValue />}
        </span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (row) =>
        row.revoked_at ? <Badge tone="neutral">회수</Badge> : <Badge tone="success">배정</Badge>,
    },
    { key: 'assigned_at', header: '배정일', type: 'datetime', render: (row) => row.assigned_at.slice(0, 10) },
    {
      key: 'actions',
      header: '관리',
      widthRem: 9,
      className: 'w-36',
      render: (row) =>
        !canWrite ? null : row.revoked_at ? (
          <Button
            variant="secondary"
            disabled={assign.isPending || !row.participant_id}
            onClick={() =>
              assign.mutate(
                { collectionId: collection.id, participantIds: [row.participant_id as string] },
                {
                  onSuccess: () => toast.show('배정을 복구했습니다.', 'success'),
                  onError: (e) => toast.show(failureText(e, '복구에 실패했습니다.'), 'danger'),
                },
              )
            }
          >
            복구
          </Button>
        ) : (
          <Button variant="outline-danger" disabled={revoke.isPending} onClick={() => setRevoking(row)}>
            회수
          </Button>
        ),
    },
  ]

  const candidateColumns: Column<TargetCandidate>[] = [
    {
      key: 'name',
      header: '이름',
      type: 'name',
      primary: true,
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">{row.name}</span>
      ),
    },
    {
      key: 'email',
      header: '이메일',
      // 이메일은 `text`(하한 4rem)로 두면 좁은 폭에서 서너 글자씩 접힌다. 종류로 답하지 못하는
      // 폭이므로 고정폭 통로를 쓰되, 폭 계산에 잡히도록 `widthRem`과 클래스를 같은 값으로 둔다.
      widthRem: 16,
      className: 'w-64',
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">{row.email || <EmptyValue />}</span>
      ),
    },
    {
      key: 'state',
      header: '배정',
      type: 'badge',
      render: (row) =>
        row.assigned ? (
          <Badge tone="success">배정됨</Badge>
        ) : row.revokedAssignmentId ? (
          <Badge tone="neutral">회수됨</Badge>
        ) : (
          <EmptyValue />
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card
        title="배정한 대상"
        count={live.length}
        subtitle={revoked.length > 0 ? `회수 ${revoked.length}명 포함` : undefined}
        help="대상마다 독립한 제출 공간이 섭니다. 회수하면 더 올리지 못하지만 이미 받은 파일과 피드백은 남습니다."
      >
        <div className="min-w-0 space-y-3">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <DataTable
              columns={assignedColumns}
              rows={assignments}
              rowKey={(row) => row.id}
              emptyText="아직 배정한 대상이 없습니다. 아래 목록에서 골라 주세요."
              numbered={false}
              standardColumns={false}
              selectable={false}
            />
          )}
        </div>
      </Card>

      <Card
        title="명부에서 고르기"
        count={pickable.length}
        help="이 사업 명부에서 로그인이 열린 게스트만 섭니다. 같은 계정이 명부에 여러 줄 있어도 한 줄로 접어 보여 줍니다."
      >
        <div className="min-w-0 space-y-3">
          {!canWrite && <Banner tone="info">읽기 권한이라 대상을 배정할 수 없습니다.</Banner>}
          {participantsQuery.isError && (
            <Banner tone="danger">
              <div className="flex flex-wrap items-center gap-2">
                <span>{failureText(participantsQuery.error, '명부를 불러오지 못했습니다.')}</span>
                <Button variant="secondary" onClick={() => void participantsQuery.refetch()}>
                  다시 시도
                </Button>
              </div>
            </Banner>
          )}
          {/* 배정 버튼은 카드 머리글이 아니라 검색 옆에 선다 — 좁은 폭에서 제목·건수·도움말이
              버튼에 눌리지 않게 하고, 고르는 동작과 배정 동작을 한자리에 둔다. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름·이메일 검색"
              />
            </div>
            {canWrite && (
              <Button
                disabled={pickedLive.length === 0 || assign.isPending}
                onClick={() =>
                  assign.mutate(
                    {
                      collectionId: collection.id,
                      participantIds: pickable
                        .filter((c) => pickedLive.includes(c.participantId))
                        .map((c) => c.participantId),
                    },
                    {
                      onSuccess: (count) => {
                        setPicked([])
                        toast.show(`${count}명을 배정했습니다.`, 'success')
                      },
                      onError: (e) => toast.show(failureText(e, '배정에 실패했습니다.'), 'danger'),
                    },
                  )
                }
              >
                {assign.isPending ? '배정 중…' : `선택한 ${pickedLive.length}명 배정`}
              </Button>
            )}
          </div>
          {participantsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <DataTable
              columns={candidateColumns}
              rows={filtered}
              rowKey={(row) => row.participantId}
              emptyText="배정할 수 있는 게스트가 없습니다. 명부에서 로그인을 먼저 열어 주세요."
              numbered={false}
              standardColumns={false}
              selectable={canWrite}
              selectableRow={(row) => !row.assigned}
              selectedKeys={pickedLive}
              onSelectionChange={setPicked}
            />
          )}
          <p className={cardText.meta}>
            로그인이 열리지 않았거나 정지된 계정은 이 목록에 서지 않습니다. 명부와 로그인은 개요의
            게스트 설정에서 다룹니다.
          </p>
        </div>
      </Card>

      {revoking && (
        <Modal
          open
          onClose={() => setRevoking(null)}
          title="배정 회수"
          size="sm"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRevoking(null)} disabled={revoke.isPending}>
                취소
              </Button>
              <Button
                variant="danger"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate(revoking.id, {
                    onSuccess: () => {
                      toast.show('배정을 회수했습니다.', 'success')
                      setRevoking(null)
                    },
                    onError: (e) => toast.show(failureText(e, '회수에 실패했습니다.'), 'danger'),
                  })
                }
              >
                {revoke.isPending ? '회수 중…' : '회수'}
              </Button>
            </div>
          }
        >
          <p className={`${cardText.value} break-words [overflow-wrap:anywhere]`}>
            <strong>{revoking.guest_name ?? '이 대상'}</strong>의 배정을 회수합니다. 더는 올리거나
            제출할 수 없지만 <strong>이미 받은 파일과 피드백은 지워지지 않습니다</strong>. 나중에
            다시 배정하면 같은 기록이 이어집니다.
          </p>
        </Modal>
      )}
    </div>
  )
}

/**
 * 이 줄을 배정 대상으로 고를 수 있는가.
 *
 * 계정이 붙어 있고, 그 계정이 외부 게스트이며, 이 사업의 로그인이 열려 있어야(ACTIVE) 한다 —
 * 서버 트리거(`fc_assignment_guard`)가 보는 조건과 같은 셋이다.
 */
function isEligible(row: ParticipantRow): boolean {
  return Boolean(row.user_id) && row.isGuestAccount && row.login_status === 'ACTIVE'
}
