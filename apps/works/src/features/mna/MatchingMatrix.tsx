import { Badge, Button, DataTable, Input, Spinner, type Column } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { DealFormModal } from '@/features/mna/DealFormModal'
import { useStartupRefs, type StartupRef } from '@/features/mna/hooks'

interface Scored extends StartupRef {
  fit: number
}

/**
 * 매수/매도 매칭 매트릭스: 매수 측 조건(업종/키워드)으로 NETWORKS 매도 후보를 대조,
 * 적합도 백분율 상위순 정렬 후 [신규 딜 생성]으로 소싱 칸반에 인계한다.
 * 근거: 3_6_workspace_ma.md §1.3
 */
export function MatchingMatrix() {
  const { data, isLoading } = useStartupRefs()
  const [industry, setIndustry] = useState('')
  const [keyword, setKeyword] = useState('')
  const [preset, setPreset] = useState<{ deal_name: string; target_name: string }>()

  const scored = useMemo<Scored[]>(() => {
    const candidates = data ?? []
    return candidates
      .map((c) => {
        let fit = 40 // 기본 적합도
        const ind = (c.industry ?? '').toLowerCase()
        if (industry && ind.includes(industry.toLowerCase())) fit += 40
        if (keyword && (c.name + ind).toLowerCase().includes(keyword.toLowerCase()))
          fit += 20
        return { ...c, fit: Math.min(fit, 100) }
      })
      .sort((a, b) => b.fit - a.fit)
  }, [data, industry, keyword])

  const columns: Column<Scored>[] = [
    { key: 'name', header: '매도 후보 기업', render: (r) => r.name },
    { key: 'industry', header: '업종', render: (r) => r.industry ?? '-' },
    {
      key: 'fit',
      header: '적합도',
      align: 'right',
      numeric: true,
      render: (r) => (
        <Badge tone={r.fit >= 80 ? 'success' : r.fit >= 60 ? 'warning' : 'neutral'}>
          {r.fit}%
        </Badge>
      ),
    },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setPreset({ deal_name: `${r.name} 인수 검토`, target_name: r.name })
          }
        >
          신규 딜 생성
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-body font-medium text-gray-800">희망 업종</label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="예: 바이오"
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">
            인수 목적 키워드
          </label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 플랫폼"
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={scored}
          rowKey={(r) => r.id}
          emptyText="매칭 후보(NETWORKS 스타트업)가 없습니다."
        />
      )}

      <DealFormModal
        open={Boolean(preset)}
        onClose={() => setPreset(undefined)}
        preset={preset}
      />
    </div>
  )
}
