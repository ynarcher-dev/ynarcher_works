import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { FUND_LIST_LABEL } from '@/config/navigation'
import { GuestAccountPanel } from '@/features/admin/GuestAccountPanel'
import { FUND_GUEST_HOST } from '@/features/fund/guestHost'
import { FundListTab } from '@/features/fund/FundListTab'
import { useListScope } from '@/lib/listScope'

/**
 * FUND 워크스페이스 목록 화면 — 메뉴 하나, 범위는 목록 안의 토글이 정한다.
 *
 * 2026-09-05: '내 운용펀드'와 '전체 운용펀드' 두 메뉴를 한 줄로 합쳤다. 두 목록은 같은
 * 테이블(FundListTab)을 쓰고 거는 조건만 달랐다 — '내 운용펀드'는 생성자 또는 담당자
 * (대표펀드매니저·운용인력·관리인력)가 나인 펀드로 좁히고, '전체 운용펀드'는 아무것도 걸지
 * 않는다. 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어 구분·재원·상태 같은 다른 축과
 * 함께 걸 수 없다(펀드 종류가 2026-08-20에 먼저 밟은 길과 같다).
 *
 * 옛 주소(`?tab=mine`·`?tab=ac_fund`·구 `?tab=dashboard`)는 이 화면으로 흡수한다 — 주소에
 * 죽은 탭이 남아 있으면 사이드바에서 활성 항목이 사라져 "내가 지금 어느 메뉴에 있는지"가
 * 보이지 않는다.
 */
export function FundPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const [scope, setScope] = useListScope()

  const legacyTab = params.get('tab')

  // 와이앤아처 GUEST 계정 — 조합의 창구(2026-09-10). PROJECT·M&A와 **같은 화면**을 세우고
  // 권한만 낮춘다(`canSuspend` 없음 — 정지·해제는 ADMIN이 소유한다). 좁히는 축 둘도 같다:
  // `entityKey`는 참여 칸이 조합만 세게 하고, `masterTables`는 목록에 설 인격을 이 창구가
  // 발급하는 원장(포트폴리오사=STARTUP)으로 좁힌다.
  //
  // 이 줄이 legacy 탭 처리보다 **앞에** 서야 한다 — 아래 분기가 tab이 있으면 무조건
  // 목록으로 돌려보내므로, 뒤에 두면 메뉴를 눌러도 목록만 뜬다.
  if (legacyTab === 'guest-accounts') {
    return (
      <div className="space-y-5">
        <PageHeader title="와이앤아처 GUEST 계정" />
        <GuestAccountPanel
          entityKey={FUND_GUEST_HOST.entityKey}
          masterTables={FUND_GUEST_HOST.guestMasterTables}
        />
      </div>
    )
  }

  if (legacyTab) {
    return <Navigate to={legacyTab === 'mine' ? '/fund?scope=mine' : '/fund'} replace />
  }

  return (
    <div className="space-y-5">
      <PageHeader title={FUND_LIST_LABEL} />
      <FundListTab scope={scope} onScopeChange={setScope} userId={userId ?? null} />
    </div>
  )
}
