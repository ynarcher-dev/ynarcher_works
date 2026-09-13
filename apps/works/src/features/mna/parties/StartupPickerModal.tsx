import { useQuery } from '@tanstack/react-query'
import { Button, Input, Modal, PickList, PickRow, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { StartupPickRow } from '@/features/startup/StartupPickRow'
import { readIndustries } from '@/features/startup/startupGrowth'
import type { EntityRow } from '@/features/master/entityHooks'
import { supabase } from '@/lib/supabase'

/**
 * 고른 기업이 함께 들고 오는 값.
 *
 * id·이름 말고 셋을 더 읽는 이유는 연결이 **원장을 가리키는 일이자 그 원장이 이미 아는 것을
 * 다시 묻지 않는 일**이기 때문이다 — 분야·대표자·이메일은 스타트업 원장이 이미 답하고 있어서
 * 연결해 놓고 손으로 또 적게 하면, 같은 사실을 두 번 적는 자리가 생기고 그때부터 어긋난다.
 */
export interface StartupPick {
  id: string
  name: string
  representative: string | null
  email: string | null
  /** 연결 시 거래상대 원장의 연락처 칸으로 함께 넘어간다(포털 계정의 초기 비밀번호). */
  phone: string | null
  /** 분야 태그 이름 배열(최대 3). 거래상대 원장도 같은 원장(industry_tags)의 이름을 담는다. */
  /** 분야 태그 이름 배열. 옛 단일 컬럼(industry)까지 합친 값이다. */
  industries: string[]
  /** 구분(투자·보육·발굴·미지정). 행의 배지가 읽는 값이다. */
  management_status: string | null
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
    queryKey: ['ma-parties', 'startup-pool'],
    enabled,
    queryFn: async (): Promise<StartupPick[]> => {
      // `industry`(옛 단일 컬럼)를 함께 읽는 이유는 분야가 두 곳에 있기 때문이다 — 배열
      // (`industries`)이 SSOT이고 옛 컬럼은 대표값 미러인데, 배열이 빈 채 옛 컬럼만 가진 행이
      // 남아 있다. 둘을 합치는 규칙은 화면이 다시 적지 않고 공용 `readIndustries`가 답한다
      // (그 규칙을 여기서 한 번 더 적으면 한쪽만 고쳐지는 날 어느 화면에서만 분야가 빈다).
      const { data, error } = await supabase
        .from('startups')
        .select('id, name, representative, email, phone, industries, industry, management_status')
        .is('deleted_at', null)
        // 정본으로 흡수된 행은 고를 수 없다(2026-09-09) — 고르면 그 연결이 목록에서 사라진
        // 행을 가리키고, 정본을 고쳐도 이 셀러는 옛 값을 계속 든다.
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(500)
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id as string,
        name: (row.name as string) ?? '',
        representative: (row.representative as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        management_status: (row.management_status as string | null) ?? null,
        industries: readIndustries(row as EntityRow),
      }))
    },
  })
}

/**
 * 스타트업 원장에서 기업 하나 고르기 — 거래상대 기업명 칸의 돋보기가 여는 창.
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
    // 목록이 500건에서 끊기고 화면에는 50건만 선다는 규칙은 창 맨 아래 각주가 아니라 제목 옆
    // 말풍선(`Modal`의 `help`)이 갖는다 — 안내가 사는 자리는 말풍선 하나이고, 그 자리를
    // 화면이 정하지 않는다(3.6.1). 빈 목록·검색 결과 없음처럼 다음 행동을 지시하는 안내는
    // 접지 않고 아래에 그대로 편다.
    <Modal
      open
      onClose={onClose}
      title="스타트업 원장에서 찾기"
      help="한 번에 최대 50건까지 보여줍니다. 찾는 기업이 없으면 검색어로 좁히세요."
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
        ) : (
          // 목록·행의 규격(가로선·여백·호버·스크롤 높이)은 공용 `PickList`가, 한 줄에 무엇을
          // 적는지는 `StartupPickRow`가 소유한다 — FUND 피투자사 검색과 같은 원장을 같은
          // 방식으로 고르는 자리라, 둘 중 어느 것도 화면이 다시 적지 않는다.
          <PickList
            isEmpty={rows.length === 0}
            empty={
              keyword.trim()
                ? '검색 결과가 없습니다. 원장에 없는 기업이면 기업명을 직접 입력하세요.'
                : '조회할 수 있는 스타트업이 없습니다.'
            }
          >
            {rows.map((s) => (
              <PickRow
                key={s.id}
                onClick={() => {
                  onPick(s)
                  onClose()
                }}
              >
                <StartupPickRow value={s} />
              </PickRow>
            ))}
          </PickList>
        )}
      </div>
    </Modal>
  )
}
