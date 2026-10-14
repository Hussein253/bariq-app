// حالات Promptfoo من cases.json: كل حالة اختبار واحد بفحوصها + الفحوص العامة (defaultTest)
import { readFileSync } from 'node:fs'

const { cases } = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'))

export default function buildTests() {
  return cases.map((c) => ({
    description: `${c.id} · ${c.category} · ${c.title}`,
    vars: { id: c.id, turns: c.turns.join('  ⟵  ') },
    metadata: { category: c.category, source: c.source },
    assert: [{ type: 'javascript', value: 'file://assertions.mjs:caseChecks' }],
  }))
}
