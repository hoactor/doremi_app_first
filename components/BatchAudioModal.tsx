
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Scene, Cut, Notification, CharacterDescription } from '../types';
import { XIcon, SpeakerWaveIcon, TrashIcon, UploadIcon, SpinnerIcon, SparklesIcon, ChevronDownIcon, CogIcon, CheckIcon, UserIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon, RefreshIcon } from './icons';
import { generateTypecastSpeech } from '../services/typecastService';
import { generateSupertoneSpeech } from '../services/supertoneService';
import { useAppContext } from '../AppContext';

interface BatchAudioModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenes: Scene[];
    onAttachAudio: (cutNumber: string, file: File, role?: string) => void;
    onRemoveAudio: (cutNumber: string, index: number) => void;
    onUpdateCut: (cutNumber: string, data: Partial<Cut>) => void;
    generateSpeech: (narration: string) => Promise<{ audioBase64: string; tokenCount: number; }>; 
    addNotification: (message: string, type: Notification['type']) => void;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
}

type AudioEngine = 'typecast' | 'supertone';

interface VoiceSetting {
    engine: AudioEngine;
    id: string; 
    emotion: string;
    speed: number;
    label: string;
}

const DEFAULT_VOICE_IDS = {
    typecast: {
        male: "tc_63be4f4f564199aab7aad258",
        female: "tc_6731b292d944a485bc406efb",
        default: "tc_63be4f4f564199aab7aad258"
    },
    supertone: "5e8e812ce89c94e3e72292"
};

const EMOTIONS = ["normal", "neutral", "Happy", "Sad", "Angry", "Fear", "Surprise", "Disgust"];
const SPLIT_REGEX = /([“][\s\S]*?[”]|"[\s\S]*?")/g;

const getRoleForPart = (
    part: string, 
    cutCharacters: string[], 
    dialogueSpeaker: string | undefined,
    characterDescriptions: Record<string, CharacterDescription>
): string => {
    const trimmedPart = part.trim();
    if (!trimmedPart) return 'undefined';
    const isQuote = (trimmedPart.startsWith('"') && trimmedPart.endsWith('"')) || (trimmedPart.startsWith('“') && trimmedPart.endsWith('”'));
    
    if (!isQuote) return 'narration';

    // Find which characters are in this cut
    const presentCharKeys = Object.keys(characterDescriptions).filter(key => 
        cutCharacters.some(c => c.includes(characterDescriptions[key].koreanName))
    );

    if (presentCharKeys.length === 1) return presentCharKeys[0];
    if (presentCharKeys.length >= 2 && dialogueSpeaker) return dialogueSpeaker;
    
    return 'narration'; 
};

interface AudioCutCardProps {
    cut: Cut;
    globalSettings: Record<string, VoiceSetting>;
    onAttachAudio: (cutNumber: string, file: File, role?: string) => void;
    onRemoveAudio: (cutNumber: string, index: number) => void;
    addNotification: (message: string, type: Notification['type']) => void;
}

const AudioCutCard: React.FC<AudioCutCardProps> = ({ cut: initialCut, globalSettings, onAttachAudio, onRemoveAudio, addNotification }) => {
    const { state, actions } = useAppContext();
    const { characterDescriptions } = state;
    
    const liveCut = useMemo(() => {
        if (!state.generatedContent) return initialCut;
        return state.generatedContent.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === initialCut.cutNumber) || initialCut;
    }, [state.generatedContent, initialCut]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [currentGeneratingInfo, setCurrentGeneratingInfo] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const characters = liveCut.characters || [];
    // Identify present character keys
    const presentCharKeys = useMemo(() => Object.keys(characterDescriptions).filter(key => 
        characters.some(c => c.includes(characterDescriptions[key].koreanName))
    ), [characters, characterDescriptions]);

    const segmentsInternal = useMemo(() => {
        if (!liveCut.narration) return [];
        return liveCut.narration.split(SPLIT_REGEX)
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(part => {
                const role = getRoleForPart(part, characters, liveCut.dialogueSpeaker, characterDescriptions);
                const settings = role !== 'undefined' ? globalSettings[role] : null;
                return {
                    text: part,
                    role: role,
                    label: settings ? settings.label : '건너뜜 (화자 미지정)',
                    settings: settings
                };
            });
    }, [liveCut.narration, characters, liveCut.dialogueSpeaker, globalSettings, characterDescriptions]);

    const handleUpdate = (data: Partial<Cut>) => actions.handleUpdateCut(liveCut.cutNumber, data);

    const handleGenerate = async () => {
        if (!liveCut.narration?.trim()) return;
        setIsGenerating(true);
        try {
            if (liveCut.audioDataUrls?.length) {
                for (let i = liveCut.audioDataUrls.length - 1; i >= 0; i--) {
                    onRemoveAudio(liveCut.cutNumber, i);
                }
            }
            for (let i = 0; i < segmentsInternal.length; i++) {
                const seg = segmentsInternal[i];
                if (seg.role === 'undefined' || !seg.settings) continue;
                const roleSettings = seg.settings;
                setCurrentGeneratingInfo(`[${roleSettings.engine.toUpperCase()}] ${seg.label} 생성 중... [${i + 1}/${segmentsInternal.length}]`);
                try {
                    const finalSpeed = liveCut.voiceSpeed !== undefined ? liveCut.voiceSpeed : roleSettings.speed;
                    const finalEmotion = liveCut.voiceEmotion || roleSettings.emotion;
                    let audioFile: File;
                    if (roleSettings.engine === 'typecast') {
                        audioFile = await generateTypecastSpeech({
                            actor_id: roleSettings.id,
                            text: seg.text,
                            emotion_name: finalEmotion,
                            speech_rate: finalSpeed,
                            pitch: liveCut.voicePitch ?? 0
                        });
                    } else {
                        audioFile = await generateSupertoneSpeech({
                            voiceId: roleSettings.id,
                            text: seg.text,
                            style: finalEmotion,
                            speed: finalSpeed,
                            pitch: liveCut.voicePitch ?? 0
                        });
                    }
                    onAttachAudio(liveCut.cutNumber, audioFile, `${seg.label}|${roleSettings.engine}`);
                } catch (e) {
                    console.error("Audio generation failed", e);
                    throw e;
                }
            }
            addNotification(`컷 #${liveCut.cutNumber} 생성 완료`, 'success');
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : '서버 오류';
            addNotification(`컷 #${liveCut.cutNumber} 실패: ${errorMsg}`, 'error');
        } finally {
            setIsGenerating(false);
            setCurrentGeneratingInfo('');
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // FIX: Explicitly check for audio files and attach
            const audioFiles = (Array.from(files) as File[]).filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length > 0) {
                audioFiles.forEach(file => {
                    onAttachAudio(liveCut.cutNumber, file, "수동 업로드");
                });
                addNotification(`${audioFiles.length}개의 오디오 파일이 추가되었습니다.`, "success");
            } else {
                addNotification("오디오 파일만 업로드 가능합니다.", "error");
            }
        }
    };

    return (
        <div className="bg-stone-800 border border-stone-700 rounded-lg p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="text-orange-400 font-bold text-sm">CUT #{liveCut.cutNumber}</span>
                    {segmentsInternal.map((seg, idx) => (
                        seg.settings && (
                            <span key={idx} className={`px-2 py-0.5 text-[8px] font-black rounded border uppercase ${seg.settings.engine === 'typecast' ? 'bg-orange-900/30 border-orange-700 text-orange-400' : 'bg-amber-900/30 border-amber-700 text-amber-400'}`}>
                                {seg.label}
                            </span>
                        )
                    ))}
                </div>
                {presentCharKeys.length >= 2 && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-stone-500 font-bold uppercase">2인 컷 화자:</span>
                        <div className="flex gap-1 bg-stone-900/50 p-1 rounded border border-stone-700">
                            {presentCharKeys.map(key => (
                                <button key={key} onClick={() => handleUpdate({ dialogueSpeaker: liveCut.dialogueSpeaker === key ? undefined : key })} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${liveCut.dialogueSpeaker === key ? 'bg-orange-600 text-white shadow-md' : 'text-stone-500 hover:text-stone-300'}`}>
                                    {characterDescriptions[key]?.koreanName || key}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <textarea
                className="w-full bg-stone-900/50 border border-stone-600 rounded p-3 text-sm text-white h-20 resize-none focus:ring-1 focus:ring-orange-500 font-medium shadow-inner"
                value={liveCut.narration}
                onChange={(e) => handleUpdate({ narration: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                    <label className="text-[10px] text-stone-500 font-bold uppercase block">전용 설정</label>
                    <select value={liveCut.voiceEmotion || ""} onChange={(e) => handleUpdate({ voiceEmotion: e.target.value || undefined })} className="w-full bg-stone-700 text-xs text-white border-none rounded p-1.5">
                        <option value="">감정: 전역 설정 따름</option>
                        {EMOTIONS.map(emo => <option key={emo} value={emo}>{emo}</option>)}
                    </select>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="range" min="0.5" max="2.0" step="0.1" value={liveCut.voiceSpeed ?? 1.3} onChange={(e) => handleUpdate({ voiceSpeed: parseFloat(e.target.value) })} className="flex-grow h-1 bg-stone-700 rounded-lg appearance-none accent-orange-500" />
                        <span className="text-[10px] font-mono w-8 text-right text-orange-400">{(liveCut.voiceSpeed ?? 1.3).toFixed(1)}x</span>
                    </div>
                </div>
                <div
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragging(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }}
                    onDrop={handleDrop}
                    className={`bg-stone-900/50 rounded border p-2 space-y-2 min-h-[5rem] max-h-32 overflow-y-auto relative transition-colors ${isDragging ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-stone-700'}`}
                >
                    {isDragging && <div className="absolute inset-0 flex items-center justify-center bg-orange-900/40 text-white font-bold text-[10px] z-10 pointer-events-none rounded animate-pulse">오디오 드롭하기</div>}
                    {liveCut.audioDataUrls?.length ? (
                        liveCut.audioDataUrls.map((url, idx) => (
                            <div key={idx} className="flex items-center gap-1 bg-stone-800/50 p-1 rounded border border-stone-700/50">
                                <audio src={url} className="h-6 flex-grow opacity-80" controls />
                                <button onClick={() => onRemoveAudio(liveCut.cutNumber, idx)} className="p-1 text-stone-500 hover:text-red-400"><TrashIcon className="w-3.5 h-3.5" /></button>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex items-center justify-center opacity-40 py-4 text-[10px] italic">오디오 생성 또는 드래그앤드롭</div>
                    )}
                </div>
            </div>
            <button onClick={handleGenerate} disabled={isGenerating} className={`w-full py-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 ${isGenerating ? 'bg-stone-700 text-stone-400' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}>
                <div className="flex items-center gap-2">{isGenerating ? <SpinnerIcon className="w-4 h-4" /> : <SpeakerWaveIcon className="w-4 h-4" />}<span>{isGenerating ? '생성 중...' : '음성 생성'}</span></div>
                {isGenerating && <span className="text-[9px] font-mono text-orange-300">{currentGeneratingInfo}</span>}
            </button>
        </div>
    );
};

export const BatchAudioModal: React.FC<BatchAudioModalProps> = ({ isOpen, onClose, scenes, onAttachAudio, onRemoveAudio, addNotification }) => {
    const { state } = useAppContext();
    const { characterDescriptions } = state;

    const [isSettingsOpen, setIsSettingsOpen] = useState(true);
    
    // Initialize globalSettings dynamically
    const [globalSettings, setGlobalSettings] = useState<Record<string, VoiceSetting>>(() => {
        const settings: Record<string, VoiceSetting> = {
            narration: { engine: 'typecast', id: "tc_661797310ae4c893f6a25353", emotion: "normal", speed: 1.3, label: "나레이션" }
        };
        Object.keys(characterDescriptions || {}).forEach(key => {
            const char = characterDescriptions[key];
            const defaultId = char.gender === 'female' ? DEFAULT_VOICE_IDS.typecast.female : DEFAULT_VOICE_IDS.typecast.male;
            
            settings[key] = {
                engine: 'typecast',
                id: defaultId,
                emotion: "normal",
                speed: 1.3,
                label: char.koreanName
            };
        });
        return settings;
    });

    // Update settings if characterDescriptions change (e.g. new character added)
    useEffect(() => {
        setGlobalSettings(prev => {
            const next = { ...prev };
            let changed = false;
            Object.keys(characterDescriptions || {}).forEach(key => {
                if (!next[key]) {
                    const char = characterDescriptions[key];
                    const defaultId = char.gender === 'female' ? DEFAULT_VOICE_IDS.typecast.female : DEFAULT_VOICE_IDS.typecast.male;
                    
                    next[key] = {
                        engine: 'typecast',
                        id: defaultId,
                        emotion: "normal",
                        speed: 1.3,
                        label: char.koreanName
                    };
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [characterDescriptions]);

    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    
    // --- Independent Window Logic ---
    const [isExternal, setIsExternal] = useState(false);
    const externalWindowRef = useRef<Window | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    const handlePopOut = useCallback(() => {
        const width = 1400; const height = 900;
        const left = (window.screen.width / 2) - (width / 2); const top = (window.screen.height / 2) - (height / 2);
        const win = window.open('', 'VoiceStudioExternal', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
        if (win) {
            win.document.title = "Audio Studio - Independent";
            document.querySelectorAll('link, style').forEach(s => win.document.head.appendChild(s.cloneNode(true)));
            win.document.body.className = "bg-stone-950 m-0 p-0 overflow-hidden";
            const container = win.document.createElement('div'); container.id = 'popout-root'; win.document.body.appendChild(container);
            setPortalContainer(container); externalWindowRef.current = win; setIsExternal(true);
            win.onbeforeunload = () => { setIsExternal(false); externalWindowRef.current = null; setPortalContainer(null); };
        }
    }, []);

    const allCuts = scenes.flatMap(s => s.cuts || []).filter(Boolean);

    const handleEngineChange = (role: string, newEngine: AudioEngine) => {
        setGlobalSettings(prev => {
            const char = characterDescriptions[role];
            const defaultTypecastId = char ? (char.gender === 'female' ? DEFAULT_VOICE_IDS.typecast.female : DEFAULT_VOICE_IDS.typecast.male) : DEFAULT_VOICE_IDS.typecast.default;
            
            return {
                ...prev,
                [role]: {
                    ...prev[role],
                    engine: newEngine,
                    id: newEngine === 'typecast' ? defaultTypecastId : DEFAULT_VOICE_IDS.supertone, 
                    ...(newEngine === 'supertone' ? { emotion: 'neutral', speed: 1.3 } : {})
                }
            };
        });
    };

    const handleBatchEngineChange = (newEngine: AudioEngine) => {
        const roles = Object.keys(globalSettings);
        const nextSettings = { ...globalSettings };
        roles.forEach(role => {
            const char = characterDescriptions[role];
            const defaultTypecastId = char ? (char.gender === 'female' ? DEFAULT_VOICE_IDS.typecast.female : DEFAULT_VOICE_IDS.typecast.male) : DEFAULT_VOICE_IDS.typecast.default;

            nextSettings[role] = {
                ...nextSettings[role],
                engine: newEngine,
                id: newEngine === 'typecast' ? defaultTypecastId : DEFAULT_VOICE_IDS.supertone,
                ...(newEngine === 'supertone' ? { emotion: 'neutral', speed: 1.3 } : { emotion: 'normal' })
            };
        });
        setGlobalSettings(nextSettings);
        addNotification(`모든 화자를 ${newEngine === 'typecast' ? 'Typecast' : 'Supertone'} 엔진으로 설정했습니다.`, 'info');
    };

    const handleGenerateAll = async () => {
        setIsGeneratingAll(true);
        const targets = allCuts.filter(c => (!c.audioDataUrls || c.audioDataUrls.length === 0) && c.narration?.trim());
        if (targets.length === 0) {
            addNotification("새로 생성할 음성이 없습니다.", "info");
            setIsGeneratingAll(false);
            return;
        }
        try {
            let finished = 0;
            for (const cut of targets) {
                setProgressMessage(`컷 #${cut.cutNumber} 처리 중... (${++finished}/${targets.length})`);
                const parts = cut.narration.split(SPLIT_REGEX).map(p => p.trim()).filter(p => p.length > 0);
                for (const part of parts) {
                    const role = getRoleForPart(part, cut.characters, cut.dialogueSpeaker, characterDescriptions);
                    if (role === 'undefined') continue;
                    const settings = globalSettings[role];
                    if (!settings) continue;

                    const finalSpeed = cut.voiceSpeed ?? settings.speed;
                    const finalEmotion = cut.voiceEmotion || settings.emotion;
                    try {
                        let audioFile: File;
                        if (settings.engine === 'typecast') {
                            audioFile = await generateTypecastSpeech({
                                actor_id: settings.id, text: part, emotion_name: finalEmotion, speech_rate: finalSpeed, pitch: cut.voicePitch ?? 0
                            });
                        } else {
                            audioFile = await generateSupertoneSpeech({
                                voiceId: settings.id, text: part, style: finalEmotion, speed: finalSpeed, pitch: cut.voicePitch ?? 0
                            });
                        }
                        onAttachAudio(cut.cutNumber, audioFile, settings.label);
                    } catch (e) { break; }
                }
            }
            addNotification("일괄 음성 생성이 완료되었습니다.", "success");
        } catch (error) {
            addNotification("배치 작업 중 오류 발생", "error");
        } finally {
            setIsGeneratingAll(false);
            setProgressMessage('');
        }
    };

    const renderContent = () => (
        <div className={`bg-stone-900 border border-stone-700 shadow-2xl w-full h-full flex flex-col overflow-hidden ${isExternal ? 'rounded-none' : 'rounded-2xl'}`}>
            <header className="flex justify-between items-center p-6 border-b border-stone-700 bg-stone-800/50 flex-shrink-0">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-3 text-white"><SpeakerWaveIcon className="w-8 h-8 text-orange-400" />멀티 AI 음성 스튜디오</h2>
                    {isGeneratingAll && <p className="text-sm text-orange-300 mt-1 font-bold animate-pulse">{progressMessage}</p>}
                </div>
                <div className="flex items-center gap-3">
                    {!isExternal && (
                        <button onClick={handlePopOut} className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-lg border border-stone-700 transition-colors" title="새 창으로 분리">
                            <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={handleGenerateAll} disabled={isGeneratingAll} className="px-8 py-3 text-sm font-bold rounded-lg bg-orange-600 hover:bg-orange-500 transition-all text-white shadow-xl disabled:opacity-50">
                        {isGeneratingAll ? <SpinnerIcon className="w-5 h-5" /> : <SparklesIcon className="w-5 h-5" />}
                        <span>{isGeneratingAll ? '일괄 생성 진행 중' : '미생성 컷 모두 생성'}</span>
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700"><XIcon className="w-8 h-8" /></button>
                </div>
            </header>
            <div className="border-b border-stone-700 bg-stone-800/30 flex-shrink-0">
                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full flex justify-between items-center p-4 text-sm font-bold text-stone-300 hover:bg-stone-800/50">
                    <div className="flex items-center gap-2"><CogIcon className="w-5 h-5 text-orange-400" />전역 보이스 엔진 설정</div>
                    <ChevronDownIcon className={`w-6 h-6 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSettingsOpen && (
                    <div className="p-6 pt-0 space-y-6 animate-fade-in">
                        <div className="bg-stone-950/50 p-4 rounded-xl border border-stone-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 text-stone-400"><SparklesIcon className="w-5 h-5 text-amber-400" /><span className="text-xs font-bold uppercase tracking-tight">전체 엔진 일괄 변경:</span></div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button onClick={() => handleBatchEngineChange('typecast')} className="flex-1 sm:flex-initial px-6 py-2.5 text-xs font-black rounded-lg bg-orange-900/30 border border-orange-500/50 text-orange-400 hover:bg-orange-600 hover:text-white transition-all shadow-lg active:scale-95">모든 화자를 TYPECAST로 설정</button>
                                <button onClick={() => handleBatchEngineChange('supertone')} className="flex-1 sm:flex-initial px-6 py-2.5 text-xs font-black rounded-lg bg-amber-900/30 border border-amber-500/50 text-amber-400 hover:bg-amber-600 hover:text-white transition-all shadow-lg active:scale-95">모든 화자를 SUPERTONE으로 설정</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            {Object.keys(globalSettings).map(role => (
                                <div key={role} className={`space-y-3 p-4 bg-stone-900/80 rounded-xl border transition-colors ${globalSettings[role].engine === 'typecast' ? 'border-orange-500/50' : 'border-amber-500/50'}`}>
                                    <div className="flex justify-between items-center">
                                        <label className={`text-xs font-black uppercase tracking-widest ${role === 'narration' ? 'text-stone-400' : 'text-orange-400'}`}>{globalSettings[role].label}</label>
                                        <div className="flex bg-stone-800 rounded-md p-1 scale-90 origin-right">
                                            <button onClick={() => handleEngineChange(role, 'typecast')} className={`px-2 py-0.5 text-[9px] font-bold rounded ${globalSettings[role].engine === 'typecast' ? 'bg-orange-600 text-white shadow' : 'text-stone-500'}`}>Typecast</button>
                                            <button onClick={() => handleEngineChange(role, 'supertone')} className={`px-2 py-0.5 text-[9px] font-bold rounded ${globalSettings[role].engine === 'supertone' ? 'bg-amber-600 text-white shadow' : 'text-stone-500'}`}>Supertone</button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-stone-500 font-bold uppercase">{globalSettings[role].engine === 'typecast' ? 'Actor ID' : 'Voice ID'}</p>
                                        <input type="text" value={globalSettings[role].id} onChange={(e) => setGlobalSettings({ ...globalSettings, [role]: { ...globalSettings[role], id: e.target.value } })} className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-orange-500 outline-none" />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <p className="text-[10px] text-stone-500 font-bold mb-1 uppercase">기본 감정</p>
                                            <select value={globalSettings[role].emotion} onChange={(e) => setGlobalSettings({ ...globalSettings, [role]: { ...globalSettings[role], emotion: e.target.value } })} className="w-full bg-stone-800 text-xs text-white border-none rounded p-1.5">
                                                {EMOTIONS.map(emo => <option key={emo} value={emo}>{emo}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-20">
                                            <p className="text-[10px] text-stone-500 font-bold mb-1 uppercase">속도</p>
                                            <input type="number" step="0.1" value={globalSettings[role].speed} onChange={(e) => setGlobalSettings({ ...globalSettings, [role]: { ...globalSettings[role], speed: parseFloat(e.target.value) || 1.3 } })} className="w-full bg-stone-800 border-none rounded text-xs text-white p-1.5 font-mono" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <main className="flex-grow p-6 overflow-y-auto bg-stone-950 grid grid-cols-1 xl:grid-cols-2 gap-8 pb-24">
                {allCuts.map(cut => (
                    <AudioCutCard key={cut.cutNumber} cut={cut} globalSettings={globalSettings} onAttachAudio={onAttachAudio} onRemoveAudio={onRemoveAudio} addNotification={addNotification} />
                ))}
            </main>
            <footer className="p-5 bg-stone-900 border-t border-stone-700 flex justify-end flex-shrink-0">
                <button onClick={onClose} className="px-12 py-3 text-sm font-bold rounded-lg bg-stone-700 hover:bg-stone-600 transition-colors text-white">닫기</button>
            </footer>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in" aria-modal="true" role="dialog">
            {isExternal ? (
                <div className="flex flex-col items-center justify-center text-center p-12 bg-stone-900 rounded-3xl border border-stone-700 shadow-2xl max-w-lg">
                    <div className="w-20 h-20 bg-orange-600/20 rounded-full flex items-center justify-center mb-6 border border-orange-500/30">
                        <ArrowTopRightOnSquareIcon className="w-10 h-10 text-orange-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">음성 작업창 분리됨</h2>
                    <p className="text-stone-400 mb-8 leading-relaxed">멀티 AI 음성 스튜디오가 독립된 창에서 실행 중입니다.<br/>생성된 음성은 메인 창에 실시간으로 반영됩니다.</p>
                    <button onClick={() => { if(externalWindowRef.current) externalWindowRef.current.close(); setIsExternal(false); }} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                        <RefreshIcon className="w-5 h-5" />
                        현재 탭으로 가져오기
                    </button>
                    <button onClick={onClose} className="w-full mt-3 py-4 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold rounded-xl transition-all">모달 닫기</button>
                </div>
            ) : (
                <div className="w-full max-w-7xl h-full max-h-[95vh]">
                    {renderContent()}
                </div>
            )}
            {isExternal && portalContainer && createPortal(renderContent(), portalContainer)}
        </div>
    );
};
