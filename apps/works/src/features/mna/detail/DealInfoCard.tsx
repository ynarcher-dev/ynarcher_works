import { Badge, Card } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Deal } from '@/features/mna/hooks'

/** 담당 심사역 이름 조회(임직원 마스터 users). */
function useUserName(userId: string | null) {
  return useQuery({
    queryKey: ['mna', 'user-name', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .maybeSingle()
      return (data as { name: string } | null)?.name ?? null
    },
  })
}

/** 딜 정보(상세 우측 카드): 대상기업·추정가액·담당 심사역·메모·관계자 요약. */
export function DealInfoCard({ deal }: { deal: Deal }) {
  const { data: managerName } = useUserName(deal.lead_manager_id)

  const rows: { label: string; value: ReactNode }[] = [
    { label: '대상기업', value: deal.target_name ?? '미지정' },
    {
      label: '추정가액',
      value:
        deal.estimated_value != null
          ? `${(deal.estimated_value / 100_000_000).toLocaleString()}억 원`
          : '미정',
    },
    { label: '담당 심사역', value: managerName ?? '미지정' },
    {
      label: '보류 여부',
      value: deal.on_hold ? <Badge tone="danger">보류</Badge> : '정상 진행',
    },
    {
      label: '최근 업데이트',
      value: new Date(deal.updated_at).toLocaleDateString('ko-KR'),
    },
  ]

  return (
    <Card title="딜 정보">
      <dl className="divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-2.5">
            <dt className="w-28 shrink-0 text-caption text-gray-500">{row.label}</dt>
            <dd className="text-body font-medium text-gray-800">{row.value}</dd>
          </div>
        ))}
        {deal.note && (
          <div className="py-2.5">
            <dt className="mb-1 text-caption text-gray-500">메모</dt>
            <dd className="whitespace-pre-wrap text-body text-gray-700">{deal.note}</dd>
          </div>
        )}
      </dl>
    </Card>
  )
}
