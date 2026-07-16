import { Badge, Button, DataTable, Modal, Spinner, useToast, type BadgeTone, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  APPLICATION_STATUS_META,
  downloadApplicationFile,
  useApplicationForm,
  useSubmissions,
  type FormField,
  type Submission,
} from '@/features/ac/recruitment/recruitmentHooks'

/** 개인정보 목록 마스킹: 이메일/연락처는 일부만 노출한다(상세에서 전체). */
function mask(value: string, type: string): string {
  if (!value) return value
  if (type === 'email') {
    const [id, domain] = value.split('@')
    if (!domain || !id) return value
    return `${id.slice(0, 2)}***@${domain}`
  }
  if (type === 'tel') {
    const d = value.replace(/\D/g, '')
    if (d.length < 7) return value
    return `${d.slice(0, 3)}****${d.slice(-4)}`
  }
  return value
}

const statusBadge = (status: string) => {
  const m = APPLICATION_STATUS_META[status] ?? { label: status, tone: 'neutral' }
  return <Badge tone={m.tone as BadgeTone}>{m.label}</Badge>
}

/**
 * 신청 현황(인스턴스 단위). 신청서 필드 기반 동적 컬럼 + 행 상세(전체 응답·첨부 다운로드).
 * 목록은 개인정보를 마스킹하고, 첨부는 material-download(감사 로그 강제) 경유로만 내려받는다.
 */
export function SubmissionsPanel({ moduleId }: { moduleId: string }) {
  const { data: form } = useApplicationForm(moduleId)
  const { data: subs, isLoading } = useSubmissions(form?.id)
  const [detail, setDetail] = useState<Submission | null>(null)

  // 목록 표시 필드: 단문류 상위 4개(넘치는 컬럼 방지). 상세엔 전체 표시.
  const listFields = useMemo(
    () =>
      (form?.fields ?? [])
        .filter((f) => ['text', 'email', 'tel', 'select'].includes(f.field_type))
        .slice(0, 4),
    [form],
  )

  const valueOf = (s: Submission, fieldId: string): string =>
    s.answers.find((a) => a.field_id === fieldId)?.text_value ?? ''

  const columns = useMemo<Column<Submission>[]>(() => {
    const dyn: Column<Submission>[] = listFields.map((f) => ({
      key: f.id ?? f.label,
      header: f.label,
      render: (s: Submission) => mask(valueOf(s, f.id ?? ''), f.field_type) || '-',
    }))
    return [
      ...dyn,
      { key: 'consent', header: '동의', render: (s) => (s.consented_at ? <Badge tone="success">동의</Badge> : '-') },
      { key: 'status', header: '상태', render: (s) => statusBadge(s.status) },
      {
        key: 'submitted_at',
        header: '제출일',
        render: (s) => (s.submitted_at ? dayjs(s.submitted_at).format('YYYY-MM-DD') : '-'),
      },
      {
        key: 'detail',
        header: '',
        render: (s) => (
          <Button variant="secondary" size="sm" onClick={() => setDetail(s)}>
            상세
          </Button>
        ),
      },
    ]
  }, [listFields])

  if (!form) {
    return (
      <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-6 text-center text-caption text-gray-500">
        먼저 우측 모집 설정에서 신청서를 만들고 공개하세요.
      </p>
    )
  }
  if (isLoading) return <Spinner />

  return (
    <>
      <DataTable
        columns={columns}
        rows={subs ?? []}
        rowKey={(s) => s.id}
        emptyText="접수된 지원서가 없습니다. (모집 폼 공개 후 수집)"
      />
      {detail && form && (
        <SubmissionDetail submission={detail} fields={form.fields} onClose={() => setDetail(null)} />
      )}
    </>
  )
}

/** 접수 상세: 전체 응답(라벨:값) + 파일 응답 다운로드. */
function SubmissionDetail({
  submission,
  fields,
  onClose,
}: {
  submission: Submission
  fields: FormField[]
  onClose: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const answerOf = (fieldId: string) => submission.answers.find((a) => a.field_id === fieldId)

  const onDownload = async (attachmentId: string, fileName: string) => {
    setBusy(attachmentId)
    try {
      await downloadApplicationFile(attachmentId, fileName)
    } catch {
      toast.show('다운로드에 실패했습니다.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="신청 상세"
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-caption text-gray-500">
          {statusBadge(submission.status)}
          <span>· {submission.source === 'PUBLIC' ? '공개 접수' : '내부 입력'}</span>
          {submission.submitted_at && (
            <span>· 제출 {dayjs(submission.submitted_at).format('YYYY-MM-DD HH:mm')}</span>
          )}
          {submission.consented_at && <span>· 개인정보 동의</span>}
        </div>

        <dl className="divide-y divide-gray-100">
          {fields
            .filter((f) => f.field_type !== 'consent')
            .map((f) => {
              const ans = answerOf(f.id ?? '')
              const file = f.field_type === 'file' ? ans?.json_value : null
              return (
                <div key={f.id} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
                  <dt className="text-caption text-gray-500">{f.label}</dt>
                  <dd className="text-body text-gray-900">
                    {f.field_type === 'file' ? (
                      file?.attachment_id ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy === file.attachment_id}
                          onClick={() => void onDownload(file.attachment_id!, file.file_name ?? '첨부')}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          {busy === file.attachment_id ? '준비 중…' : file.file_name ?? '첨부 다운로드'}
                        </Button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap">{ans?.text_value || '-'}</span>
                    )}
                  </dd>
                </div>
              )
            })}
        </dl>
      </div>
    </Modal>
  )
}
