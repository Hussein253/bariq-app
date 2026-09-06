'use client'

import { useState } from 'react'
import {
  Upload,
  FileUp,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Plus,
  Loader
} from 'lucide-react'
import { toArabicDigits } from '@/lib/formatters'

interface UploadSession {
  id: string
  fileName: string
  uploadedAt: string
  status: 'قيد المعالجة' | 'نجح' | 'خطأ'
  totalRows: number
  processedRows: number
  failedRows: number
}

export default function BulkOrderUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadSessions, setUploadSessions] = useState<UploadSession[]>([
    {
      id: '1',
      fileName: 'طلبات_سبتمبر_2026.xlsx',
      uploadedAt: '٢٠٢٦-٠٩-٠٦ ١٤:٣٠',
      status: 'نجح',
      totalRows: 150,
      processedRows: 150,
      failedRows: 0
    },
    {
      id: '2',
      fileName: 'طلبات_عاجلة_مندوب.csv',
      uploadedAt: '٢٠٢٦-٠٩-٠٦ ١٢:١٥',
      status: 'نجح',
      totalRows: 45,
      processedRows: 45,
      failedRows: 0
    }
  ])
  const [isUploading, setIsUploading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)

    // محاكاة رفع الملف
    setTimeout(() => {
      const newSession: UploadSession = {
        id: Date.now().toString(),
        fileName: files[0].name,
        uploadedAt: new Date().toLocaleString('ar-IQ'),
        status: 'نجح',
        totalRows: Math.floor(Math.random() * 200) + 50,
        processedRows: Math.floor(Math.random() * 200) + 50,
        failedRows: 0
      }
      setUploadSessions([newSession, ...uploadSessions])
      setIsUploading(false)
    }, 1500)
  }

  const downloadTemplate = () => {
    // يمكن تحسين هذا لاحقاً لتحميل قالب حقيقي
    alert('سيتم تحميل قالب ملف Excel الآن')
  }

  return (
    <>
      <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0] bg-[#FAFAFA]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#253765]/10 flex items-center justify-center">
                <FileUp size={20} className="text-[#253765]" />
              </div>
              <div>
                <h3 className="font-bold text-[#0F172A]">رفع الطلبات جماعياً</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  استيراد الطلبات من ملفات Excel أو CSV
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs transition"
            >
              <Plus size={16} />
              <span>رفع ملف جديد</span>
            </button>
          </div>
        </div>

        {/* قائمة الرفعات السابقة */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0] font-semibold">
                <th className="p-4">اسم الملف</th>
                <th className="p-4">تاريخ الرفع</th>
                <th className="p-4">إجمالي الطلبات</th>
                <th className="p-4">المعالج</th>
                <th className="p-4">الأخطاء</th>
                <th className="p-4">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {uploadSessions.map((session) => (
                <tr key={session.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="p-4 font-bold text-[#0F172A]">{session.fileName}</td>
                  <td className="p-4 text-slate-500">{session.uploadedAt}</td>
                  <td className="p-4 font-mono">{toArabicDigits(session.totalRows)}</td>
                  <td className="p-4 font-mono text-emerald-700 font-bold">
                    {toArabicDigits(session.processedRows)}
                  </td>
                  <td className="p-4 font-mono text-rose-700 font-bold">
                    {toArabicDigits(session.failedRows)}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      session.status === 'نجح'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : session.status === 'قيد المعالجة'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {session.status === 'نجح' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                      {session.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة الرفع */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-[#0F172A]">رفع ملف طلبات جديد</h3>
              <button
                onClick={() => {
                  setShowModal(false)
                  setIsUploading(false)
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* منطقة السحب والإفلات */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={(e) => {
                handleDrag(e)
                handleUpload(e.dataTransfer.files)
              }}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${
                isDragging
                  ? 'border-[#253765] bg-[#253765]/5'
                  : 'border-[#E2E8F0] hover:border-[#253765]'
              }`}
            >
              <Upload className={`mx-auto mb-3 ${isDragging ? 'text-[#253765]' : 'text-slate-400'}`} size={32} />
              <p className="font-bold text-[#0F172A] mb-1">
                {isDragging ? 'أفلت الملف هنا' : 'اسحب الملف هنا'}
              </p>
              <p className="text-xs text-slate-500 mb-3">أو</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs cursor-pointer transition">
                <Plus size={14} />
                <span>اختر ملف</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => handleUpload(e.target.files)}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {/* صيغ مقبولة وقالب */}
            <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
              <p className="text-xs font-bold text-[#64748B] mb-2">الصيغ المقبولة:</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                  .XLSX
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                  .XLS
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                  .CSV
                </span>
              </div>
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-[#253765] text-[#253765] font-bold text-xs hover:bg-[#253765]/5 transition"
              >
                <Download size={14} />
                <span>تحميل قالب Excel</span>
              </button>
            </div>

            {/* حالة الرفع */}
            {isUploading && (
              <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2">
                <Loader size={16} className="text-blue-600 animate-spin" />
                <span className="text-xs font-semibold text-blue-700">جاري معالجة الملف...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
