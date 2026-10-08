import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, CoachStats } from '../types'

// Thresholds. Opus 5.5 has a 1M window, so these are absolute token counts, not percent.
const CONTEXT_WARN = 250_000
const CONTEXT_STRONG = 500_000
const LONG_PROMPTS = 25
const LONG_HOURS = 8
const CORRECTION_LIMIT = 2
const SHIP_TIP_AFTER = 3

// "still the same", "again", "no", "not working" ... as the first words of a follow-up.
const CORRECTION = /(아직도|여전히|아직|똑같|그대로|다시 ?(시도|해|만들)|안 ?(돼|되|보여|나와)|이상해|틀렸|아니(야|라|,| )|still|again|not working|doesn'?t work)/i
const SHIP = /(커밋|배포|푸시|머지|commit|deploy|push|merge)/i

const fresh = (startedAt: number): CoachStats => ({ startedAt, prompts: 0, corrections: 0, shipPrompts: 0, tokens: 0 })

const stats = atom({ plugin: 'session-coach', key: 'stats' } as const, fresh(0))
const advice = atom({ plugin: 'session-coach', key: 'advice' } as const, [])
const dismissed = atom({ plugin: 'session-coach', key: 'dismissed' } as const, [])

// Each advice is "what happened" + "→ exactly what to do", in plain words.
function judge(s: CoachStats, now: number): Advice[] {
  const out: Advice[] = []
  const hours = s.startedAt ? (now - s.startedAt) / 3_600_000 : 0

  if (s.corrections >= CORRECTION_LIMIT) {
    out.push({
      id: `corr-${s.corrections >= 4 ? 4 : 2}`,
      level: 'warn',
      text: `같은 걸 ${s.corrections}번 다시 시켰는데 아직 안 고쳐졌어요 → /clear 로 새로 시작하고, 원하는 모습을 사진이나 예시와 함께 처음부터 한 번에 설명하세요`,
    })
  }
  if (s.tokens >= CONTEXT_STRONG) {
    out.push({
      id: 'ctx-strong',
      level: 'warn',
      text: `대화가 너무 길어서 Claude가 앞 내용을 놓칠 수 있어요 → "지금까지 한 일 정리해줘"라고 보낸 뒤 /clear 하세요`,
    })
  } else if (s.tokens >= CONTEXT_WARN) {
    out.push({
      id: 'ctx-warn',
      level: 'info',
      text: `대화가 길어졌어요 → 다음 요청이 지금 작업과 다른 일이면 먼저 /clear 하세요`,
    })
  }
  if (s.prompts >= LONG_PROMPTS || hours >= LONG_HOURS) {
    out.push({
      id: 'long',
      level: 'info',
      text: `이 대화에서 요청을 ${s.prompts}번 했어요(${Math.round(hours)}시간째) → 지금 작업이 끝났으면 "지금까지 한 일 정리해줘" 보낸 뒤 /clear 하세요`,
    })
  }
  if (s.shipPrompts >= SHIP_TIP_AFTER) {
    out.push({
      id: 'ship',
      level: 'info',
      text: `커밋·배포를 ${s.shipPrompts}번째 시키고 있어요 → "커밋하고 배포하는 과정을 /ship 명령으로 만들어줘"라고 한 번만 요청하세요`,
    })
  }
  return out
}

// /clear restarts the session clock: start counting over.
async function sync($: EngineInterface) {
  const usage = await $.session.usage()
  const s = await read($, stats)
  if (s.startedAt !== usage.startedAt) {
    await update($, stats, () => fresh(usage.startedAt))
    await update($, dismissed, () => [])
  }
  await update($, stats, cur => ({ ...cur, tokens: usage.context.tokens ?? cur.tokens }))
}

async function refresh($: EngineInterface) {
  await sync($)
  const now = await $.clock.now()
  const s = await read($, stats)

  const before = (await read($, advice)).map(a => a.id)
  const next = judge(s, now)
  await update($, advice, () => next)

  const hidden = await read($, dismissed)
  for (const a of next) {
    if (!before.includes(a.id) && !hidden.includes(a.id) && a.level === 'warn') $.ui.toast(`코치: ${a.text}`)
  }
  // Context size is unknown until the session's first response.
  const size = s.tokens ? `${Math.round(s.tokens / 10_000)}만` : '확인 중'
  $.ui.status(`코치(새 문구) · 대화량 ${size} · 요청 ${s.prompts}번${s.corrections ? ` · 다시 시킴 ${s.corrections}번` : ''}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'coach', description: '세션 코치: 현재 상태와 조언 보기' })
    const result = await next(e)
    // Show up as soon as the session opens, not only after the first prompt.
    await refresh($)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    const head = text.slice(0, 160)
    await sync($)
    await update($, stats, s => ({
      ...s,
      prompts: s.prompts + 1,
      // A correction keeps the streak; a fresh, substantial request ends it.
      corrections: CORRECTION.test(head) ? s.corrections + 1 : text.length > 40 ? 0 : s.corrections,
      shipPrompts: SHIP.test(head) && text.length < 60 ? s.shipPrompts + 1 : s.shipPrompts,
    }))
    await refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('command.run', { command: 'coach' }, async $ => {
    await refresh($)
    const s = await read($, stats)
    const list = await read($, advice)
    await update($, dismissed, () => [])
    const size = s.tokens ? `약 ${Math.round(s.tokens / 10_000)}만 (25만부터 정리 권장)` : '아직 모름 (메시지를 하나 보내면 보여요)'
    const lines = list.length ? list.map(a => `${a.level === 'warn' ? '⚠️' : '💡'} ${a.text}`).join('\n') : '✅ 지금은 괜찮아요. 그대로 계속하세요.'
    return { text: `[세션 코치]\n대화량: ${size}\n요청 수: ${s.prompts}번\n같은 걸 연달아 다시 시킨 횟수: ${s.corrections}번\n\n${lines}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const hidden = await read($, dismissed)
    const list = (await read($, advice)).filter(a => !hidden.includes(a.id))
    if (list.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const top = list.find(a => a.level === 'warn') ?? list[0]
    return (
      <Box>
        <Text color={top.level === 'warn' ? 'yellow' : undefined} dimColor={top.level !== 'warn'}>
          {top.level === 'warn' ? '⚠️ ' : '💡 '}코치: {top.text}{list.length > 1 ? ` (+${list.length - 1}, /coach)` : ''}{' '}
        </Text>
        <Button key="hide" label="숨기기" onPress={() => update($, dismissed, d => [...d, top.id])} />
      </Box>
    )
  })
}
