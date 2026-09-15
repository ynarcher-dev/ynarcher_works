import { EmptyValue, cn, tableGrid, tableText } from '@ynarcher/ui'
import { RichTextViewer } from '@/components/RichTextEditor'
import { BudgetTreeView, type BudgetUsage } from '@/features/approval/BudgetTreeView'
import {
  HtmlTemplateField,
  type HtmlTemplateContext,
} from '@/features/approval/HtmlTemplateField'
import { BudgetRefText, PartnerRefText } from '@/features/approval/RefCellText'
import {
  amountKeys,
  budgetValue,
  columnSum,
  displayValue,
  formatMoney,
  hasColumnValue,
  hasRichTextContent,
  htmlTemplateValue,
  isEmptyPlan,
  planValue,
  isNumericColumn,
  scalarValue,
  sourceColumnKeys,
  tableRows,
  toNumber,
  visibleColumns,
  type FieldValues,
  type FormField,
  type TableRow,
} from '@/features/approval/fields'
import { partnerSourceText } from '@/features/approval/partnerSnapshot'
import { vatKindLabel } from '@/features/approval/vat'

interface ApprovalFieldsViewProps {
  fields: FormField[]
  values: FieldValues
  /** 복원 문서처럼 일부 양식 필드가 문서마다 달라질 때 값이 없는 선택 필드는 감춘다. */
  hideEmpty?: boolean
  /** 카드 제목이 필드 이름을 대신할 때 내부 섹션 제목을 반복하지 않는다. */
  hideSectionLabels?: boolean
  /**
   * 예산표에 함께 세울 사용 현황(줄 id → 사용·결재 중).
   * 넘기지 않으면 예산만 보이는 표가 된다 — 기안 미리보기처럼 아직 지출이 있을 수 없는
   * 자리에서 빈 '사용' 열을 세우면 그 열이 아무 말도 하지 않는다.
   */
  budgetUsage?: Map<string, BudgetUsage>
  documentContext?: HtmlTemplateContext
  /**
   * 짝이 되는 표와 합계액이 **맞는가**(지출 내역 ↔ 송금 요청). `null`이면 견주지 않는다.
   *
   * 표 하나만 받는 호출(상세 화면의 지출 카드)에서만 뜻이 있다. 판정은 이 화면이 아니라
   * `expenseTotalsAgree`가 갖는다 — 쓰는 화면과 읽는 화면이 같은 문장으로 답해야 한다.
   */
  totalsMatch?: boolean | null
}

/** 표 필드 하나를 읽기 전용으로 편다. 금액·숫자 열에는 합계 행이 붙는다. */
function TableView({
  field,
  values,
  /**
   * 보이는 제목(`<h4>`)이 카드 제목으로 옮겨 갔는가. 그렇다면 표가 자기 이름을 들어야 한다 —
   * 보이지 않는 `<caption>`이 그 자리를 받는다(입력 쪽 `FieldTableInput`의 `caption`과 짝).
   */
  captionOnly,
  totalsMatch = null,
}: {
  field: FormField
  values: FieldValues
  captionOnly?: boolean
  totalsMatch?: boolean | null
}) {
  const allColumns = field.columns ?? []
  // 이름 사본은 열로 서지 않는다 — 그 값은 거래처 칸이 직접 든다(fields.visibleColumns).
  const columns = visibleColumns(allColumns)
  const rows = tableRows(values, field.key)
  const hasNumeric = columns.some((c) => isNumericColumn(c.type))
  // 색이 붙는 칸은 합계액 한 열이다(입력 쪽 `FieldTableInput`과 같은 규칙).
  const grossKey = amountKeys(field)?.grossKey ?? null
  /** 거래처 칸이 든 이름 사본. 사본 열이 없는 옛 양식에서는 빈 값이고, 그때는 원장이 답한다. */
  const snapshotName = (refKey: string, row: TableRow) => {
    const nameKey = sourceColumnKeys(allColumns, refKey).NAME
    return nameKey ? (row[nameKey] ?? '') : ''
  }

  if (rows.length === 0) {
    return <p className={cn('py-2', tableText.empty)}>입력된 내역이 없습니다.</p>
  }

  return (
    // 밀도 맥락을 내려받지 못하는 수제 표라 격자를 `tableGrid`에서 가져온다 — 입력 쪽
    // `FieldTableInput`과 같은 값을 써야 같은 문서의 편집 화면과 읽기 화면이 어긋나지 않는다.
    <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-300">
      <table className="w-full border-collapse">
        {captionOnly && field.label && <caption className="sr-only">{field.label}</caption>}
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn(tableGrid.row, 'border-b border-gray-200 last:border-b-0')}>
              {columns.map((c) => {
                const raw = row[c.key] ?? ''
                const numeric = isNumericColumn(c.type)
                const n = numeric ? toNumber(raw) : null
                return (
                  <td
                    key={c.key}
                    className={cn(
                      tableGrid.cellX,
                      tableText.body,
                      numeric && 'text-right tabular-nums',
                    )}
                  >
                    {c.source ? (
                      // 값의 주인이 다른 칸인 열 — 저장된 사본을 그대로 편다(이름표만 붙인다).
                      (partnerSourceText(c.source.field, raw) || <EmptyValue />)
                    ) : c.type === 'BUDGET_REF' ? (
                      <BudgetRefText value={raw} />
                    ) : c.type === 'PARTNER_REF' ? (
                      <PartnerRefText value={raw} snapshotName={snapshotName(c.key, row)} />
                    ) : c.type === 'VAT_KIND' ? (
                      // 저장된 값은 코드(TAXABLE)다. 모르는 값은 '과세'로 되돌리지 않고 '-'로 둔다.
                      (vatKindLabel(raw) ?? <EmptyValue />)
                    ) : numeric && n !== null ? (
                      c.type === 'MONEY' ? (
                        formatMoney(n)
                      ) : (
                        n.toLocaleString('ko-KR')
                      )
                    ) : (
                      raw || <EmptyValue />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          {hasNumeric && (
            <tr className={cn(tableGrid.row, 'border-t border-gray-200 bg-gray-25')}>
              {columns.map((c, i) => {
                const numeric = isNumericColumn(c.type)
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
                      ? // 입력 화면과 같이 빈 열은 값 없음(-), 명시적인 0은 실제 0으로 가른다.
                        !hasColumnValue(rows, c.key)
                        ? <EmptyValue />
                        : c.type === 'MONEY'
                          ? formatMoney(columnSum(rows, c.key))
                          : columnSum(rows, c.key).toLocaleString('ko-KR')
                      : i === 0
                        ? '합계'
                        : ''}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 문서 본문 — 스키마와 값을 받아 라벨:값으로 편다.
 *
 * 하이웍스가 HTML로 그리던 문서 표와 같은 모양이되, 그리는 근거가 저장된 마크업이 아니라
 * 양식 스키마다. 표는 자기 격자를 갖고, 서식 있는 본문(RICHTEXT)만 라벨 없이 통으로 흐른다 —
 * 서술형 본문에 좁은 값 칸을 씌우면 문장이 반 폭으로 잘린다.
 */
export function ApprovalFieldsView({
  fields,
  values,
  hideEmpty = false,
  hideSectionLabels = false,
  budgetUsage,
  documentContext = { title: '', docNo: null },
  totalsMatch = null,
}: ApprovalFieldsViewProps) {
  if (fields.length === 0) {
    return <p className={cn('py-4', tableText.empty)}>표시할 내용이 없습니다.</p>
  }

  return (
    <div className="space-y-4">
      {fields.filter((field) => {
        if (!hideEmpty || field.required) return true
        if (field.type === 'TABLE') {
          return tableRows(values, field.key).some((row) =>
            Object.values(row).some((value) => value.trim() !== ''),
          )
        }
        if (field.type === 'BUDGET_TREE') {
          return budgetValue(values, field.key).rows.some((r) => r.name.trim() !== '')
        }
        if (field.type === 'HTML_TEMPLATE') {
          return hasRichTextContent(htmlTemplateValue(values, field.key).html)
        }
        if (field.type === 'PROFIT_PLAN') {
          return !isEmptyPlan(planValue(values, field.key))
        }
        const value = scalarValue(values, field.key)
        return field.type === 'RICHTEXT' ? hasRichTextContent(value) : value.trim() !== ''
      }).map((field) => {
        if (field.type === 'HTML_TEMPLATE') {
          return (
            <HtmlTemplateField
              key={field.key}
              assets={field.htmlAssets}
              context={documentContext}
              value={htmlTemplateValue(values, field.key)}
            />
          )
        }

        if (field.type === 'RICHTEXT') {
          const html = scalarValue(values, field.key)
          return (
            <section key={field.key} className="space-y-1">
              {!hideSectionLabels && <h4 className={tableText.head}>{field.label}</h4>}
              {html.replace(/<[^>]*>/g, '').trim() ? (
                <RichTextViewer html={html} />
              ) : (
                <p className={tableText.empty}>내용이 없습니다.</p>
              )}
            </section>
          )
        }

        if (field.type === 'BUDGET_TREE') {
          return (
            <section key={field.key} className="space-y-1">
              {!hideSectionLabels && <h4 className={tableText.head}>{field.label}</h4>}
              <BudgetTreeView
                field={field}
                value={budgetValue(values, field.key)}
                usage={budgetUsage}
              />
            </section>
          )
        }

        if (field.type === 'TABLE') {
          return (
            <section key={field.key} className="space-y-1">
              {!hideSectionLabels && <h4 className={tableText.head}>{field.label}</h4>}
              <TableView
                field={field}
                values={values}
                captionOnly={hideSectionLabels}
                totalsMatch={totalsMatch}
              />
            </section>
          )
        }

        // 스칼라는 라벨:값 한 줄. 여러 줄 글은 줄바꿈을 살린다.
        return (
          <div
            key={field.key}
            className="grid grid-cols-[8rem_1fr] items-start gap-3 border-b border-gray-200 pb-2 last:border-b-0"
          >
            <span className={tableText.head}>{field.label}</span>
            <span
              className={cn(
                tableText.body,
                field.type === 'TEXTAREA' && 'whitespace-pre-wrap',
                (field.type === 'MONEY' || field.type === 'NUMBER') && 'tabular-nums',
              )}
            >
              {displayValue(field, values)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
