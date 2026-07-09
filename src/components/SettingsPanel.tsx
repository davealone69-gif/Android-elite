import React from 'react';
import { Type, WrapText, Indent, AlignLeft } from 'lucide-react';
import { EditorSettings } from '../types';

interface SettingsPanelProps {
  settings: EditorSettings;
  onChangeSettings: (settings: EditorSettings) => void;
  theme: 'dark' | 'light';
}

export default function SettingsPanel({
  settings,
  onChangeSettings,
  theme
}: SettingsPanelProps) {
  const isDark = theme === 'dark';

  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    onChangeSettings({ ...settings, [key]: value });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 text-xs select-none">
      {/* Font Size Option */}
      <div className="flex flex-col gap-2">
        <label className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px] flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-cyan-400" /> Editor Font Size ({settings.fontSize}px)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="10"
            max="20"
            value={settings.fontSize}
            onChange={e => updateSetting('fontSize', parseInt(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
        </div>
      </div>

      {/* Font Family Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px] flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5 text-pink-400" /> Font Family
        </label>
        <select
          value={settings.fontFamily}
          onChange={e => updateSetting('fontFamily', e.target.value as any)}
          className={`w-full text-xs rounded-xl px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
            isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <option value="JetBrains Mono">JetBrains Mono</option>
          <option value="Fira Code">Fira Code</option>
          <option value="Source Code Pro">Source Code Pro</option>
          <option value="monospace">Standard Monospace</option>
        </select>
      </div>

      {/* Word Wrap */}
      <div className="flex items-center justify-between py-1.5 border-b border-slate-800/20">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <WrapText className="w-3.5 h-3.5 text-emerald-400" /> Wrap Code Lines
          </span>
          <span className="text-[10px] text-slate-500">Wrap long lines to fit the view</span>
        </div>
        <input
          type="checkbox"
          checked={settings.wordWrap}
          onChange={e => updateSetting('wordWrap', e.target.checked)}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
        />
      </div>

      {/* Show Line Numbers */}
      <div className="flex items-center justify-between py-1.5 border-b border-slate-800/20">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <Indent className="w-3.5 h-3.5 text-yellow-400" /> Line Numbers
          </span>
          <span className="text-[10px] text-slate-500">Display row indicators on left gutter</span>
        </div>
        <input
          type="checkbox"
          checked={settings.showLineNumbers}
          onChange={e => updateSetting('showLineNumbers', e.target.checked)}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
        />
      </div>

      {/* Tab Size Indentation */}
      <div className="flex items-center justify-between py-1.5 border-b border-slate-800/20">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <Indent className="w-3.5 h-3.5 text-purple-400" /> Tab Spacing
          </span>
          <span className="text-[10px] text-slate-500">Choose indentation space width</span>
        </div>
        <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-lg shrink-0">
          {[2, 4].map(size => (
            <button
              key={size}
              onClick={() => updateSetting('tabSize', size as any)}
              className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                settings.tabSize === size ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {size} Spaces
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
