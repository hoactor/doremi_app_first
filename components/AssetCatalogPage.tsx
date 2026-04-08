/**
 * AssetCatalogPage — 에셋 카탈로그 독립 윈도우용 풀페이지
 * 
 * AppContext 없이 독립 동작.
 * Tauri 커맨드만으로 CRUD 처리.
 * CRUD 후 emit('asset-catalog-updated') → 메인 앱 동기화 (C-2).
 * "Studio로 보내기" → emit('send-to-studio') → 메인 앱 참조 슬롯 (C-3).
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ArtStyle } from '../types';
import { XIcon, TrashIcon, DownloadIcon, PencilIcon, CheckIcon, ExclamationTriangleIcon, PaintBrushIcon, UploadIcon, SpinnerIcon, ArrowTopRightOnSquareIcon } from './icons';
import { IS_TAURI, loadAssetCatalog, deleteAsset, updateAssetMetadata, resolveImageUrl, downloadFile, saveAsset, emit } from '../services/tauriAdapter';
import { callVisionTextModel } from '../services/ai/aiCore';
import { analyzeAssetWithVision, AssetTagPopup } from './AssetCatalogModal';
import { ImageViewerModal } from './ImageViewerModal';
import type { AssetCatalogEntry } from '../services/tauriAdapter';

const STYLE_NAMES: Record<string, string> = {
    'dalle-chibi': '프리미엄', 'moe': '극강 귀요미',
    'kyoto': '시네마 감성', 'vibrant': '도파민',
    'normal': '정통 썰툰', 'custom': '커스텀',
};

const PhotoPlaceholder = () => (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5z" />
    </svg>
);

// ─── 태그 편집 버튼 ─────────────────────────────────────────────
const TagEditButton: React.FC<{ onEdit: () => void }> = ({ onEdit }) => (
    <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="p-1.5 text-zinc-300 hover:text-orange-300 hover:bg-zinc-700 rounded transition-colors" title="태그 편집">
        <PencilIcon className="w-3.5 h-3.5" />
    </button>
);

// ─── 메인 페이지 ────────────────────────────────────────────────
export const AssetCatalogPage: React.FC = () => {
    const [assets, setAssets] = useState<AssetCatalogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'character' | 'outfit' | 'background'>('all');
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [pendingImports, setPendingImports] = useState<{ dataUrl: string; fileName: string }[]>([]);
    const [editingAsset, setEditingAsset] = useState<AssetCatalogEntry | null>(null);
    const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 독립 창에서는 artStyle을 알 수 없으므로 기본값 사용 (화풍 불일치 체크 비활성화)
    const currentArtStyle: ArtStyle = 'custom';

    // 알림 헬퍼
    const showNotification = useCallback((msg: string) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 2500);
    }, []);

    // 카탈로그 로드
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

    useEffect(() => { if (IS_TAURI) loadCatalog(); }, [loadCatalog]);

    // 창 닫힐 때 메인 앱에 알림
    useEffect(() => {
        const handleBeforeUnload = () => { emit('asset-window-closed', {}); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // 필터링
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            if (typeFilter !== 'all') {
                const extras = (asset.tags as any)?.extraTypes ? String((asset.tags as any)?.extraTypes).split(',') : [];
                if (asset.type !== typeFilter && !extras.includes(typeFilter)) return false;
            }
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return asset.name?.toLowerCase().includes(term)
                || (asset.tags?.description || '').toLowerCase().includes(term)
                || (asset.tags?.character || '').toLowerCase().includes(term)
                || (asset.tags?.location || '').toLowerCase().includes(term);
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [assets, typeFilter, searchTerm]);

    // CRUD 핸들러
    const handleDelete = useCallback(async (e: React.MouseEvent, asset: AssetCatalogEntry) => {
        e.stopPropagation();
        if (!window.confirm(`"${asset.name}" 에셋을 삭제하시겠습니까?`)) return;
        try {
            await deleteAsset(asset.id);
            setAssets(prev => prev.filter(a => a.id !== asset.id));
            await emit('asset-catalog-updated', { action: 'delete', assetId: asset.id });
            showNotification('에셋이 삭제되었습니다.');
        } catch (err) { console.error('에셋 삭제 실패:', err); }
    }, [showNotification]);

    const handleUpdateMetadata = useCallback(async (assetId: string, updates: Partial<AssetCatalogEntry>) => {
        try {
            await updateAssetMetadata(assetId, updates);
            setAssets(prev => prev.map(a => a.id === assetId ? { ...a, ...updates } : a));
            await emit('asset-catalog-updated', { action: 'update', assetId });
            showNotification('메타데이터가 업데이트되었습니다.');
        } catch (err) { console.error('메타데이터 업데이트 실패:', err); }
    }, [showNotification]);

    const handleDownloadAsset = useCallback(async (e: React.MouseEvent, asset: AssetCatalogEntry) => {
        e.stopPropagation();
        const url = imageUrls[asset.id];
        if (!url) return;
        try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            await downloadFile(blob, `${asset.name.replace(/\s+/g, '_')}.png`, [{ name: 'PNG', extensions: ['png'] }]);
        } catch (err) { console.error('다운로드 실패:', err); }
    }, [imageUrls]);

    // Studio로 보내기
    const handleSendToStudio = useCallback(async (e: React.MouseEvent, asset: AssetCatalogEntry) => {
        e.stopPropagation();
        const url = imageUrls[asset.id];
        if (!url) return;
        try {
            await emit('send-to-studio', { imageUrl: url });
            showNotification('Studio 참조 슬롯에 전송했습니다.');
        } catch (err) { console.error('Studio 전송 실패:', err); }
    }, [imageUrls, showNotification]);

    // 파일 추가
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) {
                    setPendingImports(prev => [...prev, { dataUrl: reader.result as string, fileName: file.name.replace(/\.[^.]+$/, '') }]);
                }
            };
            reader.readAsDataURL(file);
        });
        if (e.target) e.target.value = '';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) {
                    setPendingImports(prev => [...prev, { dataUrl: reader.result as string, fileName: file.name.replace(/\.[^.]+$/, '') }]);
                }
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const currentPending = pendingImports[0] || null;

    const handleImportSave = useCallback(async (type: 'character' | 'outfit' | 'background', name: string, extraTypes?: string[], artStyle?: string) => {
        if (!currentPending) return;
        const finalArtStyle = artStyle || currentArtStyle;
        setIsAnalyzing(true);
        try {
            const assetId = await saveAsset(type, `${name}.png`, currentPending.dataUrl, {
                name,
                tags: { character: type === 'character' ? name : null, artStyle: finalArtStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null },
            });

            const updates: any = { tags: { character: type === 'character' ? name : null, artStyle: finalArtStyle, location: null, description: '', extraTypes: extraTypes?.join(',') || null } };
            const allTypes = [type, ...(extraTypes || [])];

            for (const t of allTypes) {
                try {
                    const result = await analyzeAssetWithVision(currentPending.dataUrl, t as any);
                    // 독립 창에서는 토큰 카운트를 콘솔에만 로그 (AppContext 없음)
                    if (result.tokenCount > 0) console.log(`[AssetCatalog] Vision 분석 토큰: ${result.tokenCount}`);
                    if (result.description) updates.tags.description = result.description;
                    if (result.visualDNA) updates.visualDNA = result.visualDNA;
                    if (result.spatialDNA) updates.spatialDNA = result.spatialDNA;
                } catch (err) { console.error(`에셋 ${t} 분석 실패:`, err); }
            }

            if (updates.tags.description || updates.visualDNA || updates.spatialDNA) {
                await updateAssetMetadata(assetId, updates);
            }
            showNotification(`"${name}" 에셋이 저장되었습니다.`);
            await emit('asset-catalog-updated', { action: 'add', assetId });
        } catch (err) { console.error('에셋 저장 실패:', err); }
        finally { setIsAnalyzing(false); }
        setPendingImports(prev => prev.slice(1));
        if (pendingImports.length <= 1) loadCatalog();
    }, [currentPending, currentArtStyle, loadCatalog, pendingImports.length, showNotification]);

    return (
        <div className="h-screen w-screen bg-zinc-900 text-white flex flex-col overflow-hidden"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
        >
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />

            {/* 헤더 */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-zinc-700 bg-zinc-800/80 backdrop-blur-sm flex-shrink-0">
                <h1 className="text-base font-bold text-white flex items-center gap-2">
                    <PaintBrushIcon className="w-5 h-5 text-orange-400" />
                    에셋 카탈로그
                    <span className="text-xs text-zinc-500 font-normal ml-2">{assets.length}개</span>
                </h1>
                <div className="flex items-center gap-2">
                    <button onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors">
                        <UploadIcon className="w-3.5 h-3.5" /> 외부 이미지 추가
                    </button>
                </div>
            </div>

            {/* 필터 바 */}
            <div className="px-5 py-2.5 border-b border-zinc-700/50 flex items-center gap-3 flex-shrink-0">
                <input type="text" placeholder="이름, 캐릭터, 장소로 검색..."
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 text-white" />
                <div className="flex gap-1">
                    {(['all', 'character', 'outfit', 'background'] as const).map((t) => (
                        <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1 text-xs rounded-full transition-colors ${typeFilter === t ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}>
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
                        {assets.length === 0 && <p className="text-xs mt-1 text-zinc-600">이미지를 드래그앤드롭하거나 "외부 이미지 추가"를 눌러보세요.</p>}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {filteredAssets.map((asset) => (
                            <div key={asset.id} className="group relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 hover:border-orange-500/50 transition-all">
                                <div className="aspect-square bg-zinc-950 cursor-zoom-in" onClick={async () => { try { const origUrl = await resolveImageUrl(asset.imagePath); setViewerImage({ url: origUrl, name: asset.name }); } catch { if (imageUrls[asset.id]) setViewerImage({ url: imageUrls[asset.id], name: asset.name }); } }}>
                                    {imageUrls[asset.id]
                                        ? <img src={imageUrls[asset.id]} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
                                        : <div className="w-full h-full flex items-center justify-center text-zinc-700"><PhotoPlaceholder /></div>}
                                </div>
                                <div className="p-2">
                                    <p className="text-xs font-semibold text-zinc-200 truncate">{asset.name}</p>
                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                        {(() => {
                                            const extras = (asset.tags as any)?.extraTypes ? String((asset.tags as any)?.extraTypes).split(',').filter(Boolean) : [];
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
                                {/* 호버 메뉴 */}
                                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/90 rounded-lg p-1 backdrop-blur-sm border border-zinc-700/50">
                                    <TagEditButton onEdit={() => setEditingAsset(asset)} />
                                    <button onClick={(e) => handleSendToStudio(e, asset)} className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 rounded transition-colors" title="Studio로 보내기">
                                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={(e) => handleDownloadAsset(e, asset)} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded transition-colors" title="다운로드">
                                        <DownloadIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={(e) => handleDelete(e, asset)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded transition-colors" title="삭제">
                                        <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 이미지 확대 뷰어 */}
            <ImageViewerModal isOpen={!!viewerImage} onClose={() => setViewerImage(null)} imageUrl={viewerImage?.url || null} altText={viewerImage?.name} />

            {/* 태그 선택 팝업 (외부 이미지 추가 시) */}
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

            {/* 태그 편집 팝업 */}
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

            {/* 알림 토스트 */}
            {notification && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-xl animate-fade-in">
                    {notification}
                </div>
            )}
        </div>
    );
};
