import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Material } from '@/features/networks/materialHooks'

/**
 * 참조 자료 — **다른 대상에 올라간 자료를 이 화면에서 함께 보는 것**.
 *
 * 파일을 복제하지 않는다. 복제하면 두 목록이 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가
 * 없고, 원본이 고쳐져도 이쪽은 옛 파일을 계속 들고 있게 된다(2026-09-06에 파일과 링크를 한
 * 표에 담은 것과 같은 판단이다).
 *
 * **방향은 화면이 정하지 않는다.** 어느 대상이 어느 대상의 자료를 보는지는 SQL 함수
 * `app.attachment_ref_sources()` 하나가 답하고, 여기서는 그 결과를 받아 세우기만 한다.
 * 그래서 단방향(M&A SELLER는 스타트업 자료를 보지만 그 반대는 아니다)이 화면 조건이 아니라
 * 서버의 사실이며, 화면을 고쳐 뚫을 수 있는 규칙이 아니다.
 *
 * **읽기 전용이다.** 참조 목록에는 업로드·수정·삭제를 두지 않는다 — 그 자료를 고치는 자리는
 * 그것이 원래 사는 화면 하나다. 다운로드·미리보기는 열려 있고, 반출 기록은 종전대로
 * `material-download`가 남긴다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §6
 */

/**
 * 자료가 사는 곳의 이름.
 *
 * 원장이 아니라 코드가 갖는다 — 화면 분기와 함께 가는 값이고, 다형 키는 이미 행이 들고
 * 있어(`target_type`) 같은 사실을 두 곳에 적을 이유가 없다.
 */
const LOCATION_LABEL: Record<string, string> = {
  startup: '스타트업DB',
  ma_seller: 'M&A SELLER',
  ma_buyer: 'M&A BUYER',
  network: 'NETWORKS',
  fund: 'FUND',
  program: 'AC 사업',
  ma_program: 'M&A 딜',
}

/**
 * 자료가 사는 곳의 이름. 모르는 키는 `null`이다 — 아무 말이나 지어 붙이면 담당자가 그것을
 * 실제 메뉴 이름으로 읽는다(모르면 말하지 않는 편이 낫다).
 */
export function materialLocationLabel(targetType: string): string | null {
  return LOCATION_LABEL[targetType] ?? null
}

/** 위치별로 묶은 참조 자료 한 덩어리. 화면은 이 단위로 소제목과 목록을 세운다. */
export interface MaterialRefGroup {
  targetType: string
  /** 소제목에 설 이름. 모르는 위치는 '참조 자료'로 물러난다. */
  label: string
  materials: Material[]
}

/** 위치별로 묶는다. 순서는 서버가 준 순서(최신순)에서 처음 등장한 위치 순이다. */
export function groupMaterialRefs(materials: Material[]): MaterialRefGroup[] {
  const groups: MaterialRefGroup[] = []
  for (const m of materials) {
    const found = groups.find((g) => g.targetType === m.target_type)
    if (found) {
      found.materials.push(m)
      continue
    }
    groups.push({
      targetType: m.target_type,
      label: materialLocationLabel(m.target_type) ?? '참조 자료',
      materials: [m],
    })
  }
  return groups
}

/**
 * 이 대상이 함께 보는 다른 대상의 자료.
 *
 * 참조가 없는 대상(대부분)에서도 호출한다 — 방향을 아는 것은 서버뿐이라 화면이 미리 가려
 * 내려면 그 방향표를 여기에 한 벌 더 적어야 하고, 그 복제본은 새 방향을 열 때 조용히 옛
 * 답을 낸다. 참조가 없으면 빈 배열이 오고 화면은 아무것도 세우지 않는다.
 */
export function useMaterialRefs(targetType: string, targetId: string | undefined) {
  return useQuery({
    queryKey: ['material-refs', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase.rpc('attachment_refs', {
        p_target_type: targetType,
        p_target_id: targetId,
      })
      if (error) throw error
      return (data ?? []) as Material[]
    },
  })
}
