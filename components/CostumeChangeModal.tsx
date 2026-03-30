
import React, { useState, useMemo } from 'react';
import { EditableScene } from '../types';
import { ShirtIcon, XIcon, CheckIcon, UserIcon } from './icons';

import { useAppContext } from '../AppContext';

interface CostumeChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: EditableScene[];
  // Callback now accepts a list of changes
  onConfirm: (changes: { sceneNumber: number; character: string; newOutfit: string }[]) => void;
}

// Helper to extract raw outfit text removing the [Name: ...] wrapper
const extractOutfitText = (fullText: string, charName: string): string => {
    if (!fullText) return '';
    // Try to match [Name: ...description...]
    const regex = new RegExp(`\\[${charName}:\\s*(.*?)\\]`);
    const match = fullText.match(regex);
    if (match && match[1]) {
        // Remove hair info if present in parentheses e.g. (Short hair)
        return match[1].replace(/^\(.*?\)\s*/, '').trim();
    }
    // Fallback: return full text if format doesn't match
    return fullText;
};

export const CostumeChangeModal: React.FC<CostumeChangeModalProps> = ({ isOpen, onClose, scenes, onConfirm }) => {
  const { state } = useAppContext();
  const { characterDescriptions } = state;
  // State to track changes: Map<SceneNumber-CharacterName, Outfit>
  const [changes, setChanges] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const handleOutfitChange = (sceneNumber: number, charName: string, value: string) => {
    const key = `${sceneNumber}-${charName}`;
    setChanges(prev => ({
        ...prev,
        [key]: value
    }));
  };

  const handleSubmit = () => {
    const changeList: { sceneNumber: number; character: string; newOutfit: string }[] = [];
    
    Object.entries(changes).forEach(([key, value]) => {
        // Explicitly cast value to string to avoid 'unknown' type errors in some environments
        const strValue = value as string;
        if (!strValue.trim()) return;
        const [sceneNumStr, charName] = key.split('-');
        changeList.push({
            sceneNumber: parseInt(sceneNumStr),
            character: charName,
            newOutfit: strValue.trim()
        });
    });

    if (changeList.length === 0) {
        onClose();
        return;
    }

    onConfirm(changeList);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-stone-800 bg-stone-900/50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <ShirtIcon className="w-6 h-6 text-amber-400" />
                장면별 의상 일괄 설정 (Batch Costume Editor)
            </h2>
            <p className="text-sm text-stone-400 mt-1">각 장면(Scene)에 적용할 캐릭터별 의상을 설정하세요. 입력하지 않은 칸은 기존 의상이 유지됩니다.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-800 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar bg-stone-950">
            {scenes.map((scene) => {
                // Determine which characters appear in this scene
                const presentChars = Object.values(characterDescriptions).filter(char => 
                    scene.cuts.some(c => c.character.includes(char.koreanName))
                );
                
                if (presentChars.length === 0) return null; // Skip scenes with no known characters

                return (
                    <div key={scene.sceneNumber} className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-sm hover:border-stone-700 transition-colors">
                        <div className="flex items-center gap-3 mb-4 border-b border-stone-800 pb-2">
                            <span className="bg-stone-800 text-stone-300 text-xs font-bold px-2 py-1 rounded">SCENE {scene.sceneNumber}</span>
                            <h3 className="text-sm font-bold text-white truncate">{scene.title}</h3>
                            <span className="text-xs text-stone-500 ml-auto">{scene.cuts[0]?.location}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {presentChars.map(char => {
                                const hint = extractOutfitText(scene.cuts.find(c => c.character.includes(char.koreanName))?.characterOutfit || '', char.koreanName);
                                return (
                                    <div key={char.koreanName} className="space-y-1.5">
                                        <label className="text-xs font-bold text-stone-400 flex items-center gap-1.5">
                                            <UserIcon className="w-3 h-3" /> {char.koreanName}
                                        </label>
                                        <textarea
                                            value={changes[`${scene.sceneNumber}-${char.koreanName}`] || ''}
                                            onChange={(e) => handleOutfitChange(scene.sceneNumber, char.koreanName, e.target.value)}
                                            rows={2}
                                            className="w-full p-2.5 bg-stone-800/50 rounded-lg border border-stone-700 text-xs text-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-all placeholder:text-stone-600 resize-none"
                                            placeholder={hint ? `현재: ${hint.substring(0, 30)}...` : '의상 입력...'}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-stone-800 bg-stone-900/50 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-stone-400 hover:text-white transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            <CheckIcon className="w-4 h-4" />
            변경된 의상 일괄 적용
          </button>
        </div>
      </div>
    </div>
  );
};
