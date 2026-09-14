import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  AttachmentRow,
  Badge,
  CardHeading,
  CardShell,
  FileDropZone,
  Spinner,
  TextArea,
  cardText,
  formText,
  tableText,
} from '@ynarcher/ui'
import {
  fileCollectionStatusTone,
  formatFileSize,
  type FileCollectionCommentDto,
  type FileCollectionFileDto,
} from '@ynarcher/master-data'
import { Download, FileText, RefreshCw, Trash2 } from 'lucide-react'
import { GuestButton } from '@/components/GuestButton'
import { GuestIconButton } from '@/components/GuestIconButton'
import type { GuestFile } from '@/features/moduleHooks'
import { guestStatusLabel, type QuestionControls } from '@/features/fileCollectionView'
import { formatDate, formatDateTime } from '@/lib/format'

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

/**
 * 내는 버튼 — **패널 머리에 선다**(2026-09-14 사용자 지정). 본문 첫 카드 안에 있던 것을 한 칸
 * 위로 올렸다: 이 패널이 존재하는 이유가 '내는 것'이라, 그 버튼은 내용과 함께 흐르는 자리가
 * 아니라 창이 늘 보여 주는 자리에 있어야 한다. 내려서 읽다가도 낼 준비가 됐는지 보인다.
 *
 * 부품으로 떼어 둔 이유는 두 가지다. 머리는 껍데기(`QuestionDetailPanel`)가 그리고 낼 수
 * 있는지는 알맹이가 아는데, 그 사이에 상태를 흘려보내는 대신 **버튼 자체를 넘긴다**. 그리고
 * 이 판정(언제 잠기고 무엇이라 적히는가)은 통신 없이 그대로 시험할 수 있다.
 */
export function QuestionSubmitButton({
  controls,
  busy,
  onSubmit,
}: {
  controls: QuestionControls
  busy: { any: boolean; submit: boolean }
  onSubmit: () => void
}) {
  return (
    <GuestButton disabled={!controls.canSubmit || busy.any} onClick={onSubmit}>
      {busy.submit ? '제출 중…' : '제출하기'}
    </GuestButton>
  )
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
  /**
   * 담당자가 이 문항에 붙여 둔 자료(양식·견본). 내려받기만 한다 — 이 줄들은 내 제출물이 아니다.
   * 비어 있으면 그 카드는 서지 않는다(빈 상자로 "없음"을 말하지 않는다).
   */
  providedFiles: GuestFile[]
  onDownloadProvided: (file: GuestFile) => void
  notes: UploadNote[]
  commentDraft: string
  onCommentDraftChange: (value: string) => void
  onPickFiles: (files: File[]) => void
  onDownload: (fileId: string) => void
  onRemove: (fileId: string) => void
  onRetryPending: (fileId: string) => void
  onAddComment: () => void
}

/**
 * 문항 한 개의 제출 칸 — **순수 표시 부품**이다(조회도 저장도 하지 않는다).
 *
 * ## 덩이로 나눠 읽는다 (2026-09-14 사용자 지정)
 *
 * `문항명` → (`첨부파일`) → `파일 업로드` → `코멘트`. 가운데 칸은 **담당자가 건넨 것이 있을
 * 때만** 서며, 받아 갈 것이 먼저 읽히도록 올리는 상자보다 위에 둔다. 종전에는 안내·올리기·회차별 목록·메모가 같은 무게의
 * 줄로 이어져 어디까지가 한 가지 일인지 화면이 답하지 못했다. 지금은 **무엇에 대한 칸인가 ·
 * 무엇을 올렸는가 · 무슨 말이 오갔는가**가 각각 카드 한 장이다. 오간 말은 방향으로 가르지 않고
 * 한 창구에 시간순으로 쌓는다 — 담당자의 말과 내 말이 서로에 대한 답이라 갈라 두면 대화가 끊긴다.
 *
 * 나머지 두 가지는 그대로다. 하나는 **올리기와 내기가 다른 일**이라는 것 — 파일을 올려
 * 두기만 하면 담당자에게 가지 않으므로, 받는 상자와 내는 버튼을 떼어 두고 그 사이에 무엇이
 * 남았는지(확인되지 않은 파일·낼 것이 없음)를 문장으로 적는다. 다른 하나는 **회차가 갈려도
 * 한 문항**이라는 것 — 보완 요청을 받으면 새 회차에 올리되, 앞서 낸 자료도 이 문항이 아직
 * 이쪽 손에 있는 동안에는 내릴 수 있다(2026-09-14 사용자 지정).
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
  providedFiles,
  onDownloadProvided,
  notes,
  commentDraft,
  onCommentDraftChange,
  onPickFiles,
  onDownload,
  onRemove,
  onRetryPending,
  onAddComment,
}: QuestionPanelProps) {
  const commentFieldId = useId()

  if (loading) return <Spinner />

  // 상위 폴더(대분류) 이름은 세우지 않는다(2026-09-14 사용자 지정) — 옆 목록에서 이미 그 아래를
  // 눌러 들어온 자리이고, 패널 머리에 한 번 더 서면 문항 이름이 두 번째 줄로 밀린다.
  const title = path[path.length - 1] ?? ''
  const failedNotes = notes.filter((note) => !note.ok)
  // 지난 회차에서 실제로 내릴 수 있는 줄이 하나라도 있는가 — 그때만 아래 안내가 선다.
  const historyRemovable = controls.history.some((group) =>
    [...group.files, ...group.incomplete].some(canRemove),
  )

  return (
    <div className="min-w-0 space-y-4">
      {/* 1. 문항명 — 이 칸이 무엇에 대한 것인가. 이름 자체가 내용이라 카드 제목 줄을 따로 세우지
          않는다(제목과 문항명이 같은 말을 두 번 하게 된다). 담당자가 적은 요청 문구는 이름
          **바로 아래**에 선다(2026-09-14 사용자 지정) — 무엇을 내야 하는지는 이름 다음에 오는
          문장이지, 화면을 내려가다 만나는 별도의 덩이가 아니다.
          내는 버튼은 이 카드가 갖지 않는다 — 패널 머리로 올라갔다(`QuestionSubmitButton`). */}
      <CardShell className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className={`min-w-0 break-words [overflow-wrap:anywhere] ${cardText.title}`}>
            {title}
          </h3>
          {isRequired && (
            <span className={formText.required}>
              <span aria-hidden>*</span>
              <span className="sr-only">필수 문항</span>
            </span>
          )}
          <Badge tone={fileCollectionStatusTone(controls.status)}>
            {guestStatusLabel(controls.status)}
          </Badge>
        </div>
        {guide && (
          <p className="whitespace-pre-line break-words text-body text-gray-800 [overflow-wrap:anywhere]">
            {guide}
          </p>
        )}
      </CardShell>

      {/* 상태 안내 띠는 세우지 않는다(2026-09-14 사용자 지정) — 상태 배지가 이미 그 문항이 어디에
          있는지 말하고, 마감된 요청이라는 사실은 모듈 화면 위쪽이 한 번 말한다. 같은 사실을
          카드 사이에 띠로 한 번 더 두면 화면이 내려갈수록 읽을 것만 늘어난다. */}

      {/* 2. 첨부파일 — 받기 전에 **받아 갈 것**이 있으면 먼저 선다(2026-09-14 사용자 지정).
          양식을 내려받아 채우는 문항에서는 이것이 첫 동작이므로, 올리는 상자 아래에 두면 이미
          무언가를 올린 뒤에야 눈에 든다. 없으면 카드 자체가 서지 않는다. */}
      {providedFiles.length > 0 && (
        <PanelSection title="첨부파일" count={providedFiles.length}>
          <ul className="space-y-1.5">
            {providedFiles.map((file) => (
              <AttachmentRow
                key={file.id}
                icon={<FileText className="size-4 shrink-0 text-gray-500" />}
                name={file.file_name}
                size={formatFileSize(file.byte_size)}
                actions={
                  <GuestIconButton
                    variant="ghost"
                    label={`${file.file_name} 다운로드`}
                    disabled={busy.any}
                    onClick={() => onDownloadProvided(file)}
                    icon={<Download className="size-4" />}
                  />
                }
              />
            ))}
          </ul>
        </PanelSection>
      )}

      {/* 3. 파일 업로드 — 받는 상자와 이번 회차에 올린 것, 지난 회차까지 한 덩이다. */}
      <PanelSection title="파일 업로드">
        {controls.canUpload && (
          <div className="space-y-2">
            {/* 받는 자리는 WORKS 자료 관리와 같은 공용 규격이다(`FileDropZone`) — 파일을 놓는
                자리가 앱마다 다른 모양이면 같은 동작을 두 번 배우게 된다. */}
            <FileDropZone
              onFiles={onPickFiles}
              busy={busy.upload}
              disabled={busy.any}
              busyLabel="올리는 중…"
            />
            {/* 올린 파일이 담당자 화면에서 아예 보이지 않는다고 말하지 않는다 — 올라간 줄은
                원장에 남고 담당자도 그 사실을 읽을 수 있다. 여기서 약속하는 것은 **제출 처리**가
                아직 일어나지 않았다는 것 하나뿐이다. */}
            <p className={formText.hint}>
              여러 개를 한 번에 올릴 수 있습니다(한 개당 100MB까지). 올리기만 해서는 제출되지 않으며,
              위 ‘제출하기’를 눌러야 검토가 시작됩니다.
            </p>
            {/* 올라간 파일은 바로 아래 '제출 파일'에 줄로 서므로 성공은 말하지 않는다(2026-09-14
                사용자 지정) — 같은 사실을 두 번 적으면 올릴 때마다 문장이 쌓여 목록을 밀어낸다.
                **실패만** 남긴다. 실패한 파일은 어디에도 서지 않아 여기서 말하지 않으면 사라진다. */}
            {failedNotes.length > 0 && (
              <ul className="space-y-1">
                {failedNotes.map((note, index) => (
                  <li
                    key={`${note.fileName}-${index}`}
                    className={`break-words [overflow-wrap:anywhere] ${formText.error}`}
                  >
                    {note.fileName} — {note.message ?? '올리지 못했습니다.'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 못 내는 이유는 **파일을 다루는 칸**에 남는다 — 모자란 것이 파일이므로, 문항명 곁에
            적어 두면 이름·상태를 읽는 자리에 할 일 문장이 끼어든다(2026-09-14 사용자 지정). */}
        {controls.submitHint && <p className={formText.hint}>{controls.submitHint}</p>}

        <FileList
          title="제출 파일"
          empty="아직 올린 파일이 없습니다."
          files={controls.currentFiles}
          renderActions={(file) => (
            <>
              <GuestIconButton
                variant="ghost"
                label={`${file.original_name} 다운로드`}
                disabled={busy.any}
                onClick={() => onDownload(file.id)}
                icon={<Download className="size-4" />}
              />
              {canRemove(file) && (
                <GuestIconButton
                  variant="ghost"
                  danger
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
          <FileList
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
                  <GuestIconButton
                    variant="ghost"
                    label={`${file.original_name} 다시 확인`}
                    disabled={busy.any}
                    onClick={() => onRetryPending(file.id)}
                    icon={<RefreshCw className="size-4" />}
                  />
                )}
                {canRemove(file) && (
                  <GuestIconButton
                    variant="ghost"
                    danger
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
          <div className="min-w-0 space-y-3">
            {controls.history.map((group) => (
              <div key={group.round} className="min-w-0 space-y-2">
                {group.files.length > 0 && (
                  <FileList
                    title={`지난 제출${lastUploadedAt(group.files)}`}
                    empty=""
                    files={group.files}
                    renderActions={(file) => (
                      <>
                        <GuestIconButton
                          variant="ghost"
                          label={`${file.original_name} 다운로드`}
                          disabled={busy.any}
                          onClick={() => onDownload(file.id)}
                          icon={<Download className="size-4" />}
                        />
                        {canRemove(file) && (
                          <GuestIconButton
                            variant="ghost"
                            danger
                            label={`${file.original_name} 내리기`}
                            disabled={busy.any}
                            onClick={() => onRemove(file.id)}
                            icon={<Trash2 className="size-4" />}
                          />
                        )}
                      </>
                    )}
                  />
                )}
                {/* 그 회차에서 확인되지 않은 채 남은 줄. **내려받기는 걸지 않는다** — 실물이
                    없을 수 있어 언제나 실패한다. 대신 지우는 것은 열어 둔다(같은 규칙을 회차마다
                    다르게 적용하지 않는다) — 전달되지 않은 잔재를 치울 자리가 여기뿐이다. */}
                {group.incomplete.length > 0 && (
                  <FileList
                    title={`지난 제출${lastUploadedAt(group.incomplete)} — 전달되지 않은 파일`}
                    note="올리다 끊긴 채로 남은 줄입니다. 이 회차의 제출에 포함되지 않았습니다."
                    empty=""
                    files={group.incomplete}
                    renderActions={(file) =>
                      canRemove(file) ? (
                        <GuestIconButton
                          variant="ghost"
                          danger
                          label={`${file.original_name} 지우기`}
                          disabled={busy.any}
                          onClick={() => onRemove(file.id)}
                          icon={<Trash2 className="size-4" />}
                        />
                      ) : (
                        <span className={`shrink-0 ${formText.hint}`}>미완료</span>
                      )
                    }
                  />
                )}
              </div>
            ))}
            {/* 안내는 **목록 아래**, 경고 색으로 선다(2026-09-14 사용자 지정) — 지난 회차도
                내릴 수 있다는 말은 목록을 본 다음에 필요한 말이고, 되돌릴 수 없는 동작을
                여는 안내이므로 다른 힌트와 같은 회색으로 두지 않는다. 낼 수 없는 상태
                (검토 중·완료·마감)에서는 지울 수도 없으므로 이 줄도 서지 않는다. */}
            {historyRemovable && (
              <p className={formText.error}>
                앞서 낸 자료입니다. 그대로 두어도 되고, 잘못 낸 자료는 내려 두어도 됩니다.
              </p>
            )}
          </div>
        )}
      </PanelSection>

      {/* 4. 코멘트 — 담당자와 **주고받는 한 창구**(2026-09-14 사용자 지정). 종전에는 내가 남긴 말과
          담당자가 보낸 말을 카드 두 장으로 갈라 두었는데, 오간 말을 방향으로 가르면 대화가 두 줄로
          끊겨 "무엇에 대한 답인지"를 사람이 눈으로 맞춰야 했다. 여기서는 WORKS 상세의 코멘트 칸과
          같은 모양 — 쓰는 칸이 위, 오간 말이 시간순으로 아래 — 으로 한 줄에 세운다. */}
      <PanelSection title="코멘트" count={comments.length}>
        {controls.canComment && (
          <div className="space-y-2">
            {/* 자리표시자는 이름이 아니다 — 글자가 들어가면 사라지므로 화면 낭독기에게도,
                다시 읽는 사람에게도 이 칸이 무엇인지 답하지 못한다. 그래서 라벨을 세운다. */}
            <label htmlFor={commentFieldId} className="sr-only">
              담당자에게 남길 코멘트
            </label>
            <TextArea
              id={commentFieldId}
              rows={2}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="담당자에게 전할 말을 적어 주세요."
              value={commentDraft}
              disabled={busy.any}
              onChange={(event) => onCommentDraftChange(event.target.value)}
            />
            {/* 글자 수는 세지 않는다(2026-09-14 사용자 지정) — 여기 적는 말은 한두 줄이라
                상한이 화면에 서 있을 이유가 없다. 상한 자체는 `maxLength`로 남아 붙여넣기
                한 번에 목록이 덮이는 일만 막는다. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <GuestButton
                variant="secondary"
                disabled={busy.any || commentDraft.trim().length === 0}
                onClick={onAddComment}
              >
                {busy.comment ? '남기는 중…' : '등록'}
              </GuestButton>
            </div>
          </div>
        )}
        {comments.length > 0 ? (
          <ul className="min-w-0 space-y-2.5 border-t border-gray-100 pt-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="min-w-0 border-t border-gray-100 pt-2.5 first:border-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* 누가 한 말인지는 이름이 아니라 **어느 쪽인지**로 가른다 — 담당자는 여럿이
                      바뀔 수 있고, 받는 사람에게 필요한 답은 '내가 한 말인가 아닌가'다. */}
                  <span className={tableText.primary}>
                    {comment.author_side === 'WORKS' ? '담당자' : '나'}
                  </span>
                  <span className={`tabular-nums ${tableText.meta}`}>
                    {formatDateTime(comment.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-line break-words text-body text-gray-800 [overflow-wrap:anywhere]">
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-gray-600">아직 오간 말이 없습니다.</p>
        )}
      </PanelSection>
    </div>
  )
}

/**
 * 패널의 한 덩이 — 카드 한 장(2026-09-14 사용자 지정, 선 하나로 가르던 것에서 옮겼다).
 *
 * 상자는 화면 공용 규격(`CardShell`)이 소유한다 — 손으로 쓴 흰 div는 밀도 맥락(`card`)을
 * 내려주지 못해 그 안의 버튼만 페이지 밀도로 커진다. 제목도 `CardHeading`이 세우되 단계는
 * `h4`로 내린다: 이 패널의 머리(`자료 제출`)가 `h2`, 문항명이 `h3`이므로 덩이 제목이 `h2`로
 * 서면 낭독기가 읽는 차례가 화면에서 보이는 층과 어긋난다.
 */
function PanelSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <CardShell className="min-w-0">
      <CardHeading as="h4" count={count} className="mb-3">
        {title}
      </CardHeading>
      <div className="min-w-0 space-y-3">{children}</div>
    </CardShell>
  )
}

/**
 * 파일 목록 한 묶음. 행은 WORKS 자료 관리와 같은 공용 규격(`AttachmentRow`)이다 — 첨부 한 줄이
 * 두 앱에서 다른 모양이면 같은 자료를 볼 때마다 눈을 다시 맞춰야 한다.
 */
function FileList({
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
    <div className="min-w-0 space-y-2">
      <h5 className={cardText.subhead}>{title}</h5>
      {note && <p className={formText.hint}>{note}</p>}
      {files.length === 0 ? (
        empty ? (
          <p className="text-body text-gray-600">{empty}</p>
        ) : null
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <AttachmentRow
              key={file.id}
              icon={<FileText className="size-4 shrink-0 text-gray-500" aria-hidden />}
              name={file.original_name}
              size={formatFileSize(file.byte_size)}
              actions={renderActions(file)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 지난 제출 묶음의 꼬리표 — **회차 번호 대신 날짜**로 가른다(2026-09-14 사용자 지정).
 *
 * 'N회차'는 담당자 쪽 셈이라 받는 사람에게는 무엇이 몇 번째인지가 아니라 **언제 낸 것인지**가
 * 답이다. 날짜를 읽을 수 없으면(파일이 없거나 시각이 비면) 아무 말도 붙이지 않는다 — 비어 있는
 * 괄호는 잘못된 정보다.
 */
function lastUploadedAt(files: readonly FileCollectionFileDto[]): string {
  const latest = files.map((f) => f.created_at).filter(Boolean).sort().at(-1)
  const day = latest ? formatDate(latest) : ''
  return day ? ` (${day})` : ''
}
