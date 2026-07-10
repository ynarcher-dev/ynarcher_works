import { Banner, Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ENTITIES,
  isCompactEntity,
  resolveEntityFromCategory,
  type EntityConfig,
  type EntityKey,
} from '@/features/networks/config'

interface RowError {
  line: number
  message: string
}

/** 네트워크 통합 CSV 헤더(구분 기반 라우팅 모드). */
const NETWORK_IMPORT_HEADERS = [
  'name',
  'category',
  'affiliation',
  'department',
  'position',
  'email',
  'phone',
] as const

/**
 * 네트워크 CSV 한 행을 통일 스키마(scalar + profile jsonb) 페이로드로 변환하고,
 * '구분'(category) 값으로 저장 대상 엔티티를 해석한다. 조직 4종은 전문분야/매칭 미사용.
 */
function toNetworkPayload(cell: (h: string) => string | null): {
  target: EntityKey
  payload: Record<string, unknown>
} {
  const categoryRaw = cell('category')
  const target = resolveEntityFromCategory(categoryRaw)
  const compact = isCompactEntity(target)
  return {
    target,
    payload: {
      name: cell('name'),
      email: cell('email'),
      phone: cell('phone')?.replace(/\D/g, '') || null,
      affiliation: cell('affiliation'),
      expertise: [],
      profile: {
        department: cell('department'),
        position: cell('position'),
        category: ENTITIES[target].label,
        match_available: compact ? null : true,
        background: [],
      },
    },
  }
}

/**
 * 엑셀/CSV 대량 임포터(행 단위 유효성 검사).
 * 1행은 헤더(필드명), 이후 각 행을 검증 후 유효 행만 일괄 등록한다.
 * `routeByCategory`면 네트워크 통합 모드로, 각 행의 '구분'에 따라 대상 테이블로 분산 등록한다.
 * (바이너리 .xlsx 파싱은 SheetJS 도입 시 확장 — 현재는 CSV 붙여넣기 지원)
 */
export function ImporterModal({
  config,
  open,
  onClose,
  routeByCategory = false,
}: {
  config: EntityConfig
  open: boolean
  onClose: () => void
  /** 네트워크 통합 모드: '구분' 열로 대상 테이블을 분기해 등록한다. */
  routeByCategory?: boolean
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [csv, setCsv] = useState('')
  const [errors, setErrors] = useState<RowError[]>([])
  const [busy, setBusy] = useState(false)

  const onImport = async () => {
    setErrors([])
    const lines = csv.trim().split('\n').filter((l) => l.trim())
    if (lines.length < 2) {
      toast.show('헤더와 최소 1개 데이터 행이 필요합니다.', 'warning')
      return
    }
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim())
    const rowErrors: RowError[] = []
    // 네트워크 모드: 대상 테이블별로 그룹핑. 일반 모드: config.table 단일 배열.
    const byTable = new Map<EntityKey, Record<string, unknown>[]>()
    const push = (table: EntityKey, row: Record<string, unknown>) => {
      const list = byTable.get(table) ?? []
      list.push(row)
      byTable.set(table, list)
    }

    lines.slice(1).forEach((line, idx) => {
      const cells = line.split(',')
      const cell = (h: string): string | null => {
        const i = headers.indexOf(h)
        return i >= 0 ? cells[i]?.trim() || null : null
      }

      if (routeByCategory) {
        if (!cell('name')) {
          rowErrors.push({ line: idx + 2, message: '필수값 누락: 이름' })
          return
        }
        const { target, payload } = toNetworkPayload(cell)
        push(target, payload)
      } else {
        const row: Record<string, unknown> = {}
        headers.forEach((h) => {
          if (config.fields.some((f) => f.name === h)) row[h] = cell(h)
        })
        const missing = config.fields
          .filter((f) => f.required && !row[f.name])
          .map((f) => f.label)
        if (missing.length > 0) {
          rowErrors.push({ line: idx + 2, message: `필수값 누락: ${missing.join(', ')}` })
        } else {
          push(config.key, row)
        }
      }
    })

    setErrors(rowErrors)
    const validCount = [...byTable.values()].reduce((n, l) => n + l.length, 0)
    if (validCount === 0) {
      toast.show('등록 가능한 유효 행이 없습니다.', 'warning')
      return
    }

    setBusy(true)
    try {
      // 대상 테이블별로 분산 insert 후 각 테이블 캐시를 무효화한다.
      for (const [table, rows] of byTable) {
        const { error } = await supabase.from(table).insert(rows)
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['networks', table] })
      }
      toast.show(
        `${validCount}건 등록 완료${rowErrors.length ? ` (오류 ${rowErrors.length}건 제외)` : ''}`,
        'success',
      )
      if (rowErrors.length === 0) {
        setCsv('')
        onClose()
      }
    } catch {
      toast.show('일괄 등록에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const headerHint = routeByCategory
    ? NETWORK_IMPORT_HEADERS.join(',')
    : config.fields.map((f) => f.name).join(',')
  const title = routeByCategory
    ? '네트워크 대량 등록 (CSV · 구분별 자동 분류)'
    : `${config.label} 대량 등록 (CSV)`
  const placeholderRow = routeByCategory
    ? '홍길동,전문가,와이앤아처,전략실,대표,hong@yna.com,01012345678'
    : `${headerHint}\n와이앤아처,핀테크,...`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={() => void onImport()} disabled={busy}>
            검증 후 등록
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-caption text-gray-500">
          1행 헤더 예시: <code className="text-gray-700">{headerHint}</code>
        </p>
        {routeByCategory && (
          <p className="text-caption text-gray-500">
            '구분'은 전문가·BAN·투자사·기업·기관·대학·외주/거래·미분류 중 하나로 저장되며,
            해당하지 않는 값(게스트·스타트업 등)은 미분류로 등록됩니다.
          </p>
        )}
        <TextArea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={placeholderRow}
        />
        {errors.length > 0 && (
          <Banner tone="warning">
            <p className="font-medium">행 단위 오류 {errors.length}건</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((e) => (
                <li key={e.line} className="text-caption">
                  {e.line}행: {e.message}
                </li>
              ))}
            </ul>
          </Banner>
        )}
      </div>
    </Modal>
  )
}
