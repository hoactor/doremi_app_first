/**
 * ApiKeySettings — Tauri 전용 API 키 관리 모달
 * macOS Keychain 직접 저장 (keyring crate → Security.framework)
 * "키체인 접근" 앱에서 "doremissul-studio"로 검색 가능
 */

import React, { useState, useEffect } from 'react';
import { IS_TAURI, saveApiKeys, loadApiKeys, checkApiKeys, getStoragePath, setStoragePath, pickStorageFolder, type ApiKeys } from '../services/tauriAdapter';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ApiKeySettings({ isOpen, onClose }: ApiKeySettingsProps) {
    const [keys, setKeys] = useState<ApiKeys>({ claude: null, gemini: null, supertone: null, fal: null });
    const [status, setStatus] = useState<{ claude: boolean; gemini: boolean; supertone: boolean; fal: boolean }>({
        claude: false, gemini: false, supertone: false, fal: false,
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [storagePath, setStoragePathState] = useState('');
    const [pathSaving, setPathSaving] = useState(false);
    const [pathMessage, setPathMessage] = useState('');

    useEffect(() => {
        if (isOpen && IS_TAURI) {
            checkApiKeys().then(setStatus).catch(console.error);
            getStoragePath().then(setStoragePathState).catch(console.error);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            await saveApiKeys(keys);
            const newStatus = await checkApiKeys();
            setStatus(newStatus);
            setKeys({ claude: null, gemini: null, supertone: null, fal: null });
            setMessage('✅ API 키가 안전하게 저장되었습니다.');
        } catch (err: any) {
            setMessage(`❌ 저장 오류: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const keyFields = [
        { id: 'claude', label: 'Claude API', desc: '대본 분석, 프롬프트 생성', link: 'https://console.anthropic.com' },
        { id: 'gemini', label: 'Gemini API', desc: '이미지 생성', link: 'https://aistudio.google.com/apikey' },
        { id: 'supertone', label: 'Supertone API', desc: 'TTS 음성합성', link: '' },
        { id: 'fal', label: 'fal.ai API', desc: 'Flux 이미지 생성', link: 'https://fal.ai/dashboard/keys' },
    ] as const;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-zinc-900 rounded-2xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto border border-zinc-700">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">🔐 API 키 설정</h2>
                            <p className="text-sm text-zinc-400 mt-1">macOS 키체인에 안전하게 저장됩니다</p>
                        </div>
                        <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
                    </div>

                    <div className="space-y-4">
                        {keyFields.map((field) => (
                            <div key={field.id} className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">
                                        {field.label}
                                        <span className="text-xs text-zinc-500 ml-2">({field.desc})</span>
                                    </label>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        status[field.id] 
                                            ? 'bg-emerald-900/50 text-emerald-400' 
                                            : 'bg-red-900/50 text-red-400'
                                    }`}>
                                        {status[field.id] ? '설정됨' : '미설정'}
                                    </span>
                                </div>
                                <input
                                    type="password"
                                    placeholder={status[field.id] ? '••••••••  (변경하려면 새 키 입력)' : 'API 키를 입력하세요'}
                                    value={keys[field.id] || ''}
                                    onChange={(e) => setKeys(prev => ({ ...prev, [field.id]: e.target.value || null }))}
                                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-600 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono"
                                />
                                {field.link && (
                                    <a href={field.link} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-400 hover:text-orange-300">
                                        → 키 발급받기
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>

                    {message && (
                        <p className={`mt-4 text-sm ${message.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                            {message}
                        </p>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                        >
                            닫기
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || (!keys.claude && !keys.gemini && !keys.supertone && !keys.fal)}
                            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            {saving ? '저장 중...' : '저장'}
                        </button>
                    </div>

                    {/* ─── 저장 경로 설정 ─── */}
                    <div className="mt-6 pt-6 border-t border-zinc-700">
                        <div className="mb-3">
                            <h3 className="text-sm font-semibold text-zinc-300">📁 데이터 저장 경로</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">프로젝트 및 에셋 파일이 저장될 폴더를 지정합니다</p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={storagePath}
                                onChange={(e) => setStoragePathState(e.target.value)}
                                placeholder="저장 경로를 선택하거나 직접 입력"
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono"
                            />
                            <button
                                onClick={async () => {
                                    const picked = await pickStorageFolder();
                                    if (picked) setStoragePathState(picked);
                                }}
                                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-colors whitespace-nowrap"
                            >
                                폴더 선택
                            </button>
                        </div>
                        {pathMessage && (
                            <p className={`mt-2 text-xs ${pathMessage.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pathMessage}
                            </p>
                        )}
                        <div className="mt-3 flex justify-end">
                            <button
                                onClick={async () => {
                                    if (!storagePath.trim()) return;
                                    setPathSaving(true);
                                    setPathMessage('');
                                    try {
                                        await setStoragePath(storagePath.trim());
                                        setPathMessage('✅ 저장 경로가 변경되었습니다. 앱을 재시작하면 적용됩니다.');
                                    } catch (err: any) {
                                        setPathMessage(`❌ 오류: ${err.message}`);
                                    } finally {
                                        setPathSaving(false);
                                    }
                                }}
                                disabled={pathSaving || !storagePath.trim()}
                                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-200 text-xs rounded-lg transition-colors"
                            >
                                {pathSaving ? '적용 중...' : '경로 적용'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
