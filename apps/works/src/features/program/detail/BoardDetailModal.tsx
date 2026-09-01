import { Button, Card, cardText, Modal } from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { MaterialList } from '@/features/networks/MaterialList'
import {
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
} from '@/features/networks/materialHooks'

/**
 * 게시판형 상세 모달(공지사항·QNA 공용) — **두 화면이 같은 구조를 쓴다.**
 *
 * 구성은 위에서 아래로 [머리(제목·날짜) → 본문 → (답변) → 첨부 파일]이며, 셋은 각각
 * **자기 카드**로 선다(2026-09-01 사용자 지정). 구분선만으로 나눴을 때는 어디서 하나가
 * 끝나고 다음이 시작하는지 읽히지 않았다 — 성격이 다른 덩어리(물음 / 대답 / 딸린 것)는
 * 선이 아니라 면으로 갈라야 한다. 그래서 모달 본문 바닥을 페이지 바탕(gray-100)으로 깔고
 * 그 위에 카드를 올린다(표면은 그림자가 아니라 헤어라인+바탕 색차로 구획한다는 원칙 그대로).
 *
 * 글자 규격은 화면이 직접 고르지 않고 `cardText`가 소유하며, 카드 제목은 `Card`가 갖는다.
 */
export function BoardDetailModal({
  open,
  onClose,
  title,
  date,
  meta,
  body,
  answer,
  attachmentType,
  attachmentId,
  readOnlyFiles = false,
  destructiveAction,
  actions,
}: {
  open: boolean
  onClose: () => void
  /** 글 제목. 모달 머리에는 화면 이름이 서고, 글 제목은 본문 첫 줄에 선다. */
  title: string
  /** 게시일·질문일(질문자 이름이 함께 서기도 한다). */
  date: string
  /** 모달 머리에 세울 화면 이름(공지사항·QNA). */
  meta: string
  /** 본문. 리치텍스트 뷰어 또는 순수 텍스트 문단. */
  body: ReactNode
  /** 본문에 딸린 답변(QNA). 없으면 그 카드를 세우지 않는다. */
  answer?: ReactNode
  attachmentType: string
  attachmentId: string
  /** 첨부를 조회·다운로드만 허용(업로드·삭제 숨김). */
  readOnlyFiles?: boolean
  /**
   * 삭제 등 파괴적 액션. 푸터 **왼쪽 끝**에 세운다(2026-09-01 사용자 지정) —
   * 되돌릴 수 없는 것과 흐름을 잇는 것(닫기·수정)이 손가락 하나 거리에 붙어 있으면 안 된다.
   */
  destructiveAction?: ReactNode
  /** 푸터 오른쪽 액션(닫기·수정·답변). */
  actions?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={meta}
      size="xl"
      footer={
        destructiveAction || actions ? (
          <>
            {/* 푸터는 오른쪽 정렬이므로, 왼쪽으로 보낼 것 하나에만 자동 여백을 준다. */}
            {destructiveAction && <span className="mr-auto">{destructiveAction}</span>}
            {actions}
          </>
        ) : undefined
      }
    >
      {/* 모달 본문 바닥을 페이지 바탕으로 깐다(음수 여백으로 모달의 안쪽 여백까지 채운다). */}
      <div className="-mx-5 -my-4 space-y-3 bg-gray-100 px-5 py-4">
        {/* 머리 한 줄 — 카드 밖에 서서 이 모달 전체가 무엇에 대한 것인지 먼저 답한다. */}
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className={`min-w-0 flex-1 ${cardText.subhead}`}>{title}</p>
          <span className={`shrink-0 tabular-nums ${cardText.meta}`}>{date}</span>
        </div>

        <Card title="본문">{body}</Card>
        {answer && <Card title="답변">{answer}</Card>}
        <ModalAttachmentsCard
          targetType={attachmentType}
          targetId={attachmentId}
          readOnly={readOnlyFiles}
        />
      </div>
    </Modal>
  )
}

/**
 * 모달 안의 첨부 파일 카드 — 상세 패널의 자료 관리(`MaterialPanel`)를 **모달 크기로 줄인 것**
 * (2026-09-01 사용자 요청).
 *
 * 줄인 것은 드롭존이다 — 모달은 좁고 세로로 짧아 6줄짜리 빈 사각형이 본문만큼 자리를 먹는다.
 * 파일을 고르는 길은 버튼 하나로 좁히되, 목록의 행 규격은 상세 패널과 같은 `MaterialList`
 * 그대로다(같은 첨부가 자리에 따라 다른 모양이 되면 안 된다).
 */
function ModalAttachmentsCard({
  targetType,
  targetId,
  readOnly,
}: {
  targetType: string
  targetId: string
  readOnly: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: materials, isLoading } = useMaterials(targetType, targetId)
  const upload = useUploadMaterial(targetType, targetId)
  const remove = useDeleteMaterial(targetType, targetId)
  const list = materials ?? []

  return (
    <Card
      title="첨부 파일"
      count={list.length}
      actions={
        !readOnly ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                for (const file of Array.from(e.target.files ?? [])) upload.mutate(file)
                e.target.value = ''
              }}
            />
            <Button
              variant="secondary"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="size-4" />
              {upload.isPending ? '올리는 중…' : '파일 추가'}
            </Button>
          </>
        ) : undefined
      }
    >
      {upload.isError && (
        <p className="mb-2 text-caption text-danger">
          업로드에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
      <MaterialList
        materials={list}
        loading={isLoading}
        onDelete={readOnly ? undefined : (id) => remove.mutate(id)}
        deletingId={remove.isPending ? remove.variables : undefined}
        emptyText="첨부된 파일이 없습니다."
      />
    </Card>
  )
}
