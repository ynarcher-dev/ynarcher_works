import {
  Badge,
  Button,
  IconButton,
  Modal,
  PanelCard,
  Select,
  TokenMultiSelect,
  cn,
} from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { approvalText } from '@/features/approval/config'
import {
  DEFAULT_PROGRAM_LINK_KIND,
  PROGRAM_LINK_META,
  PROGRAM_LINK_PICK_KINDS,
  programLinkKind,
  programRefKey,
  type ProgramLinkType,
} from '@/features/approval/programLinkApi'
import { useMinuteLinkPool } from '@/features/office/minutes/minuteLinkSearch'
import type { MinuteLinkPickKind } from '@/features/office/minutes/minuteLinks'

/**
 * 기안 화면이 들고 있는 연동 1건. 저장에 필요한 것은 종류·id뿐이지만, 고른 뒤에도 무엇을
 * 골랐는지 화면에 보여야 하므로 이름·코드를 함께 들고 있는다(저장 시 버려진다).
 */
export interface ProgramLinkDraft {
  targetType: ProgramLinkType
  targetId: string
  label: string
  code: string | null
}

interface Props {
  value: ProgramLinkDraft[]
  onChange: (next: ProgramLinkDraft[]) => void
}

/**
 * 워크스페이스 연동 입력(기안·수정 화면) — 이 결재가 어느 사업(AC·M&A·PROJECT)의 일인지
 * 문서를 쓰는 동안 정한다. 첨부와 같은 자리(우측 패널)에 서는 이유는 둘 다 문서에 붙는
 * 것이고, 붙이는 일은 상신 전에 끝나야 하기 때문이다.
 *
 * 고른 명단은 문서가 저장될 때 한 번에 원장에 반영된다(useSyncProgramLinks) — 여기서 즉시
 * 저장하면 아직 존재하지 않는(또는 결국 버려질) 기안이 사업에 걸린 것으로 읽힌다.
 */
export function ApprovalProgramField({ value, onChange }: Props) {
  const [picking, setPicking] = useState(false)

  return (
    <PanelCard
      title="워크스페이스 연동"
      count={value.length}
      action={
        <Button variant="secondary" onClick={() => setPicking(true)}>
          프로젝트 연동
        </Button>
      }
    >
      {value.length === 0 ? (
        <p className={approvalText.empty}>연동된 프로젝트가 없습니다.</p>
      ) : (
        // 상세 패널과 같은 한 줄짜리 행 규격. 다른 것은 행이 건너가는 버튼이 아니라 **떼는
        // 자리**라는 것뿐이라, 누르는 곳을 행 전체가 아니라 끝의 X 하나로 좁힌다 — 아직 문서를
        // 쓰는 중인데 행을 잘못 눌러 연동이 사라지면 안 된다.
        <ul className="space-y-1.5">
          {value.map((c) => (
            <li
              key={programRefKey(c)}
              className="flex min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2"
            >
              <Badge tone="info">{PROGRAM_LINK_META[c.targetType].kindLabel}</Badge>
              <span className={cn('min-w-0 flex-1 truncate', approvalText.primary)}>{c.label}</span>
              {c.code && (
                <span className={cn('shrink-0 tabular-nums', approvalText.meta)}>{c.code}</span>
              )}
              <IconButton
                density="table"
                variant="ghost"
                danger
                label="연동 해제"
                onClick={() => onChange(value.filter((v) => programRefKey(v) !== programRefKey(c)))}
                icon={<X size={14} />}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 열려 있는 동안에만 세운다 — 창을 닫으면 고르던 것이 함께 사라져야 하고(취소),
          다시 열면 지금의 명단에서 출발해야 한다. 마운트가 그 초기화를 대신한다. */}
      {picking && (
        <ProgramPickerModal value={value} onChange={onChange} onClose={() => setPicking(false)} />
      )}
    </PanelCard>
  )
}

/**
 * 연동할 프로젝트 고르기 — 종류를 고르고 이름으로 검색해 태그로 담는다(회의록 연동 피커와
 * 같은 UX). 후보 풀은 원장 RLS가 돌려준 행이 전부라, 열람할 수 없는 사업은 애초에 뜨지 않는다.
 * 창 안의 선택은 [확인]을 눌러야 문서에 반영된다 — 원장을 뒤지다 창을 닫았을 뿐인데 연동이
 * 바뀌어 있으면 안 된다(결재선 설정 창과 같은 규칙).
 */
function ProgramPickerModal({ value, onChange, onClose }: Props & { onClose: () => void }) {
  const [kind, setKind] = useState<MinuteLinkPickKind>(DEFAULT_PROGRAM_LINK_KIND)
  const [draft, setDraft] = useState<ProgramLinkDraft[]>(value)
  // 후보 풀은 창이 서 있는 동안에만 읽는다(기안 화면 첫 로딩에 얹히지 않게).
  const { data: pool } = useMinuteLinkPool(kind)

  // 이 피커의 종류 목록(PROGRAM_LINK_PICK_KINDS)에는 사업 3종만 들어 있으므로, 후보가
  // 들고 오는 종류도 그 셋뿐이다 — 여기서 한 번만 좁힌다.
  const options = useMemo<ProgramLinkDraft[]>(
    () =>
      (pool ?? []).map((c) => ({
        targetType: c.targetType as ProgramLinkType,
        targetId: c.targetId,
        label: c.label,
        code: c.code,
      })),
    [pool],
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="워크스페이스 연동"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => {
              onChange(draft)
              onClose()
            }}
          >
            확인
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className={approvalText.meta}>
          이 결재가 어느 사업의 일인지 밝힙니다. 여러 건을 고를 수 있습니다.
        </p>
        <div className="flex items-start gap-2">
          <div className="w-32 shrink-0">
            <Select
              value={kind.key}
              onChange={(e) => setKind(programLinkKind(e.target.value))}
              aria-label="연동 대상 종류"
            >
              {PROGRAM_LINK_PICK_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <TokenMultiSelect<ProgramLinkDraft>
              selected={draft}
              onChange={setDraft}
              options={options}
              getKey={programRefKey}
              getLabel={(c) => `${PROGRAM_LINK_META[c.targetType].kindLabel} · ${c.label}`}
              getMeta={(c) => c.code ?? undefined}
              getSearchText={(c) => `${c.label} ${c.code ?? ''}`}
              placeholder={`${kind.label} 검색 후 선택`}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
