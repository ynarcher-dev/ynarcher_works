import { TokenMultiSelect } from '@ynarcher/ui'
import { useMemo, type ReactNode } from 'react'
import { useTags } from '@/features/admin/hooks'

export interface TagTokenFieldOptions {
  /** 태그 원장 테이블명(예: `industry_tags` · `field_tags`). */
  table: string
  /**
   * 이 칸이 고르는 것의 이름("분야" · "전문 영역"). 모달 제목과 안내 문구가 전부 이 한 낱말에서
   * 나온다 — 화면마다 손으로 적으면 같은 원장을 가리키는 말이 칸마다 갈린다.
   */
  noun: string
  /** ADMIN에서 이 원장을 관리하는 메뉴 이름("분야 관리"). 원장이 비었을 때 갈 곳을 답한다. */
  adminMenu: string
  /** 선택값. 저장되는 것이 태그 이름이므로 이름이 곧 키다. */
  value: string[]
  onChange: (next: string[]) => void
  /** 최대 선택 수. */
  max: number
  disabled?: boolean
}

export interface TagTokenField {
  /** 이 칸의 도움말. 원장이 비면 규칙 설명이 아니라 **갈 곳을 지시하는 문장**으로 바뀐다. */
  hint: string
  /** 빈 원장 안내는 접지 않는다(`Field`의 같은 이름 슬롯에 그대로 넘긴다). */
  hintInline: boolean
  /** 컨트롤 본체. 호출부가 자기 `Field` 안에 놓는다. */
  control: ReactNode
}

/**
 * ADMIN 태그 원장에서 **여럿** 고르는 칸 한 벌 — 단일 선택 `TagSelect`의 짝이다.
 *
 * 규격의 정본은 NETWORKS 네트워크 DB의 '전문 영역' 칸이며, 근거는
 * [5_component_spec_rules §2.3](../../../../../docs/docs_design/5_component_spec_rules.md)에 있다.
 * 요약하면 **원장에서 자라는 목록은 태그판으로 펼치지 않는다** — 화면은 그 칸이 몇 줄이 될지
 * 모르고, 고른 것과 안 고른 것이 색 하나로만 갈리며, 상한을 채워 회색이 된 칩이 '더 못 고름'인지
 * '비활성 태그'인지 형태가 답하지 못한다.
 *
 * 그 규격이 네 화면에 손으로 복사되어 있었다. 후보를 합치는 방법도, 빈 원장 안내 문구도, 돋보기를
 * 무엇으로 여는지도 매번 다시 적혔고 실제로 갈렸다(분야 칸 하나가 어떤 화면에서는 태그판이었다).
 * 주석으로 "같은 규격이다"라고 적는 것은 다음 사람이 한쪽만 고칠 때 아무것도 막지 못하므로,
 * 그 사실을 코드가 붙들게 한 것이 이 파일이다.
 *
 * **칸의 래퍼(`Field`)는 소유하지 않는다.** 라벨 규격이 폼마다 다르기 때문이다 — 공용 `Field`는
 * `gray-900` 본문, 기업 상세는 `gray-800` 본문, 임직원 노트는 캡션이다. 한 칸만 공용 래퍼로
 * 갈아끼우면 그 칸만 이웃과 어긋나므로, 컴포넌트는 **컨트롤과 그 칸이 할 말**까지만 갖고 래퍼는
 * 호출부에 남긴다. 대신 도움말을 문자열로 돌려주어 문구가 갈릴 자리를 없앤다.
 */
export function useTagTokenField({
  table,
  noun,
  adminMenu,
  value,
  onChange,
  max,
  disabled,
}: TagTokenFieldOptions): TagTokenField {
  const { data: tags } = useTags(table)
  /**
   * 후보는 원장 태그 + 이미 저장된 값이다. 원장에서 지워진 태그를 달고 있던 레코드도 칩이 남아야
   * 편집 중에 조용히 사라지지 않는다.
   */
  const options = useMemo(() => {
    const names = (tags ?? []).map((t) => t.name)
    return [...names, ...value.filter((n) => !names.includes(n))]
  }, [tags, value])
  const empty = options.length === 0

  return {
    hint: empty
      ? `등록된 ${noun} 태그가 없습니다. ADMIN › ${adminMenu}에서 먼저 추가하세요.`
      : `${adminMenu} 태그에서 최대 ${max}개 선택합니다.`,
    // 왜 못 고르는지는 호버해야 답할 것이 아니다.
    hintInline: empty,
    control: (
      <TokenMultiSelect<string>
        selected={value}
        onChange={onChange}
        getKey={(n) => n}
        getLabel={(n) => n}
        options={options}
        max={max}
        disabled={disabled}
        // 무엇을 고르는 칸인지는 바로 위 라벨이 이미 답한다 — 여기서는 고르는 방법만 말한다.
        placeholder="검색하거나 돋보기로 전체 목록을 엽니다."
        browsable
        // 여는 이유가 '하나 집기'가 아니라 '무엇이 있는지 보기'라 드롭다운이 아니라 모달이다.
        browseIn="modal"
        browseTitle={`${noun} 전체 목록`}
        browseEmptyText={`등록된 ${noun} 태그가 없습니다. (ADMIN › ${adminMenu})`}
      />
    ),
  }
}
