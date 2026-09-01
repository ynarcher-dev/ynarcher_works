import { Modal } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { MaterialPanel } from '@/features/networks/MaterialPanel'

/**
 * 게시판형 상세 모달(공지사항·QNA 공용) — **두 화면이 같은 구조를 쓴다.**
 *
 * 구성은 위에서 아래로 [머리(제목·날짜) → 본문 → (딸린 글) → 첨부 파일]이다. 목록에서
 * 행을 눌러 열며, 표 아래에 펼치던 종전 방식을 대체한다(2026-09-01 사용자 지정) — 글은
 * 읽는 동안 다른 것에 방해받지 않아야 하고, 표는 그 사이에도 자리를 지켜야 한다.
 *
 * 첨부는 대상 종류(`attachmentType`)와 대상 id만 받아 공용 자료 패널에 그대로 넘긴다.
 * 공지는 공지 1건이, QNA는 질문 1건이 그 대상이다.
 */
export function BoardDetailModal({
  open,
  onClose,
  title,
  date,
  meta,
  body,
  extra,
  attachmentType,
  attachmentId,
  readOnlyFiles = false,
  footer,
}: {
  open: boolean
  onClose: () => void
  /** 글 제목. 모달 머리에는 화면 이름이 서고, 글 제목은 본문 첫 줄에 선다. */
  title: string
  /** 게시일·질문일(YYYY-MM-DD). */
  date: string
  /** 모달 머리에 세울 화면 이름(공지사항·QNA). */
  meta: string
  /** 본문. 리치텍스트 뷰어 또는 순수 텍스트 문단. */
  body: ReactNode
  /** 본문에 딸린 글(QNA의 답변). 없으면 그 자리를 세우지 않는다. */
  extra?: ReactNode
  attachmentType: string
  attachmentId: string
  /** 첨부를 조회·다운로드만 허용(업로드·삭제 숨김). */
  readOnlyFiles?: boolean
  /** 푸터 액션(수정·삭제·닫기). */
  footer?: ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={meta} size="xl" footer={footer}>
      <div className="space-y-4">
        {/* 머리 한 줄 — 브랜드 바가 어디까지가 글의 이름인지 답한다(본문이 제목으로 시작해도). */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
          <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className="min-w-0 flex-1 text-title-sm font-semibold text-gray-900">{title}</p>
          <span className="shrink-0 text-caption tabular-nums text-gray-500">{date}</span>
        </div>
        {body}
        {extra}
        <MaterialPanel
          targetType={attachmentType}
          targetId={attachmentId}
          title="첨부 파일"
          readOnly={readOnlyFiles}
        />
      </div>
    </Modal>
  )
}
