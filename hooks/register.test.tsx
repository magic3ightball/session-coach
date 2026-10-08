import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function world(on: On) {
  const w = { tokens: 0, startedAt: 1_000, toasts: [] as string[], status: '' as string | undefined }
  mock.clock(on, { now: 1_000 })
  on('session.usage', () => ({ value: { startedAt: w.startedAt, context: { tokens: w.tokens, window: 1_000_000 }, rateLimits: [] } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', (_$, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', (_$, e) => { w.status = e.text; return { value: undefined } })
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  on('prompt.submit', (_$, e) => e)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return w
}

const band = { hasSurvey: false, isWorking: false, maxRows: 10 }

for (const surface of ['terminal', 'desktop'] as const) {
  describe(surface, () => {
    test('shows in the status line as soon as the session opens', async ($, on) => {
      const w = world(on)
      await $.session.start({ cwd: '/tmp', surface, isInteractive: true })
      expect(w.status).toBe('코치(새 문구) · 대화량 확인 중 · 요청 0번')
    })

    test('quiet when nothing is wrong', async ($, on) => {
      world(on)
      await $.prompt.submit({ text: '모래 질감을 더 거칠게 바꿔줘. 알갱이 크기를 키워서 표면이 울퉁불퉁해 보이게.', wait: false })
      const ui = await $.ui.mount({ plugin: 'session-coach', surface, component: 'AbovePrompt', props: band })
      expect(await ui.find({ text: /코치/ })).toBeUndefined()
    })

    test('two corrections in a row → warn band + toast, hide works', async ($, on) => {
      const w = world(on)
      await $.prompt.submit({ text: '자개 무지갯빛이 여전히 거의 안 보여', wait: false })
      await $.prompt.submit({ text: '아직도 똑같아. 다시 해줘', wait: false })
      const ui = await $.ui.mount({ plugin: 'session-coach', surface, component: 'AbovePrompt', props: band })
      expect((await ui.find({ type: 'Text', text: /2번 다시 시켰는데/ }))).toBeDefined()
      expect(w.toasts.length).toBe(1)
      expect(w.status).toContain('다시 시킴 2번')
      await ui.press({ key: 'hide' })
      expect(await ui.find({ text: /코치/ })).toBeUndefined()
    })

    test('heavy context → /clear advice, and /clear resets counters', async ($, on) => {
      const w = world(on)
      w.tokens = 300_000
      await $.prompt.submit({ text: '다음 기능으로 넘어가자', wait: false })
      const ui = await $.ui.mount({ plugin: 'session-coach', surface, component: 'AbovePrompt', props: band })
      expect(await ui.find({ text: /대화가 길어졌어요/ })).toBeDefined()
      w.tokens = 0
      w.startedAt = 9_000
      await $.prompt.submit({ text: '새 작업 시작', wait: false })
      expect(w.status).toBe('코치(새 문구) · 대화량 확인 중 · 요청 1번')
    })
  })
}
