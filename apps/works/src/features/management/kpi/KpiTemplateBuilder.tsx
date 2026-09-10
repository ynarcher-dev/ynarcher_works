import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, useToast } from '@ynarcher/ui'
import {
  useArchiveKpiRow,
  useCreateKpiTemplate,
  useKpiBlueprints,
  useKpiTemplateItems,
  useKpiTemplates,
  useSaveKpiBlueprint,
  useSaveKpiItem,
} from './kpiApi'
import { KpiItemModal } from './KpiItemModal'
import type { KpiScope, KpiTemplateItem } from './kpiTypes'

interface Props { versionId: string; editable: boolean }

export function KpiTemplateBuilder({ versionId, editable }: Props) {
  const toast = useToast()
  const { data: templates = [], isLoading } = useKpiTemplates(versionId)
  const { data: blueprints = [] } = useKpiBlueprints()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<KpiScope>('DEPARTMENT')
  const [roleHint, setRoleHint] = useState('')
  const [blueprintId, setBlueprintId] = useState('')
  const [editingItem, setEditingItem] = useState<KpiTemplateItem | null | undefined>(undefined)
  const createTemplate = useCreateKpiTemplate()
  const saveItem = useSaveKpiItem()
  const archiveTemplate = useArchiveKpiRow('kpi_templates')
  const archiveItem = useArchiveKpiRow('kpi_template_items')
  const saveBlueprint = useSaveKpiBlueprint()

  useEffect(() => {
    if (!selectedId || !templates.some((t) => t.id === selectedId)) setSelectedId(templates[0]?.id ?? null)
  }, [templates, selectedId])
  const selected = templates.find((t) => t.id === selectedId) ?? null
  const { data: items = [], isLoading: itemsLoading } = useKpiTemplateItems(selected?.id)
  const groups = useMemo(() => {
    const grouped = new Map<string, KpiTemplateItem[]>()
    for (const item of items) grouped.set(item.section_label, [...(grouped.get(item.section_label) ?? []), item])
    return grouped
  }, [items])

  const create = async () => {
    if (!name.trim()) return
    try {
      const id = await createTemplate.mutateAsync({ versionId, name: name.trim(), scope, roleHint: roleHint.trim() || null, blueprintId: blueprintId || null })
      setSelectedId(id); setCreateOpen(false); setName(''); setRoleHint(''); setBlueprintId('')
      toast.show('KPI 템플릿을 추가했습니다.', 'success')
    } catch (error) { toast.show(error instanceof Error ? error.message : '템플릿 생성에 실패했습니다.', 'danger') }
  }

  if (isLoading) return <Spinner />
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card title="KPI 템플릿" count={templates.length} actions={editable ? <Button onClick={() => setCreateOpen(true)}>템플릿 추가</Button> : undefined}>
        <div className="space-y-2">
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => setSelectedId(template.id)}
              className={`flex w-full items-center justify-between rounded-radius-md border px-3 py-2 text-left ${selectedId === template.id ? 'border-brand bg-brand/5' : 'border-gray-200 hover:bg-gray-50'}`}>
              <span className="min-w-0 truncate font-medium text-gray-900">{template.name}</span>
              <Badge tone={template.scope_type === 'PERSON' ? 'info' : 'neutral'}>{template.scope_type === 'PERSON' ? '개인' : '부서'}</Badge>
            </button>
          ))}
          {!templates.length && <EmptyState title="KPI 템플릿이 없습니다." description="부서용과 개인용 템플릿을 만들어 항목을 채우세요." />}
        </div>
      </Card>

      <Card title={selected?.name ?? '템플릿 내용'} count={items.length}
        subtitle={selected ? `${selected.scope_type === 'PERSON' ? '개인 KPI' : '부서 KPI'}${selected.role_hint ? ` · ${selected.role_hint}` : ''}` : undefined}
        actions={selected && editable ? <><Button variant="secondary" onClick={() => void saveBlueprint.mutateAsync({ template: selected, items }).then(() => toast.show('현재 구조를 구성 원형으로 저장했습니다.', 'success')).catch((e) => toast.show(e.message, 'danger'))}>구성 원형으로 저장</Button><Button onClick={() => setEditingItem(null)}>항목 추가</Button></> : undefined}>
        {!selected ? <EmptyState title="템플릿을 선택하세요." /> : itemsLoading ? <Spinner /> : (
          <div className="space-y-5">
            {[...groups.entries()].map(([section, rows]) => (
              <section key={section}>
                <h3 className="mb-2 font-semibold text-gray-900">{section}</h3>
                <div className="divide-y divide-gray-200 rounded-radius-md border border-gray-200">
                  {rows.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{item.metric_name}</p>
                        <p className="truncate text-caption text-gray-500">{item.description ?? '설명 없음'} · {item.rule_type}</p>
                      </div>
                      <span className="tabular-nums text-gray-700">{item.max_score == null ? '-' : `${item.max_score}점`}</span>
                      {editable && <><Button variant="ghost" onClick={() => setEditingItem(item)}>수정</Button><Button variant="outline-danger" onClick={() => void archiveItem.mutateAsync(item.id)}>삭제</Button></>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!items.length && <EmptyState title="등록된 KPI 항목이 없습니다." description="설명·인정 기준·점수 규칙을 가진 항목을 추가하세요." />}
            {editable && <div className="border-t border-gray-200 pt-4"><Button variant="outline-danger" onClick={() => void archiveTemplate.mutateAsync(selected.id)}>템플릿 삭제</Button></div>}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="KPI 템플릿 추가" dismissible={false}
        footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>취소</Button><Button onClick={() => void create()} disabled={createTemplate.isPending}>추가</Button></>}>
        <div className="space-y-3">
          <Field label="템플릿명" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="대상" required><Select value={scope} onChange={(e) => setScope(e.target.value as KpiScope)}><option value="DEPARTMENT">부서</option><option value="PERSON">개인</option></Select></Field>
          {scope === 'PERSON' && <Field label="직급·역할 힌트"><Input value={roleHint} onChange={(e) => setRoleHint(e.target.value)} placeholder="예: 그룹장, 팀원, PM" /></Field>}
          <Field label="구성 원형"><Select value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)}><option value="">빈 구성에서 시작</option>{blueprints.filter((b) => b.scope_type === scope).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        </div>
      </Modal>

      {selected && <KpiItemModal open={editingItem !== undefined} templateId={selected.id} item={editingItem}
        nextOrder={(items.at(-1)?.sort_order ?? -1) + 1} busy={saveItem.isPending} onClose={() => setEditingItem(undefined)}
        onSave={(values) => void saveItem.mutateAsync({ id: editingItem?.id, values }).then(() => { setEditingItem(undefined); toast.show('KPI 항목을 저장했습니다.', 'success') }).catch((e) => toast.show(e.message, 'danger'))} />}
    </div>
  )
}
