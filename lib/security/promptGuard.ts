// lib/security/promptGuard.ts
// Prompt-injection guard for Bariq (Next.js App Router).
// Layer 1: regex signatures. Layer 2: weighted semantic scoring
// (intent + target + override combos). Optional Layer 3: LLM classifier hook.

export type ThreatCategory =
  | "PRICE_MANIPULATION"
  | "INSTRUCTION_OVERRIDE"
  | "ROLE_HIJACK"
  | "SYSTEM_PROMPT_LEAK"
  | "CODE_INJECTION"
  | "OBFUSCATION";

export interface GuardResult {
  isSafe: boolean;
  riskScore: number; // 0..100
  categories: ThreatCategory[];
  message: string;
}

const MAX_LENGTH = 4000;
const BLOCK_THRESHOLD = 50;

/* ---------------- Normalization ---------------- */

const ARABIC_DIACRITICS = /[ً-ٰٟـ]/g; // tashkeel + tatweel
const ZERO_WIDTH = /[​-‏‪-‮⁠-⁤﻿]/g;

function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII, so "إلى ٠" == "إلى 0"
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٪/g, "%")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- Layer 1: Regex signatures ---------------- */

interface Signature {
  category: ThreatCategory;
  pattern: RegExp;
  weight: number;
}

const SIGNATURES: Signature[] = [
  // Instruction override (EN + AR)
  { category: "INSTRUCTION_OVERRIDE", weight: 60, pattern: /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,30}\b(previous|prior|above|all|earlier|system|your)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?|polic(y|ies))\b/ },
  // Verbs are whole words (optional و/ف prefix, ي/وا suffix) so "إلغاء الطلب حسب النظام" doesn't match "الغ"
  { category: "INSTRUCTION_OVERRIDE", weight: 60, pattern: /(?:^|[^ء-ي])[وف]?(تجاهل|انس|الغ|اهمل|تخط|تجاوز|لا تلتزم ب?)(?:ي|وا)?(?![ء-ي]).{0,25}(التعليمات|القواعد|الاوامر|التوجيهات|السياسات|النظام)/ },
  { category: "INSTRUCTION_OVERRIDE", weight: 45, pattern: /\b(new|updated) (instructions?|rules?)\b|من الان (فصاعدا )?(انت|ستكون|يجب)/ },

  // Price manipulation
  { category: "PRICE_MANIPULATION", weight: 55, pattern: /\b(set|change|make|update|lower|reduce)\b.{0,25}\b(price|cost|total|amount|fee)\b.{0,25}(\bto\b|=)\s*(\$?\s*0|zero|free|\d+)/ },
  { category: "PRICE_MANIPULATION", weight: 55, pattern: /(غير|اجعل|عدل|خفض|حدد|ضع).{0,20}(السعر|الثمن|التكلفه|المبلغ|الاجمالي|الرسوم).{0,25}(الي|ل|=|يساوي|بـ?)\s*(0|صفر|مجان|\d+)/ },
  { category: "PRICE_MANIPULATION", weight: 50, pattern: /\b100\s*% (discount|off)\b|\bfull discount\b|خصم\s*(100\s*(%|بالمئه|في المئه)|كامل|مئه بالمئه)/ }, // "خصم 100 ريال" is a normal coupon
  { category: "PRICE_MANIPULATION", weight: 40, pattern: /\b(apply|give|grant)\b.{0,20}\b(discount|coupon|refund)\b.{0,20}\b(without|no) (code|approval|verification)\b/ },

  // Role hijack / jailbreak
  { category: "ROLE_HIJACK", weight: 50, pattern: /\b(you are now|act as|pretend (to be|you are)|roleplay as|from now on you)\b|\b(dan mode|do anything now|developer mode|jailbreak|god mode)\b/ }, // bare "dan" is a common name
  { category: "ROLE_HIJACK", weight: 50, pattern: /(انت الان|تصرف ك|تظاهر بانك|العب دور|وضع المطور|بصفتك مدير|انا المدير|انا المطور)/ },

  // System prompt exfiltration
  { category: "SYSTEM_PROMPT_LEAK", weight: 55, pattern: /\b(reveal|show|print|repeat|output|tell me)\b.{0,25}\b(system prompt|initial instructions|hidden (rules|prompt)|your instructions)\b/ },
  { category: "SYSTEM_PROMPT_LEAK", weight: 55, pattern: /(اظهر|اعرض|اطبع|كرر|اكشف|ما هي).{0,20}(تعليماتك|البرومبت|موجه النظام|القواعد المخفيه|تعليمات النظام)/ },

  // Fake structural delimiters
  { category: "INSTRUCTION_OVERRIDE", weight: 50, pattern: /(<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?(inst|system)\]|###\s*(system|instruction)|^\s*system\s*:)/m },

  // Code injection
  { category: "CODE_INJECTION", weight: 60, pattern: /<\s*(script|iframe|object|embed|svg)[^>]*>|javascript\s*:|\bon(error|load|click)\s*=/ },
  { category: "CODE_INJECTION", weight: 60, pattern: /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set)\b|('|")\s*(or|and)\s+\d+\s*=\s*\d+|;\s*--/ },
  { category: "CODE_INJECTION", weight: 55, pattern: /\b(eval|exec|new function|child_process|require\s*\(|import\s*\(|process\.env|__proto__|constructor\.prototype)\b/ },
  { category: "CODE_INJECTION", weight: 50, pattern: /(\$\(|`[^`]*`|\$\{[^}]*\}|\{\{[^}]*\}\}|;\s*(rm|curl|wget|bash|sh)\b|&&\s*(rm|curl|wget)\b)/ },

  // Obfuscation
  { category: "OBFUSCATION", weight: 30, pattern: /\b(base64|rot13|hex)\b.{0,20}\b(decode|decrypt)\b|فك (التشفير|الترميز)/ },
  { category: "OBFUSCATION", weight: 25, pattern: /[A-Za-z0-9+/]{60,}={0,2}/ }, // long base64-like blobs
];

/* ---------------- Layer 2: Semantic scoring ---------------- */
// Catches paraphrases that slip past exact regexes by looking at
// co-occurrence of intent verbs + sensitive targets + authority claims.

const LEXICON = {
  modifyVerbs: ["change", "modify", "set", "update", "override", "alter", "lower", "reduce", "make it", "غير", "عدل", "اجعل", "حدث", "خفض", "بدل", "ضع"],
  negateVerbs: ["ignore", "forget", "disregard", "bypass", "skip", "don't follow", "تجاهل", "انس", "اهمل", "تجاوز", "الغ", "لا تتبع"],
  priceTargets: ["price", "cost", "total", "fee", "discount", "invoice", "payment", "free", "السعر", "الثمن", "التكلفه", "الفاتوره", "المبلغ", "الاجمالي", "الدفع", "خصم", "مجانا", "مجاني", "رسوم"],
  ruleTargets: ["rules", "instructions", "policy", "system", "prompt", "guidelines", "restrictions", "القواعد", "التعليمات", "السياسه", "النظام", "القيود", "الاوامر"],
  authorityClaims: ["i am the admin", "i'm the admin", "as an admin", "i am the developer", "authorized", "official request", "انا المدير", "انا الادمن", "انا المطور", "مصرح لي", "طلب رسمي", "بامر من الاداره"],
  urgency: ["immediately", "urgent", "right now", "must", "فورا", "حالا", "ضروري", "يجب عليك"],
};

// Whole-word match with optional Arabic proclitics (و/ف/ب/ل/ك/ال...), so
// "غير" doesn't fire on "تغيير" / "صغير" and "حدث" doesn't fire on "تحدث".
const WORD_CHAR = "[a-z0-9ء-ي]";
const AR_PREFIX = "(?:و|ف|ب|ل|ك|ال|وال|بال|فال|لل)?";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcherCache = new Map<string, RegExp>();

function hasWord(text: string, word: string): boolean {
  let re = matcherCache.get(word);
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9ء-ي])${AR_PREFIX}${escapeRe(word)}(?!${WORD_CHAR})`);
    matcherCache.set(word, re);
  }
  return re.test(text);
}

const countHits = (text: string, words: string[]) =>
  words.reduce((n, w) => (hasWord(text, w) ? n + 1 : n), 0);

function semanticScore(text: string): { score: number; categories: ThreatCategory[] } {
  const modify = countHits(text, LEXICON.modifyVerbs);
  const negate = countHits(text, LEXICON.negateVerbs);
  const price = countHits(text, LEXICON.priceTargets);
  const rules = countHits(text, LEXICON.ruleTargets);
  const authority = countHits(text, LEXICON.authorityClaims);
  const urgency = countHits(text, LEXICON.urgency);

  let score = 0;
  const categories: ThreatCategory[] = [];

  if (modify && price) {
    score += 30 + Math.min(price, 3) * 5;
    categories.push("PRICE_MANIPULATION");
  }
  if (negate && rules) {
    score += 35 + Math.min(rules, 3) * 5;
    categories.push("INSTRUCTION_OVERRIDE");
  }
  if (authority) {
    score += 20 * Math.min(authority, 2);
    categories.push("ROLE_HIJACK");
  }
  // Authority / urgency amplify an existing manipulation intent
  if (score > 0 && urgency) score += 10;
  if (score > 0 && authority && (price || rules)) score += 15;

  return { score, categories };
}

/* ---------------- Public API ---------------- */

const WARNING_AR =
  "⚠️ تم رفض رسالتك لاحتوائها على محتوى يُشتبه بأنه محاولة للتلاعب بالنظام (مثل تغيير الأسعار أو تجاوز القواعد أو إدخال أكواد). يُرجى إعادة صياغة طلبك.";

export function detectPromptInjection(userMessage: unknown): GuardResult {
  if (typeof userMessage !== "string" || userMessage.trim() === "") {
    return { isSafe: false, riskScore: 100, categories: [], message: "⚠️ رسالة غير صالحة." };
  }
  if (userMessage.length > MAX_LENGTH) {
    return { isSafe: false, riskScore: 100, categories: ["OBFUSCATION"], message: "⚠️ الرسالة أطول من الحد المسموح." };
  }

  const text = normalize(userMessage);
  const found = new Set<ThreatCategory>();
  let score = 0;

  for (const sig of SIGNATURES) {
    if (sig.pattern.test(text) || sig.pattern.test(userMessage)) {
      score += sig.weight;
      found.add(sig.category);
    }
  }

  const sem = semanticScore(text);
  score += sem.score;
  sem.categories.forEach((c) => found.add(c));

  const riskScore = Math.min(100, score);
  const isSafe = riskScore < BLOCK_THRESHOLD;

  return {
    isSafe,
    riskScore,
    categories: [...found],
    message: isSafe ? "OK" : WARNING_AR,
  };
}

/** Optional Layer 3: plug an LLM classifier for borderline scores (25..49). */
export async function guardUserMessage(
  userMessage: unknown,
  llmClassifier?: (msg: string) => Promise<boolean> // returns true if injection
): Promise<GuardResult> {
  const result = detectPromptInjection(userMessage);
  if (result.isSafe && llmClassifier && result.riskScore >= 25) {
    try {
      if (await llmClassifier(String(userMessage))) {
        return { ...result, isSafe: false, riskScore: Math.max(result.riskScore, 60), message: WARNING_AR };
      }
    } catch {
      // fail-open on classifier errors; regex/semantic layers still applied
    }
  }
  return result;
}
