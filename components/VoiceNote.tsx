'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { CONVERSATION_MEDIA_BUCKET } from '@/lib/conversations'

/**
 * مشغّل رسالة صوتية محفوظة في حاوية conversation-media الخاصة
 * ================================================================
 * الرابط يُوقَّع بجلسة المستخدم نفسها، فسياسة الحاوية (الترحيل ٠٢٨) هي من
 * تقرّر: فريق برق كل الملفات، والتاجر مجلد متجره وحده. لا رابط عام يُخزَّن.
 *
 * الرابط قصير العمر؛ صفحة بقيت مفتوحة أطول منه تجدّده عند أول خطأ تشغيل.
 * رابط جديد يفشل فوراً = الملف غير متاح، فيُعرض ذلك بدل إعادة المحاولة بلا نهاية.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60
const FRESH_URL_MS = 60 * 1000

/** رابط موقّع بجلسة المستخدم؛ null = لا صلاحية أو لا ملف */
async function signVoiceNote(path: string): Promise<string | null> {
  const { data, error } = await getBrowserSupabase()
    .storage.from(CONVERSATION_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    console.error('[VOICE_NOTE][SIGN]', error?.message ?? 'no signed url')
    return null
  }
  return data.signedUrl
}

interface Props {
  path: string
  label: string
  unavailableLabel: string
}

export default function VoiceNote({ path, label, unavailableLabel }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const signedAtRef = useRef(0)
  const resumeRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // كل setState بعد await، كما في LiveConversations
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const signed = await signVoiceNote(path)
      if (cancelled) return
      signedAtRef.current = Date.now()
      if (signed) setUrl(signed)
      else setFailed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  const handleError = async () => {
    if (Date.now() - signedAtRef.current < FRESH_URL_MS) {
      setFailed(true)
      return
    }
    const signed = await signVoiceNote(path)
    signedAtRef.current = Date.now()
    if (!signed) {
      setFailed(true)
      return
    }
    resumeRef.current = true
    setUrl(signed)
  }

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1 mb-1 text-[9px] font-bold opacity-60">
        <Mic size={9} />
        {label}
      </div>
      {failed ? (
        <p className="text-[10px] font-semibold text-amber-700">{unavailableLabel}</p>
      ) : url ? (
        <audio
          ref={audioRef}
          src={url}
          controls
          preload="metadata"
          onError={() => void handleError()}
          onCanPlay={() => {
            // بعد تجديد الرابط: يكمل التشغيل الذي طلبه المستخدم
            if (resumeRef.current) {
              resumeRef.current = false
              void audioRef.current?.play().catch(() => {})
            }
          }}
          className="block h-9 w-[240px] max-w-full"
        />
      ) : (
        <div className="h-9 w-[240px] max-w-full rounded-full bg-slate-100 animate-pulse" />
      )}
    </div>
  )
}
