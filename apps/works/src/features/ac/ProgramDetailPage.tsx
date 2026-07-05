import { Badge, Banner, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EvaluationPanel } from '@/features/ac/EvaluationPanel'
import { MentoringPanel } from '@/features/ac/MentoringPanel'
import { ModuleBoard } from '@/features/ac/ModuleBoard'
import { ParticipantPool } from '@/features/ac/ParticipantPool'
import { useProgram } from '@/features/ac/hooks'
import { PROGRAM_STATUS_LABEL } from '@/features/ac/config'

type Tab = 'modules' | 'participants' | 'evaluation' | 'mentoring' | 'timeline'

/** 프로그램 상세: 모듈 보드 + 참가자 풀. (7-1 / 7-3) */
export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: program, isLoading } = useProgram(id)
  const [tab, setTab] = useState<Tab>('modules')

  if (isLoading) return <Spinner />
  if (!program || !id) {
    return <Banner tone="warning">프로그램을 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/ac" className="text-caption text-gray-500 hover:text-gray-800">
          ← AC 대시보드
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-title-lg font-bold text-gray-900">{program.title}</h1>
          <Badge tone="info">
            {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
          </Badge>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'modules' as const, label: '모듈 보드' },
          { key: 'participants' as const, label: '참가자 풀' },
          { key: 'evaluation' as const, label: '평가 엔진' },
          { key: 'mentoring' as const, label: 'N:N 멘토링' },
          { key: 'timeline' as const, label: '통합 타임라인' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'modules' && <ModuleBoard programId={id} />}
      {tab === 'participants' && <ParticipantPool programId={id} />}
      {tab === 'evaluation' && <EvaluationPanel programId={id} />}
      {tab === 'mentoring' && <MentoringPanel programId={id} />}
      {tab === 'timeline' && (
        <Banner tone="info">
          통합 타임라인·충돌 방지(7-11)는 각 모듈 세션 데이터 연동 후 제공됩니다.
        </Banner>
      )}
    </div>
  )
}
