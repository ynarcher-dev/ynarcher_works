import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  ExpandToggleButton,
  FullscreenPanel,
  HierarchyLevelFields,
  HierarchyNameInput,
  HierarchyRowActions,
  HierarchyTable,
  Input,
  Skeleton,
  cn,
  hierarchyGridGroups,
  tableText,
  useToast,
} from '@ynarcher/ui'
import {
  questionNodes,
  type FileCollectionDto,
  type FileCollectionNodeDto,
} from '@ynarcher/master-data'
import { Maximize2, Minimize2, Paperclip, Plus } from 'lucide-react'
import { useEffect, useMemo, useReducer, useState } from 'react'
import {
  useNodeFileCounts,
  useSaveStructure,
} from '@/features/program/fileCollection/fileCollectionHooks'
import { NodeAttachmentModal } from '@/features/program/fileCollection/NodeAttachmentModal'
import {
  addSiblingBranch,
  appendBulkBranches,
  appendRootBranch,
  canMoveGridRow,
  completeBranch,
  isEmptyFolderRow,
  levelCountBlocker,
  moveGridRow,
  orphanNodeIds,
  removeGridRow,
  rowNodeType,
  setLevelCount,
  setLevelName,
  setRowGuide,
  setRowRequired,
  setRowTitle,
  structureIssues,
  type StructureDraft,
} from '@/features/program/fileCollection/structureDraft'
import {
  editorSavePayload,
  hasServerMoved,
  initialStructureEditor,
  isEditorDirty,
  isEditorReady,
  structureEditorReducer,
} from '@/features/program/fileCollection/structureEditor'
import { StructureBulkModal } from '@/features/program/fileCollection/StructureBulkModal'
import { failureText } from '@/lib/failureText'

/**
 * 문항 구성 탭 — 무엇을 받을지 **가로 계층 격자**로 짠다.
 *
 * 표의 생김새와 조작(단계 열·상위 셀 병합·형제 가지 추가·줄 이동)은 품의 예산작성과 같은
 * 공용 부품이다(`HierarchyTable`). 여기서 더하는 것은 파일받기만의 칸(필수·안내)과
 * **저장의 의미**뿐이다.
 *
 * 편집은 초안에서 일어나고 저장은 한 번의 RPC로 끝난다. 칸마다 서버를 부르면 한 번의 편집이
 * 수십 번의 쓰기로 갈라지고, 중간에서 끊기면 반쯤 저장된 트리가 남기 때문이다. 실패해도
 * **초안을 버리지 않는다** — 무엇을 쓰고 있었는지는 사람의 것이고, 저장이 원자적이라 다시
 * 눌러도 가지가 두 번 생기지 않는다. 상태 판단은 `structureEditor`가 소유한다.
 *
 * **이 화면에 공개 버튼은 없다**(2026-09-13 사용자 결정). 밖으로 나가는 시점은 모듈 공개
 * 여부가 답하므로 같은 판정을 두 곳에서 내리지 않는다. 구성은 언제든 고칠 수 있고, 서버가
 * 막는 것은 **이미 자료를 받은 문항의 삭제·이동·종류 변경**뿐이다(`fc_node_guard`).
 */
export function CollectionStructureTab({
  moduleId,
  collection,
  nodes,
  loading,
  canWrite,
  nodesTruncated = false,
  nodesFailed = false,
}: {
  moduleId: string
  collection: FileCollectionDto
  nodes: FileCollectionNodeDto[]
  loading: boolean
  canWrite: boolean
  /** 조회가 상한에 걸려 트리를 다 읽지 못한 상태. 그때는 저장을 막는다. */
  nodesTruncated?: boolean
  /** 트리 조회 자체가 실패한 상태. 없는 것과 못 읽은 것을 가른다. */
  nodesFailed?: boolean
}) {
  const toast = useToast()
  const save = useSaveStructure(moduleId)

  /** 표를 전체 화면으로 펼쳐 둔 상태(2:1 격자 안에서는 단계가 늘면 가로로 좁다). */
  const [expanded, setExpanded] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  /**
   * 자료 창을 연 문항. **원장의 id로 들고 있는다** — 초안의 줄 번호로 들면 그 사이에 줄을
   * 옮기거나 지웠을 때 창이 다른 문항의 자료를 보여 준다.
   */
  const [attachTarget, setAttachTarget] = useState<{ nodeId: string; title: string } | null>(null)

  /** 문항별 담당자 자료 건수 — 표의 클립이 이 값을 본다(0이면 표식이 서지 않는다). */
  const { data: fileCounts } = useNodeFileCounts(moduleId)

  const [state, dispatch] = useReducer(structureEditorReducer, undefined, initialStructureEditor)

  const snapshot = useMemo(
    () => ({
      nodes,
      levels: collection.level_names ?? [],
      collectionUpdatedAt: collection.updated_at ?? null,
    }),
    [nodes, collection.level_names, collection.updated_at],
  )

  // 조회가 끝난 뒤에만 값을 들인다. 로딩 중의 빈 배열을 들이면 "항목 없음"이 기준이 되고,
  // 사람이 그 위에 무언가 적는 순간 진짜 트리를 따라갈 수 없게 된다.
  useEffect(() => {
    if (loading || nodesFailed) return
    dispatch({ type: 'server', snapshot })
  }, [loading, nodesFailed, snapshot])

  const draft: StructureDraft = state.draft
  const ready = isEditorReady(state)
  const locked = !canWrite
  // 지금 값이 온전하지 않으면(조회 실패·다시 읽는 중) **읽던 것은 그대로 보여 주되 손은 대지
  // 못하게** 한다. 반쯤 아는 트리를 고쳐 저장하면 못 본 마디를 지우게 된다.
  const stale = nodesFailed || loading
  const editing = !locked && ready && !stale
  const busy = save.isPending

  const dirty = isEditorDirty(state)
  const serverMoved = hasServerMoved(state)

  const questions = questionNodes(nodes)
  const issues = structureIssues(draft)
  const orphans = orphanNodeIds(nodes)
  const groups = hierarchyGridGroups(draft.rows)
  const levelLabel = (level: number) => draft.levels[level] || `${level + 1}단계`

  const setDraft = (next: StructureDraft) => dispatch({ type: 'edit', draft: next })

  /** 그 문항에 붙어 있는 자료 건수. 아직 세지 못했으면 0으로 읽는다(클립이 서지 않는다). */
  const count = (nodeId: string | null) => (nodeId ? (fileCounts?.[nodeId] ?? 0) : 0)

  /** 지금 값이 온전하지 않아 어떤 쓰기도 열 수 없는 이유. 저장과 공개가 함께 읽는다. */
  const dataBlocked = !ready
    ? '구성을 아직 다 읽지 못했습니다.'
    : nodesFailed
      ? '구성을 읽지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.'
      : loading
        ? '구성을 다시 읽는 중입니다.'
        : nodesTruncated
          ? '항목이 너무 많아 전부 읽지 못했습니다. 다 읽지 못한 구성은 저장할 수 없습니다.'
          : orphans.length > 0
            ? '상위 폴더를 찾지 못한 항목이 있습니다. 새로 고친 뒤에도 남으면 관리자에게 알려 주세요.'
            : null

  const saveBlocked = dataBlocked ?? issues[0] ?? null

  const changeLevelCount = (next: number) => {
    const blocker = levelCountBlocker(draft, next)
    if (blocker) {
      toast.show(blocker, 'warning')
      return
    }
    setDraft(setLevelCount(draft, next))
  }

  const runSave = () => {
    const payload = editorSavePayload(state)
    if (!payload || saveBlocked) {
      if (saveBlocked) toast.show(saveBlocked, 'warning')
      return
    }
    save.mutate(
      { collectionId: collection.id, ...payload },
      {
        onSuccess: (result) => {
          // 기준은 **서버가 답한 트리**로 곧장 다시 세운다. 조회가 돌아오길 기다리면 그 사이
          // 응답이 저장 전 값일 수 있고, 그때 새 줄이 id 없이 남아 다음 저장에서 또 생긴다.
          dispatch({
            type: 'saved',
            snapshot: {
              nodes: result.nodes,
              levels: result.level_names ?? payload.levelNames,
              collectionUpdatedAt: result.updated_at,
            },
          })
          toast.show(
            `구성을 저장했습니다 (추가 ${result.created} · 수정 ${result.changed} · 삭제 ${result.deleted}).`,
            'success',
          )
        },
        // 실패하면 초안을 그대로 둔다 — 저장이 원자적이라 고친 그대로 다시 누르면 된다.
        onError: (e) => toast.show(failureText(e, '구성을 저장하지 못했습니다.'), 'danger'),
      },
    )
  }

  /**
   * 문항 표 — 카드 안과 확대보기 창이 **같은 하나**를 쓴다. 두 벌로 적으면 한쪽만
   * 고쳐진 표가 남고, 두 창이 같은 초안을 두고 다른 칸을 보여 준다.
   */
  const grid = (
    <HierarchyTable
      caption="파일받기 문항 구성"
      mode={editing ? 'edit' : 'view'}
      // 문항마다 번호를 단다 — 담당자와 받는 사람이 '3번 문항'으로 같은 줄을 가리킨다.
      numbered
      levels={draft.levels}
      groups={groups}
      columns={[
        // 체크상자 하나가 서는 칸이라 글자 폭만 준다. 남는 폭은 안내가 가져간다.
        { key: 'required', label: '필수', className: 'w-12 text-center' },
        // 안내 칸은 이름 칸에 자리를 내준다 — 여기서 다 못 읽으면 확대보기가 받는다.
        { key: 'guide', label: '문항 안내', className: 'w-56 min-w-[10rem]' },
        // 담당자가 건네는 양식이 붙는 칸. 머리글 네 글자가 접히지 않을 만큼만 준다.
        { key: 'files', label: '첨부파일', className: 'w-24 text-center' },
      ]}
      emptyContent={
        editing ? (
          <Button variant="ghost" density="table" onClick={() => setDraft(appendRootBranch(draft))}>
            <Plus size={14} />
            {levelLabel(0)} 추가
          </Button>
        ) : (
          '아직 항목이 없습니다.'
        )
      }
      renderHierarchyCell={(cell, level) => {
        const row = draft.rows[cell.nodeIndex]
        if (!row) return null
        if (!editing) {
          return (
            <div className="min-w-0">
              <p className="break-words [overflow-wrap:anywhere]">{row.title}</p>
            </div>
          )
        }
        // 분류 줄에는 안내를 받지 않는다 — 받는 사람이 읽는 설명은 문항의 '문항 안내'
        // 하나뿐이고(게스트 화면은 문항 안내만 세운다), 분류에 따로 적던 칸은 같은 일을
        // 두 자리에서 시키는 중복이었다. 옛 데이터의 분류 안내는 DB에 남지만 어디에도
        // 뜨지 않으므로 화면에서 다루지 않는다.
        // 병합된 칸(자식 여럿을 거느린 분류)은 **세로로도 그 칸만큼 큰다.** td가 h-px를
        // 들고 있어 이 줄에서 h-full을 이어 주면 입력 칸이 병합 높이를 그대로 채운다 —
        // 위쪽에만 붙어 있으면 어느 분류가 어디까지 걸치는지 선으로만 읽어야 한다.
        return (
          <div className="flex h-full min-w-0">
            <HierarchyNameInput
              levelLabel={levelLabel(level)}
              value={row.title}
              disabled={busy}
              maxLength={200}
              onAdd={() => setDraft(addSiblingBranch(draft, cell.nodeIndex))}
              onChange={(e) => setDraft(setRowTitle(draft, cell.nodeIndex, e.target.value))}
            />
          </div>
        )
      }}
      renderCells={(gridRow) => {
        const index = gridRow.leafIndex
        const row = draft.rows[index]!
        const isQuestion = rowNodeType(draft.rows, index) === 'QUESTION'
        const emptyFolder = isEmptyFolderRow(draft, index)
        return (
          <>
            <td className="whitespace-nowrap px-2 py-1 text-center">
              {!editing ? (
                isQuestion ? (
                  row.isRequired ? (
                    <Badge tone="warning">필수</Badge>
                  ) : (
                    <span className={tableText.meta}>선택</span>
                  )
                ) : (
                  <span className={tableText.meta}>빈 폴더</span>
                )
              ) : emptyFolder ? (
                // 옛 데이터의 빈 폴더는 문항이 아니다. 종류를 말없이 바꾸는 대신
                // 그 아래에 문항을 세우는 길을 준다(필요하면 열도 함께 늘어난다).
                <Button
                  variant="ghost"
                  density="table"
                  disabled={busy}
                  onClick={() => setDraft(completeBranch(draft, index))}
                >
                  <Plus size={14} />문항 넣기
                </Button>
              ) : (
                <Checkbox
                  density="table"
                  checked={row.isRequired}
                  disabled={busy}
                  aria-label={`${row.title || '이름 없는 문항'} 필수`}
                  onChange={(e) => setDraft(setRowRequired(draft, index, e.target.checked))}
                />
              )}
            </td>
            <td className="px-2 py-1">
              {!editing ? (
                <span className="break-words [overflow-wrap:anywhere]">{row.guide}</span>
              ) : (
                <Input
                  density="table"
                  value={row.guide}
                  disabled={busy}
                  maxLength={2000}
                  aria-label={`${row.title || '이름 없는 항목'} 안내`}
                  placeholder="받는 사람이 이 칸에서 읽을 설명"
                  onChange={(e) => setDraft(setRowGuide(draft, index, e.target.value))}
                />
              )}
            </td>
            {/*
              첨부파일 — "이 양식에 맞춰 내 주십시오"의 실물이 붙는 칸이다. 받는 쪽 화면에도
              같은 자리(문항)에서 열린다.

              **저장되지 않은 줄에는 붙일 수 없다.** 첨부는 마디 id에 매달리므로 id가 없는 줄에
              올리면 어디에 속하는지 답할 수 없다. 그때는 버튼 대신 이유를 적어 둔다 — 눌러 본
              뒤에 거절을 읽게 하지 않는다.

              읽기 권한만 있어도 칸은 선다(창이 목록·내려받기만 세운다) — 무엇이 붙어 있는지는
              고칠 수 없는 사람도 알아야 한다.
            */}
            <td className="whitespace-nowrap px-2 py-1 text-center">
              {!isQuestion ? null : row.nodeId ? (
                <Button
                  variant="ghost"
                  density="table"
                  disabled={busy}
                  aria-label={`${row.title || '이름 없는 문항'} 자료 ${count(row.nodeId)}건`}
                  onClick={() =>
                    setAttachTarget({
                      nodeId: row.nodeId!,
                      title: row.title || '이름 없는 문항',
                    })
                  }
                >
                  <Paperclip size={14} className={count(row.nodeId) > 0 ? '' : 'text-gray-400'} />
                  {count(row.nodeId) > 0 && <span className="tabular-nums">{count(row.nodeId)}</span>}
                </Button>
              ) : (
                <span className={tableText.meta} title="구성을 저장하면 자료를 붙일 수 있습니다.">
                  저장 후
                </span>
              )}
            </td>
          </>
        )
      }}
      renderActions={
        editing
          ? (_, index) => (
              <HierarchyRowActions
                canMoveUp={!busy && canMoveGridRow(draft, index, -1)}
                canMoveDown={!busy && canMoveGridRow(draft, index, 1)}
                canRemove={!busy}
                onMoveUp={() => setDraft(moveGridRow(draft, index, -1))}
                onMoveDown={() => setDraft(moveGridRow(draft, index, 1))}
                onRemove={() => setDraft(removeGridRow(draft, index))}
              />
            )
          : undefined
      }
    />
  )

  /**
   * 확대보기 토글 — 다른 워크스페이스(캐피탈 콜·모듈 보드)와 **같은 부품·같은 아이콘**이다.
   * 카드 안에서 볼 때와 전체 화면으로 펼쳤을 때 같은 버튼이 자리만 옮겨 선다.
   */
  const expandToggle = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="h-4 w-4" />}
      collapseIcon={<Minimize2 className="h-4 w-4" />}
    />
  )

  /**
   * 조작 셋은 **카드 머리 오른쪽에 한 줄로** 선다 — 양식으로 담기 · 확대보기 · 저장.
   * 되돌리기·공개하기는 두지 않는다(공개는 모듈 공개 여부가 답한다). 좁은 화면에서는
   * 카드 머리가 줄을 바꾸므로 여기서 따로 접지 않는다.
   */
  const actions = (
    <>
      {editing && (
        <Button variant="secondary" disabled={busy} onClick={() => setBulkOpen(true)}>
          대용량 등록
        </Button>
      )}
      {expandToggle}
      {editing && (
        <Button disabled={!dirty || busy || Boolean(saveBlocked)} onClick={runSave}>
          {busy ? '저장 중…' : '구성 저장'}
        </Button>
      )}
    </>
  )

  /**
   * 첨부파일 창 — 붙여 넣기 창과 같은 규칙으로 카드 안에서도 전체 화면에서도 같은 하나가 뜬다.
   * 편집 상태와 무관하게 선다: 자료를 보는 일은 구성을 고치는 일과 다른 일이고, 읽기 권한만
   * 있는 사람에게도 무엇이 붙어 있는지는 열려 있어야 한다.
   */
  const attachModal = attachTarget && (
    <NodeAttachmentModal
      open
      moduleId={moduleId}
      nodeId={attachTarget.nodeId}
      nodeTitle={attachTarget.title}
      canWrite={canWrite}
      onClose={() => setAttachTarget(null)}
    />
  )

  /** 붙여 넣기 창은 카드 안에서도 전체 화면에서도 같은 하나가 뜬다(모달이 전체 화면 위에 선다). */
  const bulkModal = editing && (
    <StructureBulkModal
      open={bulkOpen}
      onClose={() => setBulkOpen(false)}
      levels={draft.levels}
      onApply={(branches) => {
        setDraft(appendBulkBranches(draft, branches))
        toast.show(`${branches.length}줄을 초안에 담았습니다. 구성 저장을 눌러 주세요.`, 'success')
      }}
    />
  )

  const body = (
    <div className="min-w-0 space-y-3">
      {!canWrite && <Banner tone="info">읽기 권한이라 구성을 고칠 수 없습니다.</Banner>}
      {nodesFailed && (
        <Banner tone="danger">
          구성을 읽지 못했습니다. 새로 고친 뒤에도 같으면 관리자에게 알려 주세요 — 읽지 못한
          구성은 고치거나 저장할 수 없습니다.
        </Banner>
      )}
      {editing && serverMoved && (
        <Banner tone="warning">
          다른 사람이 이 구성을 고쳤습니다. 지금 저장하면 서버가 충돌로 거절합니다 — 고치던
          것을 옮겨 적은 뒤 <strong>서버 내용 불러오기</strong>를 눌러 주세요.
          <Button
            variant="ghost"
            density="table"
            className="ml-2"
            onClick={() => dispatch({ type: 'reload' })}
          >
            서버 내용 불러오기
          </Button>
        </Banner>
      )}
      {editing && nodesTruncated && (
        <Banner tone="danger">
          항목이 너무 많아 전부 읽지 못했습니다. 다 읽지 못한 구성은 저장할 수 없습니다.
        </Banner>
      )}
      {editing && orphans.length > 0 && (
        <Banner tone="danger">
          상위 폴더를 찾지 못한 항목이 {orphans.length}개 있어 맨 아래 최상위로 세웠습니다.
          저장은 막아 두었습니다 — 새로 고친 뒤에도 남으면 관리자에게 알려 주세요.
        </Banner>
      )}

      {editing && (
        <HierarchyLevelFields
          levels={draft.levels}
          disabled={busy}
          onCountChange={changeLevelCount}
          onNameChange={(level, name) => setDraft(setLevelName(draft, level, name))}
        />
      )}

      {loading || (!ready && !nodesFailed) ? <Skeleton className="h-40 w-full" /> : grid}

      {editing && issues.length > 0 && (
        <ul className={cn(tableText.body, 'text-danger')}>
          {issues.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {/* 표 아래에 설명 문단을 두지 않는다 — 칸 오른쪽 +와 줄 조작은 눌러 보면 알 수 있고,
          카드 머리의 도움말(ⓘ)이 같은 말을 이미 갖고 있다. */}
    </div>
  )

  // 확대보기: 카드 밖 전체 화면으로 펼친다. 초안은 이 컴포넌트가 들고 있어 확대·축소로
  // 사라지지 않는다(캐피탈 콜과 같은 규칙).
  if (expanded) {
    return (
      <>
        <FullscreenPanel
          open
          onClose={() => setExpanded(false)}
          title={<span className="text-title-sm font-medium text-gray-900">문항 구성</span>}
          actions={actions}
        >
          {body}
        </FullscreenPanel>
        {bulkModal}
        {attachModal}
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* '받을 자료 안내'(제목·안내) 카드는 두지 않는다 — 받는 사람에게 하는 말은 옆 칸의
          NOTICE가 하고, 문항마다 하는 말은 '문항 안내'가 한다. 세 자리에서 같은 일을 시키면
          어느 것이 실제로 보이는지 담당자가 알 수 없다(2026-09-13 사용자 결정). */}
      <Card
        title="문항 구성"
        count={questions.length}
        actions={actions}
        help="분류 단계를 정하면 각 단계가 열이 되고, 한 줄에 전체 경로와 문항을 함께 적습니다. 맨 오른쪽 칸이 파일을 받는 문항입니다. 칸 오른쪽 +는 그 단계에 형제 가지를 세우고, 줄을 지우면 자식을 모두 잃은 상위 분류가 함께 빠집니다. 무엇도 구성 저장 전에는 서버에 적히지 않으며, 게스트에게 보이는 시점은 모듈 공개 여부가 정합니다."
      >
        {body}
      </Card>
      {bulkModal}
      {attachModal}
    </div>
  )
}
