/**
 * مظهر الواجهة: فاتح أو داكن — بيانات نقية تُستورد من الطرفين
 * ============================================================
 * ثلاث قيم لا قيمتان: 'system' ليست مظهراً بل رفضاً للاختيار — تتبع إعداد
 * الجهاز فيتغيّر معه. وهي الافتراضي لمن لم يضغط الزرّ قطّ: من ضبط هاتفه على
 * الوضع الداكن يفتح برق داكنةً من أول مرة بلا إعداد.
 *
 * ⚠️ الكوكي هنا ليس تفضيلاً مكرَّراً عن localStorage: الخادم يرسم
 * <html class="dark"> قبل أن يصل أي جافاسكربت إلى المتصفّح، وبدون الكوكي
 * تُرسم الصفحة بيضاء ثم تقفز إلى الداكن أمام العين (وميض الشاشة البيضاء).
 * localStorage يبقى نسخة احتياطية لمن حُظرت عنه الكوكيز.
 */

export const THEME_COOKIE = 'bariq_theme'

/** سنة كاملة — المظهر تفضيل دائم لا جلسة. */
export const THEME_MAX_AGE = 60 * 60 * 24 * 365

export type ThemeChoice = 'light' | 'dark' | 'system'

/** ما يُرسَم فعلاً بعد حلّ 'system' إلى أحد الوضعين. */
export type ResolvedTheme = 'light' | 'dark'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function normalizeTheme(value: string | null | undefined): ThemeChoice {
  return isThemeChoice(value) ? value : 'system'
}

/**
 * سكربت ما قبل الرسم — يُحقن في <head> ويعمل قبل رسم أول بكسل.
 *
 * ⚠️ يبقى ضرورياً رغم أن الخادم يكتب الصنف من الكوكي: زائر أول مرة لا كوكي
 * له، وتفضيل جهازه لا يعرفه الخادم إطلاقاً. هذا السطر وحده يمنع ومضة
 * الشاشة البيضاء في وجه من يفتح المنصة ليلاً على هاتف مضبوط على الداكن.
 *
 * ويُكتب الكوكي هنا أيضاً لتعرفه الطلبات التالية فيرسمها الخادم صحيحة.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
var c=m?decodeURIComponent(m[1]):null;
if(c!=='light'&&c!=='dark'&&c!=='system'){c=localStorage.getItem('${THEME_COOKIE}')||'system';}
var dark=c==='dark'||(c==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',dark);
document.documentElement.style.colorScheme=dark?'dark':'light';
if(!m){document.cookie='${THEME_COOKIE}='+c+';path=/;max-age=${THEME_MAX_AGE};samesite=lax';}
}catch(e){}})();`
