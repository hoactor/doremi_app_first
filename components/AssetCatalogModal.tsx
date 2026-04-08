
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ArtStyle } from '../types';
import { XIcon, TrashIcon, DownloadIcon, PencilIcon, CheckIcon, ExclamationTriangleIcon, PaintBrushIcon, UploadIcon, SpinnerIcon } from './icons';
import { IS_TAURI, loadAssetCatalog, deleteAsset, updateAssetMetadata, resolveImageUrl, downloadFile, saveAsset } from '../services/tauriAdapter';
import { ImageViewerModal } from './ImageViewerModal';
import { callVisionTextModel } from '../services/ai/aiCore';
import { useAppContext } from '../AppContext';
import type { AssetCatalogEntry } from '../services/tauriAdapter';

const STYLE_NAMES: Record<string, string> = {
    'dalle-chibi': '프리미엄', 'moe': '극강 귀요미',
    'kyoto': '시네마 감성', 'vibrant': '도파민',
    'normal': '정통 썰툰', 'custom': '커스텀',
};

// ─── 에셋 자동 분석 ─────────────────────────────────────────────────
export async function analyzeAssetWithVision(
    dataUrl: string,
    type: 'character' | 'outfit' | 'background',
): Promise<{ description?: string; visualDNA?: any; spatialDNA?: string; tokenCount: number }> {
    const base64 = dataUrl.split(',')[1] || '';
    const mimeType = dataUrl.match(/data:([^;]+)/)?.[1] || 'image/png';
    let totalTokens = 0;

    if (type === 'outfit') {
        const { text, tokenCount } = await callVisionTextModel(
            'You are a fashion analyst for anime/illustration character design. Respond in plain English only. No markdown, no bold, no headers, no bullet points.',
            `Describe this outfit in a single comma-separated sentence for an AI image generator.
Format: [garment type] in [color #HEX], [fabric/texture], [silhouette], [key details/accessories].
Example: "fitted double-breasted blazer in dusty rose (#E8A598), wool-blend, structured silhouette, gold buttons, cream ruffled blouse (#FFF8F0), burgundy ribbon tie (#8B2635), brown leather belt (#8B4513)"
Keep under 60 words. Plain text only — no markdown, no line breaks, no labels.`,
            base64, mimeType
        );
        totalTokens += tokenCount;
        // 혹시 마크다운이 남아있으면 제거
        const cleaned = text.trim().replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/\n+/g, ', ').replace(/,\s*,/g, ',');
        return { description: cleaned, tokenCount: totalTokens };
    }
    if (type === 'character') {
        const { text, tokenCount } = await callVisionTextModel(
            'You are a character visual analyst. Respond ONLY in JSON format, no markdown.',
            `Analyze this character image and return JSON: {"hair":"detailed hair description with HEX color code, cut type, length, bangs, texture, accessories","colorPalette":{"hair":"#hex","eyes":"#hex","skin":"#hex"},"distinctiveMarks":"any distinctive features, marks, or accessories"}`,
            base64, mimeType, { responseMimeType: 'application/json' }
        );
        totalTokens += tokenCount;
        try {
            const parsed = JSON.parse(text);
            return { visualDNA: { hair: parsed.hair || '', colorPalette: parsed.colorPalette || {}, distinctiveMarks: parsed.distinctiveMarks || '' }, tokenCount: totalTokens };
        } catch {
            return { visualDNA: { hair: text.trim().substring(0, 200) }, tokenCount: totalTokens };
        }
    }
    if (type === 'background') {
        const { text, tokenCount } = await callVisionTextModel(
            'You are a location/scene analyst for anime/illustration production. Respond in plain English only. No markdown, no bold, no headers, no bullet points.',
            `Describe this background/location in a single comma-separated sentence for an AI image generator.
Format: [setting type], [time of day], [lighting mood], [dominant colors], [key elements].
Example: "modern office interior, afternoon, warm fluorescent lighting, beige and gray tones, cubicle desks, potted plant, whiteboard on wall"
Keep under 50 words. Plain text only — no markdown, no line breaks.`,
            base64, mimeType
        );
        totalTokens += tokenCount;
        const cleaned = text.trim().replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/\n+/g, ', ').replace(/,\s*,/g, ',');
        return { spatialDNA: cleaned, tokenCount: totalTokens };
    }
    return { tokenCount: 0 };
}

// ─── 에셋 태그 선택 팝업 ──────────────────────────────────────────
export const AssetTagPopup: React.FC<{
    onSave: (type: 'character' | 'outfit' | 'background', name: string, extraTypes?: string[], artStyle?: string) => void;
    onCancel: () => void;
    defaultName?: string;
    defaultTypes?: string[];
    defaultArtStyle?: string;
    imagePreviewUrl?: string;
}> = ({ onSave, onCancel, defaultName = '', defaultTypes, defaultArtStyle, imagePreviewUrl }) => {
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(defaultTypes || ['character']));
    const [name, setName] = useState(defaultName);
    const [selectedStyle, setSelectedStyle] = useState(defaultArtStyle || 'dalle-chibi');
    const types = [
        { key: 'character', label: '인물', bg: 'rgba(37,99,235,0.2)', border: '#3b82f6', text: '#93c5fd' },
        { key: 'outfit', label: '의상', bg: 'rgba(147,51,234,0.2)', border: '#a855f7', text: '#c4b5fd' },
        { key: 'background', label: '배경', bg: 'rgba(22,163,74,0.2)', border: '#22c55e', text: '#86efac' },
    ];
    const styles = [
        { key: 'dalle-chibi', label: '프리미엄' }, { key: 'moe', label: '극강 귀요미' },
        { key: 'kyoto', label: '시네마 감성' }, { key: 'vibrant', label: '도파민' },
        { key: 'normal', label: '정통 썰툰' }, { key: 'custom', label: '커스텀' },
    ];
    const toggleType = (key: string) => {
        setSelectedTypes(prev => {
            const next = new Set(prev);
            if (next.has(key)) { if (next.size > 1) next.delete(key); }
            else next.add(key);
            return next;
        });
    };
    const handleSave = () => {
        if (!name.trim() || selectedTypes.size === 0) return;
        const all = Array.from(selectedTypes);
        const primary = all[0] as 'character' | 'outfit' | 'background';
        const extras = all.slice(1);
        onSave(primary, name.trim(), extras, selectedStyle || undefined);
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] animate-fade-in" onClick={onCancel}>
            <div className="bg-zinc-800 rounded-xl border border-zinc-600 p-5 w-80 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {imagePreviewUrl && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-zinc-700">
                        <img src={imagePreviewUrl} alt="미리보기" className="w-full h-40 object-cover" />
                    </div>
                )}
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="에셋 이름"
                    className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-600 rounded-lg mb-3 focus:outline-none focus:ring-1 focus:ring-orange-500" autoFocus />
                <p className="text-[10px] text-zinc-500 mb-2">유형 — 복수 선택 가능</p>
                <div className="flex gap-2 mb-3">
                    {types.map(({ key, label, bg, border, text }) => {
                        const active = selectedTypes.has(key);
                        return (
                            <button key={key} onClick={() => toggleType(key)}
                                className="flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all"
                                style={active ? { backgroundColor: bg, borderColor: border, color: text } : { backgroundColor: 'transparent', borderColor: '#3f3f46', color: '#71717a' }}
                            >{label}</button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-zinc-500 mb-2">화풍</p>
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {styles.map(({ key, label }) => {
                        const active = selectedStyle === key;
                        return (
                            <button key={key} onClick={() => setSelectedStyle(active ? '' : key)}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${active ? 'bg-rose-900/40 border-rose-500/50 text-rose-200' : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'}`}
                            >{label}</button>
                        );
                    })}
                </div>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors">취소</button>
                    <button onClick={handleSave} disabled={!name.trim()} className="flex-1 py-2 text-sm font-bold bg-orange-600 hover:bg-orange-500 rounded-lg text-white transition-colors disabled:opacity-40">저장</button>
                </div>
            </div>
        </div>
    );
};

// ─── 태그 편집 버튼 (모달은 부모에서 렌더링) ─────────────────────
const TagEditButton: React.FC<{
    onEdit: () => void;
}> = ({ onEdit }) => (
    <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-zinc-300 hover:text-orange-300 hover:bg-zinc-700 rounded transition-colors" title="태그 편집"><PencilIcon className="w-3.5 h-3.5" /></button>
);

// ─── Props ────────────────────────────────────────────────────────
interface AssetCatalogModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentArtStyle: ArtStyle;
    onSelectCharacter?: (asset: AssetCatalogEntry) => void;
    onSelectBackground?: (asset: AssetCatalogEntry, action: 'reference' | 'replace') => void;
    mode?: 'all' | 'character' | 'background';
}

// ─── 메인 모달 ────────────────────────────────────────────────────
export const AssetCatalogModal: React.FC<AssetCatalogModalProps> = ({
    isOpen, onClose, currentArtStyle, onSelectCharacter, onSelectBackground, mode = 'all',
}) => {
    const { actions: ctxActions } = useAppContext();
    const [assets, setAssets] = useState<AssetCatalogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'character' | 'outfit' | 'background'>(
        mode === 'character' ? 'character' : mode === 'background' ? 'background' : 'all'
    );
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [pendingImports, setPendingImports] = useState<{ dataUrl: string; fileName: string }[]>([]);
    const [editingAsset, setEditingAsset] = useState<AssetCatalogEntry | null>(null);
    const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);
    const [pendingSelectAsset, setPendingSelectAsset] = useState<AssetCatalogEntry | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadCatalog = useCallback(async () => {
        setIsLoading(true);
        try {
            const catalog = await loadAssetCatalog();
            setAssets(catalog);
            const urls: Record<string, string> = {};
            await Promise.allSettled(catalog.map(async (asset) => {
                try { urls[asset.id] = await resolveImageUrl(asset.thumbnailPath || asset.imagePath); } catch {}
            }));
            setImageUrls(urls);
        } catch (err) { console.error('에셋 카탈로그 로드 실패:', err); }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => { if (isOpen && IS_TAURI) loadCatalog(); }, [isOpen, loadCatalog]);

    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            if (typeFilter !== 'all') {
                const extras = (asset.tags as any)?.extraTypes ? String((asset.tags as any).extraTypes).split(',') : [];
                if (asset.type !== typeFilter && !extras.includes(typeFilter)) return false;
            }
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return asset.name?.toLowerCase().includes(term) || (asset.tags?.description || '').toLowerCase().includes(term) || (asset.tags?.character || '').toLowerCase().includes(term) || (asset.tags?.location || '').toLowerCase().includes(term);
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [assets, typeFilter, searchTerm]);

    const handleDelete = useCallback(async (e: React.MouseEvent, asset: AssetCatalogEntry) => {
        e.stopPropagation();
        if (!window.confirm(`"${asset.name}" 에셋을 삭제하시겠습니까?`)) return;
        try { await deleteAsset(asset.id); setAssets(prev => prev.filter(a => a.id !== asset.id)); } catch (err) { console.error('에셋 삭제 실패:', err); }
    }, []);

    const handleUpdateMetadata = useCallback(async (assetId: string, updates: Partial<AssetCatalogEntry>) => {
        try { await updateAssetMetadata(assetId, updates); setAssets(prev => prev.map(a => a.id === assetId ? { ...a, ...updates } : a)); } catch (err) { console.error('메타데이터 업데이트 실패:', err); }
    }, []);

    const handleDownloadAsset = useCallback(async (e: React.MouseEvent, asset: AssetCatalogEntry) => {
        e.stopPropagation();
        const url = imageUrls[asset.id];
        if (!url) return;
        try { const resp = await fetch(url); const blob = await resp.blob(); await downloadFile(blob, `${asset.name.replace(/\s+/g, '_')}.png`, [{ name: 'PNG', extensions: ['png'] }]); } catch (err) { console.error('다운로드 실패:', err); }
    }, [imageUrls]);

    // 실제 선택 실행 (화풍 확인 완료 후)
    const executeSelect = useCallback((asset: AssetCatalogEntry) => {
        const extras = asset.tags?.extraTypes ? String(asset.tags.extraTypes).split(',').filter(Boolean) : [];
        if (mode === 'character' && onSelectCharacter) { onSelectCharacter(asset); onClose(); }
        else if (mode === 'background' && onSelectBackground) {
            onSelectBackground(asset, 'reference'); onClose();
        }
        else if (onSelectCharacter && (asset.type === 'character' || extras.includes('character'))) { onSelectCharacter(asset); onClose(); }
        else if (onSelectBackground && (asset.type === 'background' || extras.includes('background'))) {
            onSelectBackground(asset, 'reference'); onClose();
        }
    }, [mode, onSelectCharacter, onSelectBackground, onClose]);

    const handleSelect = useCallback((asset: AssetCatalogEntry) => {
        if (asset.tags?.artStyle && asset.tags.artStyle !== currentArtStyle) {
            setPendingSelectAsset(asset);
            return;
        }
        executeSelect(asset);
    }, [currentArtStyle, executeSelect]);

    // 외부 이미지 파일 선택 (복수)
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        let loaded = 0;
        const results: { dataUrl: string; fileName: string }[] = [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    results.push({ dataUrl: ev.target.result as string, fileName: file.name.replace(/\.[^.]+$/, '') });
                }
                loaded++;
                if (loaded === files.length) setPendingImports(prev => [...prev, ...results]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }, []);

    // 드래그앤드롭 (복수)
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        let loaded = 0;
        const results: { dataUrl: string; fileName: string }[] = [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) results.push({ dataUrl: ev.target.result as string, fileName: file.name.replace(/\.[^.]+$/, '') });
                loaded++;
                if (loaded === files.length) setPendingImports(prev => [...prev, ...results]);
            };
            reader.readAsDataURL(file);
        });
    }, []);

    // 태그 선택 후 저장 (큐에서 첫 번째 처리, 나머지는 유지) + 자동 분석
    const currentPending = pendingImports[0] || null;
    const handleImportSave = useCallback(async (type: 'character' | 'outfit' | 'background', name: string, extraTypes?: string[], artStyle?: string) => {
        if (!currentPending) return;
        const finalArtStyle = artStyle || currentArtStyle;
        setIsAnalyzing(true);
        try {
            // 1. 먼저 저장
            const assetId = await saveAsset(type, `${name}.png`, currentPending.dataUrl, {
                name,
                tags: { character: type === 'character' ? name : null, artStyle: finalArtStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null },
                prompt: 'External import',
            } as any);

            // 2. 자동 분석 (primary type + extraTypes 모두)
            const allTypes = [type, ...(extraTypes || [])];
            const updates: any = { tags: { character: type === 'character' ? name : null, artStyle: finalArtStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null } };
            let totalTokens = 0;

            for (const t of allTypes) {
                try {
                    const result = await analyzeAssetWithVision(currentPending.dataUrl, t as any);
                    totalTokens += result.tokenCount;
                    if (result.description) updates.tags.description = result.description;
                    if (result.visualDNA) updates.visualDNA = result.visualDNA;
                    if (result.spatialDNA) updates.spatialDNA = result.spatialDNA;
                } catch (err) { console.error(`에셋 ${t} 분석 실패:`, err); }
            }

            if (totalTokens > 0) ctxActions.handleAddUsage(totalTokens, 'claude');

            // 3. 분석 결과로 메타데이터 업데이트
            if (updates.tags.description || updates.visualDNA || updates.spatialDNA) {
                await updateAssetMetadata(assetId, updates);
            }
        } catch (err) { console.error('에셋 저장 실패:', err); }
        finally { setIsAnalyzing(false); }
        setPendingImports(prev => prev.slice(1));
        if (pendingImports.length <= 1) loadCatalog();
    }, [currentPending, currentArtStyle, loadCatalog, pendingImports.length, ctxActions]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="bg-zinc-800 rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleDrop}
            >
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
                
                {/* 헤더 */}
                <div className="flex justify-between items-center p-4 border-b border-zinc-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <PaintBrushIcon className="w-5 h-5 text-orange-400" />
                        에셋 카탈로그
                        <span className="text-xs text-zinc-500 font-normal ml-2">{assets.length}개</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors">
                            <UploadIcon className="w-3.5 h-3.5" /> 외부 이미지 추가
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700">
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 필터 바 */}
                <div className="p-3 border-b border-zinc-700 flex items-center gap-3">
                    <input type="text" placeholder="이름, 캐릭터, 장소로 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500" />
                    <div className="flex gap-1">
                        {(['all', 'character', 'outfit', 'background'] as const).map((t) => (
                            <button key={t} onClick={() => setTypeFilter(t)} disabled={mode !== 'all'}
                                className={`px-3 py-1 text-xs rounded-full transition-colors ${typeFilter === t ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'} ${mode !== 'all' ? 'cursor-not-allowed opacity-60' : ''}`}>
                                {t === 'all' ? '전체' : t === 'character' ? '인물' : t === 'outfit' ? '의상' : '배경'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 에셋 그리드 */}
                <div className="flex-1 p-4 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-zinc-500">불러오는 중...</div>
                    ) : filteredAssets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                            <PaintBrushIcon className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm">{assets.length === 0 ? '저장된 에셋이 없습니다.' : '검색 결과가 없습니다.'}</p>
                            {assets.length === 0 && <p className="text-xs mt-1 text-zinc-600">"외부 이미지 추가" 또는 캐릭터시트/컷에서 저장해보세요.</p>}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {filteredAssets.map((asset) => {
                                const styleMismatch = asset.tags?.artStyle && asset.tags.artStyle !== currentArtStyle;
                                return (
                                    <div key={asset.id} className="group relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-700 hover:border-orange-500/50 transition-all cursor-pointer" onClick={() => handleSelect(asset)}>
                                        <div className="aspect-square bg-zinc-950" onClick={async (e) => { e.stopPropagation(); try { const origUrl = await resolveImageUrl(asset.imagePath); setViewerImage({ url: origUrl, name: asset.name }); } catch { if (imageUrls[asset.id]) setViewerImage({ url: imageUrls[asset.id], name: asset.name }); } }}>
                                            {imageUrls[asset.id] ? <img src={imageUrls[asset.id]} alt={asset.name} className="w-full h-full object-cover cursor-zoom-in" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-zinc-700"><PhotoPlaceholder /></div>}
                                        </div>
                                        <div className="p-2">
                                            <p className="text-xs font-semibold text-zinc-200 truncate">{asset.name}</p>
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                {(() => {
                                                    const extras = (asset.tags as any)?.extraTypes ? String((asset.tags as any).extraTypes).split(',').filter(Boolean) : [];
                                                    const allTypes = [asset.type, ...extras];
                                                    const badgeStyle = (t: string) => t === 'character' ? 'bg-zinc-800/50 text-zinc-400' : t === 'outfit' ? 'bg-zinc-900/50 text-orange-400' : 'bg-green-900/50 text-green-400';
                                                    const badgeLabel = (t: string) => t === 'character' ? '인물' : t === 'outfit' ? '의상' : '배경';
                                                    return allTypes.map((t, i) => (
                                                        <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded-full ${badgeStyle(t)}`}>{badgeLabel(t)}</span>
                                                    ));
                                                })()}
                                                {asset.tags?.artStyle && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-zinc-700 text-zinc-400">{STYLE_NAMES[asset.tags.artStyle] || asset.tags.artStyle}</span>}
                                            </div>
                                        </div>
                                        {styleMismatch && <div className="absolute top-1 left-1 p-1 bg-yellow-600/90 text-white rounded-md" title="화풍 불일치"><ExclamationTriangleIcon className="w-3.5 h-3.5" /></div>}
                                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/90 rounded-lg p-1 backdrop-blur-sm border border-zinc-700/50">
                                            <TagEditButton onEdit={() => setEditingAsset(asset)} />
                                            <button onClick={(e) => handleDownloadAsset(e, asset)} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors" title="다운로드"><DownloadIcon className="w-3.5 h-3.5" /></button>
                                            <button onClick={(e) => handleDelete(e, asset)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded transition-colors" title="삭제"><TrashIcon className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* 태그 선택 팝업 (외부 이미지 추가 시 — 큐 순차 처리) */}
            {currentPending && !isAnalyzing && (
                <>
                    {pendingImports.length > 1 && (
                        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[210] px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-full shadow-lg">
                            {pendingImports.length}개 이미지 대기 중
                        </div>
                    )}
                    <AssetTagPopup
                        onSave={handleImportSave}
                        onCancel={() => setPendingImports(prev => prev.slice(1))}
                        defaultName={currentPending.fileName}
                        imagePreviewUrl={currentPending.dataUrl}
                    />
                </>
            )}

            {/* 자동 분석 중 오버레이 */}
            {isAnalyzing && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[210] animate-fade-in">
                    <div className="bg-zinc-800 rounded-xl border border-zinc-600 p-6 w-72 shadow-2xl text-center">
                        <SpinnerIcon className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
                        <p className="text-sm font-bold text-white mb-1">에셋 분석 중...</p>
                        <p className="text-[10px] text-zinc-400">AI가 이미지를 분석하고 있습니다</p>
                    </div>
                </div>
            )}

            {/* 에셋 편집 팝업 (스크롤 컨테이너 밖) */}
            {editingAsset && (
                <AssetTagPopup
                    defaultName={editingAsset.name}
                    defaultTypes={[editingAsset.type, ...((editingAsset.tags as any)?.extraTypes ? String((editingAsset.tags as any).extraTypes).split(',').filter(Boolean) : [])]}
                    defaultArtStyle={editingAsset.tags?.artStyle || undefined}
                    imagePreviewUrl={imageUrls[editingAsset.id] || undefined}
                    onCancel={() => setEditingAsset(null)}
                    onSave={async (type, name, extraTypes, artStyle) => {
                        await handleUpdateMetadata(editingAsset.id, {
                            name,
                            type,
                            tags: { ...(editingAsset.tags || {}), artStyle: artStyle || editingAsset.tags?.artStyle, extraTypes: extraTypes?.join(',') || null } as any,
                        });
                        setEditingAsset(null);
                    }}
                />
            )}

            {/* 이미지 확대 뷰어 */}
            <ImageViewerModal isOpen={!!viewerImage} onClose={() => setViewerImage(null)} imageUrl={viewerImage?.url || null} altText={viewerImage?.name} />

            {/* 화풍 불일치 확인 모달 */}
            {pendingSelectAsset && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[250] animate-fade-in" onClick={() => setPendingSelectAsset(null)}>
                    <div className="bg-zinc-800 rounded-xl border border-zinc-600 p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
                            화풍 불일치
                        </h3>
                        <p className="text-xs text-zinc-300 leading-relaxed mb-4">
                            이 에셋은 <span className="font-semibold text-yellow-300">"{STYLE_NAMES[pendingSelectAsset.tags?.artStyle!] || pendingSelectAsset.tags?.artStyle || '알 수 없음'}"</span>으로 생성되었습니다.<br />
                            현재 화풍은 <span className="font-semibold text-orange-300">"{STYLE_NAMES[currentArtStyle] || currentArtStyle}"</span>입니다.<br />
                            그래도 사용하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setPendingSelectAsset(null)} className="flex-1 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors">취소</button>
                            <button onClick={() => { const asset = pendingSelectAsset; setPendingSelectAsset(null); executeSelect(asset); }} className="flex-1 py-2 text-sm font-bold bg-orange-600 hover:bg-orange-500 rounded-lg text-white transition-colors">사용하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const PhotoPlaceholder = () => (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5z" />
    </svg>
);
