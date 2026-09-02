import { Banner, Button, Field, Input, Modal, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  useDeleteProgramModule,
  useModuleDeleteBlockers,
  type ProgramModule,
} from '@/features/program/hooks'
import { moduleContentLabel } from '@/features/program/detail/moduleContentLabels'

/**
 * 따라쓸 문구 — 모듈명, 없으면 템플릿 키.
 *
 * 서버(delete_program_module)와 **같은 규칙**이어야 한다. 화면이 템플릿 라벨('모집')을
 * 보여 주고 서버는 키('RECRUITMENT')를 기대하면, 사용자는 보이는 대로 쳤는데 계속 틀렸다는
 * 말을 듣는다. 그래서 여기서는 표시명(nameOf)이 아니라 서버 기준을 그대로 쓴다.
 */
function moduleConfirmPhrase(mod: ProgramModule): string {
  return mod.title?.trim() || mod.module_type
}

/**
 * 모듈 영구 삭제 확인창.
 *
 * 끄기와 다른 축이라 창을 따로 세운다 — 끄기는 되돌릴 수 있는 운영 중단이고, 이쪽은 원장에서
 * 사라진다. 창이 하는 일은 셋이다: 되돌릴 수 없음을 알리고, 남은 데이터가 있으면 이유를 먼저
 * 보여 주고, 그렇지 않으면 모듈명을 그대로 쓰게 해 '이 모듈이 맞다'를 확인받는다.
 *
 * 세 가지 모두 서버가 다시 판정한다(PM · 문구 일치 · 잔존 데이터). 이 창은 실패를 예고할 뿐
 * 강제하지 않는다 — 화면에서 막는 것은 보안이 아니다.
 */
export function ModuleDeleteModal({
  module: mod,
  programId,
  onClose,
  onDeleted,
}: {
  module: ProgramModule
  programId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const { data: blockers, isLoading } = useModuleDeleteBlockers(mod.id)
  const remove = useDeleteProgramModule(programId)
  const [typed, setTyped] = useState('')

  const phrase = moduleConfirmPhrase(mod)
  const blocked = (blockers ?? []).length > 0
  const matched = typed.trim().toLowerCase() === phrase.toLowerCase()

  const onSubmit = async () => {
    try {
      await remove.mutateAsync({ moduleId: mod.id, confirmText: typed })
      toast.show(`'${phrase}' 모듈을 삭제했습니다.`, 'success')
      onDeleted()
    } catch (e) {
      // 서버가 세 관문을 각각 다른 코드로 답한다. 어느 관문에서 막혔는지가 곧 다음 행동이라
      // 코드를 문장으로 바꿔 준다(42501 권한 / 22023 문구 / 23001 잔존 데이터).
      const code = (e as { code?: string })?.code
      const message =
        code === '42501'
          ? '모듈 삭제는 이 사업의 PM만 할 수 있습니다.'
          : code === '22023'
            ? '확인 문구가 모듈명과 일치하지 않습니다.'
            : code === '23001'
              ? '모듈에 남아 있는 데이터가 있어 삭제할 수 없습니다.'
              : '삭제에 실패했습니다. 잠시 후 다시 시도하세요.'
      toast.show(message, 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="모듈 삭제"
      size="md"
      dismissible={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={blocked || !matched || isLoading || remove.isPending}
            onClick={() => void onSubmit()}
          >
            영구 삭제
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 되돌릴 수 없는 작업의 파급 효과 고지는 접지 않는다(5_component_spec_rules §3.6.1). */}
        <Banner tone="danger">
          <strong>'{phrase}'</strong> 모듈을 원장에서 영구히 지웁니다. 되돌릴 수 없습니다.
          잠시 감추려는 것이라면 삭제 대신 <strong>끄기</strong>를 쓰세요 — 데이터가 보존되고
          언제든 다시 켤 수 있습니다.
        </Banner>

        {isLoading && <Spinner />}

        {!isLoading && blocked && (
          <Banner tone="warning">
            <div className="mb-1 font-semibold">남아 있는 데이터가 있어 삭제할 수 없습니다.</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {(blockers ?? []).map((b) => (
                <li key={b.rel_name} className="tabular-nums">
                  {moduleContentLabel(b.rel_name)} {b.row_count}건
                </li>
              ))}
            </ul>
            <div className="mt-1">
              업무 기록은 이 창에서 지울 수 없습니다. 각 화면에서 정리한 뒤 다시 시도하세요.
            </div>
          </Banner>
        )}

        {!isLoading && !blocked && (
          <Field
            label="확인 문구"
            required
            hint={`삭제하려면 모듈명 "${phrase}" 을(를) 그대로 입력하세요.`}
            hintInline
            error={typed.length > 0 && !matched ? '모듈명과 일치하지 않습니다.' : undefined}
          >
            <Input
              autoFocus
              value={typed}
              placeholder={phrase}
              invalid={typed.length > 0 && !matched}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
