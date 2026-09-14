// 앱과 **같은 글꼴**을 먼저 세운다(`apps/works/src/main.tsx` 첫 줄과 같다). 글꼴이 다르면
// 글자 폭이 달라지고, 폭이 달라지면 여기서 잰 잘림·넘침이 앱 이야기가 아니게 된다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '@ynarcher/ui'
import type { TableStage } from '@ynarcher/ui'
import {
  GuestBulkCase,
  GuestCreateCase,
  LedgerPickerCase,
  ParticipantAddCase,
} from './cases/GuestAccountsCase'
import './styles.css'

/**
 * 파일받기 세 화면은 **부를 때 읽는다**(`lazy`).
 *
 * 정적으로 들여오면 `?case=guest-create` 한 장을 세우는 데에도 파일받기 화면과 그 대역
 * (`mocks/guest/fileCollectionHooks`)까지 함께 읽힌다. 두 축은 서로 남남이라, 저쪽 대역이
 * 실제 훅 파일과 어긋나는 순간 **이쪽 화면이 통째로 빈 페이지가 된다** — 실제로 그렇게 됐다
 * (`useNodeFiles` export 없음). 검증 도구가 자기와 무관한 축의 표류로 멈추면 그때 재려던
 * 것을 재지 못한다.
 *
 * 이름 붙은 export를 `lazy`에 물리려면 기본 export 모양으로 감싸야 한다.
 */
const CollectionTreeCase = lazy(() =>
  import('./cases/CollectionTreeCase').then((m) => ({ default: m.CollectionTreeCase })),
)
const GuestModuleCase = lazy(() =>
  import('./cases/GuestCase').then((m) => ({ default: m.GuestModuleCase })),
)
const WorksPanelCase = lazy(() =>
  import('./cases/WorksCase').then((m) => ({ default: m.WorksPanelCase })),
)

/**
 * 브라우저 검증 픽스처의 입구.
 *
 * **프로덕션 라우터에는 손대지 않는다** — 이 화면은 저장소의 앱이 아니라 검사 도구이고,
 * 여기서 세우는 것은 실제 `packages/ui` 부품과 실제 Tailwind CSS다. 어떤 화면을 세울지는
 * 주소의 `?case=`가 정한다. 뒤에 올 `FileCollectionPanel`·GUEST 제출 화면도 이 표에 한 줄씩
 * 더하면 되고, 러너는 주소만 바꿔 부른다.
 */
const CASES: Record<string, (params: URLSearchParams) => React.ReactNode> = {
  tree: (params) => (
    <CollectionTreeCase
      scenario={params.get('scenario') ?? 'deep'}
      stage={(params.get('stage') as TableStage | null) ?? 'card'}
    />
  ),
  works: () => <WorksPanelCase />,
  guest: () => <GuestModuleCase />,
  // GUEST 계정 창 세 벌. 전부 같은 `Modal size="3xl"` 위에 서므로 한 줄씩 갈라 둔다.
  'participant-add': () => <ParticipantAddCase />,
  'guest-create': () => <GuestCreateCase />,
  'guest-bulk': () => <GuestBulkCase />,
  'ledger-picker': () => <LedgerPickerCase />,
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const key = params.get('case') ?? 'tree'
  const render = CASES[key]
  return (
    <div
      data-testid="fixture-root"
      data-case={key}
      className="min-h-full min-w-0 bg-gray-25 text-gray-900"
    >
      {/* 늦게 읽는 화면이 도착할 때까지의 자리. 러너는 `ready` 선택자를 기다리므로 이 문구를
          찍고 지나가지 않는다. */}
      <Suspense fallback={<p className="p-4">불러오는 중…</p>}>
        {render ? render(params) : <p className="p-4">알 수 없는 화면: {key}</p>}
      </Suspense>
    </div>
  )
}

const host = document.getElementById('root')
if (!host) throw new Error('#root 가 없습니다.')
createRoot(host).render(
  <StrictMode>
    {/*
      실제 화면은 검토·제출 결과를 토스트로 알린다(`useToast`는 Provider 밖에서 부르면 던진다).
      앱과 같은 부품을 같은 자리에 세워야, 토스트가 뜬 뒤의 화면 폭도 함께 재진다.
    */}
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
