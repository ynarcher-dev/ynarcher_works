import { useEffect, useRef, useState } from 'react'
import { Banner, IconButton, SlideOver, useToast } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { nodePath, type FileCollectionNodeDto, type FileCollectionResponseDto } from '@ynarcher/master-data'
import { GuestButton } from '@/components/GuestButton'
import {
  loadErrorMessage,
  useAddComment,
  useCommitPendingFile,
  useDownloadCollectionFile,
  useRemoveFile,
  useResponseComments,
  useResponseFiles,
  useScopeGuard,
  useSubmitResponse,
  useUploadFiles,
  type FileCollectionScope,
} from '@/features/fileCollectionHooks'
import { canRemoveFile, questionControls, type WriteState } from '@/features/fileCollectionView'
import { QuestionPanel, type UploadNote } from '@/pages/modules/fileCollection/QuestionPanel'

/**
 * 고른 문항 하나를 여는 **우측 패널**(2026-09-14 사용자 지정 — 가운데 모달에서 옮겼다).
 * WORKS의 전역 우측 패널(`RightPanelHost`)과 같은 뼈대를 쓴다 — 머리[제목 + 닫기] 한 줄과
 * 스크롤하는 본문, 그리고 뒤 화면을 막지 않는 `SlideOver`.
 *
 * 막지 않기 때문에 **문항 목록이 패널 옆에서 계속 살아 있다** — 한 문항을 내고 바로 옆 줄을
 * 눌러 다음 문항으로 넘어갈 수 있다(모달이던 시절에는 딤을 닫고 다시 골라야 했다). 대신
 * 작업이 도는 동안에는 닫기도 다른 문항 고르기도 막는다(`busy`) — 파일을 올리는 중에 문항이
 * 갈리면 확정이 끝나지 않은 파일이 화면에서 사라진 채로 남는다. 그 판정은 목록과 패널을
 * 함께 쥔 `FileCollectionModule`이 소유하고, 여기서는 받아 쓰기만 한다.
 *
 * 껍데기와 알맹이를 가른 이유: 알맹이는 `node.id`를 열쇠로 달고 서므로 문항이 갈리면
 * 통째로 다시 선다 — 앞 문항에 쓰던 메모나 업로드 결과 줄이 다음 문항으로 넘어가지 않는다.
 */
export function QuestionDetailPanel({
  scope,
  nodes,
  node,
  response,
  write,
  busy,
  onBusyChange,
  onClose,
}: {
  scope: FileCollectionScope
  nodes: readonly FileCollectionNodeDto[]
  /** 지금 열린 문항. 없으면 패널은 닫힌 채로 선다(닫히는 동안 마지막 내용을 유지한다). */
  node: FileCollectionNodeDto | null
  response: FileCollectionResponseDto | null
  write: WriteState
  /** 이 패널에서 작업이 도는 중인가. 켜져 있으면 닫기가 잠긴다. */
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onClose: () => void
}) {
  return (
    <SlideOver open={node != null} onClose={onClose} label="자료 제출">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-title-sm font-medium text-gray-900">자료 제출</h2>
        {/* 닫기는 GUEST 터치 하한(48px)에 맞춘다 — GuestButton이 라벨 버튼에 하는 것과 같다. */}
        <IconButton
          variant="ghost"
          label="패널 닫기"
          className="min-h-12 min-w-12"
          disabled={busy}
          onClick={onClose}
          icon={<X aria-hidden className="size-5" strokeWidth={1.8} />}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {node && (
          <QuestionWork
            key={node.id}
            scope={scope}
            nodes={nodes}
            node={node}
            response={response}
            write={write}
            onBusyChange={onBusyChange}
          />
        )}
      </div>
    </SlideOver>
  )
}

/** 문항 하나의 조회·저장. 보이는 것은 `QuestionPanel`이 맡는다 — 그래야 화면 규칙(무엇이 잠기고
 *  무엇이 열리는가)을 통신 없이 시험할 수 있다. */
function QuestionWork({
  scope,
  nodes,
  node,
  response,
  write,
  onBusyChange,
}: {
  scope: FileCollectionScope
  nodes: readonly FileCollectionNodeDto[]
  node: FileCollectionNodeDto
  response: FileCollectionResponseDto | null
  write: WriteState
  onBusyChange: (busy: boolean) => void
}) {
  const toast = useToast()
  const files = useResponseFiles(scope, response?.id)
  const comments = useResponseComments(scope, response?.id)

  const upload = useUploadFiles(scope)
  const commit = useCommitPendingFile(scope)
  const remove = useRemoveFile(scope)
  const submit = useSubmitResponse(scope)
  const comment = useAddComment(scope)
  const download = useDownloadCollectionFile(scope)

  const [notes, setNotes] = useState<UploadNote[]>([])
  const [draft, setDraft] = useState('')
  const [busyFileId, setBusyFileId] = useState<string | null>(null)

  /**
   * 이 창에서 도는 작업은 **한 번에 하나**다. `isPending` 여러 개를 각자 보면 그 사이가
   * 비는 순간(요청이 나가기 직전·끝난 직후)에 다른 버튼이 열리고, 올리는 중에 제출이 나가
   * 아직 확정되지 않은 파일을 뺀 채로 문항이 닫힌다. 그래서 잠금은 이 깃발 하나가 소유한다.
   */
  const running = useRef(false)
  const [working, setWorking] = useState(false)

  /**
   * 작업 중임을 목록·패널 머리에 알린다. 패널은 뒤 화면을 막지 않으므로, 막는 일은 딤이 아니라
   * 이 깃발이 한다. 정리 함수에서 반드시 내린다 — 갇힌 채로 사라지면 목록이 영영 안 눌린다.
   */
  useEffect(() => {
    onBusyChange(working)
    return () => onBusyChange(false)
  }, [working, onBusyChange])

  /**
   * 창을 떠난 뒤 늦게 돌아온 결과가 **새 맥락의 화면에 말을 걸지 않게** 하는 문지기.
   * 창이 닫혔거나 계정·사업·모듈이 갈렸으면 그 뒤의 알림도 화면 갱신도 하지 않는다 —
   * 서버가 이미 받은 일은 그대로 남고, 올라가다 만 줄은 돌아왔을 때 그 자리에서 다시 보인다.
   */
  const guard = useScopeGuard(scope)
  const notify = (message: string, tone: 'success' | 'danger') => {
    if (guard.isActive()) toast.show(message, tone)
  }

  /** 작업 하나를 붙잡고 돌린다. 이미 도는 것이 있으면 **시작하지 않는다**(큐에 쌓지도 않는다). */
  const run = (fileId: string | null, task: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setWorking(true)
    setBusyFileId(fileId)
    void (async () => {
      try {
        await task()
      } finally {
        running.current = false
        // 이미 떠난 창에는 상태를 되돌릴 자리가 없다(React가 무시하지만 뜻을 분명히 적는다).
        if (guard.isActive()) {
          setWorking(false)
          setBusyFileId(null)
        }
      }
    })()
  }

  const controls = questionControls({ response, files: files.data ?? [], write })
  const busy = {
    any: working,
    upload: upload.isPending,
    submit: submit.isPending,
    comment: comment.isPending,
    fileId: busyFileId,
  }
  const loadError = files.isError || comments.isError

  const onPickFiles = (picked: File[]) => {
    if (!response) return
    run(null, async () => {
      setNotes([])
      try {
        const results = await upload.mutateAsync({ responseId: response.id, files: picked })
        // 맥락이 갈린 뒤에는 결과 목록도 남기지 않는다 — 새 화면에 앞 사람의 파일 이름이 선다.
        if (!guard.isActive()) return
        setNotes(
          results.map((r) => ({
            fileName: r.fileName,
            ok: r.ok,
            message: r.ok ? undefined : r.message,
          })),
        )
        const failed = results.filter((r) => !r.ok).length
        if (failed === 0) {
          notify(`파일 ${results.length}개를 올렸습니다. 아직 제출되지 않았습니다.`, 'success')
        } else {
          // 일부만 올라간 것을 성공으로 뭉뚱그리지 않는다 — 실패한 파일은 목록에 그대로 남는다.
          notify(`${results.length}개 중 ${failed}개를 올리지 못했습니다.`, 'danger')
        }
      } catch {
        notify('파일을 올리지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
      }
    })
  }

  const onDownload = (fileId: string) =>
    run(fileId, async () => {
      try {
        const result = await download.mutateAsync(fileId)
        // 맥락이 갈려 내려받지 않은 경우는 실패가 아니다 — 알리지 않고 그대로 둔다.
        if (!result.delivered) return
      } catch {
        notify('파일을 내려받지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
      }
    })

  const onRemove = (fileId: string) =>
    run(fileId, async () => {
      try {
        await remove.mutateAsync(fileId)
        notify('파일을 내렸습니다.', 'success')
      } catch (error) {
        notify(messageOf(error, '파일을 내리지 못했습니다.'), 'danger')
      }
    })

  const onRetryPending = (fileId: string) =>
    run(fileId, async () => {
      try {
        const result = await commit.mutateAsync(fileId)
        if (result.ok) notify('업로드를 확인했습니다.', 'success')
        else notify(result.message ?? '업로드를 확인하지 못했습니다.', 'danger')
      } catch {
        notify('업로드를 확인하지 못했습니다.', 'danger')
      }
    })

  const onSubmit = () => {
    if (!response) return
    run(null, async () => {
      try {
        await submit.mutateAsync(response.id)
        notify('제출했습니다. 담당자의 검토를 기다려 주십시오.', 'success')
      } catch (error) {
        notify(messageOf(error, '제출하지 못했습니다.'), 'danger')
      }
    })
  }

  const onAddComment = () => {
    if (!response || draft.trim().length === 0) return
    run(null, async () => {
      try {
        await comment.mutateAsync({ responseId: response.id, body: draft.trim() })
        if (!guard.isActive()) return
        setDraft('')
        notify('메모를 남겼습니다.', 'success')
      } catch (error) {
        notify(messageOf(error, '메모를 남기지 못했습니다.'), 'danger')
      }
    })
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <Banner tone="danger">
          {loadErrorMessage([files.error, comments.error], '이 문항의 자료를 불러오지 못했습니다.')}
        </Banner>
        <GuestButton
          variant="secondary"
          onClick={() => {
            void files.refetch()
            void comments.refetch()
          }}
        >
          다시 시도
        </GuestButton>
      </div>
    )
  }

  return (
    <QuestionPanel
      path={nodePath(nodes, node.id)}
      guide={node.guide}
      isRequired={node.is_required}
      controls={controls}
      comments={comments.data ?? []}
      canRemove={(file) => canRemoveFile({ file, response, write })}
      loading={files.isLoading || comments.isLoading}
      busy={busy}
      notes={notes}
      commentDraft={draft}
      onCommentDraftChange={setDraft}
      onPickFiles={onPickFiles}
      onDownload={onDownload}
      onRemove={onRemove}
      onRetryPending={onRetryPending}
      onAddComment={onAddComment}
      onSubmit={onSubmit}
    />
  )
}

/** 서버가 보낸 사유가 있으면 그대로 보여 준다(막힌 이유는 사람이 읽을 수 있어야 한다). */
function messageOf(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message
  return message && message.length <= 120 ? message : fallback
}
