import { Card, cardText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useAuthStore } from '@/auth/authStore'
import { affiliationLabel } from '@/features/management/departmentOptions'
import { useDepartments, useEmployee } from '@/features/management/hooks'
import { PhotoBox } from '@/features/networks/PhotoBox'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 입사일로부터 지난 날수(입사 당일이 +0). 입사일이 없거나 미래면 null.
 * '며칠이 지났는가'를 세므로 근속 연차(1일차)와 달리 당일을 0으로 둔다.
 */
function daysSinceHire(hireDate: string): number | null {
  const start = dayjs(hireDate)
  if (!start.isValid()) return null
  const days = dayjs().startOf('day').diff(start.startOf('day'), 'day')
  return days >= 0 ? days : null
}

/**
 * 대시보드 우측 첫 칸 — 로그인한 본인을 맞이하는 카드.
 * 사진·이름·소속은 마이페이지와 같은 원장(users.profile / 부서 배치)에서 읽고,
 * 소속 표기 규칙은 `affiliationLabel`이 소유한다(여기서 다시 조립하지 않는다).
 */
export function WelcomeCard() {
  const userId = useAuthStore((s) => s.user?.id)
  const { data: me } = useEmployee(userId)
  const { data: depts } = useDepartments()

  const profile = me?.profile ?? {}
  const affiliation = affiliationLabel(depts ?? [], me?.department_id ?? null)
  const hireDate = str(profile.hire_date)
  const days = hireDate ? daysSinceHire(hireDate) : null

  return (
    <Card>
      <div className="flex items-center gap-4">
        <PhotoBox src={str(profile.photo) || null} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className={cardText.title}>
            {me?.name ? `${me.name} 님, 환영합니다` : '환영합니다'}
          </p>
          <p className={`mt-1 truncate ${cardText.subtitle}`}>{affiliation || '-'}</p>
          {/* 입사일이 비어 있으면 근속 줄 자체를 접는다 — '+0일'로 오해되지 않게 한다. */}
          {days !== null && (
            <p className="mt-1 text-body text-gray-700">
              <span className="text-gray-500">{hireDate} 입사</span>{' '}
              <span className="font-semibold tabular-nums text-brand">
                +{days.toLocaleString()}일
              </span>
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
