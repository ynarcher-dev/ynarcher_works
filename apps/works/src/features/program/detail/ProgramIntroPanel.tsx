import { Button, Card, IconButton, Modal, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import {
  useProgramOverview,
  useSaveProgramOverview,
} from '@/features/program/overviewHooks'

/**
 * 사업개요 첨부의 다형 키. 사업 자료 관리('program')와 같은 attachments 원장을 쓰되
 * 목록의 축이 달라 키로 가른다.
 */
const OVERVIEW_ATTACHMENT_TYPE = 'program_overview'

/**
 * 사업개요(사업소개문) 탭. 소개문 위, 그 소개문에 딸린 파일 아래의 **상하 배치**다
 * (2026-09-01 사용자 지정) — 읽기만 하는 GUEST 쪽은 같은 내용을 좌우 2:1로 세운다.
 *
 * 탭에서는 파일이 **목록으로만** 선다(readOnly, 2026-09-01 사용자 지정) — 올리고 지우는
 * 일은 수정 모달 안에서 하고, 탭은 지금 무엇이 붙어 있는지 확인하는 자리다. 공지·회의록이
 * 이미 그렇게 갈라져 있어(읽는 화면 readOnly / 쓰는 폼에서 업로드) 같은 규격을 따른다.
 *
 * 파일은 새 원장 없이 attachments 행에 target_type='program_overview'로 귀속만 표시한다
 * (파일첨부 모듈이 program_module_id로 하는 것과 같은 판정 — 사업개요는 모듈이 아니라
 * 모듈 마커를 쓸 수 없고, 사업 자료 관리(target_type='program')와는 목록의 축이 다르다).
 * 사업당 개요가 하나뿐이라 여기서는 사업 id가 곧 그 개요를 가리킨다.
 * 게스트 쪽 읽기는 RLS(20260901160000)가 연다.
 */
export function ProgramIntroPanel({ programId }: { programId: string }) {
  return (
    <div className="space-y-4">
      <IntroCard programId={programId} />
      <MaterialPanel
        targetType={OVERVIEW_ATTACHMENT_TYPE}
        targetId={programId}
        title="첨부 파일"
        readOnly
      />
    </div>
  )
}

/** 소개문 카드 — 카드 안에서 공용 리치텍스트 뷰어와 에디터가 자리를 바꾼다. */
function IntroCard({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: overview, isLoading } = useProgramOverview(programId)
  const save = useSaveProgramOverview(programId)
  const [editing, setEditing] = useState(false)

  /**
   * 소개문 삭제 — 원장의 행은 남기고 본문만 비운다. 이 원장은 사업 1건당 한 행이 '개요'라는
   * 자리 그 자체라(program_id가 PK), 내리는 것과 비우는 것이 같은 사실이다.
   * 첨부 파일은 별개 축이므로 함께 지우지 않는다 — 그 사실을 확인 문구가 미리 말한다.
   */
  const onDelete = async () => {
    if (
      !window.confirm(
        '사업소개를 삭제하시겠습니까? 게스트 첫 화면에서도 사라집니다. 첨부한 파일은 그대로 남습니다.',
      )
    ) {
      return
    }
    try {
      await save.mutateAsync(null)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title="사업개요"
      actions={
        !editing ? (
          <span className="flex items-center gap-1">
            {overview?.body && (
              <IconButton
                variant="ghost"
                danger
                label="사업소개 삭제"
                disabled={save.isPending}
                onClick={() => void onDelete()}
                icon={<Trash2 className="size-4" />}
              />
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {overview?.body ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {overview?.body ? '수정' : '작성'}
            </Button>
          </span>
        ) : undefined
      }
    >
      {isLoading ? (
        <Spinner />
      ) : overview?.body ? (
        // 에디터용 최소 높이(16rem)가 읽기 전용 뷰어에 빈 공간으로 남지 않게 이 자리에서만 눕힌다.
        <div className="[&_.ProseMirror]:min-h-0">
          <RichTextViewer html={overview.body} />
        </div>
      ) : (
        <p className="py-6 text-center text-body text-gray-600">
          아직 작성된 사업소개가 없습니다. 작성하면 게스트 로그인 직후 첫 화면에 보입니다.
        </p>
      )}
      {editing && (
        <IntroFormModal
          programId={programId}
          initialBody={overview?.body ?? ''}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  )
}

/**
 * 개요 작성·수정 **모달** — 공지사항·QNA의 작성 모달과 같은 방식이다(2026-09-01 사용자
 * 지정: "그렇게 해야 유저 경험이 일관될 것"). 쓰는 동안 딤 클릭으로 닫히지 않게 잠가
 * 두므로(`dismissible={false}`) 닫는 길은 취소 버튼뿐이다.
 *
 * 첨부 카드도 이 안에 둔다(2026-09-01 사용자 지정) — 소개문과 파일은 게스트 첫 화면에
 * 함께 나가는 한 벌이라 손대는 자리도 하나여야 한다. 공지 작성 모달과 달리 대기 업로드
 * (PendingMaterialPanel)가 필요 없다: 사업개요는 사업당 한 건이라 붙일 대상(program_id)이
 * 언제나 존재하므로 고른 즉시 올라간다. 그래서 첨부는 취소를 눌러도 되돌아가지 않는다 —
 * 되돌릴 것은 소개문 본문뿐이고, 파일은 카드 안에서 지운다.
 */
function IntroFormModal({
  programId,
  initialBody,
  onClose,
}: {
  programId: string
  initialBody: string
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveProgramOverview(programId)
  const [body, setBody] = useState(initialBody)

  const submit = async () => {
    try {
      await save.mutateAsync(isEmptyRichText(body) ? null : body)
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={false}
      title={initialBody ? '사업개요 수정' : '사업개요 작성'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        </>
      }
    >
      {/* 게시판 작성 모달과 같은 바닥·카드 구성 — 쓰는 화면끼리 모양이 같아야 한다. */}
      <div className="-mx-5 -my-4 space-y-3 bg-gray-100 px-5 py-4">
        <Card title="사업소개">
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="참여자에게 보일 사업소개를 적어 주세요."
          />
        </Card>

        {/* 대상이 언제나 있으므로 즉시 업로드다(공지 신규 작성의 대기 업로드와 다른 점). */}
        <MaterialPanel
          targetType={OVERVIEW_ATTACHMENT_TYPE}
          targetId={programId}
          title="첨부 파일"
        />
      </div>
    </Modal>
  )
}
