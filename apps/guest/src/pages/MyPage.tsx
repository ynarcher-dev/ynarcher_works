import { useQuery } from '@tanstack/react-query'
import { Badge, Banner, Card, EmptyState, InfoField, InfoGrid, Spinner } from '@ynarcher/ui'
import { guestAuth, type GuestMe } from '@/auth/guestAuthService'
import { PERSONA_LABEL } from '@/auth/guestStore'
import { PasswordChangeCard } from '@/pages/PasswordChangeCard'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/programMeta'
import { formatDate } from '@/lib/format'

/**
 * 마이페이지 — 내 계정과 지금 참여 중인 사업.
 *
 * 데이터 원본은 guest-auth-refresh 한 번이다. 이 호출이 원장(NETWORKS 기업·전문가)의 현재
 * 이름을 세션에 되비추므로, 이 화면을 여는 것 자체가 이름 동기화이기도 하다. 게스트에게
 * 사업 원장(programs)의 RLS를 여는 대신 로그인과 같은 판정(세션 고정 사업 + 열린 명부)을
 * 거친 표시용 응답만 받는다.
 */
export function MyPage() {
  const { data: me, isLoading } = useQuery<GuestMe | null>({
    queryKey: ['guest', 'me'],
    queryFn: () => guestAuth.refreshSession(),
  })

  if (isLoading) return <Spinner />
  // 401이면 refreshSession이 세션을 비워 RequireGuestAuth가 로그인으로 돌려보낸다.
  // 그 외 실패(네트워크 등)는 빈 화면 대신 사실대로 말한다.
  if (!me) {
    return (
      <EmptyState
        title="내 정보를 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 잠시 후 다시 시도해 주십시오."
      />
    )
  }

  const period =
    me.program.start_date || me.program.end_date
      ? `${formatDate(me.program.start_date)} ~ ${formatDate(me.program.end_date)}`
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="내 정보">
        <InfoGrid columns={2}>
          <InfoField label="이름" value={me.user.name} />
          <InfoField label="이메일" value={me.user.email} />
          <InfoField
            label="참여 구분"
            value={me.participation.persona ? PERSONA_LABEL[me.participation.persona] : '—'}
          />
          {me.company && <InfoField label="소속 기업" value={me.company.name} />}
        </InfoGrid>
      </Card>

      <Card
        title="참여 중인 사업"
        actions={
          // 라벨 표에 있는 운영 상태만 배지로 그린다 — 내부 상태 코드를 원문으로 흘리지 않는다.
          me.program.status && PROGRAM_STATUS_LABEL[me.program.status] && (
            <Badge tone={PROGRAM_STATUS_TONE[me.program.status] ?? 'neutral'}>
              {PROGRAM_STATUS_LABEL[me.program.status]}
            </Badge>
          )
        }
      >
        <InfoGrid columns={2}>
          <InfoField label="사업명" value={me.program.title} />
          <InfoField label="사업 코드" value={me.program.code} />
          <InfoField label="사업 기간" value={period} />
          <InfoField label="주관기관" value={me.program.host_organization} />
          <InfoField
            label="참여 시작일"
            value={me.participation.joined_at ? formatDate(me.participation.joined_at) : null}
            meta
          />
        </InfoGrid>
        <Banner tone="info" className="mt-4">
          사업은 로그인에 쓴 사업 코드에 고정됩니다. 다른 사업은 그 사업의 코드로 다시
          로그인해 주세요.
        </Banner>
      </Card>

      <PasswordChangeCard />

      <Banner tone="info">
        수집된 개인정보는 사업 종료 후 보존이 필요한 사항을 제외하고 파기됩니다.
      </Banner>
    </div>
  )
}
