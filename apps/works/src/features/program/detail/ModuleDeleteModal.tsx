import { Banner, Button, Field, Input, Modal, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/program/config'
import {
  useDeleteProgramModule,
  useModuleDeleteBlockers,
  type ProgramModule,
} from '@/features/program/hooks'
import { moduleContentLabel } from '@/features/program/detail/moduleContentLabels'

/**
 * 따라쓸 문구 — 모듈 종류·이름과 무관하게 언제나 이 한 문구다(2026-09-02 통일).
 *
 * 종전에는 모듈명을 그대로 치게 했다. 확인 대상을 문구가 지목한다는 점은 좋았지만, 이름이
 * 길거나 괄호·연도가 섞이면 계속 실패하고, 모듈명을 비워 둔 인스턴스는 폴백이 템플릿 키라
 * 한글 화면에서 갑자기 영문 대문자를 치라고 했다. 따라쓰기가 확인하려는 것은 정확한 타자가
 * 아니라 지금 지운다는 의식적 동의이므로, 실패하지 않으면서 조작을 의식하게 만든다.
 *
 * '무엇을 지우는가'의 확인은 문구가 아니라 아래 경고 배너의 모듈명이 맡는다 — 둘 다에 실으면
 * 같은 말을 두 번 하는 것이고, 실패할 수 있는 쪽(입력)에만 실으면 정작 읽어야 할 배너를
 * 건너뛰게 된다.
 */
const CONFIRM_PHRASE = '삭제합니다'

/** 앞뒤 공백·마침표만 눈감아 주는 대조(서버와 같은 규칙). */
const matchesPhrase = (typed: string) =>
  typed.replace(/^[\s.]+|[\s.]+$/g, '') === CONFIRM_PHRASE

/** 인스턴스 표시명: 모듈명 우선, 없으면 템플릿 라벨 폴백(보드 카드와 같은 규칙). */
function moduleName(mod: ProgramModule): string {
  return (
    mod.title?.trim() ||
    MODULE_TYPES.find((d) => d.type === mod.module_type)?.label ||
    mod.module_type
  )
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

  const name = moduleName(mod)
  const rows = blockers ?? []
  // 막는 것(밖에서 들어온 기록)과 알리는 것(함께 사라지는 내부 배치)은 다른 목록이다.
  const blockingRows = rows.filter((b) => b.blocking)
  // 첨부는 지워지지 않고 사업 자료로 귀속만 풀리므로 세 번째 자리에 따로 선다.
  const cascadeRows = rows.filter((b) => !b.blocking && b.rel_name !== 'attachments')
  const detachedRow = rows.find((b) => b.rel_name === 'attachments')
  const blocked = blockingRows.length > 0
  const matched = matchesPhrase(typed)

  const onSubmit = async () => {
    try {
      await remove.mutateAsync({ moduleId: mod.id, confirmText: typed })
      toast.show(`'${name}' 모듈을 삭제했습니다.`, 'success')
      onDeleted()
    } catch (e) {
      // 서버가 세 관문을 각각 다른 코드로 답한다. 어느 관문에서 막혔는지가 곧 다음 행동이라
      // 코드를 문장으로 바꿔 준다(42501 권한 / 22023 문구 / 23001 잔존 데이터).
      const code = (e as { code?: string })?.code
      const message =
        code === '42501'
          ? '모듈 삭제는 이 사업의 PM만 할 수 있습니다.'
          : code === '22023'
            ? '확인 문구가 일치하지 않습니다.'
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
          <strong>'{name}'</strong> 모듈을 원장에서 영구히 지웁니다. 되돌릴 수 없습니다.
          잠시 감추려는 것이라면 삭제 대신 <strong>끄기</strong>를 쓰세요 — 데이터가 보존되고
          언제든 다시 켤 수 있습니다.
        </Banner>

        {isLoading && <Spinner />}

        {!isLoading && blocked && (
          <Banner tone="warning">
            <div className="mb-1 font-semibold">
              밖에서 들어온 기록이 있어 삭제할 수 없습니다.
            </div>
            <ul className="list-disc space-y-0.5 pl-4">
              {blockingRows.map((b) => (
                <li key={b.rel_name} className="tabular-nums">
                  {moduleContentLabel(b.rel_name)} {b.row_count}건
                </li>
              ))}
            </ul>
            <div className="mt-1">
              지원서·평가 제출처럼 밖에서 받은 것은 이 창에서 지울 수 없습니다. 각 화면에서
              정리한 뒤 다시 시도하세요.
            </div>
          </Banner>
        )}

        {/* 막지 않는 것도 말없이 지우지는 않는다 — 무엇이 함께 사라지는지 먼저 밝힌다. */}
        {!isLoading && !blocked && cascadeRows.length > 0 && (
          <Banner tone="warning">
            <div className="mb-1 font-semibold">함께 삭제됩니다.</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {cascadeRows.map((b) => (
                <li key={b.rel_name} className="tabular-nums">
                  {moduleContentLabel(b.rel_name)} {b.row_count}건
                </li>
              ))}
            </ul>
          </Banner>
        )}

        {!isLoading && !blocked && detachedRow && (
          <Banner tone="info">
            첨부 파일 <span className="tabular-nums font-semibold">{detachedRow.row_count}</span>건은
            지워지지 않고 <strong>사업 자료</strong>로 옮겨집니다.
          </Banner>
        )}

        {!isLoading && !blocked && (
          <Field
            label="확인 문구"
            required
            hint={`삭제하려면 "${CONFIRM_PHRASE}" 를 그대로 입력하세요.`}
            hintInline
            error={typed.length > 0 && !matched ? '문구가 일치하지 않습니다.' : undefined}
          >
            <Input
              autoFocus
              value={typed}
              placeholder={CONFIRM_PHRASE}
              invalid={typed.length > 0 && !matched}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
