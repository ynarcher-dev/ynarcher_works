# 디자인 시스템 준수 감사 리포트

본 문서는 `apps/works` 프론트엔드 전반의 디자인 시스템 준수 실태를 감사한 결과입니다. 기준은 [5_component_spec_rules.md](./5_component_spec_rules.md)(컴포넌트 규격)와 [4_color_system_rules.md](./4_color_system_rules.md)(색·버튼 variant), 실제 토큰값은 `tailwind-preset.mjs`입니다. 정합(수정) 작업은 별도 세션으로 미루되, 착수 시 본 문서를 근거로 삼습니다.

> [!NOTE]
> 감사 일자 기준 스냅샷입니다. 파일 위치·행 번호는 이후 변경으로 이동할 수 있으니 착수 시 재확인합니다.

---

## 1. 핵심 결론

인라인 스타일 남발은 **증상**이며, 뿌리는 **단일 원천(SSOT)이 신뢰 불가** 상태라는 점입니다. 공식 컴포넌트 21종이 이미 존재함에도 우회가 잦은 이유는 세 갈래입니다.

* **① 스펙 문서 ↔ 공식 컴포넌트 불일치**: 문서가 규정한 값과 실제 컴포넌트 구현이 다릅니다(버튼 높이, 카드 radius, 입력 높이 등).
* **② 스펙 문서 자체의 내부 모순**: `radius.md`가 §1.1에서는 14px, §2.1·§3.2에서는 6px로 상충하는 등 애초에 그대로 지킬 수 없는 문서입니다.
* **③ 공식 컴포넌트 공백**: 스펙에 규격이 정의됐으나 구현이 없는 컴포넌트(IconButton·Radio·Accordion·Breadcrumb)가 있어 손수 제작이 강제됩니다.

> [!IMPORTANT]
> 지금 상태에서 인라인 코드를 공식 컴포넌트로 흡수하면 **스펙 위반이 오히려 전파**됩니다. 예: 인라인 카드 셸은 스펙대로 `radius.lg`(20px)를 쓰지만 공식 `Card`는 `radius.md`(14px)라, 통합 시 곡률이 스펙에서 후퇴합니다. 따라서 **SSOT 정합이 마이그레이션의 선행 조건**입니다.

---

## 2. 카테고리별 규모 요약

| 영역 | 인라인/우회 규모 | 공식 컴포넌트 흡수 가능 | High 이슈 |
| :--- | :--- | :--- | :--- |
| 버튼 | 인라인 `<button>` 81개 / 47파일 | 약 65~70% | 3 |
| 폼 컨트롤 | raw 폼요소 18개(실질 위반 8) | 6개 | 1 |
| 구조/카드 | 약 108건(카드 셸 ~100 + 테이블 4 + 탭 4) | 대부분 | 4 |

---

## 3. 공식 컴포넌트 ↔ 스펙 불일치 (원인 ①)

| 컴포넌트 | 스펙 요구 | 실제 구현 | 판정 | 근거 |
| :--- | :--- | :--- | :--- | :--- |
| Button (md) | 36px / 글꼴 16px / Medium | `h-10`(40px) / 14px / `font-semibold` | 불일치 | `packages/ui/src/components/Button.tsx:26,46` |
| Button (3단계) | lg40 / md36 / sm32 | sm(`h-8`) / md(`h-10`)의 2단계, lg 부재 | 미구현 | `Button.tsx:24-27` |
| Card | `radius.lg`(20px) | `radius.md`(14px) | 불일치 | `packages/ui/src/components/Card.tsx:33` |
| Input / Select | 36px(`h-9`) | `h-11`(44px) 전면 | 불일치 | `packages/ui/src/components/Input.tsx` |
| Tabs | `h-10` 명시, 비활성 `gray-700` | 높이 미고정(`py-2`), 비활성 `gray-500` | 불일치 | `packages/ui/src/components/Tabs.tsx:24-45` |
| Modal (md/lg) | 600 / 800~1000px | `max-w-lg`(512) / `max-w-2xl`(672) 미달 | 불일치 | `packages/ui/src/components/Modal.tsx:7-13` |
| TextArea | 최소 120px + `resize-y` | 둘 다 미탑재 | 불일치 | `packages/ui/src/components/TextArea.tsx` |

> DataTable(표준 메타컬럼·높이·테두리)·Badge·Switch·Checkbox·Dropdown·Banner는 대체로 스펙 정합입니다(경미 색 토큰 이탈 일부).

---

## 4. 공식 컴포넌트 공백 (원인 ③)

* **IconButton** — 아이콘 전용 버튼 약 30개가 크기 8종(`h-9 w-9`·`h-8 w-8`·`h-7 w-7`·`size-6`·`size-5`·`p-2`·`p-1.5`·무규격)으로 난립합니다. `aria-label`을 필수 prop으로 강제한 공식 컴포넌트 하나로 구조적 정리 + 접근성 위반 재발 방지가 가능합니다.
* **Radio** — 스펙 §2.3에 규격이 있으나 부재하여 `ProgramStageFields.tsx:61` 등에서 손수 제작됩니다.
* **Accordion (§3.6) / Breadcrumb (§3.7)** — 스펙 명세만 존재, 구현 부재.

---

## 5. 스펙 문서 내부 모순 (원인 ②)

* **`radius.md` 픽셀값 3중 상충**: §1.1 = 14px, §2.1(버튼) = 6px, §3.2(페이지네이션) = 6px.
* **Input 규격 상충**: §2.2 = 높이 36px·radius `sm`(4px), 그러나 §1.1은 Input = `radius.md`. 실제 코드는 높이 44px·`radius.md`.
* 문서를 정합의 기준으로 쓰려면 위 상충부터 해소해야 합니다.

---

## 6. 대표 인라인 우회 위치

* **카드 셸 4중 파편화**: 공식 `Card`(ui) 외에 `DetailPanelCard`([networks/DetailPanelCard.tsx:22](../../apps/works/src/features/networks/DetailPanelCard.tsx)), `SectionCard`가 [NetworkDetailPage.tsx:40](../../apps/works/src/features/networks/NetworkDetailPage.tsx)과 [EmployeeDetailPage.tsx:30](../../apps/works/src/features/management/EmployeeDetailPage.tsx)에 **동일 정의로 이중 존재**, STARTUP 등 인라인 복붙 다수.
* **인라인 탭 3중 재구현**: `ProjectDetailPage.tsx:58`, `FundDetailPage.tsx:104`, ProgramDetailPage가 언더라인 탭을 각자 인라인으로 구현(공식 `Tabs` 채택은 1파일뿐).
* **인라인 테이블 4곳**: `startup/MiniTable.tsx:18`, 랭킹/미리보기 패널 등.
* **primary 버튼 수제 복제**: `pages/LoginPage.tsx:81`이 `Button` primary 클래스를 손으로 복제.
* **비토큰 radius**: `ProjectPage.tsx:63`(`rounded-lg`), `DeptTreeRow.tsx`·`OrgLevelEditor.tsx:57`(소문자 `rounded`).

---

## 7. 접근성

전반 준수율은 높습니다(아이콘 버튼 대부분 `aria-label` 부여).

* **aria-label 누락 아이콘 버튼**: `management/panels/OrgLevelEditor.tsx:53`.
* **placeholder를 라벨 대용**(§2.2 위반): `ac/ProgramManagerEditor.tsx:84`.

---

## 8. 권장 로드맵

* **Phase 0 — SSOT 정합(선행·소규모·고레버리지)**: 5절 문서 내부 모순 해소 + 3절 각 토큰의 "문서 vs 코드" 정답 확정 → 공식 컴포넌트를 거기에 맞춤. *미실행 시 이후 단계가 오염을 전파합니다.*
* **Phase 1 — 공백 컴포넌트 신설**: IconButton, Radio, (Accordion, Breadcrumb).
* **Phase 2 — 흡수 마이그레이션**: 인라인 버튼·카드 셸·탭·폼을 공식 컴포넌트로 치환.
* **Phase 3 — 회귀 방어**: ESLint 룰로 비토큰 `rounded`, raw `<button>` primary 복제 등을 차단.

---

## 9. 미결 결정 사항

* **SSOT 방향**: 값이 어긋난 항목(버튼 36/40px, 카드 14/20px, 입력 36/44px 등)에서 문서와 코드 중 무엇을 정답으로 삼을지. 잠정 권고는 "수십 화면에서 검증된 **실제 코드값을 기준으로 문서를 최신화**"하되, 카드 `radius`만은 예외로 `radius.lg`(20px, 주변 다수·스펙 일치)로 통일 검토.
* 상기 결정 후 Phase 0 착수.

---

## 관련 기 반영 사항

* 상세 카드 섹션 외곽 테두리 `gray-300` 통일(스펙 §L84 준수) 및 전자결재 패널 카드화는 커밋 `e2fc0b3`으로 선반영되었습니다.
