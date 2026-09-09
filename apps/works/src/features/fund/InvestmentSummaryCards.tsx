import { Badge, Button, Card, EntityHeaderSection, InfoField, InfoGrid, InfoRows } from '@ynarcher/ui'
import { labeledPurposes } from '@/features/fund/fundPurposeLabel'
import { CLOSED_POOL_STATUS } from '@/features/startup/startupClassification'
import type { FundPurpose, Investment } from '@/features/fund/hooks'

const Info = InfoField

/** YYYY-MM-DD 앞 10자리. 없으면 '-'. */
function shortDate(v: string | null): string {
  return v ? v.slice(0, 10) : '-'
}

/** 숫자 콤마 표기. null이면 '-'. */
function num(v: number | null): string {
  return v == null ? '-' : Number(v).toLocaleString()
}

/**
 * 투자 집행 상세 페이지의 머리 카드 — 이 건의 조건(투자 집행 정보)과 규약 목적, 딜메이커.
 *
 * 아래에 서는 기업 정보와 갈리는 축은 **누가 소유한 사실인가**다. 여기 값은 `investments`
 * 원장의 것이라 이 페이지의 '수정'이 고치고, 아래 기업 카드들은 `startups` 원장의 것이라
 * STARTUP 상세에서 고친다. 그래서 수정 버튼도 페이지 상단 바가 아니라 **이 카드**가 갖는다 —
 * 페이지 맨 위에 두면 아래 기업 내용까지 고치는 버튼으로 읽힌다.
 *
 * **카드는 하나이고 안에서 구분선이 축을 가른다.** 딜메이커를 옆 카드로 떼면 카드 제목이
 * 답해야 할 것이 '이 집행 건'과 '사람' 둘로 갈려 한 줄짜리 카드가 남고, 아래 기업 카드들과
 * 폭이 어긋난다. 같은 격자에 섞지 않는 이유는 그대로다 — '이메일'이 무엇의 이메일인지 라벨이
 * 스스로 답해야 한다. 이름만 목록과 같은 요약 규격('외 N')이고 이메일·연락처는 딜메이커(리드)
 * 본인 것이다(연락처는 사람 하나에 붙는 값이라 접을 수 없다). 내부 임직원이라 마스킹하지 않는다.
 */
export function InvestmentSummaryCards({
  investment,
  fundName,
  purposes,
  onEdit,
}: {
  investment: Investment
  fundName: string
  /** 이 펀드의 규약 목적. 표의 목적 컬럼(의무1·주목적1…)과 같은 순서·같은 이름으로 선다. */
  purposes: FundPurpose[]
  onEdit: () => void
}) {
  const inv = investment
  const labeled = labeledPurposes(purposes)
  return (
    <Card title="투자 집행 정보" actions={<Button onClick={onEdit}>수정</Button>}>
      <InfoGrid>
        <Info label="투자펀드" value={fundName} />
        <Info label="투자일" value={shortDate(inv.invested_at)} />
        <Info label="라운드" value={inv.stage || '-'} />
        <Info label="투자방식" value={inv.investment_method || '-'} />
        <Info label="PRE VALUE" value={num(inv.valuation)} />
        <Info label="POST VALUE" value={num(inv.post_valuation)} />
        <Info label="집행액" value={num(inv.amount)} />
        {/* 관리현황은 `startups`의 값이지만 **이 페이지의 '수정'이 고치는 값**이라 여기 선다
            (수정 모달의 '투자기업 담당·현황' 묶음 = 딜메이커 + 관리현황). 기업 헤더의 칩과 같은
            값이 두 번 적히는 셈이지만, 칩은 훑는 자리고 여기는 라벨을 단 값이라 하는 일이 다르다 —
            고칠 수 있는 값이 고치는 버튼 아래 서 있어야 무엇을 바꾸게 되는지 화면이 답한다. */}
        <Info label="관리현황" value={inv.startup_pool_status || '-'} />
        {/* 폐업일자는 관리현황이 폐업일 때만 유효한 값이라 그때만 선다(수정 폼과 같은 조건). */}
        {inv.startup_pool_status === CLOSED_POOL_STATUS && (
          <Info label="폐업일자" value={shortDate(inv.startup_closed_on)} />
        )}
      </InfoGrid>

      {/* 규약 목적 부합 — 표에서는 Y/- 한 글자짜리 열 여럿이던 것이 여기서는 줄로 선다.
          **부합하지 않는 목적도 함께 세운다**: 이 값이 답하는 것은 '무엇에 부합하는가'가
          아니라 '이 펀드의 목적들 중 어디에 걸리는가'라, 걸리지 않은 줄이 빠지면 남은 줄만
          보고 그것이 목적의 전부라고 읽는다. 목적이 없는 펀드에서는 이 묶음 자체가 서지 않는다. */}
      {labeled.length > 0 && (
        <EntityHeaderSection label="규약 목적">
          <InfoRows
            items={labeled.map(({ purpose, short }) => {
              const hit = inv.purpose_ids.includes(purpose.id)
              return {
                label: short,
                // 표에서는 폭이 한 글자뿐이라 Y/-였지만, 여기서는 자리가 있으므로 값이 스스로
                // 말한다 — '-'는 '미해당'인지 '아직 안 정함'인지 읽는 사람이 가릴 수 없다.
                // 상태를 말하는 것은 배지 하나다 — 조건 문구까지 색을 달리하면 한 줄에 상태가
                // 두 번 적히고, 목적 문구가 길 때 그 회색이 '읽지 않아도 되는 글'로 읽힌다.
                value: (
                  <span className="flex items-baseline gap-2">
                    <Badge tone={hit ? 'success' : 'neutral'}>{hit ? '해당' : '미해당'}</Badge>
                    {purpose.label && <span className="min-w-0">{purpose.label}</span>}
                  </span>
                ),
              }
            })}
          />
        </EntityHeaderSection>
      )}

      <EntityHeaderSection label="딜메이커">
        <InfoGrid>
          <Info label="이름" value={inv.dealmaker_name || '-'} />
          <Info label="이메일" value={inv.dealmaker_email || '-'} />
          <Info label="연락처" value={inv.dealmaker_phone || '-'} />
        </InfoGrid>
      </EntityHeaderSection>
    </Card>
  )
}
