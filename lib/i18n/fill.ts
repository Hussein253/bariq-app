/**
 * يستبدل العناصر النائبة {name} بقيمها.
 *
 * ملف مستقل بلا قواميس: المكوّن التفاعلي يستورده من هنا مباشرة، فلا تعبر
 * القواميس الثلاثة إلى حزمة المتصفح كما يحدث باستيراد '@/lib/i18n'.
 *
 * ⚠️ القيم تُمرَّر منسَّقة سلفاً (نصوصاً) لا أرقاماً خاماً: الرقم في العربية
 * والكردية يُعرض بالأرقام العربية الهندية وفي الإنجليزية بالغربية، والتنسيق
 * مسؤولية المكوّن الذي يعرف لغته — لا مسؤولية هذه الدالة.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  )
}
