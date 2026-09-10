import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 관계 줄(`public.network_affiliations`) 조회·쓰기.
 *
 * 이 표가 답하는 것은 **지금 어디에 속했는가**이고, 옆 `profile.affiliation_history`가 답하는
 * 것은 **소속 칸이 어떻게 고쳐졌는가**다. 축이 달라 둘을 합치지 않는다(20260910150000 주석).
 */

export const AFFILIATION_TABLE = 'network_affiliations'

/** 관계 줄 한 개. 조직이 원장 행이면 이름은 그 원장이 답한다(여기 옮겨 적지 않는다). */
export interface Affiliation {
  id: string
  /** 'startup'(원장 행 연결) | 'text'(이름만 아는 미연결). */
  orgType: string
  orgId: string | null
  /** 화면에 세울 조직 이름 — 연결된 줄은 그 원장에서 읽어 온 이름, 미연결은 저장된 글자. */
  orgLabel: string
  title: string | null
  startedOn: string | null
  /** null이면 현재 소속. 여럿이 null이면 겸직이다. */
  endedOn: string | null
  source: string
}

interface Row {
  id: string
  org_type: string
  org_id: string | null
  org_name: string | null
  title: string | null
  started_on: string | null
  ended_on: string | null
  source: string
}

/**
 * 그 사람의 관계 줄 전부(현재가 먼저, 그다음 최근 시작 순).
 *
 * 조직 이름은 **두 번째 조회**로 읽는다. `org_id`가 다형 키라 FK가 없어 PostgREST 임베드가
 * 서지 않기 때문이며, FK를 걸지 않은 것은 다음 원장을 이을 때 스키마를 고치지 않기 위해서다
 * (실재 확인은 DB 트리거가 진다). 이름을 줄에 옮겨 적어 왕복을 아끼지는 않는다 — 그러면
 * 조직이 개명한 날 이 줄만 옛 이름으로 남는다.
 *
 * 정렬을 서버가 아니라 여기서 하는 이유는 축이 둘이기 때문이다 — '현재인가'가 먼저이고
 * 그 안에서 시작일이다. 규칙이 둘이면 눈에 보이는 자리에 둔다.
 */
export function useAffiliations(networkId: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'affiliations', networkId],
    enabled: Boolean(networkId),
    queryFn: async (): Promise<Affiliation[]> => {
      const { data, error } = await supabase
        .from(AFFILIATION_TABLE)
        .select('id, org_type, org_id, org_name, title, started_on, ended_on, source')
        .eq('network_id', networkId as string)
        .is('deleted_at', null)
      if (error) throw error
      const rows = (data ?? []) as Row[]

      // 연결된 조직의 이름을 한 번에 읽는다. 읽지 못하는 행(RLS)은 이름 없이 서고, 그것이
      // 사실이다 — 관계가 있다는 것과 그 조직을 볼 수 있다는 것은 다른 물음이다.
      const startupIds = [...new Set(rows.filter((r) => r.org_type === 'startup' && r.org_id).map((r) => r.org_id!))]
      const nameById = new Map<string, string>()
      if (startupIds.length > 0) {
        const { data: orgs } = await supabase.from('startups').select('id, name').in('id', startupIds)
        for (const o of (orgs ?? []) as { id: string; name: string }[]) nameById.set(o.id, o.name)
      }

      return rows
        .map((r) => ({
          id: r.id,
          orgType: r.org_type,
          orgId: r.org_id,
          orgLabel: (r.org_id ? nameById.get(r.org_id) : null) ?? r.org_name ?? '',
          title: r.title,
          startedOn: r.started_on,
          endedOn: r.ended_on,
          source: r.source,
        }))
        .sort((a, b) => {
          if (Boolean(a.endedOn) !== Boolean(b.endedOn)) return a.endedOn ? 1 : -1
          return (b.startedOn ?? '').localeCompare(a.startedOn ?? '')
        })
    },
  })
}

/**
 * 오등록 정리 — 줄을 **내린다**(deleted_at). 끝내기(ended_on)와 다른 축이다.
 *
 * 끝내기는 "그 자리를 떠났다"이고 내리기는 "그런 적이 없다"이다. 둘을 한 버튼으로 두면
 * 잘못 이은 줄이 이력으로 남아 그 사람의 경력에 없던 회사가 붙는다.
 */
export function useRemoveAffiliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(AFFILIATION_TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', 'affiliations'] }),
  })
}
