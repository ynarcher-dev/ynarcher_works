import { Select, Spinner, Switch, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  ROLES,
  WORKSPACE_KEYS,
  nextLevel,
  type PermLevel,
  type RoleKey,
} from '@/features/admin/config'
import { usePermissionMatrix, useSetPermission } from '@/features/admin/hooks'

/** 동적 메뉴/데이터 접근 권한 제어 콘솔(역할별 Read/Write 토글 매트릭스). */
export function PermissionConsole() {
  const toast = useToast()
  const { data, isLoading } = usePermissionMatrix()
  const setPerm = useSetPermission()
  const [role, setRole] = useState<RoleKey>('ac_business')

  // 선택 역할의 워크스페이스별 현재 권한 단계 맵.
  const levels = useMemo(() => {
    const map: Record<string, PermLevel> = {}
    for (const row of data ?? []) {
      if (row.user_type === role) map[row.workspace_key] = row.permission_level
    }
    return map
  }, [data, role])

  const apply = async (ws: string, toggle: 'read' | 'write', on: boolean) => {
    const current = levels[ws] ?? 'none'
    const level = nextLevel(current, toggle, on)
    try {
      await setPerm.mutateAsync({ user_type: role, workspace_key: ws, level })
      toast.show('권한을 적용했습니다.', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      toast.show(
        msg.includes('관리자 권한')
          ? '시스템 관리자 권한은 해제할 수 없습니다.'
          : '적용에 실패했습니다. 권한을 확인하세요.',
        'danger',
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label className="text-body font-medium text-gray-800">역할 선택</label>
        <Select value={role} onChange={(e) => setRole(e.target.value as RoleKey)}>
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <div className="grid grid-cols-[1fr_auto_auto] items-center border-b border-gray-100 bg-gray-50 px-4 py-2 text-caption font-semibold text-gray-500">
            <span>워크스페이스</span>
            <span className="w-20 text-center">읽기</span>
            <span className="w-20 text-center">쓰기</span>
          </div>
          {WORKSPACE_KEYS.map((ws) => {
            const level = levels[ws.key] ?? 'none'
            const read = level === 'read' || level === 'write'
            const write = level === 'write'
            return (
              <div
                key={ws.key}
                className="grid grid-cols-[1fr_auto_auto] items-center border-b border-gray-100 px-4 py-2 last:border-b-0"
              >
                <span className="text-body text-gray-900">{ws.label}</span>
                <div className="flex w-20 justify-center">
                  <Switch
                    checked={read}
                    onChange={(v) => void apply(ws.key, 'read', v)}
                  />
                </div>
                <div className="flex w-20 justify-center">
                  <Switch
                    checked={write}
                    onChange={(v) => void apply(ws.key, 'write', v)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-caption text-gray-400">
        토글 즉시 해당 역할 사용자 세션 권한과 GNB 노출이 갱신됩니다. 쓰기 활성 시 읽기가
        자동 부여되며, 최고 관리자의 ADMIN 권한은 해제할 수 없습니다.
      </p>
    </div>
  )
}
