import { Button, Card, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import {
  useProgramOverview,
  useSaveProgramOverview,
} from '@/features/program/overviewHooks'

/**
 * 사업개요(사업소개문) 탭. GUEST 로그인 직후 첫 화면(사이드바 최상단 '사업개요')과
 * **같은 내용**이며, 차이는 편집 가능 여부뿐이다 — WORKS에서 쓰고 게스트가 첫 화면에서
 * 읽는다. 사업 1건 = 개요 1건이므로 목록 없이 본문이 바로 서고, 에디터·뷰어는 게시판·
 * 글쓰기·NOTICE와 같은 공용 리치텍스트(RichTextEditor) 하나를 쓴다.
 */
export function ProgramIntroPanel({ programId }: { programId: string }) {
  const { data: overview, isLoading } = useProgramOverview(programId)
  const [editing, setEditing] = useState(false)

  return (
    <Card
      title="사업개요"
      actions={
        !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {overview?.body ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {overview?.body ? '수정' : '작성'}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <IntroForm
          programId={programId}
          initialBody={overview?.body ?? ''}
          onClose={() => setEditing(false)}
        />
      ) : isLoading ? (
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
    </Card>
  )
}

/** 개요 작성·수정 폼(카드 안에서 표시와 자리를 바꾼다). */
function IntroForm({
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
    <div className="space-y-4">
      <RichTextEditor
        value={body}
        onChange={setBody}
        placeholder="참여자에게 보일 사업소개를 적어 주세요."
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}
