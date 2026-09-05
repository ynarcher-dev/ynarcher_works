import { useCallback, useMemo, useState } from 'react'
import { addMaterialLink, uploadMaterialFile } from '@/features/networks/materialHooks'

/**
 * 신규 등록 폼에서 "등록 전에 고른 자료"를 보관하는 상태 컨테이너.
 *
 * attachments 는 target_id(NOT NULL)로 대상 레코드에 귀속되므로 레코드가 없는 시점에는
 * 업로드할 수 없다. 그래서 등록 폼에서는 파일을 브라우저 메모리에만 담아 두고,
 * 저장이 성공해 id가 생긴 직후 `flush(newId)`로 일괄 업로드한다.
 * (선업로드 방식은 등록을 취소했을 때 고아 파일이 남으므로 채택하지 않았다.)
 *
 * `slot`은 자료 분류 단위 키(= target_type)다. 지금은 모든 등록 폼이 단일 슬롯을 쓰지만,
 * 한 레코드에 자료 분류가 여럿인 화면이 다시 생길 수 있어 슬롯 구조는 남겨 둔다.
 */
export interface PendingMaterials {
  /** 슬롯에 담긴 파일 목록. */
  files: (slot: string) => File[]
  /** 슬롯에 파일을 추가한다. */
  add: (slot: string, files: File[]) => void
  /** 슬롯에서 파일 1건을 제거한다. */
  remove: (slot: string, index: number) => void
  /**
   * 슬롯에 담긴 링크 주소 목록.
   *
   * 링크도 파일과 같은 이유로 보류된다 — attachments 행은 target_id(NOT NULL)로 대상에
   * 귀속되므로 레코드가 없는 시점에는 스토리지를 거치지 않는 링크조차 넣을 자리가 없다.
   */
  links: (slot: string) => string[]
  /** 슬롯에 링크를 추가한다(중복 주소는 담지 않는다). */
  addLink: (slot: string, url: string) => void
  /** 슬롯에서 링크 1건을 제거한다. */
  removeLink: (slot: string, index: number) => void
  /** 전체 보류 건수(파일 + 링크). */
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
  const [linksBySlot, setLinksBySlot] = useState<Record<string, string[]>>({})

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

  const links = useCallback((slot: string) => linksBySlot[slot] ?? [], [linksBySlot])

  const addLink = useCallback((slot: string, url: string) => {
    // 같은 주소를 두 번 담지 않는다 — 파일은 같은 이름이라도 다른 실물일 수 있지만
    // 주소는 같으면 같은 것이고, 목록에 두 줄로 서면 어느 쪽을 지울지 고르게 된다.
    setLinksBySlot((prev) => {
      const list = prev[slot] ?? []
      return list.includes(url) ? prev : { ...prev, [slot]: [...list, url] }
    })
  }, [])

  const removeLink = useCallback((slot: string, index: number) => {
    setLinksBySlot((prev) => ({
      ...prev,
      [slot]: (prev[slot] ?? []).filter((_, i) => i !== index),
    }))
  }, [])

  const count = useMemo(
    () =>
      Object.values(bySlot).reduce((sum, list) => sum + list.length, 0) +
      Object.values(linksBySlot).reduce((sum, list) => sum + list.length, 0),
    [bySlot, linksBySlot],
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
      // 링크도 같은 건수에 함께 센다 — 담당자에게는 둘 다 '첨부한 자료'이고, 실패했을 때
      // 알아야 하는 것은 '무엇이 파일이었나'가 아니라 '몇 건이 안 올라갔나'다.
      for (const [slot, list] of Object.entries(linksBySlot)) {
        const targetType = resolveType ? resolveType(slot) : slot
        for (const url of list) {
          try {
            await addMaterialLink(targetType, targetId, url)
            uploaded += 1
          } catch {
            failed += 1
          }
        }
      }
      setBySlot({})
      setLinksBySlot({})
      return { uploaded, failed }
    },
    [bySlot, linksBySlot],
  )

  return { files, add, remove, links, addLink, removeLink, count, flush }
}
