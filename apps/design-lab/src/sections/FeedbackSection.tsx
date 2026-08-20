import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  Banner,
  Button,
  Dropdown,
  DropdownItem,
  EmptyState,
  IconButton,
  Modal,
  SegmentedToggle,
  Skeleton,
  Spinner,
  TextArea,
  Tooltip,
  useToast,
} from '@ynarcher/ui'
import { Section, Spec } from '@/lib/Spec'

export function FeedbackSection() {
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'card' | 'table'>('table')
  const toast = useToast()

  return (
    <Section
      id="feedback"
      title="4. 상태와 대화"
      lede="같은 사건에는 언제나 같은 표현을 씁니다. 배너는 화면에 머무는 상태, 토스트는 방금 끝난 동작, 모달은 답이 필요한 질문입니다."
    >
      <Spec label="배너" note="화면에 머무는 상태 고지. 4단 톤은 상태 신호색과 같은 값을 씁니다.">
        <div className="space-y-2">
          <Banner tone="info">이 목록은 5분마다 갱신됩니다.</Banner>
          <Banner tone="success">3건이 정상 반영되었습니다.</Banner>
          <Banner tone="warning">투자금액이 비어 있는 기업이 2곳 있습니다.</Banner>
          <Banner tone="danger">권한이 없어 일부 열이 마스킹되었습니다.</Banner>
        </div>
      </Spec>

      <Spec label="토스트 · 모달 · 드롭다운" note="방금 끝난 동작 / 답이 필요한 질문 / 부가 액션 모음">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => toast.show('저장되었습니다.', 'success')}>
            토스트 띄우기
          </Button>
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            모달 열기
          </Button>
          <Dropdown
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            align="left"
            trigger={
              <IconButton
                icon={<MoreHorizontal />}
                label="더 보기"
                variant="outline"
                onClick={() => setMenuOpen((v) => !v)}
              />
            }
          >
            <DropdownItem onClick={() => setMenuOpen(false)}>복제</DropdownItem>
            <DropdownItem onClick={() => setMenuOpen(false)}>담당자 변경</DropdownItem>
            <DropdownItem disabled>비활성화</DropdownItem>
          </Dropdown>
          <Tooltip content="담당자 원장이 비어 있으면 공동관리입니다.">
            <span className="text-body text-gray-600 underline decoration-dotted">담당자란?</span>
          </Tooltip>
        </div>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="비활성화 사유"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                비활성화
              </Button>
            </>
          }
        >
          <div className="space-y-2">
            <p className="text-body text-gray-700">
              물리 삭제가 아니라 비활성화입니다. 기록은 남고 목록에서만 내려갑니다.
            </p>
            <TextArea rows={4} placeholder="사유를 입력하세요" />
          </div>
        </Modal>
      </Spec>

      <Spec label="보기 전환 · 로딩 · 빈 상태" note="같은 자리를 지키는 세 가지 얼굴">
        <div className="space-y-5">
          <SegmentedToggle
            label="보기 방식"
            options={[
              { key: 'table', label: '표' },
              { key: 'card', label: '카드' },
            ]}
            value={view}
            onChange={setView}
          />
          <div className="flex items-center gap-3">
            <Spinner />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div className="rounded-radius-md border border-gray-200 bg-gray-25">
            <EmptyState
              title="등록된 기업이 없습니다"
              description="조건을 바꾸거나 새 기업을 등록해 보세요."
              action={<Button variant="primary">기업 등록</Button>}
            />
          </div>
        </div>
      </Spec>
    </Section>
  )
}















