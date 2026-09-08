import { Field, TokenMultiSelect } from '@ynarcher/ui'
import { useMemo } from 'react'
import {
  partyKindsOf,
  useMaProgramPartyPool,
  type MaProgramPartyKind,
  type MaProgramPartyPick,
} from '@/features/mna/programPartyLinks'

const LEDGER: Record<MaProgramPartyKind, string> = {
  SELL: 'M&A SELLER',
  BUY: 'M&A BUYER',
}

/**
 * 등록/편집 폼의 매물 연결 칸(원장 하나당 한 칸).
 *
 * **매물을 고르는 자리는 여기 하나다**(2026-09-08). 상세에도 고르는 패널이 있었으나 그 탭이
 * 걷히면서(연결된 매물의 내용은 이제 퀵리뷰 모듈이 세운다) 이 폼만 남았다.
 *
 * 여기서 고른 것은 폼이 저장될 때 함께 간다. 등록 시점에는 아직 프로젝트 id가 없어 쏠 곳이
 * 없고(그래서 종전에는 저장한 뒤 상세로 들어가 다시 골라야 했다), 편집에서도 취소를 누르면
 * 아무 일도 없어야 한다. 그래서 이 부품은 값을 들고 있지 않고 위(폼)가 소유한 상태를 그리기만 한다.
 *
 * **자리는 구분 칸 옆이다**(2026-09-08 사용자 지적 "공간이 낭비된다"). 구분은 고를 것이 다섯
 * 개뿐이라 자기 폭(w-48)만 차지하는데, M&A에는 그 옆을 채우는 주관 칸이 없어 줄의 나머지가
 * 통째로 비어 있었다. AC에서 주관이 서던 그 자리를 그대로 받는다 — 두 칸이 같은 물음('이
 * 프로젝트가 무엇을 다루는가')에 답하므로 층위도 같다.
 *
 * **컨트롤은 목록 상자가 아니라 토큰 필드다**(2026-09-08 사용자 지적 "옆 드롭다운과 사이즈를
 * 맞춰 달라"). 처음에는 고른 기업을 줄줄이 세우고 아래에 '기업 매핑' 버튼을 둔 상자였는데,
 * 한 줄짜리 셀렉트 옆에서 그 상자만 서너 배로 높아 같은 층위의 두 칸이 서로 다른 무게로
 * 읽혔다. 바로 아래 분야 칸이 이미 같은 일(원장에서 여럿 고르기)을 토큰 필드로 하고 있었으므로
 * 규격을 새로 만들 이유도 없다 — 최소 높이가 공용 컨트롤과 같아 셀렉트와 나란히 서고, 고른
 * 것은 칩으로 남아 눌러서 뺀다. 돋보기는 무엇이 있는지 보러 여는 자리라 모달로 편다.
 */
export function MaProgramPartyFields({
  category,
  buyers,
  sellers,
  onChange,
}: {
  category: string | null | undefined
  buyers: MaProgramPartyPick[]
  sellers: MaProgramPartyPick[]
  onChange: (kind: MaProgramPartyKind, next: MaProgramPartyPick[]) => void
}) {
  const kinds = partyKindsOf(category)
  // 고를 원장이 없으면 슬롯째 사라진다 — 빈 칸을 남기면 구분 옆이 다시 비고, 그 빈 자리는
  // 무엇이 들어올 자리인지 말하지 못한다.
  if (kinds.length === 0) return null

  return (
    <div className="min-w-0 flex-1 space-y-3">
      {kinds.map((kind) => (
        <PartyField
          key={kind}
          kind={kind}
          selected={kind === 'SELL' ? sellers : buyers}
          onChange={(next) => onChange(kind, next)}
        />
      ))}
    </div>
  )
}

/**
 * 원장 하나를 고르는 칸. 원장마다 후보 조회가 따로라 훅을 부르는 자리도 따로다
 * (조건부로 부르지 않기 위해 컴포넌트를 나눈다).
 */
function PartyField({
  kind,
  selected,
  onChange,
}: {
  kind: MaProgramPartyKind
  selected: MaProgramPartyPick[]
  onChange: (next: MaProgramPartyPick[]) => void
}) {
  const ledger = LEDGER[kind]
  const { data: pool } = useMaProgramPartyPool(kind, true)
  /**
   * 후보는 원장 목록 + 이미 연결된 기업이다. 목록은 상한(500건)이 있고 그 사이에 소프트 삭제된
   * 행도 있어, 합치지 않으면 이미 연결해 둔 기업의 칩이 편집 중에 조용히 사라진다.
   */
  const options = useMemo(() => {
    const rows = pool ?? []
    const ids = new Set(rows.map((r) => r.id))
    return [...rows, ...selected.filter((r) => !ids.has(r.id))]
  }, [pool, selected])

  return (
    <Field
      label={ledger}
      hint={
        `${ledger} 원장에서 이 프로젝트와 연결할 기업을 고릅니다. 등록 후 상세 화면에서도 바꿀 수 있습니다.\n` +
        '연결하면 워크플로우에 퀵리뷰 모듈이 서고, 연결을 모두 해제하면 함께 사라집니다.'
      }
      as="div"
    >
      <TokenMultiSelect<MaProgramPartyPick>
        selected={selected}
        onChange={onChange}
        getKey={(r) => r.id}
        getLabel={(r) => r.name}
        // 후보 줄의 보조 텍스트이자 검색 대상이다 — 기업명이 기억나지 않을 때 찾는 실마리가
        // 희망사항('경영권 100% 양수')인 경우가 있어 목록 검색창과 같은 두 컬럼을 본다.
        getMeta={(r) => r.wish ?? undefined}
        getSearchText={(r) => `${r.name} ${r.wish ?? ''}`}
        options={options}
        placeholder="검색하거나 돋보기로 전체 목록을 엽니다."
        browsable
        browseIn="modal"
        browseTitle={`${ledger} 전체 목록`}
        browseEmptyText={`등록된 ${ledger}이(가) 없습니다. 먼저 원장에 등록하세요.`}
      />
    </Field>
  )
}
