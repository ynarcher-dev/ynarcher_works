/**
 * **실제 GUEST 화면**을 그대로 세우는 자리.
 *
 * `apps/guest`의 `FileCollectionModule`을 그대로 부른다. 게스트 스토어와 통신을 타는 훅만
 * 대역이 물리고, 잠금 규칙(`writeStateOfModule`·`questionControls`)은 **실물 그대로**다 —
 * 마감된 요청에서 조작부가 잠기는지 여기서 그대로 확인할 수 있다. 문항 창도 화면을 눌러서
 * 연다(줄을 고르는 길이 실제로 열려 있는지까지 함께 재기 위해서다).
 */
import { FileCollectionModule } from '@guest/pages/modules/FileCollectionModule'
import { MODULE_ID } from '../appFixtures'
import { scenario } from '../mocks/scenario'

export function GuestModuleCase() {
  return (
    <div className="min-w-0 p-4">
      <FileCollectionModule moduleId={MODULE_ID} moduleStatus={scenario.moduleStatus} />
    </div>
  )
}
