import {
  EmptyValue,
  InfoField,
  InfoGrid,
  PanelCard,
  StatStrip,
  cardText,
  type Column,
} from '@ynarcher/ui'
import {
  financialSummary,
  type QrProduct,
  type QrShareholder,
  type QuickReview,
  type QrFinancialSummary,
} from '@/features/mna/parties/quickReview'
import { fiscalYearLabel } from '@/features/mna/parties/quickReviewMetrics'
import { useQuickReviewImageUrls } from '@/features/mna/parties/quickReviewImages'
import {
  Million,
  QrBlock,
  QrBullets,
  QrImages,
  QrLede,
  QrNote,
  QrSubTable,
} from '@/features/mna/parties/MaQuickReviewParts'

/**
 * 퀵 리뷰의 앞 세 절 — 주요내용(요약 포함) · 회사 소개 · 제품·서비스.
 *
 * 뒤 세 절(재무·Valuation·투자 포인트)과 파일을 가른 기준은 화면의 자리가 아니라 **읽는
 * 방식**이다. 앞은 서술이라 문장으로 읽고, 뒤는 표라 숫자를 세로로 견준다. 한 파일에 두면
 * 표의 규격을 손볼 때마다 서술의 조판이 함께 흔들린다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/**
 * 요약재무 — **재무 절의 가장 최근 회계연도를 되읽은 값**이다.
 *
 * 여기에 따로 저장된 숫자가 없다는 것이 요점이다. 문서가 이 자리에 자산·부채·자본·매출을
 * 인쇄하지만 그것은 뒤 표의 마지막 열과 같은 숫자이고, 두 곳에 적으면 한쪽만 고쳐 어긋난다.
 *
 * 한 줄로 이어 붙이지 않고 **표로 세운다**(2026-09-08). 여섯 항목을 `자산 18,763 · 부채 9,102 …`로
 * 잇던 동안 숫자들이 문장처럼 읽혀 자릿수를 견줄 수 없었고, 라벨 축(`InfoRows`)에 얹으니 기준
 * 연도와 단위를 적을 자리가 6rem 라벨 칸밖에 없어 라벨이 접혔다. 표가 되면 연도·단위는 소제목
 * 옆 단서 한 자리가 받는다.
 */
interface QrSummaryFinanceRow {
  label: string
  value: number
}

function summaryFinanceRows(s: QrFinancialSummary): QrSummaryFinanceRow[] {
  const parts: Array<[string, number | null]> = [
    ['자산', s.assets],
    ['부채', s.liabilities],
    ['자본', s.equity],
    ['매출', s.revenue],
    ['EBITDA', s.ebitda],
    ['조정 EBITDA', s.adjustedEbitda],
  ]
  // 없는 항목은 행을 만들지 않는다 — 하이픈만 남은 행은 '재지 않았다'가 아니라 '0에 가깝다'로 읽힌다.
  return parts
    .filter((p): p is [string, number] => p[1] != null)
    .map(([label, value]) => ({ label, value }))
}

/**
 * 요약재무는 **항목이 열, 값이 한 행**이다(2026-09-08 사용자 지정).
 *
 * 항목을 행으로 세우면 여섯 줄짜리 표가 카드의 절반을 먹는데, 이 표가 담는 것은 한 해뿐이라
 * 세로로 견줄 것이 없다 — 세로 축은 비교할 것이 있을 때만 값을 한다. 뒤의 재무 요약 카드가
 * 연도를 열로 세워 여러 해를 견주는 것과 갈리는 지점이 그것이다.
 */
interface QrSummaryFinanceLine {
  key: string
  year: string
}

function summaryFinanceColumns(
  items: QrSummaryFinanceRow[],
): Column<QrSummaryFinanceLine>[] {
  return [
    {
      // 1열은 이 한 줄이 **언제의 숫자인가**를 답한다. 값만 늘어서면 표가 어느 해를 세운
      // 것인지 자기 안에서 답하지 못하고, 뒤 재무 요약 표들도 1열이 행을 식별하는 자리라
      // 같은 규격으로 선다.
      key: 'year',
      header: '연도',
      type: 'date',
      primary: true,
      render: (r) => r.year,
    },
    ...items.map((item, i) => ({
      key: `finance-${i}`,
      header: item.label,
      align: 'right' as const,
      numeric: true,
      render: () => <Million v={item.value} />,
    })),
  ]
}

/**
 * 주주구성 두 열. 기준 시점은 열이 아니라 소제목 옆 단서가 답한다 — 지분율 옆에 적으면
 * 주주마다 반복되고, 열로 세우면 모든 행에 같은 값이 스무 번 선다.
 */
const shareholderColumns: Column<QrShareholder>[] = [
  { key: 'name', header: '주주', type: 'text', primary: true, render: (s) => s.name || <EmptyValue /> },
  {
    key: 'ratio',
    header: '지분율',
    type: 'count',
    render: (s) => (s.ratio == null ? <EmptyValue /> : `${s.ratio}%`),
  },
]

/**
 * 제품별 실적 두 열.
 *
 * 폭은 열이 아니라 종류가 정한다 — 제품명은 길이의 상한을 모르는 짧은 라벨(`text`), 실적은
 * 문장에 가까운 긴 값(`long`)이라 남는 폭을 1.2:2로 나눠 갖는다. `layout`을 고정하지 않는 것은
 * 실적이 잘리면 안 되는 서술이기 때문이다 — 자동 레이아웃에서 긴 값은 잘리는 대신 접힌다.
 */
const productColumns: Column<QrProduct>[] = [
  { key: 'product', header: '제품', type: 'text', primary: true, render: (p) => p.product || <EmptyValue /> },
  { key: 'achievement', header: '실적', type: 'long', render: (p) => p.achievement || <EmptyValue /> },
]

export function MaQuickReviewNarrative({ qr }: { qr: QuickReview }) {
  const fin = financialSummary(qr.financials)
  const finItems = fin ? summaryFinanceRows(fin) : []
  const b = qr.basics
  const intro = qr.intro
  const products = qr.products
  // 두 절의 그림을 한 번에 서명한다 — 절마다 훅을 부르면 왕복이 둘이 되고, 두 목록의
  // 서명 시각이 갈려 한쪽만 먼저 만료된다.
  const { data: imageUrls } = useQuickReviewImageUrls([...intro.images, ...products.images])

  return (
    <>
      {/*
        주요내용 — 문서의 첫 카드다. 순서는 좁혀 가는 순서다(2026-09-08 사용자 지정):
        요약 → 회사명·대표자 → 설립일·본사 소재지 → 사업내용 → 주주구성 → 요약재무.
        한 줄로 답할 수 있는 것이 먼저 서고, 여러 줄·여러 행이 필요한 것이 뒤에 선다.

        한줄 요약이 카드 밖 맨몸 문단에서 이 카드의 첫 블록으로 들어왔다. 밖에 있던 동안 그 줄은
        어느 카드에도 속하지 않은 채 밴드 제목과 첫 카드 사이에 떠 있었고, 편집 폼에서는 자기
        카드('한줄 요약')를 갖고 있어 조회와 편집의 카드 수가 갈렸다.

        값이 서는 자리는 둘이고 가르는 기준은 값의 모양이다 — 라벨:값 한 줄로 끝나는 것은
        `InfoGrid`, 항목이 여럿이라 자릿수를 견주는 것은 표다. **이 카드의 라벨 축은 하나뿐이다**
        — 축이 둘이 되면 같은 성격의 줄이 서로 다른 들여쓰기로 서서 무엇이 같은 층인지 알 수 없다.
      */}
      <PanelCard title="주요내용" bodyClassName="space-y-4">
        <QrLede text={qr.summary.headline} />
        {/* 두 칸 격자다 — 넷을 세 칸에 세우면 마지막 하나만 다음 줄에 홀로 남고, 그러면
            `회사명·대표자`(누구인가)와 `설립일·본사 소재지`(언제·어디)의 짝이 흩어진다.

            사업내용은 이 격자 안에서 두 칸을 다 받는다(2026-09-08). `InfoRows`에 따로 세웠더니
            그 부품의 라벨이 고정 폭 열(6rem)이라 라벨과 값 사이가 100px 가까이 벌어졌고, 바로 위
            줄들은 `라벨: 값`이 8px 간격으로 붙어 있어 한 카드 안에서 같은 성격의 줄이 두 가지
            들여쓰기로 섰다. **6rem 라벨 열은 여러 줄을 한 축에 맞추기 위한 규격이라 줄이 하나면
            값을 하지 못하고 여백만 남긴다.** 값이 길어 접히는 것은 이 칸이 두 칸 폭을 받는 것으로
            해결된다. */}
        <InfoGrid columns={2}>
          <InfoField label="회사명" value={b.companyName} />
          <InfoField label="대표자" value={b.representative} />
          <InfoField label="설립일" value={b.foundedOn} />
          <InfoField label="본사 소재지" value={b.headquarters} />
          <InfoField
            label="사업내용"
            value={b.businessDescription}
            className="sm:col-span-2"
          />
        </InfoGrid>
        <QrSubTable
          title="주주구성"
          aside={b.shareholdersAsOf}
          columns={shareholderColumns}
          rows={b.shareholders}
          rowKey={(s) => `${s.name}-${s.ratio ?? ''}`}
          layout="auto"
        />
        {finItems.length > 0 && fin && (
          <QrSubTable
            // 연도가 표 안으로 들어왔으므로 단서에는 단위만 남는다 — 같은 사실을 두 자리에
            // 적으면 한쪽만 고쳐 어긋난다.
            title="요약재무"
            aside="백만원"
            columns={summaryFinanceColumns(finItems)}
            rows={[{ key: 'summary', year: fiscalYearLabel(fin.fiscalYear) }]}
            rowKey={(r) => r.key}
          />
        )}
        <QrNote text={b.note} />
      </PanelCard>

      {/* 회사 소개 — 지표 타일은 공용 `StatStrip`이 규격을 소유한다. 문서가 네 칸으로 세우는
          자리라 격자만 바꾼다(칸 수는 화면마다 다르다는 것이 그 컴포넌트의 전제다).

          2026-09-08에 현황 카드보드(`SummaryTile`)로 옮겼다가 되돌렸다 — 파스텔 면을 칸마다
          두면 이 카드가 문서의 한 절이 아니라 대시보드로 읽혔다.

          네 칸이 서는 것은 `xl`부터다. 이 카드는 상세의 좌측 2/3 칸에 놓이므로 1024~1280px에서
          타일 하나가 90px 남짓이 되는데, 타일의 값은 서식이 정해진 숫자가 아니라 단위가 붙은
          자유 문구(`50,000+ 개소`)라 그 폭에서 말줄임된다 — 그 자리의 말줄임은 값을 줄이는 것이
          아니라 지우는 것이다. 두 칸으로 접으면 넉 줄이 두 줄이 될 뿐 값은 남는다. */}
      {(intro.metrics.length > 0 ||
        intro.body ||
        intro.bullets.length > 0 ||
        intro.images.length > 0) && (
        <PanelCard title="회사 소개" bodyClassName="space-y-4">
          {intro.metrics.length > 0 && (
            <QrBlock title="핵심 지표">
              <StatStrip
                // 세로선은 네 칸이 **한 줄에 설 때만** 긋는다 — 두 칸으로 접힌 격자에서
                // `divide-x`는 둘째 줄 첫 칸에도 왼쪽 선을 그어 없는 경계를 만든다.
                className="grid grid-cols-2 gap-y-2 divide-gray-200 xl:grid-cols-4 xl:gap-y-0 xl:divide-x"
                tiles={intro.metrics.map((m, i) => ({
                  key: `${m.label}-${i}`,
                  label: m.label,
                  value: m.value,
                }))}
              />
            </QrBlock>
          )}
          {/* 그림은 지표 **아래**에 선다. 이 절에서 먼저 답해야 하는 것은 규모(숫자)이고,
              그림은 그 숫자가 어떤 서비스에서 나온 것인지를 잇는 자리라 뒤따라야 한다. */}
          {intro.images.length > 0 && (
            <QrBlock title="이미지">
              <QrImages paths={intro.images} urls={imageUrls} />
            </QrBlock>
          )}
          {intro.body && (
            <QrBlock title="소개 본문">
              <p className={cardText.value}>{intro.body}</p>
            </QrBlock>
          )}
          {intro.bullets.length > 0 && (
            <QrBlock title="추가 사실">
              <QrBullets lines={intro.bullets} />
            </QrBlock>
          )}
        </PanelCard>
      )}

      {/* 제품·서비스 — 제품별 실적은 `InfoRows`가 아니라 표다(2026-09-08).

          한때 라벨:값 두 칸이라 보고 `InfoRows`에 세웠다. 그런데 그 부품의 라벨은 **고정 폭
          열(6rem)**에 서고, 그 규격이 성립하는 전제는 라벨이 화면이 정한 짧은 말이라는 것이다.
          여기 라벨이 되는 것은 담당자가 적는 제품명이라, `부어라 하이볼 레몬` 한 줄이 96px 칸에서
          석 줄로 접히고 그 옆 실적은 한 줄로 서서 줄마다 기준선이 달라졌다. 라벨 축은 값이 아니라
          이름이 서는 자리이므로, 값이 라벨 자리에 오면 그것은 축이 아니라 열이다.
          머리줄 하나가 느는 대신 두 열이 자기 이름을 갖는다(번호·생성자 열은 끈다). */}
      {(products.body ||
        products.items.length > 0 ||
        products.bullets.length > 0 ||
        products.images.length > 0) && (
        <PanelCard title="제품·서비스" bodyClassName="space-y-4">
          {/* 그림이 이 카드의 **첫 줄**이다. 제품·서비스는 글로 읽는 것보다 보는 편이 빠른
              절이라(화면 캡처·라인업 사진), 설명이 먼저 서면 그림에 닿기 전에 이미 무엇을
              읽는지 정해 버린다. 회사 소개에서 그림이 지표 아래인 것과 갈리는 이유가 이것이다 —
              그쪽의 첫 답은 숫자이고, 여기의 첫 답은 생김새다. */}
          {products.images.length > 0 && (
            <QrBlock title="이미지">
              <QrImages paths={products.images} urls={imageUrls} />
            </QrBlock>
          )}
          {products.body && (
            <QrBlock title="라인업 서술">
              <p className={cardText.value}>{products.body}</p>
            </QrBlock>
          )}
          <QrSubTable
            title="제품별 실적"
            columns={productColumns}
            rows={products.items}
            rowKey={(p) => `${p.product}-${p.achievement ?? ''}`}
            layout="auto"
          />
          {products.bullets.length > 0 && (
            <QrBlock title="추가 사실">
              <QrBullets lines={products.bullets} />
            </QrBlock>
          )}
          <QrNote text={products.note} />
        </PanelCard>
      )}
    </>
  )
}
