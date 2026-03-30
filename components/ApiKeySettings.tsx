import React, { useState, useEffect } from 'react';
import { IS_TAURI, saveApiKeys, checkApiKeys, loadApiKeys, getStoragePath, pickStorageFolder, setStoragePath } from '../services/tauriAdapter';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
    const [keys, setKeys] = useState({ claude: '', gemini: '', supertone: '', fal: '' });
    const [status, setStatus] = useState({ claude: false, gemini: false, supertone: false, fal: false });
    const [storagePath, setStoragePathState] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (isOpen) {
            checkApiKeys().then(setStatus).catch(() => {});
            getStoragePath().then(setStoragePathState).catch(() => {});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const toSave: any = {};
            if (keys.claude.trim()) toSave.claude = keys.claude.trim();
            if (keys.gemini.trim()) toSave.gemini = keys.gemini.trim();
            if (keys.supertone.trim()) toSave.supertone = keys.supertone.trim();
            if (keys.fal.trim()) toSave.fal = keys.fal.trim();
            if (Object.keys(toSave).length === 0) {
                setMessage({ text: '변경할 키가 없습니다.', type: 'error' });
                setSaving(false);
                return;
            }
            await saveApiKeys(toSave);
            const newStatus = await checkApiKeys();
            setStatus(newStatus);
            setKeys({ claude: '', gemini: '', supertone: '', fal: '' });
            setMessage({ text: 'API 키가 저장되었습니다.', type: 'success' });
        } catch (err: any) {
            setMessage({ text: `저장 실패: ${err.message || err}`, type: 'error' });
        }
        setSaving(false);
    };

    const handlePickFolder = async () => {
        try {
            const path = await pickStorageFolder();
            if (path) {
                await setStoragePath(path);
                setStoragePathState(path);
                setMessage({ text: '저장소 경로가 변경되었습니다.', type: 'success' });
            }
        } catch (err: any) {
            setMessage({ text: `경로 변경 실패: ${err.message || err}`, type: 'error' });
        }
    };

    const keyFields = [
        { id: 'gemini' as const, label: 'Gemini API Key', url: 'https://aistudio.google.com/apikey' },
        { id: 'claude' as const, label: 'Claude API Key', url: 'https://console.anthropic.com/settings/keys' },
        { id: 'supertone' as const, label: 'Supertone API Key', url: 'https://supertone.ai' },
        { id: 'fal' as const, label: 'fal.ai API Key', url: 'https://fal.ai/dashboard/keys' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-stone-800 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-stone-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-stone-100">API 키 설정</h2>
                    <button onClick={onClose} className="text-stone-400 hover:text-stone-200 text-xl">&times;</button>
                </div>

                <div className="space-y-3 mb-5">
                    {keyFields.map(f => (
                        <div key={f.id}>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm text-stone-300 font-medium">{f.label}</label>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs ${status[f.id] ? 'text-green-400' : 'text-stone-500'}`}>
                                        {status[f.id] ? '✓ 설정됨' : '미설정'}
                                    </span>
                                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                                        키 발급 →
                                    </a>
                                </div>
                            </div>
                            <input
                                type="password"
                                placeholder={status[f.id] ? '(변경하려면 새 키 입력)' : '키를 입력하세요'}
                                value={keys[f.id]}
                                onChange={e => setKeys(prev => ({ ...prev, [f.id]: e.target.value }))}
                                className="w-full bg-stone-900 border border-stone-600 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-orange-500 focus:outline-none"
                            />
                        </div>
                    ))}
                </div>

                {IS_TAURI && (
                    <div className="mb-5 border-t border-stone-700 pt-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-stone-300 font-medium">저장소 경로</label>
                            <button onClick={handlePickFolder} className="text-xs text-blue-400 hover:text-blue-300">
                                폴더 변경 →
                            </button>
                        </div>
                        <div className="bg-stone-900 border border-stone-600 rounded-lg px-3 py-2 text-xs text-stone-400 font-mono truncate">
                            {storagePath || '기본 경로'}
                        </div>
                    </div>
                )}

                {message && (
                    <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                        {message.text}
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-stone-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                    >
                        {saving ? '저장 중...' : '저장'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 bg-stone-700 hover:bg-stone-600 text-stone-300 font-medium py-2.5 rounded-lg transition-colors text-sm"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
