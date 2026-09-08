import { cardText } from '@ynarcher/ui'
import { MaterialList } from '@/features/networks/MaterialList'
import type { Material } from '@/features/networks/materialHooks'
import { groupMaterialRefs } from '@/features/networks/materialRefs'

/**
 * 자료 관리 카드 안의 **참조 자료** 구획 — 위치마다 한 덩어리.
 *
 * 두 패널이 함께 쓴다(수정 모드 `MaterialPanel` · 등록 모드 `PendingMaterialPanel`). 등록
 * 화면에도 세우는 이유는 그 자리가 참조가 가장 필요한 자리이기 때문이다 — 스타트업 원장에서
 * 기업을 끌어와 셀러를 만들고 그 자리에서 초안까지 만드는 것이 정상 순서다. 두 화면이 같은
 * 부품을 쓰므로 저장 전후로 목록의 생김새가 달라지지 않는다.
 *
 * **삭제·수정 핸들러를 주지 않는다.** 그래서 목록이 스스로 읽기 전용으로 선다 — 같은 목록
 * 부품을 쓰되 할 수 있는 일만 갈린다. 참조된 자료를 고치는 자리는 그것이 원래 사는 화면 하나다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6
 */
export function MaterialRefGroups({ refs }: { refs: Material[] }) {
  const groups = groupMaterialRefs(refs)
  if (groups.length === 0) return null

  return (
    <>
      {groups.map((g) => (
        <div key={g.targetType} className="mt-3 border-t border-gray-100 pt-3">
          {/* 소제목이 위치를 말한다 — 이 덩어리가 왜 지워지지 않는지도 이 한 줄이 답한다. */}
          <p className={`mb-1.5 ${cardText.subhead}`}>
            {g.label} 자료 [{g.materials.length}]
          </p>
          <MaterialList materials={g.materials} />
        </div>
      ))}
    </>
  )
}
