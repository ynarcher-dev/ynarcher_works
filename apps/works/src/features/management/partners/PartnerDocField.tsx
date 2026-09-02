import { AttachmentRow, cn, IconButton, useToast } from '@ynarcher/ui'
import { Download, FileText, Paperclip, X } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
import {
  PARTNER_DOC_ACCEPT,
  PARTNER_DOC_MAX_BYTES,
  type PartnerType,
} from '@/features/management/partners/config'
import {
  downloadPartnerDoc,
  partnerDocLabel,
  uploadPartnerDoc,
  type PartnerDocKind,
} from '@/features/management/partners/partnerDocs'

interface PartnerDocFieldProps {
  kind: PartnerDocKind
  partnerType: PartnerType
  /** 수정 중인 거래처. 등록 중에는 아직 없다(접근 로그의 대상 id로만 쓰인다). */
  partnerId?: string
  path: string
  fileName: string
  onChange: (next: { path: string; fileName: string }) => void
  disabled?: boolean
}

/**
 * 증빙 서류 한 칸(사업자등록증·신분증·통장사본) — 붙이기 / 내려받기 / 떼기.
 *
 * 고른 즉시 비공개 버킷에 올리고 원장에는 경로와 파일명만 담는다. 저장을 눌러야 올라가는
 * 방식으로 만들지 않은 이유는 자산 사진과 같다 — 원장 한 행을 쓰는 일에 파일 업로드를 묶으면
 * 파일에서 실패했을 때 무엇이 저장되고 무엇이 안 됐는지 사용자가 알 수 없다.
 *
 * 그 대신 등록을 취소하면 방금 올린 오브젝트는 아무도 참조하지 않는 채로 남는다. 비공개
 * 버킷이라 새어 나가지 않으므로 물리 삭제를 하지 않는 원칙을 지키는 쪽을 택했다.
 *
 * 내려받기는 접근 로그가 남은 뒤에만 시작된다(partnerDocs). 여기 담기는 것이 등록증·신분증·
 * 통장사본이라, 열람 기록 없이 파일이 나가는 경로를 만들지 않는다.
 */
export function PartnerDocField({
  kind,
  partnerType,
  partnerId,
  path,
  fileName,
  onChange,
  disabled,
}: PartnerDocFieldProps) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const label = partnerDocLabel(kind, partnerType)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 같은 파일을 연달아 고를 수 있어야 하므로 입력값을 먼저 비운다.
    e.target.value = ''
    if (!file) return
    if (file.size > PARTNER_DOC_MAX_BYTES) {
      toast.show(`${label} 파일은 10MB 이하여야 합니다.`, 'warning')
      return
    }
    setBusy(true)
    try {
      const uploaded = await uploadPartnerDoc(file)
      onChange({ path: uploaded, fileName: file.name })
    } catch {
      toast.show(`${label} 업로드에 실패했습니다. 권한을 확인하세요.`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    setBusy(true)
    try {
      await downloadPartnerDoc({ kind, partnerType, partnerId, path, fileName })
    } catch {
      toast.show('열람 기록을 남기지 못해 파일을 열 수 없습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (path) {
    return (
      <ul>
        <AttachmentRow
          icon={<FileText className="size-4 shrink-0 text-gray-400" aria-hidden />}
          name={fileName || label}
          actions={
            <span className="flex shrink-0 items-center gap-1">
              <IconButton
                disabled={busy}
                onClick={() => void download()}
                icon={<Download className="size-3.5" />}
                label={`${label} 내려받기`}
              />
              {!disabled && (
                <IconButton
                  disabled={busy}
                  onClick={() => onChange({ path: '', fileName: '' })}
                  icon={<X className="size-3.5" />}
                  label={`${label} 첨부 해제`}
                />
              )}
            </span>
          }
        />
      </ul>
    )
  }

  return (
    <label
      className={cn(
        'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-radius-sm',
        'border border-dashed border-gray-300 text-body text-gray-500 transition-colors hover:bg-gray-50',
        (busy || disabled) && 'pointer-events-none opacity-60',
      )}
    >
      <Paperclip className="size-4" aria-hidden />
      <span>{busy ? '올리는 중…' : `${label} 첨부`}</span>
      <input
        type="file"
        accept={PARTNER_DOC_ACCEPT}
        className="hidden"
        disabled={busy || disabled}
        onChange={(e) => void onPick(e)}
      />
    </label>
  )
}
