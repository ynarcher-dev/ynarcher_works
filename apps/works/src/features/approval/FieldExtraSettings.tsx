import { Field, Input } from '@ynarcher/ui'
import { RichTextEditor } from '@/components/RichTextEditor'
import { FieldColumnRows } from '@/features/approval/FieldColumnRows'
import type { FormField } from '@/features/approval/fields'

/** 쉼표로 이어진 한 줄을 목록으로 — 빈 칸은 버린다. */
const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * 이 필드가 한 줄에 담기지 않는가 — `ItemRows`의 아래 상자를 세울지 여기서 답한다.
 *
 * 판정을 상자 바깥에 두는 이유는 **담을 것이 없는 줄에는 상자가 서지 않아야** 하기 때문이다.
 * 컴포넌트가 스스로 `null`을 내보내도 요소 자체는 있는 값이라 빈 테두리가 남는다.
 */
export function hasFieldExtras(field: FormField): boolean {
  return (
    field.type === 'SELECT' ||
    field.type === 'RICHTEXT' ||
    field.type === 'TABLE' ||
    field.type === 'BUDGET_TREE'
  )
}

/**
 * 필드 한 줄 아래에 서는 설정 — 한 줄에 담기지 않는 것들만 온다.
 *
 * 선택지·기본 문구·층 이름은 값 하나지만 길이를 모르는 값이고, 열 정의는 목록이라 줄 안에
 * 들어갈 수 없다. 라벨은 `Field`가 소유한다(화면이 규격 클래스를 직접 쓰지 않는다).
 */
export function FieldExtraSettings({
  field,
  onChange,
}: {
  field: FormField
  onChange: (next: FormField) => void
}) {
  return (
    <div className="space-y-3">
      {field.type === 'SELECT' && (
        <Field label="선택지" hint="쉼표로 구분합니다. 적은 차례대로 목록에 섭니다.">
          <Input
            placeholder="법인카드, 개인카드, 현금"
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onChange({ ...field, options: splitList(e.target.value) })}
          />
        </Field>
      )}

      {/* 본문 기본 문구 — 새 문서가 들고 시작하는 틀(`1. 행사명 : …`).
          옛 결재에서 담당자가 매번 손으로 적던 뼈대라, 양식이 한 번 갖고 있으면 된다. */}
      {field.type === 'RICHTEXT' && (
        <Field label="기본 문구" hint="새 문서가 이 내용으로 시작합니다. 비워 두면 빈 본문입니다.">
          <RichTextEditor
            placeholder="새 문서의 기본 내용을 입력하세요."
            value={field.defaultValue ?? ''}
            onChange={(html) => onChange({ ...field, defaultValue: html })}
          />
        </Field>
      )}

      {/* 층 이름은 **기본값**만 양식이 갖는다 — 사업마다 층 이름과 층 수가 달라
          (대분류·중분류 / 세목·비목·세세목) 못 박으면 그 목록에 없는 사업은 예산을
          적을 수 없다. 문서를 쓰면서 고칠 수 있고, 최종 값은 문서가 갖는다. */}
      {field.type === 'BUDGET_TREE' && (
        <Field
          label="층 이름 기본값"
          hint="쉼표로 구분하며 위에서 아래 순서입니다. 문서를 쓰면서 사업에 맞게 고칠 수 있습니다."
        >
          <Input
            placeholder="세목, 비목, 세세목"
            value={(field.levels ?? []).join(', ')}
            onChange={(e) => onChange({ ...field, levels: splitList(e.target.value) })}
          />
        </Field>
      )}

      {(field.type === 'TABLE' || field.type === 'BUDGET_TREE') && (
        <FieldColumnRows
          title={field.type === 'BUDGET_TREE' ? '예산표의 숫자 열' : '표의 열'}
          columns={field.columns ?? []}
          onChange={(columns) => onChange({ ...field, columns })}
        />
      )}
    </div>
  )
}
