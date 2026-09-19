#!/usr/bin/env bash
# ============================================================================
# ضبط كلمة مرور حساب في برق — والتحقق من نجاحها فعلياً
# ============================================================================
#
#   ./scripts/set-password.sh <البريد>
#
# لماذا وُجد: لا استعادة كلمة مرور في المنصة لأن مُرسِل البريد (SMTP) غير
# مضبوط. هذا بديلها التشغيلي حتى يُضبط.
#
# لماذا يتحقق بعد الضبط: ضبط كلمة المرور قد ينجح (HTTP 200) ويبقى الدخول
# فاشلاً لأسباب أخرى في صفّ الحساب — حدث ذلك فعلاً في هذا النشر. فالأداة
# لا تكتفي بالضبط بل تُجرّب دخولاً حقيقياً وتقول النتيجة صراحةً.
#
# كلمة المرور تُقرأ من الطرفية ولا تظهر على الشاشة ولا تدخل سجل الأوامر.
# ============================================================================

set -euo pipefail

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "الاستعمال: ./scripts/set-password.sh <البريد>" >&2
  exit 1
fi

ENV_FILE="$(dirname "$0")/../.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "لم أجد .env.local" >&2
  exit 1
fi

read_var() {
  grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r\n'
}

URL="$(read_var NEXT_PUBLIC_SUPABASE_URL)"
SRK="$(read_var SUPABASE_SERVICE_ROLE_KEY)"
ANON="$(read_var NEXT_PUBLIC_SUPABASE_ANON_KEY)"

if [ -z "$URL" ] || [ -z "$SRK" ] || [ -z "$ANON" ]; then
  echo "متغيّرات Supabase ناقصة في .env.local" >&2
  exit 1
fi

# ---------- 1) إيجاد الحساب ----------
USER_ID="$(
  curl -s "$URL/auth/v1/admin/users?per_page=200" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  | EMAIL="$EMAIL" PYTHONIOENCODING=utf-8 python -c "
import json, os, sys
target = os.environ['EMAIL'].strip().lower()
for u in json.load(sys.stdin).get('users', []):
    if (u.get('email') or '').lower() == target:
        print(u['id']); break
"
)"

if [ -z "$USER_ID" ]; then
  echo "لا يوجد حساب بهذا البريد في نظام المصادقة." >&2
  echo "إن كان موجوداً في auth.users لكنه لا يظهر هنا، فصفّه مشوّه —" >&2
  echo "راجع supabase/migrations/015_repair_handmade_auth_users.sql" >&2
  exit 1
fi

# ---------- 2) قراءة كلمة المرور مرتين ----------
read -rsp "كلمة المرور الجديدة: " PW1; echo
read -rsp "أعِدها للتأكيد:      " PW2; echo
if [ "$PW1" != "$PW2" ]; then
  echo "الكلمتان غير متطابقتين." >&2
  exit 1
fi
if [ ${#PW1} -lt 8 ]; then
  echo "كلمة المرور أقصر من ثمانية محارف — Supabase سيرفضها." >&2
  exit 1
fi

# JSON يُبنى في python لا في الصدفة: كلمة المرور قد تحمل " أو \ فتكسر النص
BODY="$(PW="$PW1" python -c "import json, os; print(json.dumps({'password': os.environ['PW']}))")"

# ---------- 3) الضبط ----------
CODE="$(
  curl -s -o /dev/null -w '%{http_code}' \
    -X PUT "$URL/auth/v1/admin/users/$USER_ID" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" -d "$BODY"
)"
if [ "$CODE" != "200" ]; then
  echo "فشل ضبط كلمة المرور (HTTP $CODE)." >&2
  exit 1
fi
echo "ضُبطت كلمة المرور."

# ---------- 4) التحقق بدخول حقيقي ----------
LOGIN_BODY="$(EM="$EMAIL" PW="$PW1" python -c "
import json, os
print(json.dumps({'email': os.environ['EM'], 'password': os.environ['PW']}))")"

RESULT="$(
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" -d "$LOGIN_BODY"
)"
unset PW1 PW2

echo "$RESULT" | PYTHONIOENCODING=utf-8 python -c "
import json, sys
d = json.load(sys.stdin)
if d.get('access_token'):
    print('تحقّق: الدخول نجح فعلاً. افتح /login وادخل بها.')
    sys.exit(0)
print('تحقّق: الدخول ما زال يفشل —', d.get('error_description') or d.get('msg') or d)
sys.exit(1)
"
