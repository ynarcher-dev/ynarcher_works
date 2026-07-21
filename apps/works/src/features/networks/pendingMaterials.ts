import { useCallback, useMemo, useState } from 'react'
import { uploadMaterialFile } from '@/features/networks/materialHooks'

/**
 * 신규 등록 폼에서 "등록 전에 고른 자료"를 보관하는 상태 컨테이너.
 *
 * attachments 는 target_id(NOT NULL)로 대상 레코드에 귀속되므로 레코드가 없는 시점에는
 * 업로드할 수 없다. 그래서 등록 폼에서는 파일을 브라우저 메모리에만 담아 두고,
 * 저장이 성공해 id가 생긴 직후 `flush(newId)`로 일괄 업로드한다.
 * (선업로드 방식은 등록을 취소했을 때 고아 파일이 남으므로 채택하지 않았다.)
 *
 * `slot`은 자료 분류 단위 키다. 스타트업은 분류 3종(IR/재무제표/기타)을 슬롯으로 쓰고,
 * 네트워크는 단일 슬롯을 쓴다.
 */
export interface PendingMaterials {
  /** 슬롯에 담긴 파일 목록. */
  files: (slot: string) => File[]
  /** 슬롯에 파일을 추가한다. */
  add: (slot: string, files: File[]) => void
  /** 슬롯에서 파일 1건을 제거한다. */
  remove: (slot: string, index: number) => void
  /** 전체 보류 건수. */
  count: number
  /**
   * 생성된 레코드 id로 보류 자료를 모두 업로드한다.
   * `resolveType`은 슬롯 → target_type 변환(미지정 시 슬롯 자체를 target_type으로 사용).
   * 개별 실패는 삼키고 실패 건수를 반환한다(레코드 자체는 이미 저장된 상태이므로).
   */
  flush: (
    targetId: string,
    resolveType?: (slot: string) => string,
  ) => Promise<{ uploaded: number; failed: number }>
}

/** 등록 폼 전용 보류 자료 상태 훅. */
export function usePendingMaterials(): PendingMaterials {
  const [bySlot, setBySlot] = useState<Record<string, File[]>>({})

  const files = useCallback((slot: string) => bySlot[slot] ?? [], [bySlot])

  const add = useCallback((slot: string, added: File[]) => {
    setBySlot((prev) => ({ ...prev, [slot]: [...(prev[slot] ?? []), ...added] }))
  }, [])

  const remove = useCallback((slot: string, index: number) => {
    setBySlot((prev) => ({
      ...prev,
      [slot]: (prev[slot] ?? []).filter((_, i) => i !== index),
    }))
  }, [])

  const count = useMemo(
    () => Object.values(bySlot).reduce((sum, list) => sum + list.length, 0),
    [bySlot],
  )

  const flush = useCallback<PendingMaterials['flush']>(
    async (targetId, resolveType) => {
      let uploaded = 0
      let failed = 0
      for (const [slot, list] of Object.entries(bySlot)) {
        const targetType = resolveType ? resolveType(slot) : slot
        for (const file of list) {
          try {
            await uploadMaterialFile(targetType, targetId, file)
            uploaded += 1
          } catch {
            failed += 1
          }
        }
      }
      setBySlot({})
      return { uploaded, failed }
    },
    [bySlot],
  )

  return { files, add, remove, count, flush }
}
