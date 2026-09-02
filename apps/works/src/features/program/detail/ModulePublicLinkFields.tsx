import { Button, Field, Input, Select, Switch, useToast } from '@ynarcher/ui'
import { publicModuleUrl, type PublicLinkStatus } from '@/features/program/publicLinkHooks'
import type { PublicLinkForm } from '@/features/program/detail/publicLinkForm'
import { localToIso } from '@/features/program/detail/publicLinkTime'
import { effectiveLinkWindow, windowReadback } from '@/features/program/detail/publicLinkWindow'

const STATUS_OPTIONS: { value: PublicLinkStatus; label: string }[] = [
  { value: 'OPEN', label: '공개중' },
  { value: 'CLOSED', label: '마감' },
]

/**
 * 모듈 세팅 창의 '링크 공유' 칸.
 *
 * 공유 범위 셀렉트 아래에 서지만 **다른 축**이다 — 위는 로그인한 사람 중 누가 보는가를,
 * 여기는 로그인 없는 바깥에 문을 여는가를 정한다. 그래서 값을 합치지 않고 칸을 나눈다.
 *
 * 칸이 서는지는 **ADMIN이 정한 상한**이 답한다(module_templates.allow_public_link). 상한이
 * 닫힌 템플릿에서는 칸 자체를 두지 않는다 — 꺼진 채 비활성으로 두면 언젠가 켜질 수 있는
 * 것처럼 읽히는데, 그것을 켜는 자리는 여기가 아니라 ADMIN 모듈 관리다.
 *
 * 칸이 선 뒤 **켜고 끄는 것은 담당자**다. ADMIN은 종류를 열어 두었을 뿐이고, 이 건을 지금
 * 열지 말지는 그 사업을 아는 사람이 정한다.
 *
 * 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §5.1
 */
export function ModulePublicLinkFields({
  form,
  moduleStartDate,
  moduleEndDate,
}: {
  form: PublicLinkForm
  /** 편집 중인 모듈 기간('YYYY-MM-DD'). 기간 칸을 비우면 이 값이 그대로 적용된다. */
  moduleStartDate?: string
  moduleEndDate?: string
}) {
  const toast = useToast()
  if (!form.available) return null

  const url = publicModuleUrl(form.token)
  // 저장 전 폼 값으로 계산한다 — 담당자가 지금 고치고 있는 기간이 링크에 어떻게 적용되는지를
  // 저장 후에야 알게 되면, 되돌리려고 창을 다시 여는 왕복이 생긴다.
  const win = effectiveLinkWindow({
    linkOpenAt: localToIso(form.openAt),
    linkCloseAt: localToIso(form.closeAt),
    moduleStartDate: moduleStartDate ?? null,
    moduleEndDate: moduleEndDate ?? null,
  })

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.show('공개 주소를 복사했습니다.', 'success')
    } catch {
      toast.show('복사에 실패했습니다.', 'danger')
    }
  }

  const onRotate = async () => {
    if (
      !window.confirm(
        '주소를 새로 발급하면 지금까지 배포한 주소는 즉시 죽고 되살릴 수 없습니다.\n' +
          '새 주소를 다시 배포해야 합니다. 계속할까요?',
      )
    )
      return
    try {
      await form.rotate()
      toast.show('주소를 재발급했습니다. 새 주소를 다시 배포하세요.', 'success')
    } catch {
      toast.show('재발급에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-3 rounded-radius-sm border border-gray-200 bg-gray-25 p-3">
      <Field
        as="div"
        label="링크 공유"
        hint={
          '로그인 없이 이 메뉴 하나만 볼 수 있는 주소를 만듭니다.\n' +
          '같은 사업의 다른 메뉴·명부·내부 메모는 이 주소로 보이지 않습니다.\n' +
          '주소를 아는 사람은 누구나 열 수 있으므로, 개인정보가 든 자료는 올리지 마십시오.'
        }
      >
        <div className="flex items-center gap-2">
          <Switch
            id="mod-public-link"
            checked={form.enabled}
            onChange={form.setEnabled}
            aria-label="링크 공유"
          />
          <span className="text-caption text-gray-600">
            {form.enabled ? '주소를 아는 사람에게 공개' : '공개하지 않음'}
          </span>
        </div>
      </Field>

      {form.enabled && (
        <>
          <Field as="div" label="공개 주소">
            {url ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={url} className="min-w-0 flex-1 text-caption" />
                <Button variant="secondary" onClick={copy}>
                  복사
                </Button>
                <Button variant="secondary" disabled={form.rotating} onClick={onRotate}>
                  주소 재발급
                </Button>
              </div>
            ) : (
              // 다음 행동을 지시하는 안내라 접지 않는다(Field의 hintInline 예외와 같은 기준).
              <p className="text-caption text-gray-500">
                저장하면 주소가 만들어집니다. 껐다 켜도 같은 주소가 유지됩니다.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="공개 상태">
              <Select
                value={form.status}
                    onChange={(e) => form.setStatus(e.target.value as PublicLinkStatus)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="문의처"
              hint={'주소로 들어온 사람에게 보일 연락 창구입니다.\n비워 두면 표시하지 않습니다.'}
            >
              <Input
                placeholder="예: 02-000-0000 / ac@ynarcher.com"
                    value={form.contact}
                onChange={(e) => form.setContact(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="공개 시작"
              hint="비워 두면 이 메뉴의 시작일부터 열립니다."
            >
              <Input
                type="datetime-local"
                    value={form.openAt}
                onChange={(e) => form.setOpenAt(e.target.value)}
              />
            </Field>
            <Field label="공개 마감" hint="비워 두면 이 메뉴의 종료일까지 열립니다.">
              <Input
                type="datetime-local"
                    value={form.closeAt}
                onChange={(e) => form.setCloseAt(e.target.value)}
              />
            </Field>
          </div>
          {/* 비워 둔 칸이 무엇으로 채워지는지를 되읽어 준다 — 상속은 규칙 설명이 아니라
              지금 이 주소에 실제로 적용되는 값이라 접지 않는다. */}
          <p className="text-caption text-gray-700">{windowReadback(win)}</p>
        </>
      )}
    </div>
  )
}
