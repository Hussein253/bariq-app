import { describe, expect, it } from 'vitest'
import { patchWorkflow } from '@/n8n/log-on-arrival.mjs'

// مسار ماسنجر مصغّر بالعقد الي يلمسها السكربت بس (الأسماء والوصلات مثل الحي)
const node = (name: string, extra: Record<string, unknown> = {}) => ({ id: name, name, type: 'n8n-nodes-base.supabase', typeVersion: 1, position: [0, 0], parameters: {}, ...extra })
const tag = (name: string) => node(name, {
  parameters: {
    operation: 'update', tableId: 'conversation_log',
    filters: { conditions: [
      { keyName: 'id', condition: 'eq', keyValue: "={{ $('Log Incoming Message').isExecuted ? ($('Log Incoming Message').first()?.json?.id ?? -1) : -1 }}" },
      { keyName: 'phone_number', condition: 'eq', keyValue: '={{ $json.phone }}' },
      { keyName: 'sender', condition: 'eq', keyValue: 'customer' },
    ] },
  },
})
const workflow = () => ({
  nodes: [
    node('Upsert Customer Session'), node('Keep Phone After Upsert', { position: [100, 500] }), node('Typing Allowed?'),
    node('Insert into Buffer'), node('Message Data'), node('Get Buffered Messages'),
    node('Log Incoming Message', { credentials: { supabaseApi: { id: 'x' } }, parameters: { tableId: 'conversation_log' } }),
    node('Buffer Has Messages?'), node('Build User Prompt'), node('Release Lock (Empty Buffer)'),
    node('Human Takeover?'), node('Log Customer Msg (Human Mode)'), node('Remove From Buffer (Human Mode)'), node('Human Ack Wait'), node('Busy Retry?'),
    tag('Tag Customer Msg (Error)'), tag('Tag Customer Msg (Blocked)'),
  ],
  connections: {
    'Upsert Customer Session': { main: [[{ node: 'Typing Allowed?', type: 'main', index: 0 }, { node: 'Keep Phone After Upsert', type: 'main', index: 0 }]] },
    'Buffer Has Messages?': { main: [[{ node: 'Build User Prompt', type: 'main', index: 0 }, { node: 'Log Incoming Message', type: 'main', index: 0 }], [{ node: 'Release Lock (Empty Buffer)', type: 'main', index: 0 }]] },
    'Human Takeover?': { main: [[{ node: 'Log Customer Msg (Human Mode)', type: 'main', index: 0 }], [{ node: 'Busy Retry?', type: 'main', index: 0 }]] },
    'Log Customer Msg (Human Mode)': { main: [[{ node: 'Remove From Buffer (Human Mode)', type: 'main', index: 0 }]] },
    'Remove From Buffer (Human Mode)': { main: [[{ node: 'Human Ack Wait', type: 'main', index: 0 }]] },
  } as Record<string, { main: { node: string, type: string, index: number }[][] }>,
})

describe('log-on-arrival — رسالة الزبون باللوحة أول ما توصل', () => {
  it('عقدة الكتابة بعد الـ Upsert أول فرع، والقديمتين منفصلات ومعطّلات، وسلسلة رد الانتظار باقية', () => {
    const wf = workflow()
    const changes = patchWorkflow(wf, { platform: 'messenger' })
    expect(changes.length).toBeGreaterThan(0)
    const by = (n: string) => wf.nodes.find((x) => x.name === n) as Record<string, unknown> & { parameters: Record<string, unknown> }
    const arrival = by('Log Incoming On Arrival')
    expect(arrival.onError).toBe('continueRegularOutput')
    expect((arrival.position as number[])[1]).toBeLessThan(500) // فوق المسار الرئيسي: يتنفّذ قبل الانتظار
    expect(JSON.stringify(arrival.parameters)).toContain("$('Insert into Buffer').first().json.message_text")
    expect(wf.connections['Upsert Customer Session'].main[0][0].node).toBe('Log Incoming On Arrival')
    expect(wf.connections['Buffer Has Messages?'].main[0].map((l) => l.node)).toEqual(['Build User Prompt'])
    expect(wf.connections['Human Takeover?'].main[0].map((l) => l.node)).toEqual(['Remove From Buffer (Human Mode)'])
    expect(wf.connections['Remove From Buffer (Human Mode)'].main[0][0].node).toBe('Human Ack Wait')
    expect(by('Log Incoming Message').disabled).toBe(true)
    expect(by('Log Customer Msg (Human Mode)').disabled).toBe(true)
    for (const t of ['Tag Customer Msg (Error)', 'Tag Customer Msg (Blocked)']) {
      const conds = (by(t).parameters.filters as { conditions: { keyName: string, condition: string }[] }).conditions
      expect(conds.map((c) => c.keyName + ' ' + c.condition)).toEqual(['created_at gte', 'phone_number eq', 'sender eq'])
    }
  })

  it('آمن للتكرار: المرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    patchWorkflow(wf, { platform: 'messenger' })
    const snapshot = JSON.stringify(wf)
    expect(patchWorkflow(wf, { platform: 'messenger' })).toEqual([])
    expect(JSON.stringify(wf)).toBe(snapshot)
  })
})
