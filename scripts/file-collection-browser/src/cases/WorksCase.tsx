/**
 * **실제 WORKS 화면**을 그대로 세우는 자리.
 *
 * 부품을 다시 조립하지 않는다 — `apps/works`의 `FileCollectionPanel`을 그대로 불러 세우고,
 * 통신·세션을 타는 훅만 Vite 플러그인이 대역으로 바꾼다(`vite.config.mjs`). 탭 전환·필터 선택·
 * 창 열기는 **러너가 화면을 눌러서** 만든다. 상태를 여기서 직접 심으면 그 상태에 이르는 길이
 * 실제로 열려 있는지는 영영 재지 못한다.
 */
import { FileCollectionPanel } from '@works/features/program/panels/FileCollectionPanel'
import { MODULE_ID, PROGRAM_ID } from '../appFixtures'

export function WorksPanelCase() {
  /*
    바깥 여백은 앱의 사업 상세와 같은 폭 규칙(전체 폭, 최소 폭 0)만 둔다. 여기서 폭을 더
    좁히면 좁은 화면의 잘림이 이 검증 도구가 만든 것인지 화면이 만든 것인지 갈리지 않는다.
  */
  return (
    <div className="min-w-0 p-4">
      <FileCollectionPanel programId={PROGRAM_ID} moduleId={MODULE_ID} />
    </div>
  )
}
