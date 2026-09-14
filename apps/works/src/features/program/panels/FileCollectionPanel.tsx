import { Banner, Button, Card, Spinner, Tabs, useToast } from '@ynarcher/ui'
import {
  collectionSummary,
  type FileCollectionAssignmentDto,
  type FileCollectionNodeDto,
  type FileCollectionResponseDto,
} from '@ynarcher/master-data'
import { useMemo, useState } from 'react'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { CollectionMonitorTab } from '@/features/program/fileCollection/CollectionMonitorTab'
import { CollectionStructureTab } from '@/features/program/fileCollection/CollectionStructureTab'
import {
  useCollectionAssignments,
  useCollectionNodes,
  useCollectionResponses,
  useFileCollection,
  useUpsertCollection,
} from '@/features/program/fileCollection/fileCollectionHooks'
import { useProgramWorkspace } from '@/features/program/workspace'
import { failureText } from '@/lib/failureText'

type PanelTab = 'structure' | 'monitor'

/** 빈 목록의 고정 신원. 조회가 아직 안 왔을 때 렌더마다 새 배열을 만들지 않기 위한 것이다. */
const EMPTY_NODES: FileCollectionNodeDto[] = []
const EMPTY_ASSIGNMENTS: FileCollectionAssignmentDto[] = []
const EMPTY_RESPONSES: FileCollectionResponseDto[] = []

/**
 * 파일받기 모듈(전체 화면, WORKS).
 *
 * 이 화면이 하는 일은 둘이고 그 둘이 탭이다 — **무엇을 받을지 짜고**(문항 구성), **들어온
 * 것을 본다**(제출 현황). 한 화면에 세로로 쌓지 않는 이유는 시기마다 주인이 바뀌기
 * 때문이다: 처음에는 구성이 일이고 자료가 들어오기 시작하면 현황이 일인데, 쌓아 두면
 * 나중에도 구성 카드가 화면 위쪽을 계속 차지한다.
 *
 * **받는 사람을 고르는 탭은 없다**(2026-09-14 사용자 확정). 대상은 그 사업 명부에서 로그인이
 * 열린 게스트 계정 전부이며, 서버가 명부를 보고 배정을 자동으로 세운다
 * (`app.fc_sync_targets`). 누구를 넣고 뺄지는 개요의 게스트 설정(명부)에서만 다룬다.
 *
 * 폭은 다른 게스트 모듈과 같다 — 우측 NOTICE의 2:1 격자 안에 선다(2026-09-13 사용자 결정,
 * `ProgramDetailPage`가 감싼다). 좁아진 만큼 문항·명단·현황 표는 자기 칸 안에서 가로로
 * 스크롤한다.
 *
 * 편집·배포·검토는 워크스페이스 쓰기 권한자만 할 수 있다. **화면에서 감추는 것은 인가가
 * 아니며**(서버가 RPC 첫머리에서 다시 판정한다) 여기서 끄는 것은 누를 수 없는 버튼을 보여
 * 주지 않기 위한 것이다.
 */
export function FileCollectionPanel({ moduleId }: { moduleId: string }) {
  const config = useProgramWorkspace()
  const authUser = useAuthStore((s) => s.user)
  const canWrite = hasWorkspaceWrite(authUser, config.key)
  const toast = useToast()

  const collectionQuery = useFileCollection(moduleId)
  const collection = collectionQuery.data ?? null

  const nodesQuery = useCollectionNodes(moduleId, collection?.id)
  const assignmentsQuery = useCollectionAssignments(moduleId, collection?.id)
  // 응답은 배정이 서면 언제든 들어올 수 있다 — 공개 판정이 모듈로 옮겨간 뒤로 이 화면이
  // 따로 가릴 시점이 없다(2026-09-13).
  const responsesQuery = useCollectionResponses(moduleId, Boolean(collection))

  const upsert = useUpsertCollection(moduleId)

  // 비었을 때도 **같은 배열**을 돌려준다 — `?? []`는 렌더마다 새 배열이라 아래 useMemo가
  // 매번 다시 셈하고, 그 결과가 자식의 props로 내려가면 표 전체가 까닭 없이 다시 그려진다.
  const nodes = nodesQuery.data?.rows ?? EMPTY_NODES
  const assignments = assignmentsQuery.data?.rows ?? EMPTY_ASSIGNMENTS
  const responses = responsesQuery.data?.rows ?? EMPTY_RESPONSES

  /**
   * 고른 탭은 **모듈과 함께** 기억한다 — 모듈을 갈아타면 앞 모듈에서 보던 탭이 남지 않고,
   * 새 모듈의 상태에 맞는 첫 화면(들어온 자료가 있으면 현황, 없으면 구성)에서 시작한다.
   */
  const [picked, setPicked] = useState<{ moduleId: string; tab: PanelTab } | null>(null)
  const tab: PanelTab =
    picked?.moduleId === moduleId ? picked.tab : responses.length > 0 ? 'monitor' : 'structure'

  const summary = useMemo(
    () => collectionSummary(nodes, assignments, responses),
    [nodes, assignments, responses],
  )

  if (collectionQuery.isLoading) return <Spinner />

  if (collectionQuery.isError) {
    return (
      <Banner tone="danger">
        <div className="flex flex-wrap items-center gap-2">
          <span>{failureText(collectionQuery.error, '파일받기를 불러오지 못했습니다.')}</span>
          <Button variant="secondary" onClick={() => void collectionQuery.refetch()}>
            다시 시도
          </Button>
        </div>
      </Banner>
    )
  }

  // 아직 원장이 없는 모듈 — 첫 진입의 준비 안내. 여기서 세우는 것은 머리 행 하나이며,
  // 모듈이 '준비' 상태여도 초안은 짤 수 있다(서버 계약이 그렇다).
  if (!collection) {
    return (
      <Card
        title="파일받기"
        help="받을 자료의 목록(폴더·문항)만 짜면 됩니다. 받는 사람은 이 사업 명부에서 로그인이 열린 게스트 전원이며, 게스트에게 보이는 시점은 모듈 공개 여부가 정합니다."
      >
        <div className="space-y-3">
          <p className="text-body text-gray-700">
            아직 받을 자료를 정하지 않았습니다. 설정을 시작하면 폴더와 문항을 자유롭게 짤 수
            있고, 모듈을 공개하기 전에는 게스트에게 아무것도 보이지 않습니다.
          </p>
          {canWrite ? (
            <Button
              onClick={() =>
                upsert.mutate(
                  { title: '' },
                  {
                    onError: (e) =>
                      toast.show(failureText(e, '파일받기 설정을 시작하지 못했습니다.'), 'danger'),
                  },
                )
              }
              disabled={upsert.isPending}
            >
              {upsert.isPending ? '시작 중…' : '파일받기 설정 시작'}
            </Button>
          ) : (
            <Banner tone="info">
              이 사업을 편집할 권한이 없어 설정을 시작할 수 없습니다. 담당자에게 요청해 주세요.
            </Banner>
          )}
        </div>
      </Card>
    )
  }

  const listError = nodesQuery.isError || assignmentsQuery.isError || responsesQuery.isError
  const truncated = Boolean(
    nodesQuery.data?.truncated ||
      assignmentsQuery.data?.truncated ||
      responsesQuery.data?.truncated,
  )

  return (
    <div className="space-y-4">
      {/* 조회 실패를 빈 성공으로 보여주지 않는다 — 목록이 비어 있는 것과 못 읽은 것은 다르다. */}
      {listError && (
        <Banner tone="danger">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {failureText(
                nodesQuery.error ?? assignmentsQuery.error ?? responsesQuery.error,
                '파일받기 내용을 일부 불러오지 못했습니다.',
              )}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void nodesQuery.refetch()
                void assignmentsQuery.refetch()
                void responsesQuery.refetch()
              }}
            >
              다시 시도
            </Button>
          </div>
        </Banner>
      )}
      {/* 상한에 걸려 못 읽은 구간이 있으면 숫자를 믿지 말라고 적는다(조용한 절단 금지). */}
      {truncated && (
        <Banner tone="warning">
          자료가 많아 일부만 불러왔습니다. 아래 집계는 불완전할 수 있으니 문항이나 대상을 줄인 뒤
          다시 확인해 주세요.
        </Banner>
      )}

      <Tabs
        density="page"
        value={tab}
        onChange={(key) => setPicked({ moduleId, tab: key as PanelTab })}
        items={[
          { key: 'structure', label: '문항 구성', count: summary.questions },
          { key: 'monitor', label: '제출 현황', count: summary.pendingReview },
        ]}
      />

      {tab === 'structure' && (
        <CollectionStructureTab
          moduleId={moduleId}
          collection={collection}
          nodes={nodes}
          loading={nodesQuery.isLoading}
          canWrite={canWrite}
          nodesTruncated={Boolean(nodesQuery.data?.truncated)}
          nodesFailed={nodesQuery.isError}
        />
      )}
      {tab === 'monitor' && (
        <CollectionMonitorTab
          moduleId={moduleId}
          nodes={nodes}
          assignments={assignments}
          responses={responses}
          loading={responsesQuery.isLoading}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
