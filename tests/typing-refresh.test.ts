import { describe, expect, it } from 'vitest'
import { REFRESHES, patchWorkflow } from '@/n8n/typing-refresh.mjs'

// مسار ماسنجر مصغّر بالعقد الي يلمسها السكربت بس (الأسماء والمواضع والوصلات مثل الحي)
const node = (name: string, position: number[]) => ({ id: name, name, type: 'n8n-nodes-base.code', typeVersion: 1, position, parameters: {} })
const link = (n: string) => ({ node: n, type: 'main', index: 0 })
const workflow = () => ({
  nodes: [
    node('Typing Page?', [-4804, 1396]), node('Re-read Customer Session', [-4656, 1696]),
    node('Build Complaint Check', [-1856, 1856]), node('Complaint Check', [-1632, 1856]),
    node('Order Context Hint', [-1792, 1856]), node('Iraqi Store AI Agent', [-2176, 1152]),
  ] as Array<Record<string, unknown> & { name: string, position: number[] }>,
  connections: {
    'Build Complaint Check': { main: [[link('Complaint Check')]] },
    'Order Context Hint': { main: [[link('Iraqi Store AI Agent')]] },
  } as Record<string, { main: { node: string, type: string, index: number }[][] }>,
})

describe('typing-refresh — علامة «يكتب» تنعاد قبل رد البوت', () => {
  it('بوابة قبل «Complaint Check» وقبل الوكيل، فوق أختها حتى تتنفّذ أول، وترجع لـ «Typing Page?»', () => {
    const wf = workflow()
    expect(patchWorkflow(wf).length).toBeGreaterThan(0)
    const pos = (n: string) => wf.nodes.find((x) => x.name === n)!.position
    for (const r of REFRESHES) {
      const gate = wf.nodes.find((x) => x.name === r.gate)!
      expect(gate.type).toBe('n8n-nodes-base.if')
      expect(gate.onError).toBe('continueRegularOutput') // العلامة ما توقف الرد
      expect(JSON.stringify(gate.parameters)).toContain("$('Re-read Customer Session').isExecuted")
      // n8n v1 يرتّب فروع الأب من الأعلى: البوابة أول، والعقدة الأصلية باقية وراها
      expect(wf.connections[r.parent].main[0].map((l) => l.node)).toEqual([r.gate, r.before])
      expect(pos(r.gate)[1]).toBeLessThan(pos(r.before)[1])
      expect(wf.connections[r.gate].main[0].map((l) => l.node)).toEqual(['Typing Page?'])
    }
  })

  it('آمن للتكرار: المرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const snapshot = JSON.stringify(wf)
    expect(patchWorkflow(wf)).toEqual([])
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('عقدة ناقصة توقف السكربت بدل وصلة لعقدة ماكو', () => {
    const wf = workflow()
    wf.nodes = wf.nodes.filter((x) => x.name !== 'Typing Page?')
    expect(() => patchWorkflow(wf)).toThrow('Typing Page?')
  })
})
