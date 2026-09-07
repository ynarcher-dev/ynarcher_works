import { useQuery } from '@tanstack/react-query'
import { Button, Input, Modal, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface StartupPick {
  id: string
  name: string
  representative: string | null
}

/**
 * 고를 수 있는 스타트업 후보.
 *
 * 원장 RLS가 돌려준 행이 곧 후보 집합이다 — 볼 수 없는 기업은 애초에 뜨지 않으므로 화면이
 * 별도로 거를 것이 없다. 검색은 창 안에서 하므로(이름으로 찾는 일이라 서버 왕복이 필요 없다)
 * 한 번에 이름순 500건까지 들고 오고, 그 위는 검색어로 좁힌다.
 */
function useStartupPool(enabled: boolean) {
  return useQuery({
    queryKey: ['ma-buyers', 'startup-pool'],
    enabled,
    queryFn: async (): Promise<StartupPick[]> => {
      const { data, error } = await supabase
        .from('startups')
        .select('id, name, representative')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as StartupPick[]
    },
  })
}

/**
 * 스타트업 DB에서 기업 하나 고르기 — 바이어 기업명 칸의 돋보기가 여는 창.
 *
 * 고르는 즉시 닫힌다. 여러 건을 담는 피커(회의록 연동·결재 연동)가 [확인]을 받는 것은
 * 담는 동안 창 안의 상태와 바깥 상태가 갈리기 때문인데, 여기서는 고를 것이 하나뿐이라
 * 그 간극 자체가 없다 — 한 번 누를 것을 두 번 누르게 하지 않는다.
 *
 * 대표자명을 함께 세우는 이유는 같은 이름의 기업을 가르기 위해서다(이름만으로는 고르는
 * 사람이 어느 쪽인지 판단할 근거가 없다).
 */
export function StartupPickerModal({
  onPick,
  onClose,
}: {
  onPick: (pick: StartupPick) => void
  onClose: () => void
}) {
  const [keyword, setKeyword] = useState('')
  const { data: pool, isLoading } = useStartupPool(true)

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const list = pool ?? []
    if (!kw) return list.slice(0, 50)
    return list
      .filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          (s.representative ?? '').toLowerCase().includes(kw),
      )
      .slice(0, 50)
  }, [pool, keyword])

  return (
    <Modal
      open
      onClose={onClose}
      title="스타트업 DB에서 찾기"
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="기업명·대표자명 검색"
          autoFocus
        />

        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-caption text-gray-500">
            {keyword.trim()
              ? '검색 결과가 없습니다. 원장에 없는 기업이면 기업명을 직접 입력하세요.'
              : '조회할 수 있는 스타트업이 없습니다.'}
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(s)
                    onClose()
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-radius-md border border-gray-300 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate text-body text-gray-900">{s.name}</span>
                  <span className="shrink-0 text-caption text-gray-500">
                    {s.representative || '-'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 목록이 500건에서 끊기고 화면에는 50건만 서므로, 안 보이는 기업이 있을 수 있다는
            사실을 검색으로 좁히라는 지시와 함께 밝힌다(빈 목록이 아니라 잘린 목록이다). */}
        <p className="text-caption text-gray-500">
          최대 50건까지 보여줍니다. 찾는 기업이 없으면 검색어로 좁히세요.
        </p>
      </div>
    </Modal>
  )
}
