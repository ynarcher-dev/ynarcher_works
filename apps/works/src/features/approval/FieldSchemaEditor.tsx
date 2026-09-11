import { Checkbox, IconButton, Input, Select, cardText, cn } from '@ynarcher/ui'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { ItemRows, type ItemCol } from '@/components/ItemRows'
import { FieldExtraSettings, hasFieldExtras } from '@/features/approval/FieldExtraSettings'
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  canBePrimaryAmount,
  nextKey,
  withFieldType,
  type FieldType,
  type FormField,
} from '@/features/approval/fields'

interface FieldSchemaEditorProps {
  fields: FormField[]
  onChange: (fields: FormField[]) => void
}

/**
 * 필드 한 줄의 칸들 — **라벨은 머리글에 한 번, 필드는 한 줄**(`ItemRows`).
 *
 * 종전에는 필드마다 테두리 상자를 세우고 그 안에 라벨 없는 칸들을 늘어놓았다. 상자 안에서
 * 칸들이 줄을 바꿔 접히면 이름 한 줄·나머지 한 줄이 되었고, 어느 칸이 무엇인지는 자리로만
 * 짐작해야 했다(`Input`은 껍데기가 `w-full`이라 줄을 통째로 가져간다).
 *
 * 종류 열이 `pick`(고정 선택지)이 아니라 `code` 폭인 것은 가장 긴 이름('서식 있는 본문')이
 * `pick`에 담기지 않아서다 — **폭은 고를 수 있는 값의 수가 아니라 담기는 글자가 정한다.**
 */
const FIELD_COLS: ItemCol[] = [
  { label: '필드 이름' },
  { label: '종류', kind: 'code' },
  { label: '필수', kind: 'flag' },
  { label: '대표 금액', kind: 'flag' },
  { label: '저장 키', kind: 'name' },
]

/**
 * 양식 필드 조립기 — ADMIN이 양식을 스스로 만들 때 쓰는 편집기.
 *
 * 여기서 만드는 것은 HTML이 아니라 **필드 정의 목록**이다. 금액을 금액 타입으로 받아 두면
 * 그 값은 나중에 표로 집계되고, 표(TABLE) 안의 금액 열에 '대표 금액'을 표시하면 그 합계가
 * 문서 금액이 되어 재무 집계로 흘러간다.
 */
export function FieldSchemaEditor({ fields, onChange }: FieldSchemaEditorProps) {
  const setField = (index: number, next: FormField) =>
    onChange(fields.map((f, i) => (i === index ? next : f)))

  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index))

  /** 줄을 위아래로 옮긴다 — 이 차례가 곧 문서에 서는 차례다. */
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }

  return (
    <ItemRows
      cols={FIELD_COLS}
      rows={fields}
      rowKey={(f) => f.key}
      onRemove={removeField}
      onAdd={() =>
        onChange([
          ...fields,
          { key: nextKey('field', fields.map((f) => f.key)), label: '', type: 'TEXT' },
        ])
      }
      addLabel="필드 추가"
      // 아이콘 버튼 셋(28px)이 서는 폭. 거두는 일 하나뿐인 목록의 기본 폭으로는 좁다.
      actionWidth={6}
      actions={(_field, i) => (
        <>
          <IconButton
            variant="ghost"
            label="위로"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            icon={<ArrowUp size={16} />}
          />
          <IconButton
            variant="ghost"
            label="아래로"
            onClick={() => move(i, 1)}
            disabled={i === fields.length - 1}
            icon={<ArrowDown size={16} />}
          />
          <IconButton
            variant="ghost"
            danger
            label="필드 삭제"
            onClick={() => removeField(i)}
            icon={<Trash2 size={16} />}
          />
        </>
      )}
      // 한 줄에 담기지 않는 설정(선택지·기본 문구·열 정의)만 그 줄 아래에 선다.
      body={(field, i) =>
        hasFieldExtras(field) ? (
          <FieldExtraSettings field={field} onChange={(next) => setField(i, next)} />
        ) : null
      }
    >
      {(field, i) => (
        <>
          <Input
            placeholder="필드 이름(라벨)"
            value={field.label}
            onChange={(e) => setField(i, { ...field, label: e.target.value })}
          />
          <Select
            value={field.type}
            onChange={(e) => setField(i, withFieldType(field, e.target.value as FieldType))}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Checkbox
            aria-label="필수 입력"
            checked={field.required ?? false}
            onChange={(e) => setField(i, { ...field, required: e.target.checked })}
          />
          {canBePrimaryAmount(field.type) ? (
            <Checkbox
              aria-label="대표 금액"
              title="이 값이 문서 금액이 되어 재무 집계로 이어집니다."
              checked={field.primaryAmount ?? false}
              onChange={(e) => setField(i, { ...field, primaryAmount: e.target.checked })}
            />
          ) : (
            // 금액·숫자가 아닌 필드에는 고를 것이 없다. 빈 칸으로 두어 열이 어긋나지 않게 한다.
            <span aria-hidden />
          )}
          {/* 키는 고칠 수 없다 — 값이 저장되는 자리라, 바뀌면 이미 쌓인 문서의 값이 갈 곳을 잃는다. */}
          <span className={cn('truncate', cardText.meta)} title={field.key}>
            {field.key}
          </span>
        </>
      )}
    </ItemRows>
  )
}
