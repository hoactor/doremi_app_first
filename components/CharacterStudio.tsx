
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { CharacterDescription, AssetCatalogEntry, ArtStyle, LoRAEntry } from '../types';
import { IS_TAURI, resolveImageUrl, loadAssetCatalog, saveAsset, updateAssetMetadata, deleteAsset, loadLoraRegistry } from '../services/tauriAdapter';
import { LoraRegistryModal } from './LoraRegistryModal';
import { analyzeHairStyle } from '../services/geminiService';
import { AssetTagPopup, analyzeAssetWithVision } from './AssetCatalogModal';
import {
    XIcon, SparklesIcon, UploadIcon, CheckIcon, SpinnerIcon,
    FolderOpenIcon, BookmarkSquareIcon, PencilIcon, TrashIcon,
    RefreshIcon, ExclamationTriangleIcon, ChevronDownIcon, DownloadIcon,
} from './icons';

// ─── Style names ─────────────────────────────────────────────────────
const STYLE_NAMES: Record<string, string> = {
    'dalle-chibi': '프리미엄', 'dalle-chibi': 'DALL-E 치비',
    'ghibli-anime': '지브리 애니메', 'webtoon-line': '웹툰 라인', 'custom': '커스텀',
};

// ─── Types ───────────────────────────────────────────────────────────
interface CharacterStudioProps {
    isOpen: boolean;
    onClose: () => void;
    characterDescriptions: { [key: string]: CharacterDescription };
    onUpdateCharacterDescription: (key: string, data: Partial<CharacterDescription>) => void;
    onConfirm: () => void;
    onGenerateLocationOutfits: (key: string) => Promise<void>;
    onGenerateOutfitImage: (characterKey: string, location: string, outfitDescription: string) => Promise<void>;
}

type CharacterStatus = 'none' | 'partial' | 'ready';

// ─── 상태 계산 ───────────────────────────────────────────────────────
const getCharStatus = (char: CharacterDescription): CharacterStatus => {
    if (!char.sourceImageUrl) return 'none';
    const locs = Object.keys(char.locations || {});
    if (locs.length === 0) return 'ready';
    const filled = locs.filter(l => (char.locations[l] || '').trim().length > 0);
    if (filled.length < locs.length) return 'partial';
    return 'ready';
};

const STATUS_ICON: Record<CharacterStatus, { icon: string; color: string }> = {
    none: { icon: '✗', color: 'text-red-400' },
    partial: { icon: '⚠', color: 'text-orange-400' },
    ready: { icon: '✓', color: 'text-orange-400' },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const CharacterStudio: React.FC<CharacterStudioProps> = ({
    isOpen, onClose, characterDescriptions, onUpdateCharacterDescription,
    onConfirm, onGenerateLocationOutfits, onGenerateOutfitImage,
}) => {
    const { state: { artStyle, appState }, actions: ctxActions } = useAppContext();
    const characterKeys = useMemo(() => Object.keys(characterDescriptions), [characterDescriptions]);
    const [selectedKey, setSelectedKey] = useState<string>(characterKeys[0] || '');
    const [editingOutfitLoc, setEditingOutfitLoc] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── 에셋 패널 상태 ──
    const [assets, setAssets] = useState<AssetCatalogEntry[]>([]);
    const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
    const [assetFilter, setAssetFilter] = useState<'all' | 'character' | 'outfit' | 'background'>('all');
    const [assetSearch, setAssetSearch] = useState('');
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const assetFileInputRef = useRef<HTMLInputElement>(null);
    const [pendingAssetImport, setPendingAssetImport] = useState<{ dataUrl: string; fileName: string } | null>(null);
    const [isAnalyzingAsset, setIsAnalyzingAsset] = useState(false);

    // ── 화풍 불일치 확인 모달 ──
    const [styleMismatchAsset, setStyleMismatchAsset] = useState<{ asset: AssetCatalogEntry; target: 'reference' | 'outfit'; location?: string } | null>(null);
    const [editingAsset, setEditingAsset] = useState<AssetCatalogEntry | null>(null);
    // ── 의상 슬롯 이미지 (에셋 드롭 시 저장) ──
    const [outfitSlotImages, setOutfitSlotImages] = useState<Record<string, Record<string, string>>>({});  // { charKey: { location: imageUrl } }
    const [analyzingOutfitLocs, setAnalyzingOutfitLocs] = useState<Set<string>>(new Set());  // ★ 의상 분석 중인 장소
    const [outfitAssetPopup, setOutfitAssetPopup] = useState<{ location: string; imageUrl: string; charName: string } | null>(null);  // ★ 의상 에셋 저장 팝업

    // ── LoRA 상태 ──
    const [loraEntries, setLoraEntries] = useState<LoRAEntry[]>([]);
    const [isLoraRegistryOpen, setIsLoraRegistryOpen] = useState(false);
    const [loraCollapsed, setLoraCollapsed] = useState(true);

    useEffect(() => {
        if (characterKeys.length > 0 && !characterKeys.includes(selectedKey)) {
            setSelectedKey(characterKeys[0]);
        }
    }, [characterKeys, selectedKey]);

    // 에셋 로드
    const loadAssets = useCallback(async () => {
        if (!IS_TAURI) return;
        setIsLoadingAssets(true);
        try {
            const catalog = await loadAssetCatalog();
            setAssets(catalog);
            const urls: Record<string, string> = {};
            await Promise.allSettled(catalog.map(async (a) => {
                try { urls[a.id] = await resolveImageUrl(a.thumbnailPath || a.imagePath); } catch {}
            }));
            setAssetUrls(urls);
        } catch (e) { console.error('에셋 로드 실패:', e); }
        finally { setIsLoadingAssets(false); }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadAssets();
            if (IS_TAURI) loadLoraRegistry().then(setLoraEntries).catch(() => {});
        }
    }, [isOpen, loadAssets]);

    const filteredAssets = useMemo(() => {
        return assets.filter(a => {
            if (assetFilter !== 'all') {
                const extras = (a.tags as any)?.extraTypes ? String((a.tags as any)?.extraTypes).split(',') : [];
                if (a.type !== assetFilter && !extras.includes(assetFilter)) return false;
            }
            if (!assetSearch.trim()) return true;
            const t = assetSearch.toLowerCase();
            return a.name?.toLowerCase().includes(t) || (a.tags?.character || '').toLowerCase().includes(t);
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [assets, assetFilter, assetSearch]);

    const char = characterDescriptions[selectedKey];
    if (!isOpen || !char) return null;

    const allReady = characterKeys.every(k => getCharStatus(characterDescriptions[k]) !== 'none');

    // ── 파일 업로드 → 레퍼런스 설정 ──
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const url = ev.target?.result as string;
            if (url) handleSetReferenceImage(url);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSetReferenceImage = async (imageUrl: string, existingHairDNA?: string) => {
        if (existingHairDNA) {
            onUpdateCharacterDescription(selectedKey, { sourceImageUrl: imageUrl, hairStyleDescription: existingHairDNA });
        } else {
            onUpdateCharacterDescription(selectedKey, { sourceImageUrl: imageUrl, isAnalyzingHair: true } as any);
            try {
                const res = await analyzeHairStyle(imageUrl, char.koreanName || selectedKey);
                ctxActions.handleAddUsage(res.tokenCount, 'claude');
                onUpdateCharacterDescription(selectedKey, { hairStyleDescription: res.hairDescription, facialFeatures: res.facialFeatures, isAnalyzingHair: false } as any);
            } catch {
                onUpdateCharacterDescription(selectedKey, { isAnalyzingHair: false } as any);
            }
        }
    };

    const handleClearReference = () => {
        onUpdateCharacterDescription(selectedKey, { sourceImageUrl: undefined, hairStyleDescription: '', facialFeatures: '' } as any);
    };

    // ── 에셋 적용 (화풍 체크 포함) ──
    const applyAssetToReference = async (asset: AssetCatalogEntry) => {
        let url = '';
        if (asset.imagePath && IS_TAURI) url = await resolveImageUrl(asset.imagePath);
        if (url) handleSetReferenceImage(url, asset.visualDNA?.hair || '');
    };

    const applyAssetToOutfit = async (asset: AssetCatalogEntry, location: string) => {
        const desc = asset.outfitData?.englishDescription || '';
        // 에셋에 의상 데이터가 있으면 바로 적용
        if (desc) {
            const newLocs = { ...char.locations, [location]: desc };
            onUpdateCharacterDescription(selectedKey, { locations: newLocs });
        }
        // 이미지를 슬롯에 표시
        let imageUrl = '';
        if (asset.imagePath && IS_TAURI) {
            try { imageUrl = await resolveImageUrl(asset.imagePath); } catch {}
        }
        if (imageUrl) {
            setOutfitSlotImages(prev => ({ ...prev, [selectedKey]: { ...(prev[selectedKey] || {}), [location]: imageUrl } }));
        }
        // 의상 데이터가 없으면 (캐릭터 에셋 등) → 이미지에서 의상 AI 분석
        if (!desc && imageUrl) {
            setAnalyzingOutfitLocs(prev => new Set(prev).add(location));
            try {
                ctxActions.addNotification(`${location} 의상 분석 중...`, 'info');
                const result = await analyzeAssetWithVision(imageUrl, 'outfit');
                ctxActions.handleAddUsage(result.tokenCount, 'claude');
                if (result.description) {
                    const newLocs = { ...char.locations, [location]: result.description };
                    onUpdateCharacterDescription(selectedKey, { locations: newLocs });
                    ctxActions.addNotification(`${location} 의상 분석 완료!`, 'success');
                }
            } catch (err: any) {
                ctxActions.addNotification(`의상 분석 실패: ${err.message || err}`, 'error');
            } finally {
                setAnalyzingOutfitLocs(prev => { const next = new Set(prev); next.delete(location); return next; });
            }
        }
    };

    const handleAssetAction = (asset: AssetCatalogEntry, target: 'reference' | 'outfit', location?: string) => {
        if (asset.tags?.artStyle && asset.tags.artStyle !== artStyle) {
            setStyleMismatchAsset({ asset, target, location });
            return;
        }
        if (target === 'reference') applyAssetToReference(asset);
        else if (target === 'outfit' && location) applyAssetToOutfit(asset, location);
    };

    // ── 드래그앤드롭 ──
    const handleDragStart = (e: React.DragEvent, asset: AssetCatalogEntry) => {
        e.dataTransfer.setData('application/json', JSON.stringify(asset));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDropOnReference = (e: React.DragEvent) => {
        e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-orange-400');
        // 1) 에셋 JSON 드롭
        try {
            const json = e.dataTransfer.getData('application/json');
            if (json) { handleAssetAction(JSON.parse(json), 'reference'); return; }
        } catch {}
        // 2) 외부 이미지 파일 드롭 → 자동 헤어 DNA 분석
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const url = ev.target?.result as string;
                if (url) handleSetReferenceImage(url);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDropOnOutfit = async (e: React.DragEvent, location: string) => {
        e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-orange-400');
        // 1) 에셋 JSON 드롭
        try {
            const json = e.dataTransfer.getData('application/json');
            if (json) { handleAssetAction(JSON.parse(json), 'outfit', location); return; }
        } catch {}
        // 2) 외부 이미지 파일 드롭 → 자동 의상 분석
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const url = ev.target?.result as string;
                if (!url) return;
                // 이미지 슬롯에 즉시 표시
                setOutfitSlotImages(prev => ({ ...prev, [selectedKey]: { ...(prev[selectedKey] || {}), [location]: url } }));
                // AI 의상 분석
                setAnalyzingOutfitLocs(prev => new Set(prev).add(location));
                try {
                    ctxActions.addNotification(`${location} 의상 분석 중...`, 'info');
                    const result = await analyzeAssetWithVision(url, 'outfit');
                    ctxActions.handleAddUsage(result.tokenCount, 'claude');
                    if (result.description) {
                        const newLocs = { ...char.locations, [location]: result.description };
                        onUpdateCharacterDescription(selectedKey, { locations: newLocs });
                        ctxActions.addNotification(`${location} 의상 분석 완료!`, 'success');
                    }
                } catch (err: any) {
                    ctxActions.addNotification(`의상 분석 실패: ${err.message || err}`, 'error');
                } finally {
                    setAnalyzingOutfitLocs(prev => { const next = new Set(prev); next.delete(location); return next; });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    // ── 의상 텍스트 편집 ──
    const handleOutfitTextChange = (location: string, text: string) => {
        onUpdateCharacterDescription(selectedKey, {
            locations: { ...char.locations, [location]: text },
            koreanLocations: { ...char.koreanLocations, [location]: text },
        });
    };

    // ── 에셋 저장 ──
    const handleSaveReferenceAsAsset = () => {
        ctxActions.handleSaveCharacterAsset(selectedKey);
        setTimeout(loadAssets, 500);
    };

    // ── 에셋 패널: 외부 이미지 추가 ──
    const handleAssetFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) setPendingAssetImport({ dataUrl: ev.target.result as string, fileName: file.name.replace(/\.[^.]+$/, '') });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleAssetImportSave = async (type: 'character' | 'outfit' | 'background', name: string, extraTypes?: string[]) => {
        if (!pendingAssetImport) return;
        setIsAnalyzingAsset(true);
        try {
            const assetId = await saveAsset(type, `${name.replace(/\s+/g, '_')}.png`, pendingAssetImport.dataUrl, {
                name,
                tags: { character: type === 'character' ? name : null, artStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null },
            } as any);

            // 자동 분석
            const allTypes = [type, ...(extraTypes || [])];
            const updates: any = { tags: { character: type === 'character' ? name : null, artStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null } };
            let totalTokens = 0;
            for (const t of allTypes) {
                try {
                    const result = await analyzeAssetWithVision(pendingAssetImport.dataUrl, t as any);
                    totalTokens += result.tokenCount;
                    if (result.description) updates.tags.description = result.description;
                    if (result.visualDNA) updates.visualDNA = result.visualDNA;
                    if (result.spatialDNA) updates.spatialDNA = result.spatialDNA;
                } catch {}
            }
            if (totalTokens > 0) ctxActions.handleAddUsage(totalTokens, 'claude');
            if (updates.tags.description || updates.visualDNA || updates.spatialDNA) {
                await updateAssetMetadata(assetId, updates);
            }

            ctxActions.addNotification(`"${name}" 에셋 저장 + 분석 완료!`, 'success');
            setPendingAssetImport(null);
            loadAssets();
        } catch (err: any) { ctxActions.addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
        finally { setIsAnalyzingAsset(false); }
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RENDER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-[1400px] h-[90vh] flex flex-col shadow-2xl overflow-hidden">

                {/* ── 헤더 ── */}
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-700/60 shrink-0">
                    <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <span className="text-xl">🎬</span> Characters
                        <span className="text-xs text-zinc-500 font-normal ml-2">
                            {characterKeys.filter(k => getCharStatus(characterDescriptions[k]) === 'ready').length}/{characterKeys.length} 완료
                        </span>
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* ── 3컬럼 바디 ── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ═══ 왼쪽: 캐릭터 목록 ═══ */}
                    <div className="w-44 border-r border-zinc-700/60 flex flex-col py-3 shrink-0 bg-zinc-950/40">
                        <p className="px-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">캐릭터</p>
                        {characterKeys.map(key => {
                            const c = characterDescriptions[key];
                            const status = getCharStatus(c);
                            const si = STATUS_ICON[status];
                            const active = key === selectedKey;
                            return (
                                <button key={key} onClick={() => setSelectedKey(key)}
                                    className={`flex items-center gap-2.5 px-4 py-2.5 text-left transition-all ${active ? 'bg-orange-600/20 border-r-2 border-orange-400 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>
                                    <span className={`text-xs font-bold ${si.color}`}>{si.icon}</span>
                                    <span className="text-sm font-medium truncate">{c.koreanName || key}</span>
                                </button>
                            );
                        })}
                        <div className="mt-auto px-4 pt-3 border-t border-zinc-800">
                            {characterKeys.map(key => {
                                const si = STATUS_ICON[getCharStatus(characterDescriptions[key])];
                                return (
                                    <div key={key} className="flex items-center gap-1.5 text-[10px] mb-1">
                                        <span className={si.color}>{si.icon}</span>
                                        <span className="text-zinc-500 truncate">{characterDescriptions[key].koreanName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ═══ 가운데: 캐릭터 에디터 ═══ */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{char.gender === 'female' ? '👩' : '👨'}</span>
                            <h3 className="text-xl font-bold text-white">{char.koreanName}</h3>
                            <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">{char.gender === 'female' ? '여성' : '남성'}</span>
                        </div>

                        {/* ── 레퍼런스 이미지 ── */}
                        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">레퍼런스 이미지</p>
                                {char.sourceImageUrl && IS_TAURI && (
                                    <button onClick={handleSaveReferenceAsAsset}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-md bg-orange-600/60 hover:bg-orange-600 text-white transition-colors">
                                        <BookmarkSquareIcon className="w-3 h-3" /> 에셋 저장
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-5">
                                <div className="relative w-48 h-48 shrink-0 group">
                                    <div className="w-full h-full rounded-xl border-2 border-dashed border-zinc-600 flex items-center justify-center cursor-pointer hover:border-orange-400/60 transition-all overflow-hidden bg-zinc-900/60"
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('ring-2', 'ring-orange-400'); }}
                                        onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-orange-400'); }}
                                        onDrop={handleDropOnReference}>
                                        {char.sourceImageUrl ? (
                                            <img src={char.sourceImageUrl} alt={char.koreanName} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center p-4">
                                                <UploadIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                                                <p className="text-[10px] text-zinc-500">클릭 또는 에셋 드래그</p>
                                            </div>
                                        )}
                                    </div>
                                    {char.sourceImageUrl && (
                                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-zinc-900/80 hover:bg-zinc-700 text-zinc-300 rounded-md backdrop-blur-sm" title="교체">
                                                <RefreshIcon className="w-3 h-3" />
                                            </button>
                                            <button onClick={handleClearReference} className="p-1.5 bg-zinc-900/80 hover:bg-red-900/80 text-red-400 rounded-md backdrop-blur-sm" title="삭제">
                                                <TrashIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                                            <SparklesIcon className="w-3 h-3" /> 헤어스타일 DNA
                                        </label>
                                        {char.isAnalyzingHair ? (
                                            <div className="flex items-center gap-2 mt-1.5 text-xs text-orange-300">
                                                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> DNA 분석 중...
                                            </div>
                                        ) : (
                                            <>
                                                <textarea value={char.hairStyleDescription || ''}
                                                    onChange={(e) => onUpdateCharacterDescription(selectedKey, { hairStyleDescription: e.target.value })}
                                                    placeholder="레퍼런스 이미지를 등록하면 AI가 자동 분석합니다."
                                                    className="w-full mt-1.5 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg resize-none h-16 focus:outline-none focus:ring-1 focus:ring-orange-500 text-zinc-200 placeholder:text-zinc-600" />
                                                <button
                                                    disabled={!char.sourceImageUrl}
                                                    onClick={async () => {
                                                        if (!char.sourceImageUrl) return;
                                                        onUpdateCharacterDescription(selectedKey, { isAnalyzingHair: true } as any);
                                                        try {
                                                            const { analyzeHairStyle } = await import('../services/ai/textAnalysis');
                                                            const res = await analyzeHairStyle(char.sourceImageUrl, char.koreanName || selectedKey);
                                                            onUpdateCharacterDescription(selectedKey, { hairStyleDescription: res.hairDescription, facialFeatures: res.facialFeatures, isAnalyzingHair: false } as any);
                                                        } catch {
                                                            onUpdateCharacterDescription(selectedKey, { isAnalyzingHair: false } as any);
                                                        }
                                                    }}
                                                    className="mt-1.5 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-orange-300 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-orange-600/50 rounded-lg disabled:text-zinc-700 disabled:border-zinc-800 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                                                ><RefreshIcon className="w-3.5 h-3.5" /> 재분석</button>
                                            </>
                                        )}
                                    </div>
                                    {char.facialFeatures && (
                                        <div>
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">얼굴 특징</label>
                                            <p className="text-xs text-zinc-400 mt-0.5">{char.facialFeatures}</p>
                                        </div>
                                    )}
                                    <p className="text-[9px] text-orange-500 flex items-center gap-1">
                                        <CheckIcon className="w-2.5 h-2.5" /> 이 DNA는 모든 이미지 생성에 적용됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── LoRA 설정 (접히는 섹션) ── */}
                        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
                            <button onClick={() => setLoraCollapsed(!loraCollapsed)}
                                className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-800/80 transition-colors">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                    <SparklesIcon className="w-3 h-3 text-teal-400" /> LoRA 설정
                                    {char.loraId && <span className="text-teal-400 font-normal text-[10px]">• {loraEntries.find(e => e.id === char.loraId)?.name || '연결됨'}</span>}
                                </p>
                                <ChevronDownIcon className={`w-4 h-4 text-zinc-500 transition-transform ${loraCollapsed ? '' : 'rotate-180'}`} />
                            </button>
                            {!loraCollapsed && (
                                <div className="px-5 pb-4 space-y-3">
                                    {/* 현재 연결된 LoRA */}
                                    {(() => {
                                        const linked = loraEntries.find(e => e.id === char.loraId);
                                        return linked ? (
                                            <div className="flex items-center gap-3 bg-teal-900/20 border border-teal-700/30 rounded-lg px-3 py-2">
                                                <span className="text-sm">👤</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-xs font-bold text-white">{linked.name}</span>
                                                    <code className="text-[10px] font-mono text-teal-400 ml-2">{linked.triggerWord}</code>
                                                </div>
                                                <span className="text-[10px] text-zinc-400">scale {char.loraScaleOverride ?? linked.scale}</span>
                                                <button onClick={() => onUpdateCharacterDescription(selectedKey, { loraId: undefined, loraScaleOverride: undefined })}
                                                    className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors">
                                                    <XIcon className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-zinc-500">연결된 LoRA가 없습니다.</p>
                                        );
                                    })()}

                                    {/* LoRA 선택 드롭다운 */}
                                    <div className="flex gap-2">
                                        <select
                                            value={char.loraId || ''}
                                            onChange={e => {
                                                const id = e.target.value || undefined;
                                                onUpdateCharacterDescription(selectedKey, { loraId: id, loraScaleOverride: undefined });
                                            }}
                                            className="flex-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        >
                                            <option value="">없음</option>
                                            {loraEntries.filter(e => e.type === 'character').map(e => (
                                                <option key={e.id} value={e.id}>{e.name} ({e.triggerWord})</option>
                                            ))}
                                        </select>
                                        <button onClick={() => setIsLoraRegistryOpen(true)}
                                            className="px-3 py-2 text-[10px] font-bold rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors whitespace-nowrap">
                                            ⚙ 관리
                                        </button>
                                    </div>

                                    {/* 스케일 오버라이드 */}
                                    {char.loraId && (
                                        <div>
                                            <label className="text-[10px] font-bold text-zinc-400 uppercase flex items-center justify-between">
                                                Scale 오버라이드
                                                <span className="text-teal-400 font-mono">{(char.loraScaleOverride ?? loraEntries.find(e => e.id === char.loraId)?.scale ?? 0.9).toFixed(2)}</span>
                                            </label>
                                            <input type="range" min={0} max={100} step={5}
                                                value={(char.loraScaleOverride ?? loraEntries.find(e => e.id === char.loraId)?.scale ?? 0.9) * 100}
                                                onChange={e => onUpdateCharacterDescription(selectedKey, { loraScaleOverride: Number(e.target.value) / 100 })}
                                                className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-teal-500 cursor-pointer mt-1" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── 장소별 의상 ── */}
                        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    장소별 의상 <span className="text-zinc-600 font-normal ml-1">({Object.keys(char.locations || {}).length})</span>
                                </p>
                                <button onClick={() => onGenerateLocationOutfits(selectedKey)} disabled={char.isGeneratingLocationOutfits}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-orange-600/80 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors">
                                    {char.isGeneratingLocationOutfits
                                        ? <><SpinnerIcon className="w-3 h-3 animate-spin" /> 생성 중...</>
                                        : <><SparklesIcon className="w-3 h-3" /> 비어있는 의상 AI 자동생성</>}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.keys(char.locations || {}).map(location => {
                                    const outfitText = char.locations[location] || '';
                                    const isEditing = editingOutfitLoc === location;
                                    const outfitImgData = (char.locationOutfitImages as any)?.[location];
                                    const outfitImg = outfitImgData?.imageUrl || outfitSlotImages[selectedKey]?.[location] || null;
                                    const isGeneratingImg = outfitImgData?.imageLoading || false;
                                    const isAnalyzingOutfit = analyzingOutfitLocs.has(location);
                                    return (
                                        <div key={location} className="rounded-lg bg-zinc-900/60 border border-zinc-700/40 hover:border-zinc-600/60 transition-colors overflow-hidden"
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('ring-2', 'ring-orange-400'); }}
                                            onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-orange-400'); }}
                                            onDrop={(e) => handleDropOnOutfit(e, location)}>
                                            {/* 장소 헤더 */}
                                            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                                                <p className="text-xs font-bold text-teal-400">{location}</p>
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-[9px] ${outfitText ? 'text-orange-500' : 'text-zinc-600'}`}>
                                                        {outfitText ? '✓' : '✗'}
                                                    </span>
                                                    <button onClick={() => setEditingOutfitLoc(isEditing ? null : location)}
                                                        className="p-1 text-zinc-500 hover:text-orange-300 hover:bg-zinc-700 rounded transition-colors" title="편집">
                                                        <PencilIcon className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            {/* 이미지 + 텍스트 좌우 배치 */}
                                            <div className="flex gap-2.5 px-3 pb-2">
                                                {/* 이미지 드롭존 + 생성 버튼 */}
                                                <div className="w-20 shrink-0 flex flex-col gap-1">
                                                    <div className="w-20 h-20 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 overflow-hidden flex items-center justify-center relative group/outfit">
                                                        {isGeneratingImg ? (
                                                            <SpinnerIcon className="w-5 h-5 animate-spin text-orange-400" />
                                                        ) : outfitImg ? (
                                                            <img src={outfitImg} alt={location} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-[8px] text-zinc-700 text-center px-1">에셋<br/>드래그</span>
                                                        )}
                                                        {isAnalyzingOutfit && (
                                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                                                                <SpinnerIcon className="w-5 h-5 animate-spin text-orange-400" />
                                                            </div>
                                                        )}
                                                        {outfitImg && !isGeneratingImg && !isAnalyzingOutfit && IS_TAURI && (
                                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/outfit:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button onClick={(e) => { e.stopPropagation(); setOutfitAssetPopup({ location, imageUrl: outfitImg, charName: char.koreanName || selectedKey }); }}
                                                                    className="p-1.5 bg-orange-600 text-white rounded-full hover:bg-orange-500" title="에셋으로 저장">
                                                                    <BookmarkSquareIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {outfitText && !isGeneratingImg && (
                                                        <button
                                                            onClick={() => onGenerateOutfitImage(selectedKey, location, outfitText)}
                                                            className="w-full py-1 text-[8px] font-bold rounded bg-teal-700/60 hover:bg-teal-600 text-teal-200 transition-colors truncate"
                                                            title="AI 의상 미리보기 생성"
                                                        >
                                                            {outfitImg ? '🔄 재생성' : '🖼️ 미리보기'}
                                                        </button>
                                                    )}
                                                </div>
                                                {/* 텍스트 */}
                                                <div className="flex-1 min-w-0">
                                                    {isEditing ? (
                                                        <textarea value={outfitText} onChange={(e) => handleOutfitTextChange(location, e.target.value)}
                                                            onBlur={() => setEditingOutfitLoc(null)} autoFocus
                                                            className="w-full px-2 py-1 text-[10px] bg-zinc-800 border border-orange-500/50 rounded-md resize-none h-20 focus:outline-none focus:ring-1 focus:ring-orange-500 text-zinc-200" />
                                                    ) : (
                                                        <p className="text-[10px] text-zinc-400 leading-relaxed max-h-[4.5rem] overflow-hidden cursor-text" onClick={() => setEditingOutfitLoc(location)}>
                                                            {outfitText || <span className="text-zinc-600 italic">에셋 드래그 또는 클릭하여 입력</span>}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {Object.keys(char.locations || {}).length === 0 && (
                                    <p className="text-xs text-zinc-600 text-center py-4">대본 분석에서 장소 정보가 없습니다.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ═══ 오른쪽: 에셋 사이드 패널 ═══ */}
                    <div className="w-72 border-l border-zinc-700/60 flex flex-col bg-zinc-950/40 shrink-0">
                        <div className="px-4 pt-4 pb-2 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">에셋</p>
                                <button onClick={loadAssets} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="새로고침">
                                    <RefreshIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <input type="text" placeholder="검색..." value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 text-zinc-300" />
                            <div className="flex gap-1 mt-2">
                                {(['all', 'character', 'outfit', 'background'] as const).map(t => (
                                    <button key={t} onClick={() => setAssetFilter(t)}
                                        className={`flex-1 px-1 py-1 text-[10px] rounded-md transition-colors ${assetFilter === t ? 'bg-orange-600 text-white font-bold' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}>
                                        {t === 'all' ? '전체' : t === 'character' ? '인물' : t === 'outfit' ? '의상' : '배경'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {isLoadingAssets ? (
                                <div className="flex items-center justify-center h-32 text-zinc-600"><SpinnerIcon className="w-5 h-5 animate-spin" /></div>
                            ) : filteredAssets.length === 0 ? (
                                <p className="text-[10px] text-zinc-600 text-center mt-8">{assets.length === 0 ? '저장된 에셋이 없습니다.' : '검색 결과 없음'}</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {filteredAssets.map(asset => {
                                        const mismatch = asset.tags?.artStyle && asset.tags.artStyle !== artStyle;
                                        return (
                                            <div key={asset.id} draggable onDragStart={(e) => handleDragStart(e, asset)}
                                                className="group relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-700/50 hover:border-orange-500/40 cursor-grab active:cursor-grabbing transition-all"
                                                title={`${asset.name}\n드래그하여 레퍼런스 또는 의상에 놓기`}>
                                                <div className="aspect-square bg-zinc-950">
                                                    {assetUrls[asset.id]
                                                        ? <img src={assetUrls[asset.id]} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
                                                        : <div className="w-full h-full flex items-center justify-center text-zinc-800"><UploadIcon className="w-4 h-4" /></div>}
                                                </div>
                                                <div className="p-1.5">
                                                    <p className="text-[9px] font-semibold text-zinc-300 truncate">{asset.name}</p>
                                                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                                                        {(() => {
                                                            const extras = (asset.tags as any)?.extraTypes ? String((asset.tags as any)?.extraTypes).split(',').filter(Boolean) : [];
                                                            const all = [asset.type, ...extras];
                                                            const bs = (t: string) => t === 'character' ? 'bg-zinc-800/60 text-zinc-400' : t === 'outfit' ? 'bg-zinc-900/60 text-orange-400' : 'bg-green-900/60 text-green-400';
                                                            const bl = (t: string) => t === 'character' ? '인물' : t === 'outfit' ? '의상' : '배경';
                                                            return all.map((t, i) => <span key={i} className={`px-1 py-0 text-[7px] rounded ${bs(t)}`}>{bl(t)}</span>);
                                                        })()}
                                                    </div>
                                                </div>
                                                {mismatch && <div className="absolute top-0.5 left-0.5 p-0.5 bg-yellow-600/90 text-white rounded" title="화풍 불일치"><ExclamationTriangleIcon className="w-2.5 h-2.5" /></div>}
                                                {/* ★ 호버 메뉴: 다운로드 + 삭제 */}
                                                <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/90 rounded-md p-0.5 backdrop-blur-sm border border-zinc-700/50">
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingAsset(asset); }} className="p-1 text-zinc-300 hover:text-orange-300 hover:bg-zinc-700 rounded transition-colors" title="태그 편집"><PencilIcon className="w-3 h-3" /></button>
                                                    <button onClick={async (e) => { e.stopPropagation(); try { const url = await resolveImageUrl(asset.imagePath); const a = document.createElement('a'); a.href = url; a.download = `${asset.name}.png`; a.click(); } catch {} }} className="p-1 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors" title="다운로드"><DownloadIcon className="w-3 h-3" /></button>
                                                    <button onClick={async (e) => { e.stopPropagation(); if (!window.confirm(`"${asset.name}" 에셋을 삭제하시겠습니까?`)) return; try { await deleteAsset(asset.id); setAssets(prev => prev.filter(a => a.id !== asset.id)); } catch (err) { console.error('에셋 삭제 실패:', err); } }} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded transition-colors" title="삭제"><TrashIcon className="w-3 h-3" /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="px-3 py-2.5 border-t border-zinc-800 space-y-2">
                            <button onClick={() => assetFileInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-semibold rounded-lg bg-orange-600/60 hover:bg-orange-600 text-white transition-colors">
                                <UploadIcon className="w-3 h-3" /> 외부 이미지 추가
                            </button>
                            <input ref={assetFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAssetFileSelect} />
                            <p className="text-[9px] text-zinc-600 text-center">에셋을 드래그하여 왼쪽에 놓으세요</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 화풍 불일치 확인 모달 ── */}
            {styleMismatchAsset && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[250] animate-fade-in" onClick={() => setStyleMismatchAsset(null)}>
                    <div className="bg-zinc-800 rounded-xl border border-zinc-600 p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" /> 화풍 불일치
                        </h3>
                        <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                            이 에셋은 <span className="font-semibold text-yellow-300">"{STYLE_NAMES[styleMismatchAsset.asset.tags?.artStyle!] || styleMismatchAsset.asset.tags?.artStyle || '알 수 없음'}"</span>으로 생성되었습니다.<br />
                            현재 화풍은 <span className="font-semibold text-orange-300">"{STYLE_NAMES[artStyle] || artStyle}"</span>입니다.<br />
                            그래도 사용하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setStyleMismatchAsset(null)} className="flex-1 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors">취소</button>
                            <button onClick={() => {
                                const { asset, target, location } = styleMismatchAsset;
                                setStyleMismatchAsset(null);
                                if (target === 'reference') applyAssetToReference(asset);
                                else if (target === 'outfit' && location) applyAssetToOutfit(asset, location);
                            }} className="flex-1 py-2 text-sm font-bold bg-orange-600 hover:bg-orange-500 rounded-lg text-white transition-colors">사용하기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 에셋 태그 편집 팝업 ── */}
            {editingAsset && (
                <AssetTagPopup
                    defaultName={editingAsset.name}
                    defaultTypes={[editingAsset.type, ...((editingAsset.tags as any)?.extraTypes ? String((editingAsset.tags as any).extraTypes).split(',').filter(Boolean) : [])]}
                    defaultArtStyle={editingAsset.tags?.artStyle || undefined}
                    imagePreviewUrl={assetUrls[editingAsset.id] || undefined}
                    onCancel={() => setEditingAsset(null)}
                    onSave={async (type, name, extraTypes, artStyleParam) => {
                        try {
                            await updateAssetMetadata(editingAsset.id, {
                                name, type,
                                tags: { ...(editingAsset.tags || {}), artStyle: artStyleParam || editingAsset.tags?.artStyle, extraTypes: extraTypes?.join(',') || null } as any,
                            });
                            setAssets(prev => prev.map(a => a.id === editingAsset.id ? { ...a, name, type, tags: { ...(a.tags || {}), artStyle: artStyleParam || a.tags?.artStyle, extraTypes: extraTypes?.join(',') || null } as any } : a));
                        } catch (err) { console.error('에셋 메타데이터 업데이트 실패:', err); }
                        setEditingAsset(null);
                    }}
                />
            )}

            {/* ── 외부 이미지 에셋 저장 태그 팝업 ── */}
            {pendingAssetImport && !isAnalyzingAsset && (
                <AssetTagPopup
                    onSave={handleAssetImportSave}
                    onCancel={() => setPendingAssetImport(null)}
                    defaultName={pendingAssetImport.fileName}
                />
            )}

            {/* 자동 분석 중 오버레이 */}
            {isAnalyzingAsset && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[210] animate-fade-in">
                    <div className="bg-zinc-800 rounded-xl border border-zinc-600 p-6 w-72 shadow-2xl text-center">
                        <SpinnerIcon className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
                        <p className="text-sm font-bold text-white mb-1">에셋 분석 중...</p>
                        <p className="text-[10px] text-zinc-400">AI가 이미지를 분석하고 있습니다</p>
                    </div>
                </div>
            )}

            {/* ★ 의상 에셋 저장 팝업 */}
            {outfitAssetPopup && (
                <AssetTagPopup
                    defaultName={`${outfitAssetPopup.charName} - ${outfitAssetPopup.location}`}
                    defaultTypes={['outfit']}
                    imagePreviewUrl={outfitAssetPopup.imageUrl}
                    onCancel={() => setOutfitAssetPopup(null)}
                    onSave={async (type, name, extraTypes, artStyleParam) => {
                        try {
                            const finalArtStyle = artStyleParam || artStyle || 'dalle-chibi';
                            const safeName = `${name.replace(/\s+/g, '_')}.png`;
                            const res = await fetch(outfitAssetPopup.imageUrl);
                            const blob = await res.blob();
                            const base64 = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                                reader.onerror = () => reject(reader.error);
                                reader.readAsDataURL(blob);
                            });
                            await saveAsset(type, safeName, base64, {
                                name,
                                tags: {
                                    character: type === 'character' ? name : null,
                                    artStyle: finalArtStyle,
                                    location: outfitAssetPopup.location,
                                    description: '',
                                    extraTypes: extraTypes?.join(',') || null,
                                },
                            } as any);
                            ctxActions.addNotification(`의상 에셋 "${name}" 저장 완료`, 'success');
                            setOutfitAssetPopup(null);
                        } catch (err) {
                            console.error('의상 에셋 저장 실패:', err);
                            ctxActions.addNotification('의상 에셋 저장 실패', 'error');
                        }
                    }}
                />
            )}

            {/* ── Footer: 완료/비율조정 버튼 ── */}
            <footer className="p-4 bg-zinc-800 border-t border-zinc-700 flex justify-between items-center flex-shrink-0">
                <button onClick={() => ctxActions.setUIState({ isProportionStudioOpen: true })}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 border border-zinc-700/50 transition-colors">
                    📐 비율 조정
                </button>
                <button onClick={onConfirm} disabled={!allReady}
                    className="flex items-center gap-2 px-8 py-3 text-sm font-bold rounded-xl bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/20">
                    <CheckIcon className="w-5 h-5" />
                    {appState === 'storyboardGenerated' ? '변경사항 적용' : '완료 — 스토리보드 생성'}
                </button>
            </footer>

            {/* ── LoRA 레지스트리 모달 ── */}
            <LoraRegistryModal
                isOpen={isLoraRegistryOpen}
                onClose={() => { setIsLoraRegistryOpen(false); if (IS_TAURI) loadLoraRegistry().then(setLoraEntries).catch(() => {}); }}
                filterType="character"
                onSelect={(entry) => {
                    onUpdateCharacterDescription(selectedKey, { loraId: entry.id, loraScaleOverride: undefined });
                    setIsLoraRegistryOpen(false);
                    if (IS_TAURI) loadLoraRegistry().then(setLoraEntries).catch(() => {});
                }}
            />
        </div>
    );
};
