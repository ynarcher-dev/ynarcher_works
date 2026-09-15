import { Badge, Button, CardShell, cardText, cn } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ImageIcon, Users } from 'lucide-react'
import {
  buildSlots,
  isOpenOn,
  isPastDateKey,
  scheduleLabel,
  type ReservationSpan,
} from '@/features/office/rooms/availability'
import { roomPhotoUrl, roomSchedule, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'

interface Props {
  room: MeetingRoom
  date: Date
  /** 그날 이 회의실의 유효 예약(시간대). */
  spans: ReservationSpan[]
  /** 이 회의실·이 날짜의 예약 현황 모달을 연다(카드 전체와 '예약하기' 버튼이 함께 쓴다). */
  onOpen: () => void
}

/**
 * 가로형 회의실 카드(레퍼런스 재현): 좌측 사진 · 중앙 이름/위치/요일일정 · 우측 인원·예약하기,
 * 하단에 운영시간을 슬롯으로 쪼갠 가용성 바(예약된 슬롯은 채워 표시).
 * 컨테이너는 CardShell — 카드 밀도 맥락을 내려 내부 버튼·배지가 카드 규격으로 렌더된다.
 * 글자 위계는 cardText·InfoField가 소유하고 화면에서 규격 클래스를 직접 쓰지 않는다.
 *
 * 카드는 면 전체가 그날 예약 현황으로 들어가는 손잡이다 — 지난 날짜·휴무일이라 '예약하기'가
 * 비활성인 날에도 그날 누가 무엇을 잡아뒀는지는 볼 수 있어야 한다.
 */
export function RoomCard({ room, date, spans, onOpen }: Props) {
  const url = roomPhotoUrl(room.photoPath)
  const schedule = roomSchedule(room)
  const open = isOpenOn(schedule, date)
  const slots = buildSlots(schedule, spans, date)
  // 지나간 날짜는 예약을 받지 않는다(휴무와 같은 비활성 처리). 카드를 여는 것은 막지 않는다.
  const past = isPastDateKey(dayjs(date).format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD'))

  return (
    <CardShell className="relative flex items-stretch gap-4 transition-colors duration-fast hover:bg-gray-25">
      {/*
        카드 면을 덮는 손잡이. 카드를 통째로 <button>으로 감싸면 안쪽 '예약하기'가 버튼 속
        버튼이 되므로(잘못된 HTML), 형제로 깔고 눌러야 할 것만 그 위로 올린다 — 위치를 가진
        형제가 나중에 그려져 z 토큰 없이 DOM 순서로 층이 정해진다.

        형제 관계라 위로 올린 컨트롤의 클릭이 손잡이로 전파될 경로가 없고(stopPropagation
        불필요), 올리지 않은 것 — 인원 배지와 그 주변 여백 — 은 손잡이에 덮인 채로 남아
        카드 클릭이 된다. 포커스 링은 손잡이가 카드 면과 같은 크기라 안쪽으로 그린다.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${room.name} 예약 현황 보기`}
        className="absolute inset-0 cursor-pointer rounded-radius-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/10"
      />

      {/* 사진 */}
      <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-gray-100 text-gray-400">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-8" aria-hidden />
        )}
      </div>

      {/* 정보 + 가용성 바 (세로 중앙 정렬로 묶어 붕뜨는 여백 제거) */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className={cardText.subhead}>{room.name}</h3>
            <p className={cardText.label}>{scheduleLabel(schedule, date)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {room.capacity != null && (
              <Badge tone="info">
                <Users className="mr-1 size-3" aria-hidden />
                인원 {room.capacity}
              </Badge>
            )}
            {/* relative — 손잡이 위로 올라오는 유일한 컨트롤. */}
            <Button
              className="relative"
              onClick={onOpen}
              disabled={!open || past}
              title={past ? '지난 날짜는 예약할 수 없습니다.' : undefined}
            >
              예약하기
            </Button>
          </div>
        </div>

        {/* 가용성 슬롯 바(휴무일이면 안내 문구) */}
        {slots.length === 0 ? (
          <p className={cardText.label}>이 날은 예약할 수 없습니다.</p>
        ) : (
          /*
            가용성 바도 손잡이 위로 올린다 — 덮이면 슬롯별 시간 툴팁이 뜨지 않는다.
            클릭만 카드와 같은 동작으로 이어주고 role·tabIndex는 두지 않는다 — 키보드 경로는
            손잡이가 이미 갖고 있어, 더하면 같은 동작이 탭 순서에 두 번 선다.
          */
          <div className="relative flex cursor-pointer gap-0.5" onClick={onOpen}>
            {slots.map((s) => (
              <span
                key={s.start}
                title={`${s.start} - ${s.end}${s.reserved ? ' (예약됨)' : ''}`}
                className={cn(
                  'h-2.5 flex-1 rounded-sm',
                  s.reserved ? 'bg-brand/70' : 'bg-gray-200',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </CardShell>
  )
}
