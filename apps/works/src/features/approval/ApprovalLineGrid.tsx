import type { ReactNode } from 'react'
import { cn } from '@ynarcher/ui'
import { ApprovalSeqBadge } from '@/features/approval/ApprovalSeqBadge'
import { InfoLabelCell, LABEL_COL_WIDTH } from '@/features/approval/ApprovalInfoTable'
import { LINE_KIND_LABEL, approvalText } from '@/features/approval/config'

/** 결재선 격자의 사람 한 칸 — 세로 3단(직급 / 도장 / 이름)으로 나뉜다. */
export interface GridPerson {
  key: string
  /** 직급·직책(없으면 빈 칸으로 남긴다). */
  title: string
  name: string
  /**
   * 자기 구분 안에서의 처리 순번. 결재·합의·재무합의 세 구분이 모두 순차로 흐르므로 셋 다
   * 붙고, 순번을 갖지 않는 자리(결재 행 맨 앞의 기안자 칸)만 비운다.
   */
  seq?: number
  /** 도장 칸 내용. 상신 전 미리보기는 null로 자리만 잡는다. */
  stamp: ReactNode
}

/**
 * 격자 폭 상수 — 결재 구역 기본 8칸, 합의 행은 합의 3 + 재무합의 라벨 1 + 재무합의 4로
 * 같은 8칸을 나눠 갖는다(레퍼런스 결재 양식과 동일). 인원이 넘치면 그만큼 늘어난다.
 */
const APPROVAL_MIN_COLS = 8
const AGREEMENT_MIN_COLS = 3
const FINANCE_MIN_COLS = 4

const CELL_BORDER = 'border border-gray-200'

/** 빈 자리의 줄 높이 유지용 NBSP — 공백뿐인 텍스트 노드는 셀 높이를 만들지 못한다. */
const NBSP = '\u00A0'

type CellPart = 'title' | 'stamp' | 'name'

/** 한 구역의 한 단을 채우는 셀들 — 사람이 없는 자리도 같은 칸으로 그려 격자를 유지한다. */
function blockCells(people: GridPerson[], cols: number, part: CellPart): ReactNode[] {
  return Array.from({ length: cols }, (_, i) => {
    const p = people[i]
    const key = p?.key ?? `empty-${i}`
    if (part === 'stamp') {
      // 도장 칸만 위아래를 넉넉히 둔다 — 도장은 글자가 아니라 찍히는 표식이라, 직급·이름 단과
      // 같은 여백으로 조이면 원이 위아래 선에 닿아 답답해진다.
      // 글자 크기 맥락도 이 칸이 세운다 — 안에 드는 도장·일시가 크기 클래스를 스스로
      // 적지 않아도 되도록(`approvalText.empty`처럼 크기 없는 단이 셀 크기를 전제한다).
      return (
        <td key={key} className={cn(CELL_BORDER, 'h-24 px-2 py-3 text-center', approvalText.body)}>
          {p?.stamp}
        </td>
      )
    }
    return (
      <td
        key={key}
        className={cn(
          CELL_BORDER,
          'px-2 py-1.5 text-center',
          // 직급 단은 라벨 칸과 같은 면색으로 눌러 이름 단과 갈라 둔다 — 둘 다 같은 크기라
          // 색만으로는 구분이 약하고, 종이 양식에서도 직급 줄은 머리글에 가깝다.
          part === 'title' ? cn(approvalText.meta, 'bg-gray-25') : approvalText.body,
        )}
      >
        {part === 'title' ? (
          p?.title || NBSP
        ) : p ? (
          <span className="inline-flex items-center justify-center gap-1.5">
            {p.seq !== undefined && <ApprovalSeqBadge seq={p.seq} />}
            {p.name}
          </span>
        ) : (
          NBSP
        )}
      </td>
    )
  })
}

interface ApprovalLineGridProps {
  approval: GridPerson[]
  agreement: GridPerson[]
  finance: GridPerson[]
  /** 참조 행 내용. undefined면 행 자체를 만들지 않는다. */
  cc?: ReactNode
  className?: string
}

/**
 * 결재선 격자 — 기안 미리보기(ApprovalLinePicker)와 완성 문서(ApprovalStampTable)가
 * 공유하는 표 골격의 단일 소유자.
 *
 * 셀 안에 div 격자를 넣지 않고 진짜 `<table>` 하나로 그리는 이유: 행마다 독립된 flex/grid를
 * 만들면 결재 행과 재무합의 행의 세로선이 같은 x좌표에 설 근거가 없다. 고정 열폭(colgroup +
 * table-fixed) 위에 라벨을 rowSpan으로 얹으면 선·폭·높이를 브라우저 표 레이아웃이 맞춘다.
 *
 * 사람 한 명 = 가로 1칸, 그 칸이 세로 3단(직급 / 도장 / 이름). 빈 자리도 같은 칸으로 그려
 * 격자가 인원수와 무관하게 늘 같은 모양으로 선다 — 결재자가 아직 한 명도 없어도 안내문으로
 * 갈아끼우지 않는다(채워질 모양 그대로가 곧 안내다). 합의 영역만 비었을 때 한 덩어리로
 * 합친다 — 재무합의만 있는 문서에서 '합의' 칸이 통째로 비어 있는 것 자체가 읽어야 할 사실이다.
 */
export function ApprovalLineGrid({
  approval,
  agreement,
  finance,
  cc,
  className,
}: ApprovalLineGridProps) {
  const hasAgreementRow = agreement.length > 0 || finance.length > 0
  const financeCols = Math.max(FINANCE_MIN_COLS, finance.length)
  const dataCols = Math.max(
    APPROVAL_MIN_COLS,
    approval.length,
    hasAgreementRow ? Math.max(AGREEMENT_MIN_COLS, agreement.length) + 1 + financeCols : 0,
  )
  const agreementCols = dataCols - 1 - financeCols

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[36rem] table-fixed border-collapse">
        {/* 라벨 열만 폭을 못 박고 데이터 열은 균등 분배 — 이 colgroup이 모든 행의 열 골격이다. */}
        <colgroup>
          <col className={LABEL_COL_WIDTH} />
          {Array.from({ length: dataCols }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <InfoLabelCell rowSpan={3}>{LINE_KIND_LABEL.APPROVAL}</InfoLabelCell>
            {blockCells(approval, dataCols, 'title')}
          </tr>
          <tr>{blockCells(approval, dataCols, 'stamp')}</tr>
          <tr>{blockCells(approval, dataCols, 'name')}</tr>

          {hasAgreementRow && (
            <>
              <tr>
                <InfoLabelCell rowSpan={3}>{LINE_KIND_LABEL.AGREEMENT}</InfoLabelCell>
                {agreement.length === 0 ? (
                  <td rowSpan={3} colSpan={agreementCols} className={CELL_BORDER} />
                ) : (
                  blockCells(agreement, agreementCols, 'title')
                )}
                <InfoLabelCell rowSpan={3}>{LINE_KIND_LABEL.FINANCE_AGREEMENT}</InfoLabelCell>
                {blockCells(finance, financeCols, 'title')}
              </tr>
              <tr>
                {agreement.length > 0 && blockCells(agreement, agreementCols, 'stamp')}
                {blockCells(finance, financeCols, 'stamp')}
              </tr>
              <tr>
                {agreement.length > 0 && blockCells(agreement, agreementCols, 'name')}
                {blockCells(finance, financeCols, 'name')}
              </tr>
            </>
          )}

          {cc !== undefined && (
            <tr>
              <InfoLabelCell>참조</InfoLabelCell>
              <td colSpan={dataCols} className={cn(CELL_BORDER, 'px-3 py-2', approvalText.body)}>
                {cc}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
