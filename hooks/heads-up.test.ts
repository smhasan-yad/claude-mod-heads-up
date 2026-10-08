import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseNotice } from './heads-up.mjs'

const ok = (value: unknown) => ({ value }) as never
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120 } as never } as const
const done = (text: string) => ({ turnId: 't1', answer: text, durationMs: 1, isAborted: false, reason: 'answer', text }) as never

function world(on: On, reply: object, enabled = false) {
  // The switch lives in the mod bar's toolbar: stand in for its value here.
  on('state.get', async ($, e, next) => {
    const ref = e as { plugin: string; key: string }
    if (ref.plugin === 'mod-bar' && ref.key === 'headsUp') return ok({ value: enabled, version: 1 })
    return next(e)
  })
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') })
  const asked: string[] = []
  on('model.complete', async ($, e) => {
    asked.push(e.prompt)
    return ok({ isAnswered: true, text: JSON.stringify(reply), usage: {} })
  })
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  on('tool.call', async () => ({ result: { ok: true } }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
  return { clock, asked }
}

async function turn($: any, w: { clock: { settle: () => Promise<void> } }, edit: boolean) {
  await $.prompt.submit({ text: 'add retries to the payment call', origin: { kind: 'composer' }, wait: false })
  if (edit) await $.tool.call({ tool: 'Edit', file_path: 'C:\\repo\\pay.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' })
  await $.turn.complete(done('Done. Added two retries.'))
  await w.clock.settle()
}

const RETRY = { notice: { title: 'A retry could charge a customer twice', detail: 'Add an idempotency key per payment so retries count once.' } }

test('parseNotice reads a notice or nothing', () => {
  expect(parseNotice(JSON.stringify(RETRY))?.title).toBe('A retry could charge a customer twice')
  expect(parseNotice('{"notice": null}')).toBeNull()
  expect(parseNotice('no json')).toBeNull()
})

test('off: no model call and nothing drawn', async ($, on) => {
  const w = world(on, RETRY, false)
  await turn($, w, true)
  expect(w.asked).toEqual([])
  const ui = await $.ui.mount({ plugin: 'heads-up', surface: 'desktop', ...BAND })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: on, a longer turn's warning shows as one compact block`, async ($, on) => {
    const w = world(on, RETRY, true)
    await turn($, w, true)
    expect(w.asked.length).toBe(1)
    expect(w.asked[0]).toContain('add retries to the payment call')
    let ui = await $.ui.mount({ plugin: 'heads-up', surface, ...BAND })
    expect((await ui.findAll({ type: 'Text' })).map(t => String(t.text))).toContain('✦ Heads up · A retry could charge a customer twice')
    expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Understood', 'Ask about it'])
    await ui.press({ key: 'hu-ok' })
    await ui.unmount()
    ui = await $.ui.mount({ plugin: 'heads-up', surface, ...BAND })
    expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
    await ui.unmount()
  })
}

test('on: nothing to flag shows nothing, and a short turn makes no call', async ($, on) => {
  const w = world(on, { notice: null }, true)
  await turn($, w, false)
  expect(w.asked).toEqual([])
  await turn($, w, true)
  expect(w.asked.length).toBe(1)
  const ui = await $.ui.mount({ plugin: 'heads-up', surface: 'desktop', ...BAND })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text))
  expect(texts.some(t => t.startsWith('✦'))).toBe(false)
  expect(texts).toContain('👀 Heads-up checked the last turn · nothing to flag')
  await ui.unmount()
})
