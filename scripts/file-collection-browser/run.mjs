import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { importFromApp } from './resolve.mjs'
import { findBrowser, startFixtureServer } from './harness.mjs'
import { IN_PAGE } from './checks.mjs'

/**
 * 파일받기 화면의 **브라우저 검증 러너**.
 *
 * 하는 일은 넷이다 — 자기 Vite 서버를 띄우고, 실제 크로미움으로 그 주소를 열고, 화면을 재고,
 * 스크린샷과 판정을 OS 임시 폴더에 떨군 뒤 서버를 내린다. 저장소에는 아무것도 쓰지 않는다.
 *
 * `pnpm ... exec vite <폴더>` 로 부르지 않는 이유: Vite CLI는 설정 파일을 임시 파일로 옮겨
 * 담고 그 자리에서 bare import를 푼다. 이 폴더에는 `node_modules`가 없어 그때
 * `ERR_MODULE_NOT_FOUND: @vitejs/plugin-react` 로 끝난다. 여기서는 설정을 **객체로 직접
 * 넘겨**(`configFile: false`) 그 경로 자체를 없앤다.
 *
 * 화면 상태는 **눌러서** 만든다(탭 전환·필터 선택·줄 클릭). 상태를 코드로 심으면 그 상태에
 * 이르는 길이 실제로 열려 있는지는 영영 재지 못한다.
 *
 * 실행: `node scripts/file-collection-browser/run.mjs [--headed] [--keep] [--only <이름조각>]`
 */

const require = createRequire(import.meta.url)

const VIEWPORTS = [320, 375, 768, 1280, 1440]

/** 화면에 표가 서는 줄에서 함께 보는 검사. */
const TABLE_CHECKS = ['tableScrollContained']
/** 문항 트리가 서는 줄에서 함께 보는 검사. */
const TREE_CHECKS = ['treeScrollReachable', 'longTitleNotClipped', 'rowsFocusable']
/** 어느 화면에서나 보는 검사 — 페이지가 밀리지 않는가, 조작부가 눌리는가. */
const BASE_CHECKS = ['pageNoHorizontalOverflow', 'controlsHittable']

/** '받는 사람' 탭으로 옮긴다. 실제 사용자가 하는 그 동작 그대로. */
const openTab = (label) => async (page) => {
  await page.getByRole('tab', { name: new RegExp(label) }).click()
}

/**
 * 조작 확인은 **얕은 표본**에서 한다(`&shallow=1`). 깊이 20짜리 표본은 좁은 화면의 잘림을
 * 재기 위한 것이라 단계를 더 늘릴 자리가 없고, 같은 이름의 칸이 스무 개라 무엇을 눌렀는지도
 * 흐려진다. 아래 줄들은 상태를 심지 않고 **눌러서** 만든다.
 */
const SHALLOW = 'case=works&shallow=1'

function assert(ok, message, detail) {
  if (!ok) throw new Error(detail ? `${message} — ${JSON.stringify(detail)}` : message)
}

const rowCount = (page) => page.locator('table tbody tr').count()
/** 마지막 단계(문항) 칸들. 단계 이름이 곧 접근성 이름이다. */
const questionCells = (page) => page.getByLabel('문항', { exact: true })

/** 저장이 끝났는가 — 고칠 것이 없어지면 '구성 저장'이 꺼진다. */
const waitSaved = (page) =>
  page.waitForFunction(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '구성 저장' && b.disabled)`,
    { timeout: 10000 },
  )

const clickSave = async (page) => {
  await page.getByRole('button', { name: '구성 저장' }).click()
}

/**
 * 그 단계의 **빈 칸**을 집는다.
 *
 * 자리(nth)로 집으면 표본이 조금만 달라져도 엉뚱한 칸을 채우고, 그때 이 검증은 "저장 버튼이
 * 꺼져 있다"는 엉뚱한 실패로 끝난다. 새로 선 가지의 칸은 비어 있다는 사실로 집는다.
 */
async function blankCell(page, label) {
  const cells = page.getByLabel(label, { exact: true })
  const count = await cells.count()
  for (let i = 0; i < count; i += 1) {
    if ((await cells.nth(i).inputValue()) === '') return cells.nth(i)
  }
  throw new Error(`${label} 단계에 빈 칸이 없다`)
}

/** 관제 탭에서 대상·문항을 골라 제출 내역을 한 줄로 좁힌다. */
async function narrowMonitor(page) {
  await page.getByLabel('대상 필터').selectOption('asg-0')
  await page.getByLabel('문항 필터').selectOption('n-q0')
  await page.locator('table').last().locator('tbody tr').first().waitFor({ timeout: 10000 })
}

/**
 * 각 줄은 한 화면 상태다.
 *
 * `ready`는 그 상태가 실제로 섰다는 증거이며, 이것이 뜨기 전에 재면 빈 화면을 재게 된다.
 * `modal`이 켜진 줄은 창 검사(맞춤·바닥 도달)와 파일 이름 검사를 함께 받는다.
 */
const CASES = [
  // 1) 부품 단위 — 트리 표만 세운 합성 화면(관리 열에 입력칸이 서는 유일한 자리).
  {
    name: 'tree-deep-card',
    query: 'case=tree&scenario=deep&stage=card',
    ready: '[role="treegrid"] [data-row-id]',
    checks: [...BASE_CHECKS, ...TREE_CHECKS, ...TABLE_CHECKS, 'actionsNotClipped'],
    keyboard: 'fixture',
  },
  {
    name: 'tree-deep-page',
    query: 'case=tree&scenario=deep&stage=page',
    ready: '[role="treegrid"] [data-row-id]',
    checks: [...BASE_CHECKS, ...TREE_CHECKS, ...TABLE_CHECKS, 'actionsNotClipped'],
    keyboard: 'fixture',
  },
  {
    name: 'tree-many-card',
    query: 'case=tree&scenario=many&stage=card',
    ready: '[role="treegrid"] [data-row-id]',
    checks: [...BASE_CHECKS, ...TREE_CHECKS, ...TABLE_CHECKS, 'actionsNotClipped'],
    keyboard: 'fixture',
  },
  {
    name: 'tree-mixed-card',
    query: 'case=tree&scenario=mixed&stage=card',
    ready: '[role="treegrid"] [data-row-id]',
    checks: [...BASE_CHECKS, ...TREE_CHECKS, ...TABLE_CHECKS, 'actionsNotClipped'],
    keyboard: 'fixture',
  },

  // 2) 실제 WORKS 화면 — 공개 전(구성·받는 사람)과 공개 뒤(관제·검토 창).
  /*
    문항 구성은 2026-09-13부터 트리가 아니라 **가로 계층 격자**다(품의 예산작성과 같은 표).
    그래서 트리 전용 검사(treegrid 셀렉터·접기/펴기 키보드)를 걸지 않고, 표가 가로로 넘칠 때
    스크롤로 닿는지와 조작부가 눌리는지를 본다 — 단계 열이 늘어날수록 그것이 이 화면의 위험이다.
  */
  {
    name: 'works-structure',
    query: 'case=works',
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  // 2-b) 구성 편집의 **조작**들. 각 줄은 눌러서 상태를 만들고, 그 결과를 setup 안에서 단언한다
  //      (단언이 깨지면 러너가 그 줄을 오류로 적는다).
  {
    name: 'works-structure-slow',
    query: `${SHALLOW}&slow=1`,
    setup: async (page) => {
      // 조회가 늦게 온다. 그 사이 세운 빈 표에 갇히지 않고 진짜 트리로 초기화돼야 한다.
      await page.locator('table tbody tr input').first().waitFor({ timeout: 15000 })
      const value = await questionCells(page).first().inputValue()
      assert(value === '재무제표', '늦게 온 트리로 초기화되지 않았다', { value })
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-depth',
    query: SHALLOW,
    setup: async (page) => {
      const before = await questionCells(page).first().inputValue()
      const columns = await page.locator('table thead th').count()
      await page.getByLabel('분류 단계 수').selectOption('3')
      await page.waitForFunction(
        `document.querySelectorAll('table thead th').length > ${columns}`,
        { timeout: 10000 },
      )
      // 늘어난 것은 열과 **빈 분류**뿐이어야 한다. 문항 칸의 값은 그대로 마지막 열에 남는다.
      const after = await questionCells(page).first().inputValue()
      assert(after === before, '단계를 늘렸더니 문항 칸의 값이 바뀌었다', { before, after })
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-branch',
    query: SHALLOW,
    setup: async (page) => {
      const before = await rowCount(page)
      await page.getByRole('button', { name: '대분류 추가' }).first().click()
      await page.waitForFunction(
        `document.querySelectorAll('table tbody tr').length === ${before + 1}`,
        { timeout: 10000 },
      )
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-empty-folder',
    query: SHALLOW,
    setup: async (page) => {
      const before = await questionCells(page).count()
      await page.getByRole('button', { name: '문항 넣기' }).first().click()
      await page.waitForFunction(
        `document.querySelectorAll('table input[aria-label="문항"]').length === ${before + 1}`,
        { timeout: 10000 },
      )
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-save-cycle',
    query: SHALLOW,
    setup: async (page) => {
      // (1) 새 가지를 세우고 이름을 적어 저장한다.
      await page.getByRole('button', { name: '대분류 추가' }).first().click()
      await (await blankCell(page, '대분류')).fill('새 분류')
      await (await blankCell(page, '문항')).fill('새 문항')
      await clickSave(page)
      await waitSaved(page)
      const saved = await rowCount(page)

      // (2) 저장된 상태에서 한 번 더 고쳐 저장한다 — 같은 가지가 또 생기면 안 된다.
      await page.getByLabel('새 문항 필수').check()
      await clickSave(page)
      await waitSaved(page)
      const again = await rowCount(page)
      assert(again === saved, '두 번째 저장이 같은 가지를 또 만들었다', { saved, again })
      const value = await questionCells(page).last().inputValue()
      assert(value === '새 문항', '저장 뒤 새 문항의 값이 사라졌다', { value })
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-save-error',
    query: `${SHALLOW}&saveError=1`,
    setup: async (page) => {
      const cell = questionCells(page).first()
      await cell.fill('고치는 중')
      await clickSave(page)
      await page.getByText('다른 사용자가 먼저 저장했습니다').first().waitFor({ timeout: 10000 })
      const value = await cell.inputValue()
      assert(value === '고치는 중', '저장이 거절됐는데 고치던 값이 사라졌다', { value })
      const disabled = await page.getByRole('button', { name: '구성 저장' }).isDisabled()
      assert(!disabled, '저장이 거절됐는데 다시 시도할 수 없다')
    },
    ready: 'table tbody tr input',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-readonly',
    query: `${SHALLOW}&canWrite=0`,
    setup: async (page) => {
      await page.locator('table tbody tr').first().waitFor()
      const inputs = await page.locator('table input').count()
      assert(inputs === 0, '읽기 권한인데 표에 입력칸이 있다', { inputs })
    },
    ready: 'table tbody tr',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-structure-published',
    query: `${SHALLOW}&published=1`,
    setup: async (page) => {
      await page.getByRole('tab', { name: /문항 구성/ }).click()
      await page.locator('table tbody tr').first().waitFor()
      const inputs = await page.locator('table input').count()
      assert(inputs === 0, '공개 뒤인데 구성 표에 입력칸이 있다', { inputs })
    },
    ready: 'table tbody tr',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-targets',
    query: 'case=works',
    setup: openTab('받는 사람'),
    ready: 'table tbody tr',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-monitor',
    query: 'case=works&published=1',
    setup: narrowMonitor,
    ready: 'table tbody tr',
    checks: [...BASE_CHECKS, ...TABLE_CHECKS],
  },
  {
    name: 'works-review-modal',
    query: 'case=works&published=1',
    setup: async (page) => {
      await narrowMonitor(page)
      // 좁힌 한 줄이 검토할 수 있는 그 줄(제출됨)이다 — 누르면 실제 상세 창이 열린다.
      await page.locator('table').last().locator('tbody tr').first().click()
    },
    ready: '[role="dialog"]',
    checks: [...BASE_CHECKS, 'modalFits', 'fileNameReadable'],
    modal: true,
  },

  // 3) 실제 GUEST 화면 — 목록과 문항 창(열림·마감), 그리고 조회 실패.
  {
    name: 'guest-tree',
    query: 'case=guest',
    ready: '[role="treegrid"] [data-row-id]',
    checks: [...BASE_CHECKS, ...TREE_CHECKS, ...TABLE_CHECKS],
    keyboard: 'tree',
  },
  {
    name: 'guest-detail-open',
    query: 'case=guest',
    setup: async (page) => page.locator('[data-row-id="n-q1"]').click(),
    ready: '[role="dialog"]',
    checks: [...BASE_CHECKS, 'modalFits', 'fileNameReadable'],
    modal: true,
  },
  {
    name: 'guest-detail-closed',
    query: 'case=guest&moduleStatus=CLOSED',
    setup: async (page) => page.locator('[data-row-id="n-q1"]').click(),
    ready: '[role="dialog"]',
    checks: [...BASE_CHECKS, 'modalFits', 'fileNameReadable'],
    modal: true,
  },
  {
    name: 'guest-error',
    query: 'case=guest&state=error',
    ready: 'text=다시 시도',
    checks: BASE_CHECKS,
  },
]

/**
 * 키보드 검사 — 줄 이동·접기·펴기.
 *
 * `mode`가 `fixture`면 합성 화면에만 있는 두 가지를 더 본다: 선택이 오른쪽 상세에 서는지와,
 * 관리 열 입력칸이 표에 방향키를 빼앗기지 않는지. 실제 화면에는 그 두 자리가 없다(선택은 창을
 * 열고, 관리 열에는 입력칸 대신 버튼이 선다).
 */
async function keyboardChecks(page, mode) {
  const results = {}
  const snap = () => page.evaluate('window.__checks.snapshotRows().detail')

  // 첫 줄에 초점을 준다. 표 안에서 탭으로 닿는 자리는 로빙 tabindex가 정한 그 한 줄이다.
  await page.locator('[data-row-id][tabindex="0"]').first().focus()
  const start = await snap()

  await page.keyboard.press('ArrowDown')
  const afterDown = await snap()
  results.arrowDownMovesFocus = {
    ok: Boolean(afterDown.focusedId) && afterDown.focusedId !== start.focusedId,
    detail: { from: start.focusedId, to: afterDown.focusedId },
  }

  await page.keyboard.press('ArrowUp')
  const afterUp = await snap()
  results.arrowUpReturns = {
    ok: afterUp.focusedId === start.focusedId,
    detail: { expected: start.focusedId, got: afterUp.focusedId },
  }

  // 접기: 자식을 가진 줄에서 ArrowLeft 한 번이면 아래 줄 수가 줄어야 한다.
  await page.keyboard.press('ArrowLeft')
  const collapsed = await snap()
  await page.keyboard.press('ArrowRight')
  const expanded = await snap()
  results.arrowLeftCollapses = {
    ok: collapsed.count < start.count && expanded.count > collapsed.count,
    detail: { start: start.count, collapsed: collapsed.count, reexpanded: expanded.count },
  }

  if (mode !== 'fixture') return results

  // Enter는 선택이다 — 오른쪽 상세에 전체 경로가 서야 한다.
  await page.keyboard.press('Enter')
  const path = (await page.locator('[data-testid="detail-path"]').first().textContent()) ?? ''
  results.enterSelectsRow = { ok: path.trim() !== '' && path.trim() !== '선택 없음', detail: { path } }

  // 관리 열 입력칸: 방향키가 표로 새면 글자 사이 이동이 막혀 그 칸이 키보드에 잠긴다.
  const input = page.locator('[data-testid="row-input"]').first()
  await input.focus()
  await page.keyboard.press('ArrowDown')
  const afterInput = await snap()
  results.inputKeepsArrowKeys = {
    ok: afterInput.activeTag === 'input',
    detail: { activeTag: afterInput.activeTag },
  }

  return results
}

/** 가로 스크롤 상자를 전부 오른쪽 끝으로 민다(오른쪽 끝 스크린샷을 찍기 위한 상태 만들기). */
const SCROLL_RIGHT = `
(() => {
  const boxes = [...document.querySelectorAll('*')].filter((el) => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  });
  for (const box of boxes) box.scrollLeft = box.scrollWidth;
  return boxes.length;
})()
`

/** 왼쪽 끝·맨 위로 되돌린다 — 첫 스크린샷은 **사람이 처음 보는 그 자리**여야 한다. */
const SCROLL_LEFT = `
(() => {
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollLeft) el.scrollLeft = 0;
  }
  window.scrollTo(0, 0);
  return true;
})()
`

async function main() {
  const headed = process.argv.includes('--headed')
  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : null
  const outDir = join(tmpdir(), `file-collection-browser-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  await mkdir(outDir, { recursive: true })

  const executablePath = findBrowser()
  const { chromium } = require('playwright-core')
  const { server, base } = await startFixtureServer(await importFromApp('vite'))

  const report = { startedAt: new Date().toISOString(), base, executablePath, outDir, results: [] }
  let failures = 0
  const cases = only ? CASES.filter((c) => c.name.includes(only)) : CASES

  /*
    브라우저 실행 자체가 실패해도 **서버는 내려야 한다** — 그러지 않으면 5199 포트를 문 채
    프로세스가 남아 다음 실행이 `strictPort`에서 곧바로 죽는다. 그래서 `launch`도 이 안에 둔다.
  */
  let browser = null
  try {
    browser = await chromium.launch({ executablePath, headless: !headed })
    for (const testCase of cases) {
      for (const width of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const consoleErrors = []
        page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
        page.on('pageerror', (e) => consoleErrors.push(String(e)))

        const entry = { case: testCase.name, width, checks: {}, screenshots: {}, consoleErrors }
        try {
          await page.goto(`${base}/?${testCase.query}`, { waitUntil: 'load' })
          if (testCase.setup) await testCase.setup(page)
          await page.locator(testCase.ready).first().waitFor({ timeout: 15000 })
          // 실제 앱 글꼴(Pretendard)이 서기 전에 재면 폭이 달라진다.
          await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true')
          await page.evaluate(IN_PAGE)

          /*
            첫 장은 **왼쪽 끝에서, 키보드 초점을 주기 전에** 찍는다. 검사들은 조작부를 화면
            안으로 끌어오느라 스크롤을 만지고(끝나면 되돌리지만), 키보드 검사는 초점 테두리와
            펼침 상태를 바꾼다. 그 뒤에 찍은 장은 사람이 처음 보는 화면이 아니다.
          */
          await page.evaluate(SCROLL_LEFT)
          const initial = join(outDir, `${testCase.name}-${width}.png`)
          await page.screenshot({ path: initial, fullPage: !testCase.modal })
          entry.screenshots.initial = initial

          for (const name of testCase.checks) {
            entry.checks[name] = await page.evaluate(`window.__checks.${name}()`)
          }
          if (testCase.keyboard) {
            Object.assign(entry.checks, await keyboardChecks(page, testCase.keyboard))
          }

          // 오른쪽 끝은 **따로** 찍는다. 한 장에 담으려면 전체 페이지를 늘려야 하고, 그러면
          // 좁은 화면에서 무엇이 잘렸는지가 사라진다. 뷰포트 크기 그대로 한 장 더 남긴다.
          const scrollers = await page.evaluate(SCROLL_RIGHT)
          if (scrollers > 0) {
            const right = join(outDir, `${testCase.name}-${width}-right.png`)
            await page.screenshot({ path: right })
            entry.screenshots.right = right
          }

          if (testCase.modal) {
            await page.evaluate('window.__checks.scrollModalToBottom()')
            const bottom = join(outDir, `${testCase.name}-${width}-modal-bottom.png`)
            await page.screenshot({ path: bottom })
            entry.screenshots.modalBottom = bottom
          }
        } catch (error) {
          entry.error = String(error?.stack ?? error)
        } finally {
          await page.close()
        }

        entry.failed = Object.entries(entry.checks)
          .filter(([, v]) => !v.ok)
          .map(([k]) => k)
        if (entry.error || entry.failed.length > 0 || consoleErrors.length > 0) failures += 1
        report.results.push(entry)
        console.log(
          `${entry.error ? 'ERROR' : entry.failed.length ? 'FAIL ' : 'ok   '} ${testCase.name} @${width}` +
            (entry.failed.length ? ` — ${entry.failed.join(', ')}` : '') +
            (consoleErrors.length ? ` — console: ${consoleErrors.length}건` : ''),
        )
      }
    }
  } finally {
    if (browser) await browser.close()
    await server.close()
  }

  report.finishedAt = new Date().toISOString()
  report.failingScreens = failures
  const jsonPath = join(outDir, 'report.json')
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n결과: ${jsonPath}`)
  console.log(`스크린샷: ${outDir}`)
  if (failures > 0) {
    console.log(`문제 있는 화면 ${failures}개 / 전체 ${report.results.length}개`)
    process.exitCode = 1
  }
}

await main()
