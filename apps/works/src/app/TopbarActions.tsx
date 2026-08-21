import { IconButton, cn } from '@ynarcher/ui'
import { Bell, CalendarDays, CircleUserRound, StickyNote } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { useMyPhoto } from '@/features/management/myPhotoHooks'
import { useNotifications } from '@/features/notifications/notificationHooks'
import { useRightPanel, type RightPanelKey } from '@/app/rightPanel'

/**
 * 상단바 버튼 공통 규격 — `page` 맥락의 아이콘 버튼(36px)을 그대로 쓴다.
 *
 * 한동안 40px로 손수 고정해 두었는데, 그 값은 아이콘 버튼이 아니라 **라벨 있는 컨트롤**의
 * 높이(`h-ctl-page`)였다. 아이콘 버튼이 한 단계 작은 데는 이유가 있다 — 라벨이 없어 같은
 * 높이면 시각적으로 더 커 보인다(5_component_spec_rules.md §1.3). 게다가 클래스를 이렇게
 * 상수로 빼 두면 컨트롤 높이를 막는 ESLint 규칙이 닿지 않아, 규격 밖 값이 조용히 살아남는다.
 *
 * 정사각 버튼은 `IconButton`이 그리고, 이 상수는 라벨을 함께 다는 개인 메뉴 버튼 하나만
 * 담당한다(아이콘 버튼과 높이·모서리·색·호버를 공유하되 폭만 내용에 맞춰 늘어난다).
 */
const topbarLabeledButton = cn(
  'flex h-icon-page shrink-0 items-center justify-center gap-2 rounded-radius-md px-2.5',
  'border border-transparent text-gray-500',
  'transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
)

interface QuickLink {
  label: string
  icon?: LucideIcon
  key: RightPanelKey
  /** 아이콘 대신 얹는 글자(AI 에이전트 전용). */
  text?: string
}

/**
 * 전역 진입점(OFFICE 권한 필요, 없으면 감춘다). 페이지 이동이 아니라 우측 슬라이드오버를
 * 토글한다. AI 에이전트는 아이콘만으로 읽히지 않아 "AI" 글자를 얹고, 버튼 크기는 옆의 아이콘
 * 버튼과 같은 정사각을 유지한다.
 *
 * 상단바 순서는 **AI·캘린더·알림·메모**다. 앞의 셋은 "밖에서 내게 오는 것"(도움·일정·소식)이라
 * 한 묶음으로 붙이고, 메모는 "내가 적어 두는 것"이라 그 뒤 개인 메뉴 앞에 세운다. 알림만 렌더가
 * 다르므로(미읽음 배지) 이 목록에 담지 않고 아래에서 따로 그린다 — 그래서 메모도 목록에서 빠진다.
 */
const QUICK_LINKS: QuickLink[] = [
  { label: 'AI 에이전트', key: 'ai', text: 'AI' },
  { label: '전사 캘린더', icon: CalendarDays, key: 'calendar' },
]

/** 알림 뒤에 서는 퀵 메모. 자리만 다르고 규격은 위 목록과 같은 한 벌을 쓴다. */
const MEMO_LINK: QuickLink = { label: '퀵 메모', icon: StickyNote, key: 'memo' }

/** 퀵 링크 버튼 한 칸 — 목록으로 도는 자리와 따로 세우는 자리(메모)가 같은 모양을 공유한다. */
function QuickLinkButton({
  link: { label, icon: Icon, text },
  active,
  onToggle,
}: {
  link: QuickLink
  active: boolean
  onToggle: () => void
}) {
  return (
    <IconButton
      variant="ghost"
      label={label}
      title={label}
      aria-pressed={active}
      onClick={onToggle}
      // 모바일에서는 햄버거·검색과 경합하므로 아이콘 진입점은 sm 이상에서만 노출한다.
      className={cn('hidden sm:grid', active && 'bg-gray-100 text-gray-900')}
      icon={
        Icon ? (
          <Icon aria-hidden className="size-5" strokeWidth={1.8} />
        ) : (
          <span aria-hidden className="text-body font-bold tracking-tight">
            {text}
          </span>
        )
      }
    />
  )
}

/**
 * 상단바 우측 전역 액션 — AI·캘린더·알림·퀵 메모·개인 메뉴 진입점. 다섯 다 우측 슬라이드오버(RightPanelHost)를
 * 여는 토글이며, 하나를 열면 나머지는 닫힌다(단일 활성). 상단바는 패널보다 z가 높아 패널을 연
 * 채로도 다른 진입점으로 전환할 수 있다. 워크스페이스 전환은 사이드바 소관.
 */
export function TopbarActions() {
  const user = useAuthStore((s) => s.user)
  const canOffice = hasWorkspaceRead(user, 'office')
  const { active, toggle } = useRightPanel()

  // 종 배지용 미읽음 수(목록 본문은 NotificationList가 조회한다 — 같은 queryKey라 캐시 공유).
  const { data: notifications } = useNotifications()
  const unread = (notifications ?? []).filter((n) => n.read_at == null).length

  // 개인 메뉴 버튼의 얼굴. 없으면 인물 아이콘으로 물러난다.
  const { data: photo } = useMyPhoto()

  return (
    <div className="flex items-center gap-1">
      {canOffice &&
        QUICK_LINKS.map((link) => (
          <QuickLinkButton
            key={link.key}
            link={link}
            active={active === link.key}
            onToggle={() => toggle(link.key)}
          />
        ))}
      <IconButton
        variant="ghost"
        label={unread > 0 ? `알림 ${unread}건` : '알림'}
        title="알림"
        aria-pressed={active === 'notifications'}
        onClick={() => toggle('notifications')}
        className={cn('relative', active === 'notifications' && 'bg-gray-100 text-gray-900')}
        icon={
          <>
            <Bell aria-hidden className="size-5" strokeWidth={1.8} />
            {unread > 0 && (
              // 미읽음 배지(9건 초과는 9+). 종 아이콘 우상단에 겹친다.
              <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-tag-table font-bold leading-4 text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </>
        }
      />
      {/* 퀵 메모는 전사 진입점 넷 가운데 가장 오른쪽 — 앞의 셋은 밖에서 내게 오는 것이고
          메모는 내가 적어 두는 것이라, '나'로 넘어가기 직전 자리가 제자리다. */}
      {canOffice && (
        <QuickLinkButton
          link={MEMO_LINK}
          active={active === MEMO_LINK.key}
          onToggle={() => toggle(MEMO_LINK.key)}
        />
      )}
      {/* 세로 구분선 — 앞의 넷(AI·캘린더·알림·메모)은 전사 기능이고 뒤의 하나는 '나'라, 같은 줄에
          붙어 있으면 넷이 한 묶음으로 읽힌다. 높이는 40px 버튼보다 낮춰(20px) 선이 버튼과 같은
          무게로 서지 않게 하고, 좌우 여백은 버튼 간격(gap-1)에 조금만 더한다. */}
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-gray-200" />
      {/* 개인 메뉴 — 대시보드 우측 열(인사말·근무체크·전자결재)을 그대로 연다. 다른 워크스페이스에
          있다가 출퇴근을 찍으려고 OFFICE로 돌아오지 않게 하는 것이 이 버튼의 목적이라, OFFICE
          권한과 무관하게(내 계정·내 근태는 누구에게나 자기 것이다) 항상 노출한다.
          가장 오른쪽 끝이 제자리다 — '나'에 관한 것은 전역 기능들 바깥에 선다. */}
      <button
        type="button"
        aria-label="개인 메뉴"
        title="개인 메뉴"
        aria-pressed={active === 'me'}
        onClick={() => toggle('me')}
        className={cn(topbarLabeledButton, active === 'me' && 'bg-gray-100 text-gray-900')}
      >
        {/* 아이콘 자리에 본인 사진을 끼운다 — 크기는 옆 아이콘들과 같은 20px이라 상단바의
            줄맞춤이 흔들리지 않는다. 사진이 없는 계정은 같은 크기의 인물 아이콘으로 물러난다
            (공용 PhotoBox의 플레이스홀더는 정사각 큰 규격이라 이 크기에 맞지 않는다). */}
        {photo ? (
          <img
            src={photo}
            alt=""
            className="size-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <CircleUserRound aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
        )}
        {/* 아이콘 옆에 지금 로그인한 사람의 이름을 적는다 — 이 버튼만 '나'에 관한 것이라,
            이름이 곧 이 자리가 무엇인지에 대한 설명이 된다(계정 확인도 겸한다).
            글자색은 버튼이 정한다(호버·활성에서 아이콘과 함께 진해진다). 이름이 길어도
            상단바가 밀리지 않게 잘라 두고, 좁은 화면에서는 아이콘만 남긴다. */}
        <span className="hidden max-w-32 truncate text-body font-medium sm:inline">
          {user?.name || '개인 메뉴'}
        </span>
      </button>
    </div>
  )
}
