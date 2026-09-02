import { useEffect, useState } from 'react'
import {
  useModulePublicLink,
  useRotateModulePublicLink,
  useSetModulePublicLink,
  type PublicLinkStatus,
} from '@/features/program/publicLinkHooks'

/**
 * 모듈 세팅 창의 링크 공유 칸이 쓰는 폼 상태.
 *
 * 모듈 저장(set_program_module)과 **별개 축**이라 저장 경로도 따로다. 다만 담당자에게는
 * 한 창이므로 버튼은 하나이며, 모듈이 저장된 뒤 `apply()`가 이어서 호출된다 — 두 축이
 * 독립이라는 사실이 담당자에게 '저장을 두 번 눌러야 한다'로 나타나서는 안 된다.
 *
 * 켤 수 있는 자리는 **이미 만들어진 모듈**뿐이다. 링크는 모듈 하나를 가리키는 주소라
 * 대상이 존재해야 발급되며, 신규 생성 중에는 가리킬 것이 아직 없다.
 */
export interface PublicLinkForm {
  /** 이 모듈에서 링크 공유 칸을 세울 수 있는가(허용 템플릿 + 편집 모드). */
  available: boolean
  enabled: boolean
  setEnabled: (v: boolean) => void
  status: PublicLinkStatus
  setStatus: (v: PublicLinkStatus) => void
  /** datetime-local 표기(빈 문자열이면 모듈 기간을 상속한다). */
  openAt: string
  setOpenAt: (v: string) => void
  closeAt: string
  setCloseAt: (v: string) => void
  contact: string
  setContact: (v: string) => void
  token: string | null
  viewCount: number
  rotating: boolean
  rotate: () => Promise<void>
  /** 모듈 저장 후 호출. 바뀐 것이 없으면 아무 요청도 보내지 않는다. */
  apply: () => Promise<void>
}

/** 'YYYY-MM-DDTHH:mm'(로컬) → ISO. 빈 값은 null(상속). */
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ISO → 'YYYY-MM-DDTHH:mm'(로컬). datetime-local 입력이 읽을 수 있는 형태. */
function toLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function useModulePublicLinkForm(
  moduleId: string | undefined,
  publicLinkable: boolean,
): PublicLinkForm {
  const available = Boolean(moduleId) && publicLinkable
  const { data: link } = useModulePublicLink(available ? moduleId : undefined)
  const save = useSetModulePublicLink(moduleId ?? '')
  const rotateMutation = useRotateModulePublicLink(moduleId ?? '')

  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<PublicLinkStatus>('OPEN')
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [contact, setContact] = useState('')

  // 서버 값이 도착하면 한 번 싣는다. 꺼짐의 표현은 상태 PRIVATE이며, 행이 없으면 아직 켠 적이
  // 없다는 뜻이라 기본 상태(공개중)로 두되 스위치는 꺼진 채로 둔다.
  useEffect(() => {
    if (!link) return
    setEnabled(link.status !== 'PRIVATE')
    setStatus(link.status === 'PRIVATE' ? 'OPEN' : link.status)
    setOpenAt(toLocal(link.open_at))
    setCloseAt(toLocal(link.close_at))
    setContact(link.contact ?? '')
  }, [link])

  const apply = async () => {
    if (!available) return
    const next: PublicLinkStatus = enabled ? status : 'PRIVATE'
    // 켠 적도 없고 지금도 끄는 중이면 원장에 행을 만들 이유가 없다 — 주소를 발급해 두고
    // 아무 데도 쓰지 않으면 그 주소가 언젠가 왜 있는지 모를 채로 남는다.
    if (!link && next === 'PRIVATE') return
    await save.mutateAsync({
      status: next,
      openAt: toIso(openAt),
      closeAt: toIso(closeAt),
      contact: contact.trim() || null,
    })
  }

  const rotate = async () => {
    await rotateMutation.mutateAsync()
  }

  return {
    available,
    enabled,
    setEnabled,
    status,
    setStatus,
    openAt,
    setOpenAt,
    closeAt,
    setCloseAt,
    contact,
    setContact,
    token: link?.token ?? null,
    viewCount: link?.view_count ?? 0,
    rotating: rotateMutation.isPending,
    rotate,
    apply,
  }
}
