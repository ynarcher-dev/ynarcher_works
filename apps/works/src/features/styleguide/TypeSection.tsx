import { Card, cardText, tableText } from '@ynarcher/ui'
import { GuideSection, Tag } from '@/features/styleguide/GuideSection'

const LADDER = [
  ['text-title-lg', '30px / bold', '페이지 제목', 'text-title-lg font-bold text-gray-900'],
  ['text-title-md', '24px / bold', '섹션 제목', 'text-title-md font-bold text-gray-900'],
  ['text-title-sm', '20px / bold', '지표 값·섹션 헤딩', 'text-title-sm font-bold text-gray-900'],
  ['text-body-lg', '16px / semibold', '카드 제목', 'text-body-lg font-semibold text-gray-900'],
  ['text-body', '14px', '본문 표준', 'text-body text-gray-900'],
  ['text-body-sm', '13px', '컨트롤 라벨', 'text-body-sm text-gray-900'],
  ['text-caption', '12px', '표 셀·보조 설명', 'text-caption text-gray-900'],
] as const

export function TypeSection() {
  return (
    <GuideSection
      id="type"
      title="글자"
      lede="한 줄 안에서 크기를 갈라 위계를 만들지 않습니다. 크기는 하나로 두고 구분은 굵기와 색이 맡습니다."
    >
      <Card
        title="크기 사다리"
        subtitle="페이지 30 → 섹션 24 → 지표 20 → 카드 제목 16 → 본문 14 → 컨트롤 13 → 표 12"
      >
        <div className="space-y-3">
          {LADDER.map(([token, meta, use, cls]) => (
            <div key={token} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={cls}>다람쥐 헌 쳇바퀴에 타고파</span>
              <Tag>{token}</Tag>
              <span className="text-caption text-gray-500">
                {meta} · {use}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="카드 안 위계 — cardText"
        subtitle="Card·PanelCard·InfoField가 소유합니다. 화면에서 규격 클래스를 직접 쓰지 않습니다."
      >
        <div className="space-y-1">
          <p className={cardText.title}>카드 제목 (title · 16 semibold)</p>
          <p className={cardText.subtitle}>카드 부제 (subtitle · 14 gray-500)</p>
          <p className={cardText.subhead}>카드 안 소제목 (subhead · 14 semibold gray-900)</p>
          <div className="flex items-baseline gap-2">
            <span className={cardText.label}>라벨:</span>
            <span className={cardText.value}>값 — 크기는 본문 하나, 위계는 색으로만</span>
          </div>
          <p className="flex items-center gap-1 pt-1">
            <span className={cardText.subhead}>관련 자료</span>
            <span className={cardText.count}>[3]</span>
          </p>
        </div>
      </Card>

      <Card
        title="표 안 위계 — tableText"
        subtitle="전부 12px입니다. 머리글·메타는 gray-600 — 한글 12px은 획이 촘촘해 gray-500에서 흐려집니다."
      >
        <div className="space-y-1.5">
          <p className={tableText.head}>머리글 (head · gray-600 semibold · 7.8:1)</p>
          <p className={tableText.primary}>
            식별 값 — 그 행이 무엇인지 알려주는 열, 행마다 하나 (primary)
          </p>
          <p className={tableText.body}>일반 값 — 나머지 도메인 열 전부 (body · gray-700)</p>
          <p className={tableText.meta}>보조 값 — 생성자·수정일 등 메타 (meta · gray-600)</p>
          <p className={`${tableText.body} ${tableText.empty}`}>- (empty · gray-400)</p>
        </div>
      </Card>
    </GuideSection>
  )
}
