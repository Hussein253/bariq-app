"""
يبني results/outputs.json (مدخل Promptfoo) من ملفات تنفيذ n8n المحفوظة.
كل تنفيذ يُنسب لحالته من معرّف الرسالة wamid.EVAL-<الحالة>-T<الدور>.
الاستعمال:  python build_outputs.py <مجلد ملفات التنفيذ>
"""
import json
import re
import sys
from pathlib import Path

from collect_executions import load, summarize

HERE = Path(__file__).parent
CASES = json.loads((HERE / 'cases.json').read_text(encoding='utf-8'))['cases']
# ادعاء توفر: جملة إيجابية (متوفر/عدنا/موجود) عن لون أو قياس، بلا نفي بنفس الجملة
AFFIRM = re.compile(r'(متوفر|عدنا|موجود)')
PRODUCT = re.compile(r'(أسود|اسود|السوداء|أبيض|ابيض|البيضاء|أصفر|اصفر|سمول|ميديم|لارج|تيشيرت)')
NEGATION = re.compile(r'(ماكو|ما عدنا|مو متوفر|غير متوفر|ما موجود|مو موجود|ما متوفر|خلص|بس عدنا)')


def claims_availability(text):
    return any(AFFIRM.search(s) and PRODUCT.search(s) and not NEGATION.search(s)
               for s in re.split(r'[.!؟?\n]+', text or ''))


def main(src):
    turns = {}
    for p in sorted(Path(src).glob('*.json')):
        d = load(p)
        run = d['data']['resultData']['runData']
        try:
            wamid = run['Message Data'][0]['data']['main'][0][0]['json']['wamid']
        except (KeyError, IndexError, TypeError):
            continue
        m = re.match(r'wamid\.EVAL-([A-E]\d)-T(\d)', wamid)
        if not m:
            continue
        s = summarize(d)
        s['claims_availability'] = claims_availability(s['reply'])
        s['grounded'] = not s['claims_availability'] or 'get_available_products' in s['tools']
        turns.setdefault(m.group(1), {})[int(m.group(2))] = s

    outputs, summary = {}, []
    for c in CASES:
        ts = [turns.get(c['id'], {}).get(i + 1) for i in range(len(c['turns']))]
        missing = [i + 1 for i, t in enumerate(ts) if t is None]
        done = [t for t in ts if t]
        outputs[c['id']] = {
            'reply': done[-1]['reply'] if done else '',
            'replies': [t['reply'] or '' for t in done],
            'ordersCreated': 0,  # فُحص بقاعدة البيانات بعد التشغيل: لا طلبات لأرقام الاختبار
            'error': f'أدوار بلا تنفيذ: {missing}' if missing else (
                'خطأ في الوكيل (رد الطوارئ)' if any(t['agent_error'] for t in done) else None),
            'executions': [t['id'] for t in done],
            'tools': [t['tools'] for t in done],
            'grounded': all(t['grounded'] for t in done),
            'tokens': {'prompt': sum(t['prompt_tokens'] for t in done), 'completion': sum(t['completion_tokens'] for t in done)},
            'cost_usd': round(sum(t['cost_usd'] for t in done), 6),
            'seconds': [t['seconds'] for t in done],
        }
        summary.extend(dict(t, case=c['id'], turn=i + 1) for i, t in enumerate(ts) if t)

    out = HERE / 'results'
    out.mkdir(exist_ok=True)
    (out / 'outputs.json').write_text(json.dumps(outputs, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'executions.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(outputs)} cases, {len(summary)} turns -> results/outputs.json')


if __name__ == '__main__':
    main(sys.argv[1])
