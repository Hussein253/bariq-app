/**
 * مزوّد Promptfoo لبوت واتساب
 * ===========================
 * وضعان:
 *  - BOT_EVAL_URL معرّف: يرسل أدوار كل حالة لـ Webhook نسخة الاختبار المعزولة (منشورة) ويستنى الرد.
 *  - غير معرّف (الافتراضي): يعيد ردود البوت الحقيقية المسجّلة من تشغيل الاختبار في results/outputs.json.
 * الناتج كائن: { reply, replies, ordersCreated, error }
 */
import { readFileSync, existsSync } from 'node:fs'

const CASES = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).cases
const OUTPUTS = new URL('./results/outputs.json', import.meta.url)

// رقم اختبار ثابت لكل حالة: 964770999 + 01NN حسب ترتيبها بالملف
const phoneOf = (id) => '9647709990' + String(101 + CASES.findIndex((c) => c.id === id)).padStart(3, '0')

async function sendTurn(url, phone, text, msgId) {
  const body = {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: 'test', phone_number_id: 'TEST' },
    contacts: [{ profile: { name: 'Test' }, wa_id: phone }],
    messages: [{ from: phone, id: msgId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
  }
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  return String(json.reply ?? '')
}

export default class BariqBotProvider {
  id() {
    return 'bariq-whatsapp-bot'
  }

  async callApi(_prompt, context) {
    const id = context?.vars?.id
    const c = CASES.find((x) => x.id === id)
    if (!c) return { error: `unknown case ${id}` }

    const url = process.env.BOT_EVAL_URL
    if (url) {
      const run = Date.now()
      const replies = []
      for (const [i, text] of c.turns.entries()) {
        replies.push(await sendTurn(url, phoneOf(id), text, `wamid.EVAL-${id}-T${i + 1}-${run}`))
      }
      return { output: { reply: replies.at(-1), replies, ordersCreated: null, error: null } }
    }

    if (!existsSync(OUTPUTS)) return { error: 'results/outputs.json غير موجود — شغّل الحالات أولاً' }
    const rec = JSON.parse(readFileSync(OUTPUTS, 'utf8'))[id]
    if (!rec) return { error: `لا يوجد رد مسجّل للحالة ${id}` }
    return { output: rec, tokenUsage: rec.tokens ? { prompt: rec.tokens.prompt, completion: rec.tokens.completion, total: rec.tokens.prompt + rec.tokens.completion } : undefined }
  }
}
