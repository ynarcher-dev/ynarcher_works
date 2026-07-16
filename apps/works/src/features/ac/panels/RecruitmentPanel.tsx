import { Card } from '@ynarcher/ui'
import { RecruitmentSettingsPanel } from '@/features/ac/recruitment/RecruitmentSettingsPanel'
import { SubmissionsPanel } from '@/features/ac/recruitment/SubmissionsPanel'

/**
 * 모집 운영 화면(인스턴스 단위). 좌측 신청 현황(신청서 필드 기반 동적 목록 + 상세)
 * + 우측 모집 설정(폼빌더·랜딩·공개 URL).
 */
export function RecruitmentPanel({ programId, moduleId }: { programId: string; moduleId: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-body font-semibold text-gray-900">신청 현황</h3>
          <p className="text-caption text-gray-500">
            공개 랜딩페이지로 접수된 신청 기업입니다. 행을 열어 응답·첨부서류를 확인하고, 선발 기업은 계정을 발급합니다.
          </p>
        </div>
        <SubmissionsPanel moduleId={moduleId} />
      </Card>

      <RecruitmentSettingsPanel programId={programId} moduleId={moduleId} />
    </div>
  )
}
