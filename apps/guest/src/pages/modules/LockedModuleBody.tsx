import { CardShell } from '@ynarcher/ui'
import { Lock } from 'lucide-react'

/** 상태별 안내 — 무엇을 기다리는 중인지가 서로 다르므로 한 문구로 뭉치지 않는다. */
const LOCK_COPY = {
  DRAFT: {
    title: '아직 열리지 않은 메뉴입니다',
    description: '담당 운영진이 준비 중입니다. 진행 단계가 되면 내용이 열립니다.',
  },
  CANCELLED: {
    title: '취소된 메뉴입니다',
    description: '운영이 취소되어 내용을 볼 수 없습니다. 자세한 사항은 담당 운영진에게 문의해 주십시오.',
  },
}

/**
 * 잠긴 몸통. 자리표시(흐린 막대)를 블러로 덮고 그 위에 안내만 세운다.
 *
 * 진짜 내용을 블러로 가리는 것이 아니다 — 이 화면은 애초에 내용을 **불러오지 않으며**,
 * 서버도 준비·취소 메뉴의 글·링크·파일을 게스트에게 내주지 않는다. 뒤에 놓인 막대는
 * '여기에 무언가 들어설 자리'라는 사실만 말하는 그림이다(그래서 aria-hidden).
 */
export function LockedModuleBody({ status }: { status: string }) {
  const copy = status === 'CANCELLED' ? LOCK_COPY.CANCELLED : LOCK_COPY.DRAFT

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-[6px]">
        <CardShell>
          <div className="space-y-2">
            <div className="h-5 w-24 rounded bg-gray-200" />
            {['w-full', 'w-11/12', 'w-4/5'].map((w) => (
              <div
                key={w}
                className="flex h-12 items-center rounded-radius-md border border-gray-300 px-3"
              >
                <div className={`h-3.5 rounded bg-gray-200 ${w} max-w-[16rem]`} />
              </div>
            ))}
          </div>
        </CardShell>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
        <Lock aria-hidden className="size-5 text-gray-500" />
        <p className="text-body-lg font-medium text-gray-700">{copy.title}</p>
        <p className="max-w-md text-body text-gray-500">{copy.description}</p>
      </div>
    </div>
  )
}
