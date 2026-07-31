import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 생성자 교체 대상 원장 카탈로그.
 * 서버(RPC)의 허용 목록은 `app.has_contribution_trigger()`가 카탈로그에서 판정하므로,
 * 이 목록은 '화면에 어떤 순서로 보여줄 것인가'만 정한다 — 여기에 없는 표를 서버가 허용하기도 하고,
 * 여기 있는 표라도 서버가 거절하면 그대로 오류가 뜬다(허용 판정을 프론트에 복제하지 않는다).
 */
export interface CreatorLedger {
  /** 물리 테이블명(RPC 인자). */
  table: string
  label: string
  /** 레코드 이름 컬럼(사업 계열은 title, 나머지는 name). */
  nameColumn: 'name' | 'title'
  /** 사이드바 구획(선택 셀렉트의 optgroup). */
  group: '데이터베이스' | '워크스페이스'
}

export const CREATOR_LEDGERS: CreatorLedger[] = [
  { table: 'startups', label: '스타트업', nameColumn: 'name', group: '데이터베이스' },
  { table: 'experts', label: '전문가 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'investors', label: '투자사 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'van', label: 'BAN 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'exp', label: 'EXP 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'corporates', label: '기업 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'institutions', label: '기관 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'universities', label: '대학 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'vendors', label: '외주 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'etc', label: '기타 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'others', label: '미분류 데이터베이스', nameColumn: 'name', group: '데이터베이스' },
  { table: 'global_networks', label: '글로벌 네트워크', nameColumn: 'name', group: '데이터베이스' },
  { table: 'programs', label: 'AC 사업', nameColumn: 'title', group: '워크스페이스' },
  { table: 'ma_programs', label: 'M&A/PE 딜', nameColumn: 'title', group: '워크스페이스' },
  { table: 'project_programs', label: '프로젝트', nameColumn: 'title', group: '워크스페이스' },
  { table: 'funds', label: '펀드', nameColumn: 'name', group: '워크스페이스' },
]

export interface CreatorTargetRow {
  id: string
  name: string
  created_by: string | null
}

/**
 * 대상 원장에서 이름 부분일치로 레코드를 찾는다(최대 20건, 비활성 제외).
 * 생성자 이름은 화면이 임직원 목록과 맞춰 표시하므로 여기서는 created_by(id)만 가져온다 —
 * 원장마다 users FK 임베드 이름이 달라 조인 문법을 원장별로 분기하지 않기 위해서다.
 */
export function useCreatorTargets(ledger: CreatorLedger, keyword: string) {
  const kw = keyword.trim()
  return useQuery({
    queryKey: ['admin', 'creator-transfer', ledger.table, kw],
    enabled: kw.length > 0,
    queryFn: async (): Promise<CreatorTargetRow[]> => {
      const { data, error } = await supabase
        .from(ledger.table)
        .select(`id, ${ledger.nameColumn}, created_by`)
        .ilike(ledger.nameColumn, `%${kw.replace(/[(),]/g, ' ')}%`)
        .is('deleted_at', null)
        .order(ledger.nameColumn, { ascending: true })
        .limit(20)
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        name: String(r[ledger.nameColumn] ?? '-'),
        created_by: (r.created_by as string | null) ?? null,
      }))
    },
  })
}

/**
 * 생성자 강제 교체(관리자 전용 RPC). 서버가 권한·원장·계정 유효성을 모두 판정하며,
 * 변경은 audit_logs(CREATOR_CHANGE)와 원장 변동 이력에 함께 남는다.
 */
export function useSetEntityCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { table: string; id: string; userId: string; reason: string }) => {
      const { error } = await supabase.rpc('set_entity_creator', {
        p_table: args.table,
        p_id: args.id,
        p_user_id: args.userId,
        p_reason: args.reason || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, args) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'creator-transfer', args.table] })
      // 교체된 레코드는 '내 ~ 관리' 목록의 소속이 바뀌므로 해당 원장 캐시를 통째로 무효화한다.
      void qc.invalidateQueries({ queryKey: [args.table] })
    },
  })
}
