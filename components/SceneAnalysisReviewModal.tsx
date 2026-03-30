
import React from 'react';
import { EditableScene } from '../types';
import { XIcon, SparklesIcon, CheckIcon, RefreshIcon, VideoCameraIcon, SpinnerIcon } from './icons';

interface SceneAnalysisReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: EditableScene[];
  onConfirm: () => void;
  onRegenerate: () => void;
  isLoading: boolean;
}

export const SceneAnalysisReviewModal: React.FC<SceneAnalysisReviewModalProps> = ({ 
    isOpen, 
    onClose, 
    scenes, 
    onConfirm, 
    onRegenerate, 
    isLoading 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" aria-modal="true" role="dialog">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-stone-700 bg-stone-800/50 flex-shrink-0 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <VideoCameraIcon className="w-8 h-8 text-orange-400" />
              1차 대본 분석 결과
            </h2>
            <p className="text-sm text-stone-400 mt-1">AI가 분석한 장면(Scene)과 장소 구분이 맞는지 확인하세요.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700 transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-grow p-6 overflow-y-auto bg-stone-900 space-y-4">
            <div className="bg-orange-900/20 border border-orange-800 p-4 rounded-lg flex items-start gap-3">
                <div className="p-2 bg-orange-900/50 rounded-full">
                    <SparklesIcon className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                    <h4 className="font-bold text-orange-300 text-sm">확인 팁</h4>
                    <p className="text-sm text-orange-200/70 mt-1">
                        장소나 시간이 바뀔 때마다 새로운 씬(Scene)으로 나뉘었나요? <br/>
                        결과가 마음에 들지 않으면 <b>'재분석'</b> 버튼을 눌러보세요. AI가 다른 방식으로 해석합니다.
                    </p>
                </div>
            </div>

            <div className="grid gap-4">
                {scenes.map((scene) => (
                    <div key={scene.sceneNumber} className="bg-stone-800 p-4 rounded-xl border border-stone-700 hover:border-orange-500/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="bg-stone-700 px-2 py-0.5 rounded text-sm text-stone-300">SCENE {scene.sceneNumber}</span>
                                {scene.title}
                            </h3>
                            <span className="text-xs font-mono text-stone-500">{scene.cuts.length} CUTS</span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-orange-400 font-bold">📍 장소:</span>
                                <span className="text-stone-300 bg-stone-900/50 px-2 py-0.5 rounded border border-stone-700">{scene.cuts[0]?.location || '미정'}</span>
                            </div>
                            <p className="text-sm text-stone-400 italic border-l-2 border-stone-600 pl-3 py-1">
                                {scene.cuts[0]?.narrationText ? `"${scene.cuts[0].narrationText.substring(0, 50)}${scene.cuts[0].narrationText.length > 50 ? '...' : ''}"` : '(지문/연출 전용 컷)'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Footer */}
        <footer className="p-5 bg-stone-800 border-t border-stone-700 flex justify-between items-center flex-shrink-0 rounded-b-2xl">
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors disabled:opacity-50"
          >
            {isLoading ? <SpinnerIcon className="w-4 h-4"/> : <RefreshIcon className="w-4 h-4" />}
            {isLoading ? '분석 중...' : '마음에 안 들어요 (전체 재분석)'}
          </button>
          
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-8 py-3 text-lg font-bold rounded-lg text-white bg-orange-600 hover:bg-orange-500 transition-all shadow-lg hover:shadow-orange-500/30 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none"
          >
            <CheckIcon className="w-6 h-6" />
            <span>좋아요! 캐릭터 설정하기</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
