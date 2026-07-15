import type { Program } from '@/features/ac/hooks'
import { ModuleBoardCard } from '@/features/ac/detail/ModuleBoardCard'
import { ParticipantPoolCard } from '@/features/ac/detail/ParticipantPoolCard'
import { ProgramScheduleCard } from '@/features/ac/detail/ProgramScheduleCard'

/**
 * 프로그램 상세 개요 탭: 좌측 운영 모듈 보드, 우측 통합 타임라인 + 참가자 풀.
 * 세 패널은 각자 자기 쿼리 훅으로 데이터를 독립 조회한다(부모는 컴포지션만).
 */
export function ProgramOverviewTab({
  program,
  onOpenModule,
}: {
  program: Program
  onOpenModule: (moduleType: string) => void
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <ModuleBoardCard programId={program.id} onOpenModule={onOpenModule} />
      <div className="space-y-4">
        <ProgramScheduleCard program={program} />
        <ParticipantPoolCard programId={program.id} />
      </div>
    </div>
  )
}
