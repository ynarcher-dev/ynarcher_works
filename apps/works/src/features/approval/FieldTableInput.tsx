import { Button, EmptyValue, IconButton, Input, Select, cn, tableGrid, tableText } from '@ynarcher/ui'
import { Plus, Trash2 } from 'lucide-react'
import { BudgetRefCell } from '@/features/approval/BudgetRefCell'
import { ACTION_COLUMN_REM, columnWidthRem } from '@/features/approval/columnWidth'
import { PartnerRefCell } from '@/features/approval/PartnerRefCell'
import {
  amountKeys,
  columnSum,
  emptyRow,
  formatMoney,
  hasColumnValue,
  hasVatColumns,
  isNumericColumn,
  sourceColumnKeys,
  visibleColumns,
  type FormColumn,
  type FormField,
  type TableRow,
} from '@/features/approval/fields'
import {
  partnerSnapshotPatch,
  partnerSourceText,
  type PartnerSnapshot,
} from '@/features/approval/partnerSnapshot'
import {
  VAT_KINDS,
  VAT_KIND_LABEL,
  applyAmountEdit,
  readAmounts,
  validateAmounts,
} from '@/features/approval/vat'

interface FieldTableInputProps {
  field: FormField
  rows: TableRow[]
  onChange: (rows: TableRow[]) => void
  /**
   * 화면에 보이지 않는 표 이름(`<caption class="sr-only">`).
   *
   * 라벨이 카드 제목으로 옮겨 간 자리에서만 넘긴다 — 그때 `Field`가 주던 접근명이 사라지므로,
   * 표가 자기 이름을 스스로 들어야 화면 낭독이 "표, 3열"에서 멈추지 않는다. 라벨이 표 바로
   * 위에 그대로 있는 자리에서는 넘기지 않는다(같은 이름이 두 번 읽힌다).
   */
  caption?: string
  /**
   * 짝이 되는 표와 합계액이 **맞는가**(지출 내역 ↔ 송금 요청). `null`이면 견주지 않는다.
   *
   * 판정을 표가 스스로 하지 못하는 이유는 이 부품이 표 **하나**만 알기 때문이다. 둘을 함께 보는
   * 자리는 그 둘을 카드로 세우는 화면이고, 판정 규칙은 `expenseTotalsAgree`가 혼자 갖는다.
   */
  totalsMatch?: boolean | null
}

/**
 * 값의 주인이 다른 칸인 열 — **읽기만 한다.**
 *
 * 비활성 입력 상자를 세우지 않는 이유는 그것이 "지금은 못 적지만 언젠가 적는 칸"으로 읽히기
 * 때문이다. 이 칸은 조건이 풀리면 열리는 칸이 아니라 애초에 적는 자리가 아니다 — 거래처를
 * 바꾸는 것 말고는 바뀔 길이 없고, 그 조작은 왼쪽 거래처 칸이 이미 들고 있다. 그래서 상자를
 * 지우고 값만 남긴다(빈 상자 대신 빈 값 표기가 서므로 미입력도 그대로 보인다).
 */
function DerivedCell({ column, value }: { column: FormColumn; value: string }) {
  const source = column.source
  const text = source ? partnerSourceText(source.field, value) : value.trim()
  if (!text) return <EmptyValue />
  return (
    <span className={cn('block truncate text-gray-700', tableText.body)} title={text}>
      {text}
    </span>
  )
}

/** 열 종류에 맞는 입력 한 칸. 숫자·금액은 자릿수를 견주도록 우측 정렬한다. */
function CellInput({
  column,
  columns,
  row,
  value,
  onChange,
  onPatch,
  onPatchMany,
}: {
  column: FormColumn
  /** 표의 **모든** 열(화면에 서지 않는 사본 열 포함) — 파생 칸의 자리를 여기서 찾는다. */
  columns: FormColumn[]
  row: TableRow
  value: string
  onChange: (v: string) => void
  /** 한 조작이 같은 줄의 여러 칸을 바꿀 때(거래처 선택·해제). */
  onPatch: (patch: TableRow) => void
  /**
   * 한 조작이 **여러 줄**을 만들 때(예산 줄·거래처를 한 번에 여럿 고르기).
   *
   * 첫 묶음은 이 줄에 들어가고 나머지는 바로 아래 새 줄이 된다 — 고른 것이 어느 줄에서 시작한
   * 선택인지 표에서 그대로 읽힌다.
   */
  onPatchMany: (patches: TableRow[]) => void
}) {
  // 값의 주인이 다른 칸이면 고치는 자리가 아니다 — 종류(TEXT)보다 출처가 먼저다.
  if (column.source) {
    return <DerivedCell column={column} value={value} />
  }
  // 다른 원장의 행을 가리키는 칸은 글자를 적는 자리가 아니라 **고르는 자리**다.
  // 자기 부품이 자기 선택 창을 갖는다(표는 어느 원장인지 알 필요가 없다).
  if (column.type === 'BUDGET_REF') {
    return (
      <BudgetRefCell
        label={column.label}
        value={value}
        onChange={onChange}
        onPickMany={(ids) => onPatchMany(ids.map((id) => ({ [column.key]: id })))}
      />
    )
  }
  if (column.type === 'PARTNER_REF') {
    const nameKey = sourceColumnKeys(columns, column.key).NAME
    return (
      <PartnerRefCell
        label={column.label}
        value={value}
        // 이름은 문서가 든 사본이 먼저 답한다. 사본 열이 없는 옛 양식에서만 원장이 답한다.
        snapshotName={nameKey ? (row[nameKey] ?? '') : ''}
        onPick={(snapshot: PartnerSnapshot | null) =>
          onPatch(partnerSnapshotPatch(columns, column.key, snapshot))
        }
        onPickMany={(snapshots) =>
          onPatchMany(snapshots.map((s) => partnerSnapshotPatch(columns, column.key, s)))
        }
      />
    )
  }
  if (column.type === 'SELECT' || column.type === 'VAT_KIND') {
    // 과세 유형의 선택지는 양식이 아니라 vat.ts가 갖는다 — 양식마다 적어 넣게 두면
    // '면세'와 '면세(0%)'가 섞여 부가세 신고 자료를 다시 만들 수 없다.
    const options =
      column.type === 'VAT_KIND'
        ? VAT_KINDS.map((k) => ({ value: k, label: VAT_KIND_LABEL[k] }))
        : (column.options ?? []).map((o) => ({ value: o, label: o }))
    return (
      <Select
        density="table"
        // 표 머리글이 이름을 들고 있지만 칸 자체는 이름이 없다 — 한 줄에 같은 종류의 칸이
        // 여럿이면 낭독이 "선택 상자"만 반복한다.
        aria-label={column.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <Input
      density="table"
      aria-label={column.label}
      type={column.type === 'DATE' ? 'date' : 'text'}
      inputMode={isNumericColumn(column.type) ? 'numeric' : undefined}
      className={cn(
        isNumericColumn(column.type) && 'text-right tabular-nums',
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * 표 필드 입력 — 이 부품이 전자결재를 다시 만든 이유다.
 *
 * 지출 내역을 리치텍스트 표에 적으면 금액이 문자열 속 글자로만 남아, 나중에 합계를 내려면
 * 사람이 문서를 열어 옮겨 적어야 한다. 열마다 종류(type)를 갖는 표로 받으면 금액 열의 합계를
 * 입력 중에 바로 보여줄 수 있고, 저장된 값도 그대로 집계된다.
 *
 * 합계 행은 금액·숫자 열에만 붙는다(항목명 열의 합계는 뜻이 없다).
 *
 * 격자(행 높이·셀 좌우 여백)는 카드 안 표의 값을 따른다 — 셀 여백 `px-2.5`는 셀 안 컨트롤의
 * 좌우 여백과 같은 값이라야 머리글과 값이 한 세로선에 선다(5_component_spec_rules §3.1).
 */
export function FieldTableInput({
  field,
  rows,
  onChange,
  caption,
  totalsMatch = null,
}: FieldTableInputProps) {
  const allColumns = field.columns ?? []
  // 사본 열 중 이름 칸은 거래처 칸이 직접 들므로 화면에 서지 않는다(fields.visibleColumns).
  const columns = visibleColumns(allColumns)
  const numericColumns = columns.filter((c) => isNumericColumn(c.type))
  const keys = amountKeys(field)
  const vatRows = hasVatColumns(field)

  // 한 칸을 고치면 같은 줄의 나머지 금액 칸이 따라간다. 규칙은 vat.ts 한 곳에만 있고
  // 예산표 입력도 같은 함수를 쓴다.
  const setCell = (index: number, key: string, value: string) =>
    onChange(
      rows.map((r, i) => {
        if (i !== index) return r
        const next = { ...r, [key]: value }
        return keys ? applyAmountEdit(next, keys, key) : next
      }),
    )

  /**
   * 한 조작이 같은 줄의 여러 칸을 바꾼다 — 거래처를 고르면 이름·구분·은행·계좌·예금주가 함께
   * 채워지고, 해제하면 함께 비워진다. **금액 규칙을 태우지 않는다**: 이 묶음에 금액 칸이 들지
   * 않으므로(사본은 전부 글자 칸) 부가세 재계산을 부를 이유가 없고, 부르면 사람이 적어 둔
   * 송금액이 거래처를 바꿨다는 이유로 다시 계산된다.
   */
  const patchRow = (index: number, patch: TableRow) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  /**
   * 한 번에 고른 여럿을 줄로 편다 — **첫 묶음은 이 줄에 덮어쓰고 나머지는 바로 아래에 끼운다.**
   *
   * 맨 아래에 붙이지 않는 이유는 고른 순서와 표의 순서가 갈리기 때문이다. 세 번째 줄에서 창을
   * 열어 다섯을 고르면 그중 하나만 세 번째 줄에 들어가고 넷은 표 끝으로 떨어져, 무엇이 이번에
   * 들어온 값인지 눈으로 따라갈 수 없다.
   *
   * 새 줄은 **고른 값만** 든다(`emptyRow`). 금액·날짜는 줄마다 다른 값이라 복사할 것이 없고,
   * 복사하면 지우는 일이 적는 일보다 많아진다. 금액 규칙(`applyAmountEdit`)도 태우지 않는다 —
   * 이 묶음에 금액 칸이 들지 않으므로 다시 계산할 것이 없다.
   */
  const patchRows = (index: number, patches: TableRow[]) => {
    const [first, ...rest] = patches
    if (!first) return
    const next = rows.map((r, i) => (i === index ? { ...r, ...first } : r))
    next.splice(index + 1, 0, ...rest.map((patch) => ({ ...emptyRow(field), ...patch })))
    onChange(next)
  }

  // 상신 전에 서버가 같은 규칙으로 다시 본다(app.assert_approval_amounts). 여기서 먼저
  // 보이는 이유는 되돌아오는 오류보다 적는 자리에서 알려 주는 편이 낫기 때문이다.
  const issues = !keys || !vatRows
    ? []
    : rows
        .map((r, i) => {
          const amounts = readAmounts(r, keys)
          const message = validateAmounts(amounts, amounts.kind, true)
          return message ? `${i + 1}행: ${message}` : null
        })
        .filter((m): m is string => m !== null)

  // 색이 붙는 칸은 **합계액 한 열**이다 — 공급가액·부가세·수량까지 물들면 무엇이 어긋났다는
  // 말인지 흐려진다(짝이 되는 표와 견주는 값도 그 열 하나다).
  const grossKey = amountKeys(field)?.grossKey ?? null

  const addRow = () => onChange([...rows, emptyRow(field)])
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))

  return (
    <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-300">
      {/* `table-fixed` — 폭은 열 종류가 정하고 내용이 밀지 않는다(columnWidth.ts). 자동
          배치에서는 입력 상자의 기본 너비가 기준이 되어, 여덟 자리면 끝나는 금액 칸과 날짜
          칸이 표의 절반을 가져간다. */}
      <table className="w-full min-w-[32rem] table-fixed border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <colgroup>
          {columns.map((c) => {
            const rem = columnWidthRem(c)
            return <col key={c.key} style={rem === null ? undefined : { width: `${rem}rem` }} />
          })}
          <col style={{ width: `${ACTION_COLUMN_REM}rem` }} />
        </colgroup>
        <thead>
          <tr className={cn(tableGrid.head, 'border-b border-gray-200 bg-gray-25')}>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  tableGrid.cellX,
                  'text-left',
                  tableText.head,
                  isNumericColumn(c.type) && 'text-right',
                )}
              >
                {c.label}
              </th>
            ))}
            {/* 행 삭제 열: 값이 아니라 조작이 놓이는 자리라 가운데. 폭은 colgroup이 준다. */}
            <th className={cn('text-center', tableGrid.cellX, tableText.head)}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={cn(tableGrid.row, 'border-b border-gray-200 last:border-b-0')}
            >
              {columns.map((c) => (
                <td key={c.key} className={tableGrid.cellX}>
                  <CellInput
                    column={c}
                    columns={allColumns}
                    row={row}
                    value={row[c.key] ?? ''}
                    onChange={(v) => setCell(index, c.key, v)}
                    onPatch={(patch) => patchRow(index, patch)}
                    onPatchMany={(patches) => patchRows(index, patches)}
                  />
                </td>
              ))}
              {/* `IconButton`은 `grid`(블록 레벨)라 `text-center`가 닿지 않는다 — 감싸는
                  칸이 가운데로 세워야 머리글(삭제)과 한 세로선에 선다. */}
              <td className={cn(tableGrid.cellX)}>
                <span className="flex items-center justify-center">
                  <IconButton
                    density="table"
                    variant="ghost"
                    danger
                    label="행 삭제"
                    onClick={() => removeRow(index)}
                    // 마지막 한 행은 남긴다 — 표가 통째로 사라지면 무엇을 적는 자리였는지 알 수 없다.
                    disabled={rows.length <= 1}
                    icon={<Trash2 size={14} />}
                  />
                </span>
              </td>
            </tr>
          ))}

          {numericColumns.length > 0 && (
            <tr className={cn(tableGrid.row, 'border-t border-gray-200 bg-gray-25')}>
              {columns.map((c, i) => {
                const numeric = isNumericColumn(c.type)
                const sum = numeric ? columnSum(rows, c.key) : null
                const compared = totalsMatch !== null && c.key === grossKey
                return (
                  <td
                    key={c.key}
                    className={cn(
                      tableGrid.cellX,
                      tableText.body,
                      numeric ? 'text-right font-semibold tabular-nums' : 'text-gray-600',
                      compared && (totalsMatch ? 'text-success' : 'text-danger'),
                    )}
                    // 색만으로 말하지 않는다 — 색을 가리지 못하는 눈에도 같은 사실이 닿아야 한다.
                    title={
                      compared
                        ? totalsMatch
                          ? '지출 내역과 송금 요청의 합계가 같습니다.'
                          : '지출 내역과 송금 요청의 합계가 다릅니다.'
                        : undefined
                    }
                  >
                    {numeric
                      ? // 빈 열과 명시적으로 0을 적은 열은 다르다. 전자는 값 없음(-), 후자는
                        // 실제 합계 0(금액이면 0원)으로 보여 준다.
                        !hasColumnValue(rows, c.key)
                        ? <EmptyValue />
                        : c.type === 'MONEY'
                          ? formatMoney(sum)
                          : sum?.toLocaleString('ko-KR')
                      : i === 0
                        ? '합계'
                        : ''}
                  </td>
                )
              })}
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {issues.length > 0 && (
        <ul className={cn('border-t border-gray-200 px-3 py-2 text-danger', tableText.body)}>
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div className="border-t border-gray-200 p-2">
        <Button variant="ghost" density="table" onClick={addRow}>
          <Plus size={14} className="mr-1" />행 추가
        </Button>
      </div>
    </div>
  )
}
