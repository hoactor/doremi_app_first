
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { EditableScene, EditableCut, GeneratedImage, ArtStyle } from '../types';
import { XIcon, SparklesIcon, RefreshIcon, SpinnerIcon, CheckIcon, PhotoIcon, ZoomInIcon, BookmarkSquareIcon, ChevronDownIcon, ChevronRightIcon, ArrowLeftIcon, ArrowTopRightOnSquareIcon, PaintBrushIcon, ShirtIcon } from './icons';
import { useAppContext } from '../AppContext';

interface StoryboardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftScenes: EditableScene[];
  onConfirm: (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => Promise<void>;
}

const DraftCutCard: React.FC<{
  cut: EditableCut;
  isSelected: boolean;
  onSelect: () => void;
  hasModified: boolean;
  imageUrl?: string;
  versionCount: number;
}> = ({ cut, isSelected, onSelect, hasModified, imageUrl, versionCount }) => (
  <div
    id={`review-list-item-${cut.id}`}
    onClick={onSelect}
    className={`p-2 rounded-lg border-l-4 cursor-pointer transition-all duration-200 flex items-center gap-3 ${isSelected ? 'bg-orange-900/40 border-orange-500 shadow-md scale-[1.02]' : 'bg-stone-800/50 border-transparent hover:bg-stone-800'}`}
  >
    <div className="w-12 h-12 flex-shrink-0 bg-stone-900 rounded-md overflow-hidden border border-stone-700 flex items-center justify-center relative">
      {imageUrl ? (
        <img src={imageUrl} alt={`Cut ${cut.id}`} className="w-full h-full object-cover" />
      ) : (
        <PhotoIcon className="w-5 h-5 text-stone-600" />
      )}
      {versionCount > 1 && (
        <div className="absolute bottom-0 right-0 bg-orange-600 text-[8px] font-black px-1 rounded-tl-sm text-white shadow-sm border-t border-l border-orange-400/50">
          v{versionCount}
        </div>
      )}
      {hasModified && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-stone-900 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
    </div>
    <div className="flex-grow min-w-0">
      <div className="flex justify-between items-center mb-0.5">
        <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-orange-300' : 'text-stone-500'}`}>CUT #{cut.id}</span>
      </div>
      <p className="text-[11px] text-stone-300 line-clamp-1 leading-tight">{cut.narrationText}</p>
    </div>
  </div>
);

// --- New UI Component: Outfit Selector Popover ---
const OutfitSelector: React.FC<{
  characterName: string;
  outfits: { [location: string]: string };
  onSelect: (outfit: string) => void;
  onClose: () => void;
}> = ({ characterName, outfits, onSelect, onClose }) => (
    <div className="absolute z-[100] bottom-full right-0 mb-2 w-72 bg-stone-800 border border-stone-600 rounded-xl shadow-2xl animate-fade-in-scale ring-1 ring-black/50 overflow-hidden">
        <div className="p-3 border-b border-stone-700 flex justify-between items-center bg-stone-900/80">
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{characterName} 프로필 의상함</span>
            <button onClick={onClose} className="p-1 hover:bg-stone-700 rounded-full transition-colors"><XIcon className="w-3.5 h-3.5 text-stone-400" /></button>
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5 custom-scrollbar bg-stone-800/50">
            {Object.entries(outfits).length > 0 ? (
                Object.entries(outfits).map(([loc, desc]) => (
                    <button
                        key={loc}
                        onClick={() => onSelect(desc)}
                        className="w-full text-left p-2.5 hover:bg-orange-600/30 rounded-lg transition-all border border-transparent hover:border-orange-500/30 group mb-1 last:mb-0"
                    >
                        <p className="text-[10px] font-bold text-stone-400 group-hover:text-orange-300 mb-0.5 uppercase tracking-tighter">{loc}</p>
                        <p className="text-[11px] text-stone-200 line-clamp-2 leading-relaxed group-hover:text-white italic">"{desc}"</p>
                    </button>
                ))
            ) : (
                <div className="p-4 text-center text-xs text-stone-500 italic">프로필에 저장된 의상이 없습니다.</div>
            )}
        </div>
    </div>
);

export const StoryboardReviewModal: React.FC<StoryboardReviewModalProps> = ({ isOpen, onClose, draftScenes, onConfirm }) => {
  const { state, actions } = useAppContext();
  const { isLoading, generatedImageHistory, characterDescriptions, storyTitle, artStyle } = state;

  const [localScenes, setLocalScenes] = useState<EditableScene[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [modifiedCutIds, setModifiedCutIds] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [regeneratingCutIds, setRegeneratingCutIds] = useState<Set<string>>(new Set());
  const [viewingVersionMap, setViewingVersionMap] = useState<Record<string, number>>({});
  const editorScrollRef = useRef<HTMLDivElement>(null);
  
  // Selection UI state
  const [outfitSelectionTarget, setOutfitSelectionTarget] = useState<{ cutId: string, charName: string } | null>(null);

  // --- Independent Window Logic ---
  const [isExternal, setIsExternal] = useState(false);
  const externalWindowRef = useRef<Window | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const handlePopOut = useCallback(() => {
    const width = 1600;
    const height = 1000;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    const win = window.open('', 'DirectorReviewExternal', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
    if (win) {
      win.document.title = `${storyTitle || 'Director'} - Review Popout`;
      document.querySelectorAll('link, style').forEach(s => win.document.head.appendChild(s.cloneNode(true)));
      win.document.body.className = "bg-stone-950 m-0 p-0";
      const container = win.document.createElement('div');
      container.id = 'popout-root';
      win.document.body.appendChild(container);
      setPortalContainer(container);
      externalWindowRef.current = win;
      setIsExternal(true);
      win.onbeforeunload = () => {
        setIsExternal(false);
        externalWindowRef.current = null;
        setPortalContainer(null);
      };
    }
  }, [storyTitle]);

  const QUICK_INTENTS = [
    { label: "🔍 클로즈업", text: "인물의 표정이 잘 보이도록 얼굴 위주로 클로즈업해줘." },
    { label: "☀️ 밝은 조명", text: "전체적으로 화사하고 밝은 햇살이 내리쬐는 분위기로 변경해줘." },
    { label: "🌑 어둡고 차갑게", text: "조명을 낮추고 차가운 푸른색 톤으로 무겁게 연출해줘." },
    { label: "🌿 배경 강조", text: "인물보다는 주변 배경의 디테일과 소품이 잘 보이도록 풀샷으로 잡아줘." },
    { label: "🎭 표정 극대화", text: "캐릭터의 감정이 아주 처절하게 느껴지도록 표정을 더 일그러뜨려줘." }
  ];

  const cutHistoryMap = React.useMemo(() => {
    const map = new Map<string, GeneratedImage[]>();
    [...generatedImageHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach(img => {
        if (!map.has(img.sourceCutNumber)) map.set(img.sourceCutNumber, []);
        map.get(img.sourceCutNumber)!.push(img);
      });
    return map;
  }, [generatedImageHistory]);

  useEffect(() => {
    if (isOpen && draftScenes) {
      setLocalScenes(JSON.parse(JSON.stringify(draftScenes)));
      if (draftScenes.length > 0 && draftScenes[0].cuts.length > 0) {
        const allIds = draftScenes.flatMap(s => s.cuts.map(c => c.id));
        if (!selectedCutId || !allIds.includes(selectedCutId)) {
          setSelectedCutId(draftScenes[0].cuts[0].id);
        }
      } else {
        setSelectedCutId(null);
      }
      setModifiedCutIds(new Set());
    }
  }, [isOpen, draftScenes]);

  const getCharKey = (name: string) => {
    return Object.keys(characterDescriptions).find(key => characterDescriptions[key].koreanName === name);
  };

  const handleUpdateCut = (cutId: string, updates: Partial<EditableCut>) => {
    setLocalScenes(prev => {
      const nextScenes = prev.map(scene => ({
        ...scene,
        cuts: scene.cuts.map(cut => {
          if (cut.id === cutId) {
            const newCut = { ...cut, ...updates };
            // Automatic profile assignment logic for CAST changes
            if (updates.character) {
              const profileOutfitParts: string[] = [];
              (updates.character || []).forEach(name => {
                const key = getCharKey(name);
                if (key && characterDescriptions[key]) {
                  const hair = characterDescriptions[key].hairStyleDescription ? `(${characterDescriptions[key].hairStyleDescription}) ` : '';
                  const outfitText = characterDescriptions[key].koreanLocations?.[newCut.location] || characterDescriptions[key].koreanBaseAppearance || '기본 의상';
                  profileOutfitParts.push(`[${name}: ${hair}${outfitText}]`);
                }
              });
              newCut.characterOutfit = profileOutfitParts.join(' ');
            }
            return newCut;
          }
          return cut;
        })
      }));
      return nextScenes;
    });
    setModifiedCutIds(prev => new Set(prev).add(cutId));
  };

  const handleConfirmClick = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      await onConfirm(localScenes, modifiedCutIds);
      if (!isExternal) onClose();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSelectCut = (cutId: string) => {
    setSelectedCutId(cutId);
    const element = document.getElementById(`review-editor-card-${cutId}`);
    if (element && editorScrollRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleRegenerateCut = async (cut: EditableCut) => {
    setRegeneratingCutIds(prev => new Set(prev).add(cut.id));
    const newData = await actions.handleRegenerateSingleCut(cut);
    if (newData) {
      handleUpdateCut(cut.id, newData);
    }
    setRegeneratingCutIds(prev => {
      const next = new Set(prev);
      next.delete(cut.id);
      return next;
    });
  };

  /**
   * REPLACED: Sync Scene dummy function with real Profile Outfit Retrieval logic
   */
  const handleSyncOutfitFromProfile = async (cut: EditableCut) => {
    if (!cut.character || cut.character.length === 0) {
      actions.addNotification('인물이 배정되지 않은 컷입니다.', 'error');
      return;
    }

    const nextOutfits: string[] = [];
    let manualCharName = '';
    let foundAll = true;

    for (const name of cut.character) {
      const key = getCharKey(name);
      if (key && characterDescriptions[key]) {
        const char = characterDescriptions[key];
        const profileOutfit = char.koreanLocations?.[cut.location];
        
        if (profileOutfit) {
          // Found exact match for this location
          const hair = char.hairStyleDescription ? `(${char.hairStyleDescription}) ` : '';
          nextOutfits.push(`[${name}: ${hair}${profileOutfit}]`);
        } else {
          // No exact match, trigger manual choice UI for the first problematic character
          manualCharName = name;
          foundAll = false;
          break;
        }
      }
    }

    if (!foundAll) {
      setOutfitSelectionTarget({ cutId: cut.id, charName: manualCharName });
      actions.addNotification(`'${manualCharName}'의 해당 장소 의상이 프로필에 없습니다. 리스트에서 직접 골라주세요.`, 'info');
    } else if (nextOutfits.length > 0) {
      handleUpdateCut(cut.id, { characterOutfit: nextOutfits.join(' ') });
      actions.addNotification('장소에 배당된 의상을 프로필에서 성공적으로 가져왔습니다.', 'success');
    }
  };

  const handleManualOutfitSelect = (outfitDesc: string) => {
    if (!outfitSelectionTarget) return;
    const { cutId, charName } = outfitSelectionTarget;
    
    const key = getCharKey(charName);
    const char = key ? characterDescriptions[key] : null;
    const hair = char?.hairStyleDescription ? `(${char.hairStyleDescription}) ` : '';
    const formattedOutfit = `[${charName}: ${hair}${outfitDesc}]`;

    setLocalScenes(prev => {
        return prev.map(scene => ({
            ...scene,
            cuts: scene.cuts.map(cut => {
                if (cut.id === cutId) {
                    const existing = (cut.characterOutfit || '').trim();
                    let next = existing;
                    // If multiple characters, update only this one if it exists
                    if (existing.includes(`[${charName}:`)) {
                        next = existing.replace(new RegExp(`\\[${charName}:.*?\\]`, 'g'), formattedOutfit);
                    } else {
                        next = existing ? `${existing} ${formattedOutfit}` : formattedOutfit;
                    }
                    return { ...cut, characterOutfit: next };
                }
                return cut;
            })
        }));
    });
    setModifiedCutIds(prev => new Set(prev).add(cutId));
    setOutfitSelectionTarget(null);
    actions.addNotification('선택한 의상이 장면에 반영되었습니다.', 'success');
  };

  const changeViewingVersion = (cutId: string, direction: 'prev' | 'next', max: number) => {
    const current = viewingVersionMap[cutId] ?? (max - 1);
    let next = direction === 'next' ? current + 1 : current - 1;
    if (next < 0) next = 0;
    if (next >= max) next = max - 1;
    setViewingVersionMap(prev => ({ ...prev, [cutId]: next }));
  };

  const appendQuickIntent = (cutId: string, currentText: string, appendText: string) => {
    const base = currentText.trim();
    const next = base ? `${base}\n${appendText}` : appendText;
    handleUpdateCut(cutId, { directorialIntent: next });
  };

  if (!isOpen) return null;

  const allCuts = localScenes.flatMap(s => s.cuts);
  const allLocations = [...new Set(allCuts.map(c => c.location))];
  
  // Find current scene number based on selectedCutId
  const currentScene = localScenes.find(s => s.cuts.some(c => c.id === selectedCutId));
  const currentSceneId = currentScene ? currentScene.sceneNumber : 1;

  const renderContent = () => (
    <div className={`bg-stone-900 border border-stone-700 shadow-2xl w-full h-full flex flex-col overflow-hidden ${isExternal ? 'rounded-none' : 'rounded-3xl'}`}>
      <header className="flex justify-between items-center p-6 border-b border-stone-800 bg-stone-900/50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-orange-600/20 rounded-2xl border border-orange-500/30">
            <SparklesIcon className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">AI Director Review</h2>
            <p className="text-sm text-stone-500 font-medium">연출 의도를 입력하면 AI가 모든 시각적 요소를 정밀하게 설계합니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isExternal && (
            <button onClick={handlePopOut} className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-lg border border-stone-700 transition-colors" title="새 창으로 분리">
              <ArrowTopRightOnSquareIcon className="w-5 h-5" />
            </button>
          )}
          <button onClick={onClose} className="p-3 rounded-full text-stone-500 hover:text-white hover:bg-stone-800 transition-all">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
      </header>

      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/4 min-w-[280px] border-r border-stone-800 bg-stone-950/30 flex flex-col">
          <div className="p-4 border-b border-stone-800 bg-stone-900/50 flex justify-between items-center">
            <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Storyboard Draft</h3>
            <span className="px-2 py-0.5 rounded-full bg-stone-800 text-[10px] font-bold text-stone-400 border border-stone-700">{allCuts.length} CUTS</span>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {allCuts.map(cut => {
              const history = cutHistoryMap.get(cut.id);
              return (
                <DraftCutCard
                  key={cut.id}
                  cut={cut}
                  isSelected={selectedCutId === cut.id}
                  onSelect={() => handleSelectCut(cut.id)}
                  hasModified={modifiedCutIds.has(cut.id)}
                  imageUrl={history?.[history.length - 1]?.imageUrl}
                  versionCount={history?.length || 0}
                />
              );
            })}
          </div>
        </div>

        {/* Editor Main */}
        <div ref={editorScrollRef} className="flex-grow p-8 overflow-y-auto bg-stone-900 custom-scrollbar relative">
          <div className="max-w-3xl mx-auto space-y-8">
            {allCuts.map(currentCut => {
              const history = cutHistoryMap.get(currentCut.id) || [];
              const currentVersionIdx = viewingVersionMap[currentCut.id] ?? (history.length - 1);
              const currentImg = history[currentVersionIdx];
              const hasModified = modifiedCutIds.has(currentCut.id);

              return (
                <div 
                  id={`review-editor-card-${currentCut.id}`}
                  key={currentCut.id} 
                  className={`space-y-4 relative p-6 rounded-3xl border-2 transition-all duration-500 ${selectedCutId === currentCut.id ? 'bg-stone-800/40 border-orange-500/50 shadow-2xl' : 'bg-stone-800/10 border-stone-800 opacity-60 hover:opacity-100'}`}
                >
                  {regeneratingCutIds.has(currentCut.id) && (
                    <div className="absolute inset-0 bg-stone-900/80 z-10 flex flex-col items-center justify-center rounded-3xl backdrop-blur-sm">
                      <SpinnerIcon className="w-10 h-10 text-orange-400 mb-3" />
                      <p className="text-sm font-black text-orange-300 animate-pulse uppercase tracking-widest">Re-Imagining Scene...</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black text-orange-500/50 italic tracking-tighter">#{currentCut.id}</span>
                      <div className="h-1 w-12 bg-stone-800 rounded-full"></div>
                      {hasModified && <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-[10px] font-black text-green-400 border border-green-500/30 uppercase tracking-tighter">Modified</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRegenerateCut(currentCut)}
                        disabled={regeneratingCutIds.has(currentCut.id)}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-black text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 uppercase tracking-tight"
                      >
                        <RefreshIcon className="w-4 h-4" />
                        New Idea
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block px-1">Narration / Script</label>
                    <textarea
                      value={currentCut.narrationText || ''}
                      onChange={(e) => handleUpdateCut(currentCut.id, { narrationText: e.target.value })}
                      rows={2}
                      className="w-full p-4 text-xl font-bold bg-stone-950/50 rounded-2xl border border-stone-800 text-stone-100 focus:outline-none focus:border-orange-500 transition-all resize-none shadow-inner"
                      placeholder="나레이션이 없는 컷입니다."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block px-1">Cast</label>
                      <div className="flex gap-2 p-2 bg-stone-950/30 rounded-2xl border border-stone-800 flex-wrap">
                        {Object.values(characterDescriptions).map(charDesc => {
                          const charName = charDesc.koreanName;
                          return (
                            <button
                              key={charName}
                              onClick={() => {
                                const newChars = currentCut.character.includes(charName)
                                  ? currentCut.character.filter(c => c !== charName)
                                  : [...currentCut.character, charName];
                                handleUpdateCut(currentCut.id, { character: newChars });
                              }}
                              className={`flex-1 min-w-[60px] py-1.5 text-sm font-black rounded-xl transition-all ${currentCut.character.includes(charName) ? 'bg-orange-600 text-white shadow-md' : 'text-stone-800 text-stone-500 hover:text-stone-300'}`}
                            >
                              {charName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block px-1">Location</label>
                      <select
                        value={currentCut.location}
                        onChange={(e) => handleUpdateCut(currentCut.id, { location: e.target.value })}
                        className="w-full p-2.5 bg-stone-950/30 rounded-2xl border border-stone-800 text-sm font-bold text-white focus:ring-1 focus:ring-orange-500 appearance-none"
                      >
                        {allLocations.map(loc => <option key={loc} value={loc} className="bg-stone-800">{loc}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="p-5 bg-stone-900/50 rounded-3xl border border-stone-800 shadow-inner flex gap-6 items-start">
                    <div className="flex flex-col gap-3">
                      <div
                        className="w-[160px] h-[160px] flex-shrink-0 bg-stone-950 rounded-2xl border border-stone-800 overflow-hidden flex items-center justify-center relative group cursor-zoom-in shadow-2xl"
                        onClick={() => currentImg && actions.handleOpenImageViewer(currentImg.imageUrl, `Cut ${currentCut.id} Reference`, currentImg.prompt)}
                      >
                        {currentImg ? (
                          <>
                            <img src={currentImg.imageUrl} alt="Reference" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomInIcon className="w-10 h-10 text-white drop-shadow-lg" />
                            </div>
                            <div className="absolute top-2 left-2 bg-orange-600/80 backdrop-blur-sm text-[10px] font-black px-2 py-0.5 rounded text-white border border-white/20">
                              VER. {currentVersionIdx + 1}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 opacity-30">
                            <PhotoIcon className="w-10 h-10" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">No Preview</span>
                          </div>
                        )}
                      </div>
                      {history.length > 1 && (
                        <div className="flex items-center justify-between px-1">
                          <button
                            onClick={() => changeViewingVersion(currentCut.id, 'prev', history.length)}
                            disabled={currentVersionIdx === 0}
                            className="p-1 rounded-lg bg-stone-800 text-stone-400 hover:text-white disabled:opacity-20"
                          >
                            <ArrowLeftIcon className="w-4 h-4" />
                          </button>
                          <span className="text-[10px] font-black text-stone-500">{currentVersionIdx + 1} / {history.length}</span>
                          <button
                            onClick={() => changeViewingVersion(currentCut.id, 'next', history.length)}
                            disabled={currentVersionIdx === history.length - 1}
                            className="p-1 rounded-lg bg-stone-800 text-stone-400 hover:text-white disabled:opacity-20"
                          >
                            <ChevronRightIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-grow flex flex-col h-full min-w-0">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                          <SparklesIcon className="w-5 h-5" />
                          Directorial Intent
                        </label>
                        {currentImg && (
                          <div className="group relative">
                            <BookmarkSquareIcon className="w-4 h-4 text-stone-600 cursor-help hover:text-orange-400 transition-colors" />
                            <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-stone-950 border border-stone-700 rounded-xl shadow-2xl text-[10px] text-stone-400 invisible group-hover:visible z-30 font-mono leading-relaxed break-words">
                              <p className="text-orange-400 font-bold mb-1 uppercase tracking-tighter">[Prompt of this version]</p>
                              {currentImg.prompt}
                            </div>
                          </div>
                        )}
                      </div>
                      <textarea
                        value={currentCut.directorialIntent || ''}
                        onChange={(e) => handleUpdateCut(currentCut.id, { directorialIntent: e.target.value })}
                        className={`w-full flex-grow p-4 text-base font-medium rounded-2xl bg-stone-950/50 border-2 transition-all focus:outline-none focus:ring-4 focus:ring-amber-500/10 placeholder:text-stone-700 leading-relaxed ${(hasModified && (currentCut.directorialIntent || '').trim()) ? 'border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]' : 'border-stone-800'}`}
                        placeholder="연출 의도를 구체적으로 입력하세요. 예) 비가 억수같이 쏟아지는 창밖을 보며 흐느끼는 장면. 조명은 차가운 푸른색."
                        style={{ minHeight: '115px' }}
                      />
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {QUICK_INTENTS.map(chip => (
                          <button
                            key={chip.label}
                            onClick={() => appendQuickIntent(currentCut.id, currentCut.directorialIntent || '', chip.text)}
                            className="px-3 py-1.5 rounded-full bg-stone-800 border border-stone-700 text-[10px] font-bold text-stone-400 hover:text-orange-300 hover:border-orange-500 transition-all active:scale-95"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <p className="mt-[-0.75rem] text-[9px] font-bold text-stone-500 italic px-1 text-right">
                    * 입력한 의도는 '검수 완료' 시 AI가 세부 묘사(포즈, 표정, 배경)로 자동 변환하여 이미지 생성에 사용합니다.
                  </p>

                  <div className="space-y-2 bg-stone-950/20 p-4 rounded-2xl border border-stone-800/50 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Base Outfit for {currentCut.location}</label>
                      <div className="relative">
                        <button
                          onClick={() => handleSyncOutfitFromProfile(currentCut)}
                          disabled={regeneratingCutIds.has(currentCut.id)}
                          className="text-[10px] font-black text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-tight flex items-center gap-1"
                        >
                          <RefreshIcon className="w-3 h-3" /> Sync Outfit
                        </button>
                        
                        {/* MANUAL OUTFIT SELECTOR POPOVER */}
                        {outfitSelectionTarget?.cutId === currentCut.id && (
                            <OutfitSelector 
                                characterName={outfitSelectionTarget.charName}
                                outfits={characterDescriptions[getCharKey(outfitSelectionTarget.charName) || '']?.koreanLocations || {}}
                                onSelect={handleManualOutfitSelect}
                                onClose={() => setOutfitSelectionTarget(null)}
                            />
                        )}
                      </div>
                    </div>
                    <textarea
                      value={currentCut.characterOutfit || ''}
                      onChange={(e) => handleUpdateCut(currentCut.id, { characterOutfit: e.target.value })}
                      rows={2}
                      className="w-full p-3 bg-transparent text-xs font-medium text-stone-400 border border-stone-800/50 rounded-xl focus:outline-none focus:border-orange-500 resize-none shadow-inner"
                      placeholder="의상 설명 (프로필에서 자동 주입됨)"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="p-6 bg-stone-900 border-t border-stone-800 flex justify-between items-center flex-shrink-0">
        <button
          onClick={() => actions.handleRegenerateStoryboardDraft()}
          disabled={isLoading}
          className="flex items-center gap-3 px-6 py-3 text-sm font-black rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-400 transition-all border border-stone-700 disabled:opacity-50 active:scale-95 uppercase tracking-tighter"
        >
          <RefreshIcon className="w-5 h-5" />
          Regenerate All Drafts
        </button>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Ready to Process</p>
            <p className="text-sm font-bold text-white"><span className="text-orange-400">{modifiedCutIds.size}</span> Custom Intentions Set</p>
          </div>
          <button
            onClick={handleConfirmClick}
            disabled={isConfirming || isLoading}
            className="group flex items-center gap-4 px-10 py-4 text-xl font-black rounded-2xl text-white bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 transition-all shadow-[0_0_30px_rgba(234,88,12,0.3)] transform hover:-translate-y-1 active:scale-95 disabled:opacity-70 disabled:transform-none uppercase tracking-tight"
          >
            {isConfirming ? <SpinnerIcon className="w-7 h-7" /> : <CheckIcon className="w-7 h-7 font-black" />}
            <span>Finalize Direction & Generate</span>
          </button>
        </div>
      </footer>
    </div>
  );

  const content = renderContent();

  if (isExternal && portalContainer) {
    return createPortal(content, portalContainer);
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in" aria-modal="true" role="dialog">
      {isExternal ? (
        <div className="flex flex-col items-center justify-center text-center p-12 bg-stone-900 rounded-3xl border border-stone-700 shadow-2xl max-w-lg">
          <div className="w-20 h-20 bg-orange-600/20 rounded-full flex items-center justify-center mb-6 border border-orange-500/30">
            <ArrowTopRightOnSquareIcon className="w-10 h-10 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">창이 분리되었습니다</h2>
          <p className="text-stone-400 mb-8 leading-relaxed">디렉터 리뷰 창이 독립된 환경에서 실행 중입니다.<br />이 창을 닫기 전까지 계속해서 수정을 진행할 수 있습니다.</p>
          <button onClick={() => { if (externalWindowRef.current) externalWindowRef.current.close(); setIsExternal(false); }} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
            <RefreshIcon className="w-5 h-5" />
            현재 탭으로 가져오기
          </button>
          <button onClick={onClose} className="w-full mt-3 py-4 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold rounded-xl transition-all">모달 닫기</button>
        </div>
      ) : (
        <div className="w-full max-w-7xl h-full max-h-[92vh]">
          {renderContent()}
        </div>
      )}
      {isExternal && portalContainer && createPortal(renderContent(), portalContainer)}
    </div>
  );
};
