import React, { useMemo } from 'react';
import { XIcon, CheckIcon, ScissorsIcon } from './icons';
import { normalizeScriptCuts } from '../services/geminiService';

interface CutPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    script: string;
}

export const CutPreviewModal: React.FC<CutPreviewModalProps> = ({ isOpen, onClose, onConfirm, script }) => {
    if (!isOpen) return null;

    const cuts = useMemo(() => {
        const normalized = normalizeScriptCuts(script);
        return normalized.split('\n').filter(line => line.trim() !== '');
    }, [script]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
                <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <ScissorsIcon className="w-6 h-6 text-orange-400" />
                        컷 분할 미리보기
                    </h2>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 bg-zinc-950">
                    <div className="mb-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                        <p className="text-sm text-orange-300 leading-relaxed">
                            입력하신 대본이 아래와 같이 <strong>{cuts.length}개의 컷</strong>으로 나뉘어 AI에게 전달됩니다. 
                            <br/>각 블록이 하나의 독립된 장면(컷)으로 생성됩니다. 의도한 대로 나뉘었는지 확인해 주세요.
                        </p>
                    </div>
                    
                    <div className="space-y-3">
                        {cuts.map((cut, index) => (
                            <div key={index} className="flex gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                                <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-zinc-800 rounded-lg font-mono text-sm font-bold text-zinc-400">
                                    #{index + 1}
                                </div>
                                <div className="flex-1 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {cut}
                                </div>
                            </div>
                        ))}
                        {cuts.length === 0 && (
                            <div className="text-center p-8 text-zinc-500">
                                입력된 대본이 없습니다.
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                    >
                        대본 수정하기
                    </button>
                    <button 
                        onClick={() => {
                            onClose();
                            onConfirm();
                        }}
                        disabled={cuts.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white bg-orange-600 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <CheckIcon className="w-5 h-5" />
                        확인 및 스튜디오 시작
                    </button>
                </div>
            </div>
        </div>
    );
};
