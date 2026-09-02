import { moduleTypeLabel } from '@ynarcher/master-data'
import { Card, IconButton, Spinner, Switch, useToast } from '@ynarcher/ui'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useModuleInstanceCounts } from '@/features/admin/moduleAdminHooks'
import {
  MODULE_CATEGORIES,
  useModuleTemplates,
  useSetModuleTemplates,
  type ModuleTemplate,
} from '@/features/program/moduleTemplateHooks'

/** 워크스페이스 열 — 사업 공용 모듈을 쓰는 셋뿐이라 열도 셋이다. */
const WORKSPACES = [
  { key: 'ac', label: 'AC' },
  { key: 'mna', label: 'M&A' },
  { key: 'project', label: 'PJT' },
] as const

/**
 * 모듈 관리(ADMIN): 사업 운영 모듈의 **템플릿 카탈로그**를 배치한다.
 *
 * 행을 만들지도 지우지도 않는다 — 템플릿은 화면 구현과 함께 오므로 행은 마이그레이션이 심고
 * 여기서는 배치 값(분류·순서·사용 여부·워크스페이스 노출·공유 상한)만 고친다.
 *
 * **누르면 곧 저장된다.** 처음에는 초안을 손에 들고 [저장]을 누르게 했는데, 토글은 눌린 순간
 * 반영됐다고 읽히는 컨트롤이라 담당자 화면이 안 바뀌는 것을 버그로 오해하게 만들었다.
 * 게시판·회의실 관리도 활성 토글을 즉시 저장하므로 조작감을 그쪽에 맞춘다. 순서 이동도 같다 —
 * 두 행의 sort_order를 맞바꿔 한 번에 보내며, RPC가 원자적이라 부분 반영이 없다.
 *
 * 끄는 것이 기존 인스턴스에 미치는 영향은 **축마다 다르다**. 카탈로그(사용·워크스페이스)는
 * 새로 못 만들게 할 뿐 진행 중인 인스턴스를 건드리지 않고, 상한(GUEST·링크)은 이미 열린
 * 것까지 닫는다. 그래서 확인 문구도 갈린다.
 *
 * 근거 기획: docs/docs_planning/3_2_1_admin_module_registry.md
 */
export function ModuleAdminPanel() {
  const toast = useToast()
  const { data: templates, isLoading } = useModuleTemplates()
  const { data: counts } = useModuleInstanceCounts()
  const save = useSetModuleTemplates()

  // 서버 값의 낙관적 사본. 누른 즉시 화면이 바뀌고, 저장이 실패하면 되돌린다.
  const [rows, setRows] = useState<ModuleTemplate[]>([])
  useEffect(() => {
    if (templates) setRows(templates)
  }, [templates])

  if (isLoading) {
    return (
      <Card title="모듈 관리">
        <Spinner />
      </Card>
    )
  }

  /** 바뀐 행만 즉시 보낸다. 실패하면 서버 값으로 되돌리고 사유를 말한다. */
  const commit = async (changed: ModuleTemplate[]) => {
    setRows((prev) => prev.map((t) => changed.find((x) => x.key === t.key) ?? t))
    try {
      await save.mutateAsync(changed)
    } catch {
      setRows(templates ?? [])
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const patch = (t: ModuleTemplate, part: Partial<ModuleTemplate>) => void commit([{ ...t, ...part }])

  /** 같은 분류 안에서 위/아래로 한 칸. 두 행의 sort_order를 맞바꾼다. */
  const move = (t: ModuleTemplate, dir: -1 | 1) => {
    const siblings = rows
      .filter((r) => r.category === t.category)
      .sort((a, b) => a.sort_order - b.sort_order)
    const swap = siblings[siblings.findIndex((r) => r.key === t.key) + dir]
    if (!swap) return
    void commit([
      { ...t, sort_order: swap.sort_order },
      { ...swap, sort_order: t.sort_order },
    ])
  }

  /**
   * 끄기 전 확인. 축에 따라 다른 사실을 말한다 — 카탈로그는 "새로 못 만든다",
   * 상한은 "이미 열린 것도 닫힌다". 되돌릴 수 없다는 고지는 하지 않는다(사실이 아니다).
   */
  const confirmOff = (t: ModuleTemplate, kind: 'catalog' | 'exposure', what: string): boolean => {
    const n = counts?.get(t.key) ?? 0
    const body =
      kind === 'catalog'
        ? `앞으로 새로 배치할 수 없습니다. 이미 배치된 ${n}건은 그대로 동작합니다.`
        : `이미 배치된 ${n}건 중 열려 있던 것도 즉시 닫힙니다. 설정값과 주소는 남아 있어 다시 켜면 돌아옵니다.`
    return window.confirm(`'${moduleTypeLabel(t.key)}'의 ${what}을(를) 끕니다.\n${body}\n\n계속할까요?`)
  }

  return (
    <Card
      title="모듈 관리"
      count={rows.length}
      help={
        '사업 운영 모듈의 템플릿 목록을 배치합니다. 누르면 곧바로 저장됩니다.\n' +
        '사용·워크스페이스를 끄면 새로 배치할 수 없을 뿐 기존 모듈은 그대로 동작합니다.\n' +
        'GUEST·링크 상한을 내리면 이미 열려 있던 것도 즉시 닫힙니다(설정값은 보존).'
      }
    >
      <div className="space-y-5">
        {MODULE_CATEGORIES.map((c) => {
          const group = rows
            .filter((t) => t.category === c.key)
            .sort((a, b) => a.sort_order - b.sort_order)
          if (group.length === 0) return null
          return (
            <section key={c.key}>
              <h3 className="mb-2 text-caption font-semibold text-gray-600">{c.label}</h3>
              <ul className="space-y-1.5">
                {group.map((t, i) => {
                  // 어디에도 서지 않는 행은 흐리게 — 의도한 상태인지 되묻게 하되 막지는 않는다.
                  const nowhere = t.is_active && t.workspaces.length === 0
                  return (
                    <li
                      key={t.key}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-radius-sm border border-gray-200 px-3 py-2 ${
                        t.is_active ? '' : 'bg-gray-25'
                      } ${nowhere ? 'opacity-60' : ''}`}
                    >
                      <span className="flex shrink-0 gap-0.5">
                        <IconButton
                          variant="ghost"
                          label="위로"
                          icon={<ChevronUp className="h-4 w-4" />}
                          disabled={i === 0 || save.isPending}
                          onClick={() => move(t, -1)}
                        />
                        <IconButton
                          variant="ghost"
                          label="아래로"
                          icon={<ChevronDown className="h-4 w-4" />}
                          disabled={i === group.length - 1 || save.isPending}
                          onClick={() => move(t, 1)}
                        />
                      </span>

                      <span className="min-w-[7rem] flex-1 text-body font-medium text-gray-900">
                        {moduleTypeLabel(t.key)}
                      </span>

                      <Toggle
                        label="사용"
                        checked={t.is_active}
                        onChange={(on) => {
                          if (!on && !confirmOff(t, 'catalog', '사용')) return
                          patch(t, { is_active: on })
                        }}
                        name={`${t.key}-active`}
                      />

                      {WORKSPACES.map((w) => (
                        <Toggle
                          key={w.key}
                          label={w.label}
                          checked={t.workspaces.includes(w.key)}
                          disabled={!t.is_active}
                          onChange={(on) => {
                            if (!on && !confirmOff(t, 'catalog', `${w.label} 노출`)) return
                            patch(t, {
                              workspaces: on
                                ? [...t.workspaces, w.key]
                                : t.workspaces.filter((k) => k !== w.key),
                            })
                          }}
                          name={`${t.key}-${w.key}`}
                        />
                      ))}

                      <Toggle
                        label="GUEST"
                        checked={t.allow_guest}
                        disabled={!t.is_active}
                        onChange={(on) => {
                          if (!on && !confirmOff(t, 'exposure', 'GUEST 공개 허용')) return
                          patch(t, { allow_guest: on })
                        }}
                        name={`${t.key}-guest`}
                      />
                      <Toggle
                        label="링크"
                        checked={t.allow_public_link}
                        disabled={!t.is_active}
                        onChange={(on) => {
                          if (!on && !confirmOff(t, 'exposure', '링크 공유 허용')) return
                          patch(t, { allow_public_link: on })
                        }}
                        name={`${t.key}-link`}
                      />

                      {/* 끄기 전에 영향 범위가 같은 줄에 서 있어야 한다. */}
                      <span className="w-20 shrink-0 text-right text-caption tabular-nums text-gray-600">
                        배치 {counts?.get(t.key) ?? 0}건
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </Card>
  )
}

/** 라벨을 단 토글 한 칸. 스위치는 글자를 품지 않으므로 접근명을 반드시 함께 준다. */
function Toggle({
  label,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  name: string
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-caption text-gray-600">{label}</span>
      <Switch
        id={`mt-${name}`}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </span>
  )
}
