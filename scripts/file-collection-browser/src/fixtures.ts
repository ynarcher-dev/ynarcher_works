/**
 * 브라우저 검증용 원장 표본.
 *
 * 값은 손으로 적지 않고 규칙으로 만든다 — 20단 깊이나 200줄짜리 목록은 눈으로 적으면 틀리고,
 * 무엇을 재고 있는지(깊이·길이·줄 수)가 데이터에 묻힌다. 각 표본은 **한 가지 극단**을 맡는다.
 */

export interface FixtureNode {
  id: string
  parent_id: string | null
  title: string
  node_kind: 'FOLDER' | 'QUESTION'
  sort_order: number
  is_required?: boolean
}

/** 공백이 하나도 없는 200자 — `truncate`가 감추거나 셀을 밀고 나가는지 보는 값이다. */
export const LONG_TITLE_200 =
  '사업자등록증명원과법인등기부등본및주주명부와최근3개년감사보고서와부가가치세과세표준증명원을하나로묶어제출하되파일명은회사명_서류명_발급일자순서로적어주시고스캔본은해상도300dpi이상컬러로올려주세요확인후반려될수있습니다합니다요망'.slice(
    0,
    200,
  )

const longFileName =
  '2026년도_와이앤아처_투자심의위원회_제출용_감사보고서_최종본_v12_수정반영_20260913_대표이사날인.pdf'

/** 깊이 20 — 들여쓰기 접기(`INDENT_MAX_DEPTH`)를 넘겨도 이름이 살아 있는지 본다. */
function deepChain(): FixtureNode[] {
  const nodes: FixtureNode[] = []
  let parent: string | null = null
  for (let depth = 0; depth < 20; depth += 1) {
    const id = `deep-${depth}`
    nodes.push({
      id,
      parent_id: parent,
      title:
        depth === 19
          ? LONG_TITLE_200
          : `${depth + 1}단계 제출 서류 묶음 — ${longFileName.slice(0, 20 + depth)}`,
      node_kind: depth === 19 ? 'QUESTION' : 'FOLDER',
      sort_order: 0,
      is_required: depth % 3 === 0,
    })
    // 각 단마다 문항 하나를 곁들여, 깊은 자리에서도 상태·관리 열이 함께 서는 줄을 만든다.
    nodes.push({
      id: `deep-${depth}-leaf`,
      parent_id: id,
      title: `${longFileName} (${depth + 1}단)`,
      node_kind: 'QUESTION',
      sort_order: 1,
      is_required: depth % 2 === 0,
    })
    parent = id
  }
  return nodes
}

/** 줄이 많을 때 — 표 자체의 세로 길이와 밀도를 본다. */
function manyRows(): FixtureNode[] {
  const nodes: FixtureNode[] = []
  for (let folder = 0; folder < 10; folder += 1) {
    const id = `many-f${folder}`
    nodes.push({
      id,
      parent_id: null,
      title: `${folder + 1}. 제출 서류 묶음`,
      node_kind: 'FOLDER',
      sort_order: folder,
    })
    for (let i = 0; i < 20; i += 1) {
      nodes.push({
        id: `${id}-q${i}`,
        parent_id: id,
        title: i % 7 === 0 ? LONG_TITLE_200 : `${i + 1}) ${longFileName}`,
        node_kind: 'QUESTION',
        sort_order: i,
        is_required: i % 4 === 0,
      })
    }
  }
  return nodes
}

/** 깊이·긴 이름·많은 줄·망가진 부모를 한 화면에 섞는다. */
function mixed(): FixtureNode[] {
  return [
    ...deepChain(),
    ...manyRows().slice(0, 42),
    {
      id: 'orphan',
      parent_id: 'no-such-parent',
      title: `부모를 잃은 문항 — ${LONG_TITLE_200.slice(0, 60)}`,
      node_kind: 'QUESTION',
      sort_order: 99,
      is_required: true,
    },
  ]
}

export const SCENARIOS: Record<string, { label: string; nodes: FixtureNode[] }> = {
  deep: { label: '깊이 20 + 200자 무공백 문항', nodes: deepChain() },
  many: { label: '210줄', nodes: manyRows() },
  mixed: { label: '깊이·길이·줄 수·유실 부모 혼합', nodes: mixed() },
}

export type ScenarioKey = keyof typeof SCENARIOS
