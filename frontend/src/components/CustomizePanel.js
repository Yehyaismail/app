import React, { useState, useRef } from 'react';
import { X, RotateCcw, Palette, Upload, Trash2 } from 'lucide-react';
import { useCustomize } from '../contexts/CustomizeContext';

const AVATAR_COLORS = ['#059669', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#ca8a04', '#0d9488', '#4f46e5', '#be185d', '#1e293b'];
const CHAT_BG_COLORS = ['', '#f0fdf4', '#eff6ff', '#faf5ff', '#fef2f2', '#fffbeb', '#f0fdfa', '#eef2ff', '#fdf2f8', '#f8fafc', '#1e293b', '#0f172a', '#14532d', '#1e1b4b'];
const BUBBLE_COLORS_SENT = ['', '#d1fae5', '#bbf7d0', '#a7f3d0', '#bfdbfe', '#ddd6fe', '#fecdd3', '#fde68a', '#99f6e4'];
const BUBBLE_COLORS_RECEIVED = ['', '#ffffff', '#f1f5f9', '#f8fafc', '#fefce8', '#fdf4ff', '#ecfdf5', '#eff6ff'];
const FONTS = [
  { label: 'افتراضي', value: '' },
  { label: 'IBM Plex Sans', value: "'IBM Plex Sans', sans-serif" },
  { label: 'Manrope', value: "'Manrope', sans-serif" },
  { label: 'Tajawal', value: "'Tajawal', sans-serif" },
  { label: 'Cairo', value: "'Cairo', sans-serif" },
  { label: 'Amiri', value: "'Amiri', serif" },
  { label: 'Noto Kufi', value: "'Noto Kufi Arabic', sans-serif" },
];
const FONT_SIZES = [
  { label: 'صغير', value: 'sm' },
  { label: 'متوسط', value: 'base' },
  { label: 'كبير', value: 'lg' },
  { label: 'كبير جداً', value: 'xl' },
];

export const CustomizePanel = ({ isOpen, onClose }) => {
  const { settings, updateSetting, resetSettings } = useCustomize();
  const [tab, setTab] = useState('avatar');
  const bgInputRef = useRef(null);

  const handleBgImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateSetting('chatBgImage', ev.target.result);
      updateSetting('chatBgColor', '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeBgImage = () => {
    updateSetting('chatBgImage', '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="customize-panel">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">تخصيص المظهر</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={resetSettings} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="إعادة تعيين" data-testid="reset-customize">
              <RotateCcw className="w-4 h-4 text-slate-500" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" data-testid="close-customize">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-2">
          {[
            { id: 'avatar', label: 'الصورة' },
            { id: 'chat', label: 'المحادثة' },
            { id: 'font', label: 'الخط' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-3 text-sm font-medium transition-colors ${tab === t.id ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {tab === 'avatar' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">لون الأيقونة</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button key={c} onClick={() => updateSetting('avatarColor', c)} className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 ${settings.avatarColor === c ? 'border-emerald-500 scale-110 ring-2 ring-emerald-200' : 'border-transparent'}`} style={{ backgroundColor: c }} data-testid={`avatar-color-${c}`} />
                  ))}
                </div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">معاينة</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium" style={{ backgroundColor: settings.avatarColor }}>أد</div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">Admin</p>
                    <p className="text-xs text-slate-500">متصل</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'chat' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">صورة خلفية المحادثة</label>
                <input type="file" ref={bgInputRef} accept="image/*" className="hidden" onChange={handleBgImageUpload} />
                <div className="flex gap-2 items-center">
                  <button onClick={() => bgInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-300 transition-colors" data-testid="upload-bg-btn">
                    <Upload className="w-4 h-4" /><span>اختيار صورة من المعرض</span>
                  </button>
                  {settings.chatBgImage && (
                    <button onClick={removeBgImage} className="p-2.5 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors" data-testid="remove-bg-btn">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {settings.chatBgImage && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 h-24">
                    <img src={settings.chatBgImage} alt="bg" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">أو اختر لون خلفية</label>
                <div className="flex flex-wrap gap-2">
                  {CHAT_BG_COLORS.map((c, i) => (
                    <button key={i} onClick={() => updateSetting('chatBgColor', c)} className={`w-10 h-10 rounded-lg border-2 transition-transform hover:scale-110 ${settings.chatBgColor === c ? 'border-emerald-500 scale-110 ring-2 ring-emerald-200' : 'border-slate-200 dark:border-slate-600'}`} style={{ backgroundColor: c || '#f8fafc' }} data-testid={`chat-bg-${i}`}>
                      {!c && <span className="text-[10px] text-slate-400">auto</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">لون فقاعة الإرسال</label>
                <div className="flex flex-wrap gap-2">
                  {BUBBLE_COLORS_SENT.map((c, i) => (
                    <button key={i} onClick={() => updateSetting('sentBubbleColor', c)} className={`w-10 h-10 rounded-lg border-2 transition-transform hover:scale-110 ${settings.sentBubbleColor === c ? 'border-emerald-500 scale-110' : 'border-slate-200 dark:border-slate-600'}`} style={{ backgroundColor: c || '#d1fae5' }}>
                      {!c && <span className="text-[10px] text-slate-400">auto</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">لون فقاعة الاستقبال</label>
                <div className="flex flex-wrap gap-2">
                  {BUBBLE_COLORS_RECEIVED.map((c, i) => (
                    <button key={i} onClick={() => updateSetting('receivedBubbleColor', c)} className={`w-10 h-10 rounded-lg border-2 transition-transform hover:scale-110 ${settings.receivedBubbleColor === c ? 'border-emerald-500 scale-110' : 'border-slate-200 dark:border-slate-600'}`} style={{ backgroundColor: c || '#ffffff' }}>
                      {!c && <span className="text-[10px] text-slate-400">auto</span>}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'font' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">نوع الخط</label>
                <div className="space-y-2">
                  {FONTS.map((f) => (
                    <button key={f.value} onClick={() => updateSetting('fontFamily', f.value)} className={`w-full text-right px-4 py-3 rounded-lg border transition-colors ${settings.fontFamily === f.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`} style={{ fontFamily: f.value || 'inherit' }}>
                      <span className="text-slate-900 dark:text-slate-100">{f.label}</span>
                      <span className="text-xs text-slate-400 mr-2" style={{ fontFamily: f.value || 'inherit' }}>مرحباً بالعالم</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">حجم الخط</label>
                <div className="flex gap-2">
                  {FONT_SIZES.map((s) => (
                    <button key={s.value} onClick={() => updateSetting('fontSize', s.value)} className={`flex-1 px-3 py-2.5 rounded-lg border text-sm transition-colors ${settings.fontSize === s.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">معاينة</p>
                <p className={`text-slate-900 dark:text-slate-100 text-${settings.fontSize}`} style={{ fontFamily: settings.fontFamily || 'inherit' }}>
                  مرحباً! هذا نص تجريبي لمعاينة الخط والحجم المختار.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
