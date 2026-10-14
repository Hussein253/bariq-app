"""
يلخّص تنفيذات n8n المحفوظة (JSON من get_execution) إلى: الزمن، عدد نداءات النموذج، التوكنز، الأدوات، والرد.
الاستعمال:  python collect_executions.py <مجلد ملفات التنفيذ> <ملف الناتج>
"""
import json
import sys
from pathlib import Path

# أسعار gpt-4o-mini لكل مليون توكن (دولار) — تُحدَّث من صفحة أسعار OpenAI
PRICE_IN = 0.15
PRICE_CACHED_IN = 0.075
PRICE_OUT = 0.60

TOOLS = {'get_available_products', 'get_customer_orders', 'get_order_items', 'create_customer', 'create_order',
         'add_order_item', 'update_order_status', 'update_session_data', 'find_delivery_area'}


def load(path):
    d = json.loads(Path(path).read_text(encoding='utf-8'))
    if isinstance(d, list):
        d = json.loads(d[0]['text'])
    return d


def summarize(d):
    ex = d['execution']
    run = d['data']['resultData']['runData']
    starts = [r['startTime'] for runs in run.values() for r in runs if 'startTime' in r]
    ends = [r['startTime'] + r.get('executionTime', 0) for runs in run.values() for r in runs if 'startTime' in r]
    # n8n يسجّل tokenUsage (من OpenAI) أو tokenUsageEstimate (تقدير محلي) حسب نوع التنفيذ
    prompt = completion = calls = 0
    estimated = False
    for r in run.get('OpenAI Chat Model', []):
        calls += 1
        try:
            out = r['data']['ai_languageModel'][0][0]['json']
        except (KeyError, IndexError, TypeError):
            out = {}
        usage = out.get('tokenUsage')
        if not usage:
            usage = out.get('tokenUsageEstimate') or {}
            estimated = estimated or bool(usage)
        prompt += usage.get('promptTokens', 0) or 0
        completion += usage.get('completionTokens', 0) or 0
    reply = None
    if 'Parse Agent Output' in run:
        reply = run['Parse Agent Output'][0]['data']['main'][0][0]['json'].get('clean_reply')
    # n8n يسجّل 0 لتوكنز الإخراج بنداءات الأدوات؛ تقدير: نص الرد العربي ≈ 2.5 حرف/توكن + 80 توكن لكل نداء أداة
    if completion == 0 and calls:
        completion = int(len(reply or '') / 2.5) + 80 * (calls - 1)
        estimated = True
    send_at = None
    if 'Parse Agent Output' in run and starts:
        send_at = (run['Parse Agent Output'][0]['startTime'] - min(starts)) / 1000
    debounce = sum(r.get('executionTime', 0) for r in run.get('Debounce Wait 8s', [])) / 1000
    llm_ms = sum(r.get('executionTime', 0) for r in run.get('OpenAI Chat Model', [])) / 1000
    db_nodes = [n for n in run if any(k in n for k in ('Load', 'Log', 'Check', 'Mark', 'Insert', 'Upsert', 'Re-read',
                                                       'Acquire', 'Release', 'Clear', 'Get ', 'Reset', 'Audit'))]
    db_ms = sum(r.get('executionTime', 0) for n in db_nodes for r in run[n]) / 1000
    return {
        'id': ex['id'],
        'status': ex['status'],
        'seconds': round((max(ends) - min(starts)) / 1000, 1) if starts else None,
        'reply_ready_s': round(send_at, 1) if send_at is not None else None,
        'debounce_s': round(debounce, 1),
        'llm_s': round(llm_ms, 1),
        'db_s': round(db_ms, 1),
        'llm_calls': calls,
        'prompt_tokens': prompt,
        'completion_tokens': completion,
        'tokens_estimated': estimated,
        'cost_usd': round(prompt / 1e6 * PRICE_IN + completion / 1e6 * PRICE_OUT, 6),
        'tools': sorted(n for n in run if n in TOOLS),
        'agent_error': 'Agent Error Info' in run,
        'reply': reply,
    }


if __name__ == '__main__':
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    rows = [summarize(load(p)) for p in sorted(src.glob('*.json'))]
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    n = len(rows)
    tot = sum(r['cost_usd'] for r in rows)
    print(f'{n} executions, total ${tot:.4f}, avg ${tot / max(n, 1):.5f}/reply, '
          f'avg {sum(r["seconds"] or 0 for r in rows) / max(n, 1):.1f}s, '
          f'avg LLM calls {sum(r["llm_calls"] for r in rows) / max(n, 1):.2f}')
