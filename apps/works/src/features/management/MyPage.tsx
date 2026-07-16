import { Badge, Banner, Button, Spinner, TextArea, useToast } from '@ynarcher/ui'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ROLE_LABELS } from '@/features/management/config'
import {
  useDepartments,
  useEmployee,
  useUpdateMyProfile,
} from '@/features/management/hooks'
import { MaterialPanel } from '@/features/networks/MaterialPanel'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 라벨: 값 한 줄(읽기 전용 정보). */
function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-caption text-gray-400">{label}:</span>
      <span className="text-body text-gray-800">{value || '-'}</span>
    </div>
  )
}

/**
 * 마이페이지(내 계정 관리). 본인 계정 정보는 조회만 하고, 본인이 직접 바꿀 수 있는 것은
 * 약력·노트 텍스트와 자료 업로드로 한정한다(서버 RPC/RLS로 강제).
 * 이름·역할·부서·이메일 등 계정 필드 변경은 인사 관리(관리자)에서만 가능하다.
 */
export function MyPage() {
  const toast = useToast()
  const userId = useAuthStore((s) => s.user?.id)
  const { data: me, isLoading } = useEmployee(userId)
  const { data: depts } = useDepartments()
  const update = useUpdateMyProfile()

  const [bio, setBio] = useState('')
  const [note, setNote] = useState('')

  // 로드된 프로필로 편집 필드를 동기화한다(최초/재조회 시).
  useEffect(() => {
    if (!me) return
    const p = me.profile ?? {}
    setBio(str(p.bio))
    setNote(str(p.note))
  }, [me])

  if (isLoading) return <Spinner />
  if (!me) return <Banner tone="warning">내 계정 정보를 불러올 수 없습니다.</Banner>

  const profile = me.profile ?? {}
  const roleLabel = ROLE_LABELS[me.user_type] ?? me.user_type

  // 부서/팀 파생: 소속→루트 경로에서 인사 미노출(hr_hidden) 부서를 제외하고 가장 구체적인 2개를 취한다.
  const byId: Record<string, { name: string; parent_id: string | null; hidden: boolean }> = {}
  for (const d of depts ?? []) byId[d.id] = { name: d.name, parent_id: d.parent_id, hidden: d.hr_hidden }
  const chain: string[] = []
  for (let cur = me.department_id ?? null; cur && byId[cur]; cur = byId[cur]!.parent_id) {
    if (!byId[cur]!.hidden) chain.push(byId[cur]!.name)
  }
  const teamName = chain.length > 1 ? chain[0]! : ''
  const deptName = chain.length > 1 ? chain[1]! : chain[0] ?? ''
  const affiliation = [deptName, teamName].filter(Boolean).join(' · ')

  const save = async () => {
    try {
      await update.mutateAsync({ bio, note })
      toast.show('내 프로필을 저장했습니다.', 'success')
    } catch {
      toast.show('저장에 실패했습니다. 다시 시도하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-title-md font-bold text-gray-900">내 계정 관리</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 계정 정보(조회) + 약력·노트(편집) */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-body font-semibold text-gray-900">{me.name}</h2>
              <Badge tone="neutral" size="sm">
                {roleLabel}
              </Badge>
            </div>
            <p className="mt-1 text-body text-gray-500">{affiliation || '-'}</p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <Info label="회사" value={str(profile.company)} />
              <Info label="직책" value={str(profile.position)} />
              <Info label="직급" value={str(profile.rank)} />
              <Info label="호봉" value={str(profile.pay_step)} />
              <Info label="이메일" value={me.email ?? ''} />
              <Info label="연락처" value={me.phone ?? ''} />
            </div>
            <p className="mt-3 text-caption text-gray-400">
              이름·역할·부서·연락처 등 계정 정보 변경은 인사 관리(경영지원)에 요청하세요.
            </p>
          </section>

          <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-caption font-medium text-gray-600">약력</label>
                <TextArea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-caption font-medium text-gray-600">노트</label>
                <TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void save()} disabled={update.isPending}>
                  저장
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* 우측(1/3): 자료 업로드(공용 자료 패널 재사용). */}
        <div className="space-y-4 lg:col-span-1">
          <MaterialPanel targetType="employee" targetId={me.id} />
        </div>
      </div>
    </div>
  )
}
