import { Badge, Banner, Button, CardShell, cardText, InfoField, Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ROLE_LABELS } from '@/features/management/config'
import { affiliationLabel } from '@/features/management/departmentOptions'
import { EmployeeNoteFields } from '@/features/management/EmployeeNoteFields'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { noteEditorInit, parseNote, type EmployeeNote } from '@/features/management/noteConfig'
import {
  useDepartments,
  useEmployee,
  useUpdateMyProfile,
} from '@/features/management/hooks'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { CareerEditor } from '@/features/networks/CareerEditor'
import { PhotoPicker } from '@/features/networks/PhotoPicker'
import { parseBackground, type CareerData } from '@/features/networks/careerConfig'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

/**
 * 마이페이지(내 계정 관리). 본인 계정 정보는 조회만 하고, 본인이 직접 바꿀 수 있는 것은
 * 사진·약력·노트와 자료 업로드로 한정한다(서버 RPC/RLS로 강제).
 * 편집기와 저장 규약(profile.photo / profile.background / 노트 세 항목)은 NETWORKS·인사 관리와 공용이다.
 * 이름·역할·부서·이메일 등 계정 필드 변경은 인사 관리(관리자)에서만 가능하다.
 */
export function MyPage() {
  const toast = useToast()
  const userId = useAuthStore((s) => s.user?.id)
  const { data: me, isLoading } = useEmployee(userId)
  const { data: depts } = useDepartments()
  const update = useUpdateMyProfile()
  // 이름 옆 호칭은 직급·직책 태그 원장의 표기 방식이 정한다(코드에 목록을 박지 않는다).
  const jobTitle = useJobTitleLabel()

  const [photo, setPhoto] = useState('')
  const [background, setBackground] = useState<CareerData>(parseBackground(null))
  const [note, setNote] = useState<EmployeeNote>(parseNote(null))
  // 이전 자유 텍스트 노트를 철학 칸으로 옮겨 실었는지 — 그때만 저장 시 원본 키를 비운다.
  const [carriedLegacy, setCarriedLegacy] = useState(false)

  // 로드된 프로필로 편집 필드를 동기화한다(최초/재조회 시).
  useEffect(() => {
    if (!me) return
    const p = me.profile ?? {}
    setPhoto(str(p.photo))
    setBackground(parseBackground(p.background))
    const init = noteEditorInit(p)
    setNote(init.value)
    setCarriedLegacy(init.carriedLegacy)
  }, [me])

  if (isLoading) return <Spinner />
  if (!me) return <Banner tone="warning">내 계정 정보를 불러올 수 없습니다.</Banner>

  const profile = me.profile ?? {}
  // 이름 옆 배지는 자리 표기(직급 직책) + 관리자(super_admin)뿐이다 — 임직원 상세와 동일 규칙.
  const jobLabel = jobTitle(str(profile.rank), str(profile.position))
  const adminLabel = me.user_type === 'super_admin' ? ROLE_LABELS[me.user_type] : ''

  // 부서/팀 표기(상위 · 하위)의 규칙은 departmentOptions.affiliationLabel이 소유한다.
  const affiliation = affiliationLabel(depts ?? [], me.department_id ?? null)

  const save = async () => {
    try {
      await update.mutateAsync({
        photo,
        background,
        philosophy: note.philosophy,
        interests: note.interests,
        oneLiner: note.oneLiner,
        // 옮겨 실었으면 원본을 비우고, 아니면 있던 값을 그대로 되돌려 보낸다(RPC는 덮어쓴다).
        note: carriedLegacy ? '' : str(profile.note),
      })
      toast.show('내 프로필을 저장했습니다.', 'success')
    } catch {
      toast.show('저장에 실패했습니다. 다시 시도하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-title-md font-bold text-gray-900">내 계정 관리</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 계정 정보(조회) + 사진·약력·노트(편집) */}
        <div className="space-y-4 lg:col-span-2">
          <CardShell>
            <div className="flex flex-wrap items-center gap-2">
              {/* 페이지 제목('내 계정 관리')이 따로 있으므로 이름은 카드 제목 층이다. */}
              <h2 className={cardText.title}>{me.name}</h2>
              {/* 자리 표기(직급 직책)는 임직원 상세 헤더와 같은 자리·같은 모양으로 둔다. */}
              {jobLabel && <Badge tone="neutral">{jobLabel}</Badge>}
              {adminLabel && <Badge tone="neutral">{adminLabel}</Badge>}
            </div>
            <p className={`mt-1 ${cardText.subtitle}`}>{affiliation || '-'}</p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <Info label="회사" value={str(profile.company)} />
              <Info label="직책" value={str(profile.position)} />
              <Info label="직급" value={str(profile.rank)} />
              {/* 호봉은 인사 관리(MANAGEMENT) 화면에서만 다룬다 — 본인 확인 화면에는 노출하지 않는다. */}
              <Info label="입사일" value={str(profile.hire_date)} />
              <Info label="이메일" value={me.email ?? ''} />
              <Info label="연락처" value={me.phone ?? ''} />
            </div>
            <p className="mt-3 text-caption text-gray-700">
              이름·역할·부서·연락처 등 계정 정보 변경은 인사 관리(경영지원)에 요청하세요.
            </p>
          </CardShell>

          <CardShell>
            <p className="mb-3 text-caption font-medium text-gray-700">사진</p>
            <PhotoPicker value={photo} onChange={setPhoto} />
          </CardShell>

          <CardShell>
            <p className="mb-3 text-caption font-medium text-gray-700">약력</p>
            <CareerEditor value={background} onChange={setBackground} />
          </CardShell>

          <CardShell>
            <EmployeeNoteFields value={note} onChange={setNote} />
          </CardShell>

          {/* 저장은 사진·약력·노트 세 카드를 한 번에 반영한다(카드별 저장 없음). */}
          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} disabled={update.isPending}>
              저장
            </Button>
          </div>
        </div>

        {/* 우측(1/3): 자료 업로드(공용 자료 패널 재사용). */}
        <div className="space-y-4 lg:col-span-1">
          <MaterialPanel targetType="employee" targetId={me.id} />
        </div>
      </div>
    </div>
  )
}
