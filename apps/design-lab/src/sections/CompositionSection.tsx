import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardShell,
  DataTable,
  EmptyValue,
  InfoField,
  InfoGrid,
  Input,
  PageHeader,
  PanelCard,
  StatStrip,
  Tabs,
  TextAction,
  type Column,
} from '@ynarcher/ui'
import { Section, Spec } from '@/lib/Spec'

interface Row {
  id: string
  name: string
  sector: string
  stage: '발굴' | '보육' | '투자'
  manager: string | null
  investedAt: string | null
  amount: number
  created_by: string
  updated_at: string
}

const ROWS: Row[] = [
  { id: '1', name: '뉴런브릿지', sector: '딥테크', stage: '투자', manager: '김와이', investedAt: '2026-05-14', amount: 500, created_by: '박아처', updated_at: '2026-08-11' },
  { id: '2', name: '세이프하비스트', sector: '애그테크', stage: '보육', manager: '이현수', investedAt: null, amount: 0, created_by: '김와이', updated_at: '2026-08-09' },
  { id: '3', name: '코발트라인', sector: '2차전지', stage: '투자', manager: '박아처', investedAt: '2026-03-02', amount: 1200, created_by: '박아처', updated_at: '2026-07-28' },
  { id: '4', name: '리버스랩', sector: '바이오', stage: '발굴', manager: null, investedAt: null, amount: 0, created_by: '이현수', updated_at: '2026-08-18' },
]

const STAGE_TONE = { 발굴: 'neutral', 보육: 'info', 투자: 'success' } as const

/*
 * 열마다 종류(`type`)만 적는다.
 *
 * 폭·정렬·수치서식·줄바꿈은 종류가 함께 정한다 — 넷을 손으로 조합하게 두면 화면마다 조합이
 * 조금씩 달라지고, 그게 곧 들쑥날쑥한 표가 된다. 비율을 계산할 일도 없다.
 *
 * 식별 열만 `name`이다. 폭을 갖지 않아 남는 폭을 받는 쪽이며, 자동 레이아웃에서는 도메인 열 뒤의
 * 빈 열이 여백을 삼키므로 이 열도 자기 내용 폭으로 붙는다.
 *
 * '투자금액(백만원)'은 머리글이 값보다 길어 종류가 정한 112px보다 넓어진다. 자동 레이아웃에서
 * 폭은 하한이므로 정상 동작이며, 그럴 때 늘려야 하는 것은 폭이 아니라 줄여야 하는 것이 머리글이다.
 */
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: '기업명', type: 'name', primary: true, render: (r) => r.name },
  { key: 'sector', header: '업종', type: 'text', render: (r) => r.sector },
  {
    key: 'stage',
    header: '단계',
    type: 'badge',
    render: (r) => <Badge tone={STAGE_TONE[r.stage]}>{r.stage}</Badge>,
  },
  {
    key: 'manager',
    header: '담당자',
    type: 'person',
    render: (r) => r.manager ?? <EmptyValue />,
  },
  {
    key: 'investedAt',
    header: '최근 투자일',
    type: 'date',
    render: (r) => r.investedAt ?? <EmptyValue />,
  },
  {
    key: 'amount',
    header: '투자금액(백만원)',
    type: 'money',
    render: (r) => (r.amount ? r.amount.toLocaleString() : <EmptyValue />),
  },
]

const TILES = [
  // 켜진 칸 = 지금 목록을 좁히고 있는 조건. 상자를 걷어냈으므로 선택은 옅은 브랜드 면으로 말한다.
  { key: 'all', label: '전체', value: '128', unit: '개사', selected: true },
  { key: 'found', label: '발굴', value: '61', unit: '개사', delta: 4 },
  { key: 'care', label: '보육', value: '43', unit: '개사', delta: 0 },
  { key: 'inv', label: '투자', value: '24', unit: '개사', delta: -1 },
  { key: 'amt', label: '누적 투자금', value: '18,400', unit: '백만원' },
]

export function CompositionSection() {
  const [tab, setTab] = useState('list')

  return (
    <Section
      id="composition"
      title="5. 화면"
      lede="앞의 규격이 하나의 업무 화면으로 모이면 이렇게 됩니다. 목록 화면과 상세 화면의 표준 뼈대입니다."
    >
      <Spec
        label="목록 화면"
        note="PageHeader → 상태 타일 → 탭 → 표. 검색·액션은 항상 구분선 아래 한 줄에 모입니다."
        className="p-0"
      >
        <div className="space-y-5 p-5">
          <PageHeader
            title="투자기업"
            titleExtra={<Badge tone="neutral">STARTUP</Badge>}
            description="투자를 집행한 포트폴리오사를 관리합니다."
            search={<Input placeholder="기업명·업종 검색" />}
            actions={
              <>
                <Button variant="outline">
                  <Download size={16} />
                  내보내기
                </Button>
                <Button variant="primary">
                  <Plus size={16} />
                  기업 등록
                </Button>
              </>
            }
          />
          <CardShell className="px-5 py-4">
            <StatStrip tiles={TILES} />
          </CardShell>
          <Tabs
            items={[
              { key: 'list', label: '목록', count: 128 },
              { key: 'board', label: '보드' },
              { key: 'stat', label: '통계' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <DataTable
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(r) => r.id}
            showManageColumn={false}
            /*
             * 생성자 열은 끈다. 생성자는 어떤 권한도 주지 않으므로 목록에는 노출하지 않고 상세
             * 페이지에만 둔다 — 목록에서 관리 주체를 답하는 것은 담당자 열이다. DataTable의
             * showAuthor 기본값이 true라 끄지 않으면 규칙과 반대로 렌더된다.
             */
            showAuthor={false}
            pagination={{ page: 0, pageSize: 4, total: 128, onChange: () => {} }}
          />
        </div>
      </Spec>

      <Spec
        label="상세 화면"
        note="좌측 본문 Card(라벨:값 격자) + 우측 PanelCard(건수 말머리). 생성자는 목록이 아니라 상세에만 둡니다."
        className="p-0"
      >
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card
              title="뉴런브릿지"
              subtitle="딥테크 · 시리즈 A · 서울 성동구"
              actions={
                <>
                  <Badge tone="success" dot>
                    투자
                  </Badge>
                  <Button variant="outline">수정</Button>
                </>
              }
            >
              <InfoGrid columns={3}>
                <InfoField label="대표자" value="정민서" />
                <InfoField label="설립일" value="2022-11-08" />
                <InfoField label="사업자번호" value="123-45-67890" />
                <InfoField label="담당자" value="김와이" />
                <InfoField label="최근 투자일" value="2026-05-14" />
                <InfoField label="누적 투자금" value="500백만원" />
                <InfoField label="홈페이지" value={null} />
                {/* 생성자·수정일은 레코드를 다룬 흔적이지 업무 사실이 아니므로 한 단 물러난다. */}
                <InfoField label="생성자" value="박아처" meta />
                <InfoField label="수정일" value="2026-08-11" meta />
              </InfoGrid>
            </Card>

            <Card title="투자 이력">
              <DataTable
                columns={[
                  { key: 'round', header: '라운드', type: 'name', primary: true, render: (r: { id: string; round: string; date: string; amount: string }) => r.round },
                  { key: 'date', header: '집행일', type: 'date', render: (r) => r.date },
                  { key: 'amount', header: '금액(백만원)', type: 'money', render: (r) => r.amount },
                ]}
                rows={[
                  { id: 'a', round: 'Seed', date: '2023-04-20', amount: '150' },
                  { id: 'b', round: 'Pre-A', date: '2024-09-02', amount: '350' },
                ]}
                rowKey={(r) => r.id}
                numbered={false}
                standardColumns={false}
              />
            </Card>
          </div>

          <div className="space-y-4">
            <PanelCard
              title="관련 자료"
              count={3}
              action={<TextAction>전체 보기</TextAction>}
            >
              <ul className="space-y-2">
                {['IR덱_2026H1.pdf', '주주간계약서.pdf', '실사보고서.docx'].map((f) => (
                  <li key={f} className="flex items-center justify-between gap-2">
                    <span className="truncate text-body text-gray-900">{f}</span>
                    <span className="shrink-0 text-body text-gray-500">2026-08-11</span>
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard title="변동 이력" count={0}>
              <p className="py-6 text-center text-body text-gray-500">
                기록된 변동이 없습니다.
              </p>
            </PanelCard>
          </div>
        </div>
      </Spec>
    </Section>
  )
}















