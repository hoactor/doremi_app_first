import React from 'react';
import { Scene } from '../types';
import { XIcon } from './icons';

interface CutAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  onConfirm: (cutNumber: string) => void;
  title?: string;
  description?: string;
}

export const CutAssignmentModal: React.FC<CutAssignmentModalProps> = ({
  isOpen,
  onClose,
  scenes,
  onConfirm,
  title,
  description,
}) => {
  if (!isOpen) {
    return null;
  }

  const handleConfirm = (cutNumber: string) => {
    onConfirm(cutNumber);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 z-[90] flex items-center justify-center p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-2xl h-[85vh] flex flex-col">
        <header className="flex justify-between items-center p-4 border-b border-zinc-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">{title || '컷 할당'}</h2>
          <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <p className="text-sm text-zinc-400 p-4 bg-zinc-900/50 flex-shrink-0">
          {description || '새로 생성된 이미지를 할당할 컷을 선택해주세요.'}
        </p>
        
        <main className="flex-grow p-4 overflow-y-auto space-y-4">
          {scenes.map(scene => (
            <div key={scene.sceneNumber}>
                <h3 className="font-bold text-orange-400 mb-2">Scene #{scene.sceneNumber}: {scene.title}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {(scene.cuts || []).filter(Boolean).map(cut => (
                        <button 
                            key={cut.cutNumber} 
                            onClick={() => handleConfirm(cut.cutNumber)}
                            className="p-2 rounded-md text-center cursor-pointer transition-colors font-mono text-sm bg-zinc-800 text-zinc-400 border border-zinc-600 hover:bg-zinc-700 hover:border-zinc-500"
                            title={`Cut #${cut.cutNumber}: ${cut.narration}`}
                        >
                            <span>#{cut.cutNumber}</span>
                        </button>
                    ))}
                </div>
            </div>
          ))}
        </main>

        <footer className="p-4 bg-zinc-900/50 border-t border-zinc-700 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold rounded-lg bg-zinc-600 hover:bg-zinc-500 text-white"
          >
            취소
          </button>
        </footer>
      </div>
    </div>
  );
};