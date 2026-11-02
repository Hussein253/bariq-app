import { describe, expect, it } from 'vitest'
import {
  CHANNELS,
  DISPATCH,
  EVENT,
  FIRST_GATE,
  SPLIT,
  SPLIT_CODE,
  TRIGGER,
  patchWorkflow,
} from '@/n8n/batched-events.mjs'

type Item = { json: { body: { object?: string; entry: Array<{ id: string; messaging: unknown[] }> }; batchIndex: number; batchSize: number } }

// كود «Split Batched Events» كما يتنفّذ داخل n8n: $input.first().json = مخرج الـ Webhook
const split = (webhookJson: unknown): Item[] => {
  const $input = { first: () => ({ json: webhookJson }) }
  return new Function('$input', SPLIT_CODE)($input) as Item[]
}

// نفس تعبير «Extract Message Details» للمرسل ومعرّف الرسالة
const sender = (j: Item['json']) => (j.body as { entry?: Array<{ messaging?: Array<{ sender?: { id?: string } }> }> }).entry?.[0]?.messaging?.[0]?.sender?.id
const mid = (j: Item['json']) => (j.body as { entry?: Array<{ messaging?: Array<{ message?: { mid?: string } }> }> }).entry?.[0]?.messaging?.[0]?.message?.mid

const msg = (psid: string, m: string, text: string) => ({
  sender: { id: psid },
  recipient: { id: 'PAGE' },
  timestamp: 1,
  message: { mid: m, text },
})

describe('Split Batched Events', () => {
  it('حدث واحد: عنصر واحد بنفس الشكل', () => {
    const items = split({ headers: {}, body: { object: 'page', entry: [{ id: 'PAGE', time: 1, messaging: [msg('A', 'm1', 'هلو')] }] } })
    expect(items).toHaveLength(1)
    expect(items[0].json.batchIndex).toBe(0)
    expect(sender(items[0].json)).toBe('A')
    expect(mid(items[0].json)).toBe('m1')
  })

  it('دفعة من زبونين وثلاث رسائل: عنصر لكل رسالة، ولا رسالة تضيع', () => {
    const items = split({
      body: {
        object: 'page',
        entry: [
          { id: 'PAGE', time: 1, messaging: [msg('A', 'm1', 'عندكم هودي؟')] },
          { id: 'PAGE', time: 2, messaging: [msg('B', 'm2', 'بكم التيشيرت')] },
          { id: 'PAGE', time: 3, messaging: [msg('A', 'm3', 'لون اسود')] },
        ],
      },
    })
    expect(items.map((i) => [sender(i.json), mid(i.json), i.json.batchIndex])).toEqual([
      ['A', 'm1', 0],
      ['B', 'm2', 1],
      ['A', 'm3', 2],
    ])
    expect(items.every((i) => i.json.batchSize === 3 && i.json.body.object === 'page')).toBe(true)
    // كل عنصر بحدث واحد بس: المسار يقرا entry[0].messaging[0]
    expect(items.every((i) => i.json.body.entry.length === 1 && i.json.body.entry[0].messaging.length === 1)).toBe(true)
  })

  it('أكثر من حدث بنفس الـ entry يتفرّق كذلك', () => {
    const items = split({ body: { object: 'page', entry: [{ id: 'PAGE', messaging: [msg('A', 'm1', 'x'), msg('A', 'm2', 'y')] }] } })
    expect(items.map((i) => mid(i.json))).toEqual(['m1', 'm2'])
  })

  it('طلب بلا أحداث: عنصر واحد بالطلب نفسه (المسار القديم يرفضه)', () => {
    const items = split({ body: { object: 'page', entry: [] } })
    expect(items).toHaveLength(1)
    expect(items[0].json.batchIndex).toBe(0)
  })
})

const baseWorkflow = () => ({
  id: CHANNELS.messenger.id,
  name: 'test',
  nodes: [
    { id: '1', name: 'Ack Meta Event', type: 'n8n-nodes-base.respondToWebhook', position: [0, 0], parameters: {} },
    { id: '2', name: 'Extract Message Details', type: 'n8n-nodes-base.set', position: [200, 0], parameters: {} },
    { id: '3', name: 'Build Location Entry', type: 'n8n-nodes-base.code', position: [0, 0], parameters: { jsCode: "const req = $('Webhook').item.json;\nconst x = $('Webhook').item.json;" } },
    { id: '4', name: 'Build Other Media Entry', type: 'n8n-nodes-base.code', position: [0, 0], parameters: { jsCode: "const req = $('Webhook').item.json;" } },
  ],
  connections: {
    'Ack Meta Event': { main: [[{ node: 'Extract Message Details', type: 'main', index: 0 }]] },
  } as Record<string, { main: Array<Array<{ node: string; type?: string; index?: number }>> }>,
})

describe('patchWorkflow', () => {
  it('يربط Ack ← Split ← First? ← (Meta Event | Dispatch)، والتريغر الداخلي ← Meta Event ← Extract', () => {
    const wf = baseWorkflow()
    const changes = patchWorkflow(wf)
    expect(changes.length).toBe(3)
    const to = (n: string, out = 0) => wf.connections[n].main[out].map((l) => l.node)
    expect(to('Ack Meta Event')).toEqual([SPLIT])
    expect(to(SPLIT)).toEqual([FIRST_GATE])
    expect(to(FIRST_GATE, 0)).toEqual([EVENT])
    expect(to(FIRST_GATE, 1)).toEqual([DISPATCH])
    expect(to(TRIGGER)).toEqual([EVENT])
    expect(to(EVENT)).toEqual(['Extract Message Details'])

    const dispatch = wf.nodes.find((n) => n.name === DISPATCH) as unknown as { parameters: { workflowId: { value: string }; mode: string; options: { waitForSubWorkflow: boolean } } }
    expect(dispatch.parameters.workflowId.value).toBe(CHANNELS.messenger.id)
    expect(dispatch.parameters.mode).toBe('each')
    expect(dispatch.parameters.options.waitForSubWorkflow).toBe(false)
  })

  it('العقد الي تقرا $(\'Webhook\') تقرا Meta Event (بالتنفيذ الداخلي ماكو Webhook)', () => {
    const wf = baseWorkflow()
    patchWorkflow(wf)
    for (const name of ['Build Location Entry', 'Build Other Media Entry']) {
      const code = (wf.nodes.find((n) => n.name === name) as { parameters: { jsCode: string } }).parameters.jsCode
      expect(code).not.toContain("$('Webhook')")
      expect(code).toContain(`$('${EVENT}')`)
    }
  })

  it('آمن للتكرار', () => {
    const wf = baseWorkflow()
    patchWorkflow(wf)
    const nodes = wf.nodes.length
    expect(patchWorkflow(wf)).toEqual([])
    expect(wf.nodes.length).toBe(nodes)
  })

  it('يرفض إذا Ack موصول بشي غير Extract', () => {
    const wf = baseWorkflow()
    wf.connections['Ack Meta Event'].main[0].push({ node: 'Other' })
    expect(() => patchWorkflow(wf)).toThrow()
  })
})
