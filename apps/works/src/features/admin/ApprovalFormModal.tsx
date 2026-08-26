import { Button, Field, Input, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { FieldSchemaEditor } from '@/features/approval/FieldSchemaEditor'
import type { ApprovalForm } from '@/features/approval/approvalApi'
import { parseFields, validateSchema, type FormField } from '@/features/approval/fields'

export interface ApprovalFormSubmit {
  name: string
  category: string
  abbrev: string
  retention: string
  security_grade: string
  sort_order: number
  fields: FormField[]
  /** 필드 스키마가 실제로 바뀌었는가(바뀌었을 때만 새 버전을 발행한다). */
  schemaChanged: boolean
}

interface ApprovalFormModalProps {
  open: boolean
  /** 수정 대상. 없으면 신규 양식. */
  form?: ApprovalForm
  /** 이미 쓰이고 있는 분류(입력 자동완성). 새 이름을 적으면 새 분류가 된다. */
  categories: string[]
  onClose: () => void
  onSubmit: (v: ApprovalFormSubmit) => Promise<void> | void
}

const EMPTY_FIELDS: FormField[] = [{ key: 'body', label: '내용', type: 'RICHTEXT' }]

/**
 * 결재 양식 편집 — 메타(이름·약칭·보존·보안)와 필드 스키마를 한 창에서 다룬다.
 *
 * 약칭은 문서 번호의 접두라서 한 번 정하면 그 양식으로 쓴 문서 번호 체계가 된다.
 * 수정 시 필드 스키마를 건드리면 새 버전이 발행되고, 이미 쓴 문서는 자기 버전을 계속 본다.
 */
export function ApprovalFormModal({
  open,
  form,
  categories,
  onClose,
  onSubmit,
}: ApprovalFormModalProps) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('공통')
  const [abbrev, setAbbrev] = useState('')
  const [retention, setRetention] = useState('영구')
  const [grade, setGrade] = useState('A등급')
  const [sortOrder, setSortOrder] = useState('0')
  const [fields, setFields] = useState<FormField[]>(EMPTY_FIELDS)
  const [initialJson, setInitialJson] = useState('')
  const [saving, setSaving] = useState(false)

  // 창이 열릴 때마다 대상 양식의 현재 값을 싣는다(생성·수정 겸용 창).
  useEffect(() => {
    if (!open) return
    const loaded = form ? parseFields(form.current_version?.fields) : EMPTY_FIELDS
    setName(form?.name ?? '')
    setCategory(form?.category ?? '공통')
    setAbbrev(form?.abbrev ?? '')
    setRetention(form?.retention ?? '영구')
    setGrade(form?.security_grade ?? 'A등급')
    setSortOrder(String(form?.sort_order ?? 0))
    setFields(loaded.length > 0 ? loaded : EMPTY_FIELDS)
    setInitialJson(JSON.stringify(loaded))
  }, [open, form])

  const submit = async () => {
    if (!name.trim()) {
      toast.show('양식 이름을 입력하세요.', 'warning')
      return
    }
    if (!abbrev.trim()) {
      toast.show('문서 번호 약칭을 입력하세요.', 'warning')
      return
    }
    const errors = validateSchema(fields)
    if (errors.length > 0) {
      toast.show(errors[0]!, 'warning')
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        name: name.trim(),
        category: category.trim() || '공통',
        abbrev: abbrev.trim(),
        retention: retention.trim() || '영구',
        security_grade: grade.trim() || 'A등급',
        sort_order: Number(sortOrder) || 0,
        fields,
        schemaChanged: JSON.stringify(fields) !== initialJson,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form ? '결재 양식 수정' : '결재 양식 등록'}
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="분류(대분류)"
            hint="같은 분류끼리 기안 화면에서 묶입니다. 새 이름을 적으면 새 분류가 됩니다."
          >
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="approval-form-categories"
              placeholder="지출결의서"
            />
            {/* 선택지는 살아 있는 양식이 쓰는 분류에서 파생한다 — 별도 원장이 없으므로
                빈 분류가 목록에 남지 않는다. */}
            <datalist id="approval-form-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="양식 이름" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="법인카드 지출결의서"
            />
          </Field>
          <Field
            label="문서 번호 약칭"
            required
            hint="문서 번호의 접두가 됩니다(예: 지결-260826-0001)."
          >
            <Input value={abbrev} onChange={(e) => setAbbrev(e.target.value)} placeholder="지결" />
          </Field>
          <Field label="보존 연한">
            <Input value={retention} onChange={(e) => setRetention(e.target.value)} />
          </Field>
          <Field label="보안 등급">
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
          </Field>
          <Field label="표시 순서" hint="작은 값이 먼저 놓입니다.">
            <Input
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
        </div>

        <section className="space-y-2 border-t border-gray-200 pt-4">
          <div>
            <h4 className="text-body font-semibold text-gray-900">양식 필드</h4>
            <p className="text-caption text-gray-600">
              금액은 금액 타입으로 받아야 집계됩니다. 표(TABLE) 안의 금액 열에 &lsquo;대표 금액&rsquo;을
              지정하면 그 합계가 문서 금액이 되어 재무 집계로 이어집니다.
            </p>
          </div>
          <FieldSchemaEditor fields={fields} onChange={setFields} />
        </section>
      </div>
    </Modal>
  )
}
