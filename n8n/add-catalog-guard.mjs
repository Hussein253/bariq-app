/**
 * يزيد «حارس الكتالوك الفارغ» لمسارات البوت الحية بـ n8n.
 *
 * المشكلة الي يحلها: عقدة «تحديد التاجر» ترجع التاجر المربوط بالصفحة مثل ما هو، وإذا كتالوكه
 * فاضي (ولا منتج بـ stock > 0) البوت يجاوب الزبون «ما عدنا منتجات» بثقة. صار هذا فعلاً بتنفيذ
 * 750 بتاريخ 2026-10-22 لمن كانت صفحة الماسنجر مربوطة بتاجر بلا بضاعة.
 *
 * التعديل (بنفس نمط delivery_fees الموجود أصلاً بالاستعلام):
 *   ١. يزيد عمود catalog_guard للاستعلام: نص تعليمات إذا الكتالوك فاضي، و'' إذا بيه بضاعة.
 *   ٢. يحشر العمود ببرومت الوكيل ورا سطر delivery_fees — فاضي = ما يبين ولا سطر.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/add-catalog-guard.mjs            # الثلاثة
 *   N8N_KEY=<api key> node n8n/add-catalog-guard.mjs messenger  # قناة وحدة
 *
 * آمن للتكرار: إذا الحارس مزيود من قبل يتجاهل القناة بلا ما يرسل شي.
 * يسحب نسخة طرية من n8n قبل كل تعديل، فما يرجّع أي تعديل ثاني تم بالواجهة.
 */
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)' },
}

const MERCHANT_NODE = 'تحديد التاجر'

// التعليمة الي توصل الوكيل لمن الكتالوك فاضي. التحقق نفس شرط product_names بالاستعلام.
const GUARD_SQL = `       CASE WHEN NOT EXISTS (SELECT 1 FROM products p
                              WHERE p.merchant_id = sa.merchant_id AND coalesce(p.stock, 0) > 0
                                AND nullif(btrim(p.name), '') IS NOT NULL)
            THEN E'\\n- كتالوك هذا المتجر فاضي هسة: ممنوع تقول «ماكو منتجات» أو «ما عدنا منتجات» أو تذكر أي منتج أو سعر أو توفر، وممنوع تستدعي create_order. إذا الزبون سأل عن المنتجات أو الأسعار، قله إن البضاعة قيد التحديث وموظف من الفريق يرد عليه بالتفاصيل، واعرض التحويل.'
            ELSE ''
       END AS catalog_guard`

const PROMPT_LINE = `- {{ $('${MERCHANT_NODE}').first().json.delivery_fees }}`

const swap = (text, from, to, label) => {
  const parts = text.split(from)
  if (parts.length !== 2) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${parts.length - 1}`)
  return parts.join(to)
}

const api = async (path, init) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

const patch = async (channel) => {
  const { id, agent } = CHANNELS[channel]
  const wf = await api(`/workflows/${id}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار ${channel}`)
    return n
  }

  const merchant = pick(MERCHANT_NODE)
  const agentNode = pick(agent)

  if (merchant.parameters.query.includes('catalog_guard')) {
    console.log(`— ${channel}: الحارس مزيود من قبل، ما سويت شي`)
    return
  }

  // العمود يُضاف بآخر قائمة SELECT. ما نعتمد على اسم آخر عمود: الماسنجر عنده
  // customer_prior_orders ورا delivery_fees، والقناتين الثانيتين لا.
  merchant.parameters.query = swap(
    merchant.parameters.query,
    '\nFROM social_accounts sa',
    `,\n${GUARD_SQL}\nFROM social_accounts sa`,
    `${channel}/query`,
  )

  agentNode.parameters.options.systemMessage = swap(
    agentNode.parameters.options.systemMessage,
    PROMPT_LINE,
    `${PROMPT_LINE}{{ $('${MERCHANT_NODE}').first().json.catalog_guard }}`,
    `${channel}/prompt`,
  )

  const saved = await api(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings ?? {},
      ...(wf.staticData ? { staticData: wf.staticData } : {}),
    }),
  })

  const q = saved.nodes.find((x) => x.name === MERCHANT_NODE).parameters.query
  const sys = saved.nodes.find((x) => x.name === agent).parameters.options.systemMessage
  console.log(`✓ ${channel} (${saved.name})`)
  console.log(`   active: ${saved.active} | عمود الحارس: ${q.includes('AS catalog_guard')} | محشور بالبرومت: ${sys.includes('.catalog_guard')}`)
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHANNELS)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join(', ')})`)
  await patch(t)
}
