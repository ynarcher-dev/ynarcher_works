import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  Badge,
  Banner,
  IconButton,
  Spinner,
  TextArea,
  cardText,
  formText,
  panelRowBox,
  tableText,
} from '@ynarcher/ui'
import {
  fileCollectionStatusLabel,
  fileCollectionStatusTone,
  formatFileSize,
  roundLabel,
  type FileCollectionCommentDto,
  type FileCollectionFileDto,
} from '@ynarcher/master-data'
import { Download, FileText, RefreshCw, Trash2, Upload } from 'lucide-react'
import { GuestButton } from '@/components/GuestButton'
import type { QuestionControls } from '@/features/fileCollectionView'
import { formatDateTime } from '@/lib/format'

/**
 * 메모 한 건의 길이 상한(화면 쪽 제동).
 *
 * 원장(`file_collection_comments.body`)은 제약 없는 `text`이므로 **이 값은 서버의 한계가
 * 아니라 화면의 약속**이다. 붙여넣기 한 번으로 수십만 자가 들어가면 목록이 그 한 줄로 덮이고
 * 되돌릴 길이 없어 여기서 먼저 끊는다. 서버 쪽 상한은 RPC가 가질 일이며 아직 없다.
 */
export const COMMENT_MAX_LENGTH = 2000

/** 마지막 업로드 시도의 결과 한 줄. 성공도 실패도 파일마다 따로 적는다. */
export interface UploadNote {
  fileName: string
  ok: boolean
  message?: string
}

export interface QuestionPanelProps {
  /** 뿌리부터의 전체 경로(마지막이 이 문항). */
  path: string[]
  guide: string | null
  isRequired: boolean
  controls: QuestionControls
  comments: FileCollectionCommentDto[]
  /** 이 파일을 내릴 수 있는가(서버와 같은 조건). */
  canRemove: (file: FileCollectionFileDto) => boolean
  loading?: boolean
  /**
   * 지금 이 문항에서 돌고 있는 작업. `any`가 켜져 있으면 **모든** 쓰기 버튼이 잠긴다 —
   * 올리는 중에 제출을 누르면 아직 확정되지 않은 파일을 뺀 채로 제출되고, 내리는 중에 다시
   * 올리면 어느 줄이 남는지가 순서에 걸린다. 한 번에 한 가지만 한다.
   */
  busy: {
    any: boolean
    upload: boolean
    submit: boolean
    comment: boolean
    fileId: string | null
  }
  notes: UploadNote[]
  commentDraft: string
  onCommentDraftChange: (value: string) => void
  onPickFiles: (files: File[]) => void
  onDownload: (fileId: string) => void
  onRemove: (fileId: string) => void
  onRetryPending: (fileId: string) => void
  onAddComment: () => void
  onSubmit: () => void
}

/**
 * 문항 한 개의 제출 칸 — **순수 표시 부품**이다(조회도 저장도 하지 않는다).
 *
 * 여기서 갈리는 것은 두 가지다. 하나는 **올리기와 내기가 다른 일**이라는 것 — 파일을 올려
 * 두기만 하면 담당자에게 가지 않으므로, 올리는 자리와 내는 버튼을 떼어 두고 그 사이에 무엇이
 * 남았는지(확인되지 않은 파일·낼 것이 없음)를 문장으로 적는다. 다른 하나는 **지난 회차는
 * 읽기 전용**이라는 것 — 보완 요청을 받아도 앞서 낸 것은 그대로 남고 새 회차에만 올린다.
 *
 * 남의 것은 어디에도 서지 않는다. 이 화면이 아는 사실은 내 배정·내 응답 칸뿐이며, 대상이
 * 몇 명인지도 답하지 않는다.
 */
export function QuestionPanel({
  path,
  guide,
  isRequired,
  controls,
  comments,
  canRemove,
  loading,
  busy,
  notes,
  commentDraft,
  onCommentDraftChange,
  onPickFiles,
  onDownload,
  onRemove,
  onRetryPending,
  onAddComment,
  onSubmit,
}: QuestionPanelProps) {
  const pickerRef = useRef<HTMLInputElement | null>(null)
  const commentFieldId = useId()

  if (loading) return <Spinner />

  const title = path[path.length - 1] ?? ''
  const parents = path.slice(0, -1).join(' / ')

  return (
    <div className="min-w-0 space-y-5">
      <header className="min-w-0 space-y-1">
        {parents && (
          <p className={`${tableText.meta} break-words [overflow-wrap:anywhere]`}>{parents}</p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className={`min-w-0 break-words [overflow-wrap:anywhere] ${cardText.subhead}`}>
            {title}
          </h3>
          {isRequired && (
            <span className={formText.required}>
              <span aria-hidden>*</span>
              <span className="sr-only">필수 문항</span>
            </span>
          )}
          <Badge tone={fileCollectionStatusTone(controls.status)}>
            {fileCollectionStatusLabel(controls.status)}
          </Badge>
          <span className={tableText.meta}>{roundLabel(controls.round)}</span>
        </div>
        {guide && (
          <p className="whitespace-pre-line break-words text-body text-gray-800 [overflow-wrap:anywhere]">
            {guide}
          </p>
        )}
      </header>

      {controls.blockedReason && <Banner tone="info">{controls.blockedReason}</Banner>}

      {controls.canUpload && (
        <section className="min-w-0 space-y-2">
          <h4 className={cardText.subhead}>파일 올리기</h4>
          {/* 올린 파일이 담당자 화면에서 아예 보이지 않는다고 말하지 않는다 — 올라간 줄은
              원장에 남고 담당자도 그 사실을 읽을 수 있다. 여기서 약속하는 것은 **제출 처리**가
              아직 일어나지 않았다는 것 하나뿐이다. */}
          <p className={formText.hint}>
            여러 개를 한 번에 고를 수 있습니다. 파일을 올린 것만으로는 제출 처리되지 않으며, 아래
            ‘제출하기’를 눌러야 담당자의 검토가 시작됩니다. (한 개당 100MB까지)
          </p>
          <input
            ref={pickerRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? [])
              // 같은 파일을 연달아 고를 수 있도록 값을 비운다(고르기를 취소하면 아무 일도 없다).
              event.target.value = ''
              if (picked.length > 0) onPickFiles(picked)
            }}
          />
          <GuestButton
            variant="secondary"
            disabled={busy.any}
            onClick={() => pickerRef.current?.click()}
          >
            <Upload className="size-4" />
            {busy.upload ? '올리는 중…' : '파일 선택'}
          </GuestButton>
          {notes.length > 0 && (
            <ul className="space-y-1">
              {notes.map((note, index) => (
                <li
                  key={`${note.fileName}-${index}`}
                  className={`break-words [overflow-wrap:anywhere] ${
                    note.ok ? formText.hint : formText.error
                  }`}
                >
                  {note.fileName} — {note.ok ? '올렸습니다.' : (note.message ?? '실패했습니다.')}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <FileSection
        title={`${roundLabel(controls.round)} 제출 파일`}
        empty="아직 올린 파일이 없습니다."
        files={controls.currentFiles}
        renderActions={(file) => (
          <>
            <IconButton
              variant="ghost"
              label={`${file.original_name} 다운로드`}
              disabled={busy.any}
              onClick={() => onDownload(file.id)}
              icon={<Download className="size-4" />}
            />
            {canRemove(file) && (
              <IconButton
                variant="ghost"
                label={`${file.original_name} 내리기`}
                disabled={busy.any}
                onClick={() => onRemove(file.id)}
                icon={<Trash2 className="size-4" />}
              />
            )}
          </>
        )}
      />

      {controls.pendingFiles.length > 0 && (
        <FileSection
          title="확인되지 않은 파일"
          note="올리다 끊긴 파일입니다. 제출에 포함되지 않으니 다시 확인하거나 지운 뒤 새로 올려 주십시오."
          empty=""
          files={controls.pendingFiles}
          renderActions={(file) => (
            <>
              {/* 다시 확인은 **쓰기**다(확정을 다시 보낸다). 마감·제출·승인 뒤에는 버튼을
                  잠그는 것으로 끝내지 않고 아예 세우지 않는다 — 잠긴 버튼은 "지금은 안 되지만
                  곧 된다"고 읽히고, 여기서는 이 회차에 다시는 되지 않기 때문이다. 줄 자체는
                  남으므로 무엇이 전달되지 않았는지는 그대로 보인다. */}
              {controls.canUpload && (
                <IconButton
                  variant="ghost"
                  label={`${file.original_name} 다시 확인`}
                  disabled={busy.any}
                  onClick={() => onRetryPending(file.id)}
                  icon={<RefreshCw className="size-4" />}
                />
              )}
              {canRemove(file) && (
                <IconButton
                  variant="ghost"
                  label={`${file.original_name} 지우기`}
                  disabled={busy.any}
                  onClick={() => onRemove(file.id)}
                  icon={<Trash2 className="size-4" />}
                />
              )}
            </>
          )}
        />
      )}

      {controls.history.length > 0 && (
        <section className="min-w-0 space-y-3">
          <h4 className={cardText.subhead}>지난 회차</h4>
          <p className={formText.hint}>지난 회차에 낸 자료는 그대로 남으며 내려받기만 됩니다.</p>
          {controls.history.map((group) => (
            <div key={group.round} className="min-w-0 space-y-2">
              {group.files.length > 0 && (
                <FileSection
                  title={roundLabel(group.round)}
                  empty=""
                  files={group.files}
                  renderActions={(file) => (
                    <IconButton
                      variant="ghost"
                      label={`${file.original_name} 다운로드`}
                      disabled={busy.any}
                      onClick={() => onDownload(file.id)}
                      icon={<Download className="size-4" />}
                    />
                  )}
                />
              )}
              {/* 그 회차에서 확인되지 않은 채 남은 줄. **내려받기를 걸지 않는다** — 실물이
                  없을 수 있어 언제나 실패하고, 지난 회차는 다시 확인하거나 지울 수도 없다.
                  이름만 남기고 전달되지 않았다는 사실을 그 자리에 적는다. */}
              {group.incomplete.length > 0 && (
                <FileSection
                  title={`${roundLabel(group.round)} — 전달되지 않은 파일`}
                  note="올리다 끊긴 채로 남은 줄입니다. 이 회차의 제출에 포함되지 않았습니다."
                  empty=""
                  files={group.incomplete}
                  renderActions={() => (
                    <span className={`shrink-0 ${formText.hint}`}>미완료</span>
                  )}
                />
              )}
            </div>
          ))}
        </section>
      )}

      <section className="min-w-0 space-y-2">
        <h4 className={cardText.subhead}>메모와 피드백</h4>
        {comments.length === 0 ? (
          <p className="text-body text-gray-600">아직 오간 말이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={`min-w-0 rounded-radius-sm border border-gray-200 bg-white ${panelRowBox}`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={tableText.primary}>
                    {comment.author_side === 'WORKS' ? '담당자' : '내가 남긴 메모'}
                  </span>
                  <span className={tableText.meta}>{roundLabel(comment.round)}</span>
                  <span className={tableText.meta}>{formatDateTime(comment.created_at)}</span>
                </div>
                <p className="whitespace-pre-line break-words text-body text-gray-800 [overflow-wrap:anywhere]">
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        {controls.canComment && (
          <div className="space-y-2">
            {/* 자리표시자는 이름이 아니다 — 글자가 들어가면 사라지므로 화면 낭독기에게도,
                다시 읽는 사람에게도 이 칸이 무엇인지 답하지 못한다. 그래서 라벨을 세운다. */}
            <label htmlFor={commentFieldId} className={formText.label}>
              담당자에게 남길 메모
            </label>
            <TextArea
              id={commentFieldId}
              rows={3}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="담당자에게 전할 말을 적어 주세요."
              value={commentDraft}
              disabled={busy.any}
              onChange={(event) => onCommentDraftChange(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`tabular-nums ${formText.hint}`}>
                {commentDraft.length}/{COMMENT_MAX_LENGTH}자
              </span>
              <GuestButton
                variant="secondary"
                disabled={busy.any || commentDraft.trim().length === 0}
                onClick={onAddComment}
              >
                {busy.comment ? '남기는 중…' : '메모 남기기'}
              </GuestButton>
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-2 border-t border-gray-200 pt-4">
        {controls.submitHint && <p className={formText.hint}>{controls.submitHint}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <GuestButton disabled={!controls.canSubmit || busy.any} onClick={onSubmit}>
            {busy.submit ? '제출 중…' : '제출하기'}
          </GuestButton>
        </div>
      </section>
    </div>
  )
}

/**
 * 파일 목록 한 묶음. 이름은 **말줄임하지 않는다** — 좁은 화면에서 잘라 버리면 무엇을 올렸는지
 * 확인할 길이 사라지므로, 공백 없는 긴 이름도 그 자리에서 접는다.
 *
 * 한 줄은 위아래 두 칸이다. 위는 이름만, 아래는 크기와 버튼이다 — 넷을 한 가로줄에 늘어놓으면
 * 좁은 화면에서 이름 칸이 먼저 눌려 한 줄에 한두 글자만 남는다.
 */
function FileSection({
  title,
  note,
  empty,
  files,
  renderActions,
}: {
  title: string
  note?: string
  empty: string
  files: readonly FileCollectionFileDto[]
  renderActions: (file: FileCollectionFileDto) => ReactNode
}) {
  return (
    <section className="min-w-0 space-y-2">
      <h4 className={cardText.subhead}>{title}</h4>
      {note && <p className={formText.hint}>{note}</p>}
      {files.length === 0 ? (
        empty ? (
          <p className="text-body text-gray-600">{empty}</p>
        ) : null
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className={`min-w-0 rounded-radius-sm border border-gray-200 bg-white ${panelRowBox}`}
            >
              {/* 이름은 **자기 줄을 통째로** 쓴다. 크기·버튼과 한 줄을 나눠 쓰면 320px에서
                  이름 칸이 서너 글자로 눌려 읽을 수 없게 된다. 크기와 버튼은 아래 줄에서
                  좌우로 갈라 선다. */}
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
                  <span
                    className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] ${tableText.primary}`}
                  >
                    {file.original_name}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className={`tabular-nums ${tableText.meta}`}>
                    {formatFileSize(file.byte_size)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">{renderActions(file)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
