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
 * 사업개요(사업소개문) 탭. 소개문 위, 그 소개문에 딸린 파일 아래의 **상하 배치**다
 * (2026-09-01 사용자 지정) — WORKS는 쓰는 화면이라 에디터와 업로드 드롭존이 모두 전체
 * 폭을 받아야 하고, 읽기만 하는 GUEST 쪽은 같은 내용을 좌우 2:1로 세운다. 같은 자료를
 * 두 앱이 다른 배치로 보는 이유가 이것 하나다: 한쪽은 쓰는 자리, 한쪽은 읽는 자리다.
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
      <MaterialPanel targetType="program_overview" targetId={programId} title="파일" />
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
   * 우측 파일은 별개 축이므로 함께 지우지 않는다 — 그 사실을 확인 문구가 미리 말한다.
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
 * 공지 작성 모달과 달리 **첨부 카드를 안에 두지 않는다** — 사업개요는 사업당 한 건이라
 * 대상(program_id)이 언제나 존재하므로 파일을 탭 화면의 파일 카드에서 곧바로 올리면 되고,
 * 모달에 하나 더 두면 같은 파일함이 두 곳에 생긴다. 공지가 첨부를 폼 안에 둔 이유는
 * 신규 작성 시점에 붙일 대상이 아직 없기 때문이다.
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
      <div className="-mx-5 -my-4 bg-gray-100 px-5 py-4">
        <Card title="사업소개">
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="참여자에게 보일 사업소개를 적어 주세요."
          />
        </Card>
      </div>
    </Modal>
  )
}
