import React, { useState, useMemo, useEffect } from 'react';
import { Cut, Scene } from '../types';
import { XIcon, SparklesIcon } from './icons';

interface CutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  onConfirm: (selectedCutNumbers: string[]) => void;
}

export const CutSelectionModal: React.FC<CutSelectionModalProps> = ({ isOpen, onClose, scenes, onConfirm }) => {
  const allCuts = useMemo(() => scenes.flatMap(scene => scene.cuts || []).filter(Boolean), [scenes]);
  const allCutNumbers = useMemo(() => allCuts.map(cut => cut.cutNumber), [allCuts]);

  const [selectedCuts, setSelectedCuts] = useState<string[]>([]);

  useEffect(() => {
    // 모달이 열릴 때마다 선택을 초기화합니다.
    if (isOpen) {
      setSelectedCuts([]);
    }
  }, [isOpen]);


  const handleToggleCut = (cutNumber: string) => {
    setSelectedCuts(prev => 
      prev.includes(cutNumber)
        ? prev.filter(cn => cn !== cutNumber)
        : [...prev, cutNumber]
    );
  };

  const handleSelectAll = () => {
    setSelectedCuts(allCutNumbers);
  };

  const handleDeselectAll = () => {
    setSelectedCuts([]);
  };

  const handleConfirm = () => {
    onConfirm(selectedCuts);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-2xl h-[85vh] flex flex-col">
        <header className="flex justify-between items-center p-4 border-b border-zinc-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">자동 생성할 컷 선택</h2>
          <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700"><XIcon className="w-6 h-6" /></button>
        </header>

        <div className="p-4 flex-shrink-0 flex justify-between items-center border-b border-zinc-700">
            <p className="text-sm text-zinc-400">{selectedCuts.length} / {allCuts.length}개 컷 선택됨</p>
            <div className="flex gap-2">
                <button onClick={handleSelectAll} className="px-3 py-1 text-xs font-semibold rounded-md bg-zinc-600 hover:bg-zinc-500">전체 선택</button>
                <button onClick={handleDeselectAll} className="px-3 py-1 text-xs font-semibold rounded-md bg-zinc-600 hover:bg-zinc-500">전체 해제</button>
            </div>
        </div>

        <main className="flex-grow p-4 overflow-y-auto space-y-4">
          {scenes.map(scene => (
            <div key={scene.sceneNumber}>
                <h3 className="font-bold text-orange-400 mb-2">Scene #{scene.sceneNumber}: {scene.title}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {(scene.cuts || []).filter(Boolean).map(cut => (
                        <label key={cut.cutNumber} className={`p-2 rounded-md text-center cursor-pointer transition-colors font-mono text-sm ${selectedCuts.includes(cut.cutNumber) ? 'bg-zinc-700 text-white font-semibold' : 'bg-zinc-800 text-zinc-400 border border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500'}`} title={`Cut #${cut.cutNumber}: ${cut.narration}`}>
                            <input 
                                type="checkbox"
                                checked={selectedCuts.includes(cut.cutNumber)}
                                onChange={() => handleToggleCut(cut.cutNumber)}
                                className="hidden"
                            />
                            <span>#{cut.cutNumber}</span>
                        </label>
                    ))}
                </div>
            </div>
          ))}
        </main>
        
        <footer className="p-4 bg-zinc-900/50 border-t border-zinc-700 flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={selectedCuts.length === 0}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-bold rounded-lg text-white bg-orange-600 hover:bg-orange-500 transition-colors disabled:opacity-50"
          >
            <SparklesIcon className="w-5 h-5"/>
            선택한 {selectedCuts.length}개 컷 생성 시작
          </button>
        </footer>
      </div>
    </div>
  );
};