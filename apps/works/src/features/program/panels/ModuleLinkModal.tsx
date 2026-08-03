import { Button, IconButton, Input, Modal, Spinner, TextArea, useToast } from '@ynarcher/ui'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  useDeleteLink,
  useModuleLinks,
  useSaveLink,
  type ProgramLink,
} from '@/features/program/moduleContentHooks'

/** 저장 전 화면 단의 안내용 검증. 강제는 DB CHECK(http/https)가 한다. */
const URL_PATTERN = /^https?:\/\/\S+$/i

/**
 * URL첨부 모듈(모달). 모듈 카드를 누르면 이 모달이 열려 "어디로 갈지" 버튼으로 고르게 한다.
 *
 * 전체 화면 탭으로 만들지 않은 이유는 한 번의 선택으로 끝나는 일이기 때문이다 — 링크를 고르면
 * 새 탭으로 나가므로, 화면을 갈아 끼우면 돌아올 자리만 잃는다.
 * 편집(추가·수정·삭제)은 같은 모달 안에서 목록과 자리를 바꿔 가며 처리한다.
 */
export function ModuleLinkModal({
  programId,
  moduleId,
  title,
  onClose,
}: {
  programId: string
  moduleId: string
  /** 모달 제목(모듈명). */
  title: string
  onClose: () => void
}) {
  const { data: links = [], isLoading } = useModuleLinks(moduleId)
  // undefined=목록 / null=신규 추가 / ProgramLink=수정
  const [editing, setEditing] = useState<ProgramLink | null | undefined>(undefined)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        editing === undefined ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              링크 추가
            </Button>
            <Button onClick={onClose}>닫기</Button>
          </>
        ) : undefined
      }
    >
      {editing !== undefined ? (
        <LinkForm
          key={editing?.id ?? 'new'}
          programId={programId}
          moduleId={moduleId}
          link={editing ?? undefined}
          nextSortOrder={links.length}
          onDone={() => setEditing(undefined)}
          onCancel={() => setEditing(undefined)}
        />
      ) : isLoading ? (
        <Spinner />
      ) : links.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-600">
          등록된 링크가 없습니다. 아래 &lsquo;링크 추가&rsquo;로 첫 링크를 넣어 보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} moduleId={moduleId} onEdit={() => setEditing(link)} />
          ))}
        </ul>
      )}
    </Modal>
  )
}

/**
 * 링크 1건: 눌러서 새 탭으로 여는 버튼 + 수정·삭제.
 * `rel="noreferrer"`는 외부 페이지에 원래 창 제어권(window.opener)이 넘어가지 않게 한다.
 */
function LinkRow({
  link,
  moduleId,
  onEdit,
}: {
  link: ProgramLink
  moduleId: string
  onEdit: () => void
}) {
  const toast = useToast()
  const remove = useDeleteLink(moduleId)

  const onDelete = async () => {
    if (!window.confirm(`'${link.label}' 링크를 삭제하시겠습니까?`)) return
    try {
      await remove.mutateAsync(link.id)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <li className="flex items-center gap-2">
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-radius-md border border-gray-300 bg-white px-4 py-3 transition-colors duration-fast hover:border-brand/50 hover:bg-brand-25"
      >
        <ExternalLink className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-gray-900">{link.label}</span>
          {link.description && (
            <span className="block truncate text-caption text-gray-600">{link.description}</span>
          )}
          <span className="block truncate text-caption text-gray-500">{link.url}</span>
        </span>
      </a>
      <IconButton
        variant="ghost"
        label={`${link.label} 수정`}
        onClick={onEdit}
        icon={<Pencil className="size-4" />}
      />
      <IconButton
        variant="ghost"
        danger
        label={`${link.label} 삭제`}
        disabled={remove.isPending}
        onClick={() => void onDelete()}
        icon={<Trash2 className="size-4" />}
      />
    </li>
  )
}

/** 링크 추가·수정 폼(모달 안에서 목록과 자리를 바꾼다). */
function LinkForm({
  programId,
  moduleId,
  link,
  nextSortOrder,
  onDone,
  onCancel,
}: {
  programId: string
  moduleId: string
  link?: ProgramLink
  /** 신규 추가 시 부여할 정렬 순서(목록 맨 뒤). */
  nextSortOrder: number
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const save = useSaveLink(programId, moduleId)
  const [label, setLabel] = useState(link?.label ?? '')
  const [url, setUrl] = useState(link?.url ?? 'https://')
  const [description, setDescription] = useState(link?.description ?? '')

  const urlValid = URL_PATTERN.test(url.trim())
  const canSubmit = Boolean(label.trim()) && urlValid && !save.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await save.mutateAsync({
        id: link?.id,
        label: label.trim(),
        url: url.trim(),
        description: description.trim() || null,
        sortOrder: link?.sort_order ?? nextSortOrder,
      })
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 주소 형식과 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">표시명</label>
        <Input
          autoFocus
          placeholder="예: 참가 신청 구글폼"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">URL</label>
        <Input placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        {!urlValid && url.trim() !== 'https://' && (
          <p className="text-caption text-danger">http:// 또는 https:// 로 시작하는 주소만 등록할 수 있습니다.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">설명</label>
        <TextArea
          rows={2}
          placeholder="이 링크가 무엇인지 한 줄로 적어 주세요."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {save.isPending ? '저장 중…' : link ? '수정 완료' : '추가'}
        </Button>
      </div>
    </div>
  )
}
