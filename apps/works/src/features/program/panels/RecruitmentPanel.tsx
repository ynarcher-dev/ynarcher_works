import { Card } from '@ynarcher/ui'
import { RecruitmentSettingsPanel } from '@/features/program/recruitment/RecruitmentSettingsPanel'
import { SubmissionsPanel } from '@/features/program/recruitment/SubmissionsPanel'

/**
 * 모집 운영 화면(인스턴스 단위). 좌측 모집 설정(3블록: 기본 세팅·안내 설정·신청 설정)
 * + 우측 신청 현황(신청서 필드 기반 동적 목록 + 상세).
 */
export function RecruitmentPanel({ programId, moduleId }: { programId: string; moduleId: string }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <RecruitmentSettingsPanel programId={programId} moduleId={moduleId} />

      <Card
        title="신청 현황"
        subtitle="공개 랜딩페이지로 접수된 신청 기업입니다. 행을 열어 응답·첨부서류를 확인하고, 선발 기업은 계정을 발급합니다."
      >
        <SubmissionsPanel moduleId={moduleId} />
      </Card>
    </div>
  )
}
