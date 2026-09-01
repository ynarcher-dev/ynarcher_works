import { Button, Card, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import {
  useProgramOverview,
  useSaveProgramOverview,
} from '@/features/program/overviewHooks'

/**
 * 사업개요(사업소개문) 탭. GUEST 로그인 직후 첫 화면(사이드바 최상단 '사업개요')과
 * **같은 구성**이며, 차이는 편집 가능 여부뿐이다 — 소개문(2)과 소개문에 딸린 파일(1)의
 * 2:1 분할로, WORKS에서 쓰고·올리고 게스트가 첫 화면 같은 자리에서 읽고·내려받는다.
 *
 * 파일은 새 원장 없이 attachments 행에 target_type='program_overview'로 귀속만 표시한다
 * (파일첨부 모듈이 program_module_id로 하는 것과 같은 판정 — 사업개요는 모듈이 아니라
 * 모듈 마커를 쓸 수 없고, 사업 자료 관리(target_type='program')와는 목록의 축이 다르다).
 * 게스트 쪽 읽기는 RLS(20260901160000)가 연다.
 */
export function ProgramIntroPanel({ programId }: { programId: string }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <IntroCard programId={programId} />
      </div>
      <MaterialPanel targetType="program_overview" targetId={programId} title="파일" />
    </div>
  )
}

/** 소개문 카드 — 카드 안에서 공용 리치텍스트 뷰어와 에디터가 자리를 바꾼다. */
function IntroCard({ programId }: { programId: string }) {
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
