import React, { useState, useEffect } from 'react';
import { TextEditingTarget } from '../types';
import { XIcon, SpinnerIcon } from './icons';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: TextEditingTarget;
  onRender: (
    target: TextEditingTarget,
    text: string,
    textType: 'speech' | 'narration',
    characterName?: string
  ) => Promise<void>;
}

export const TextEditorModal: React.FC<TextEditorModalProps> = ({ isOpen, onClose, target, onRender }) => {
  const [text, setText] = useState('');
  const [textType, setTextType] = useState<'speech' | 'narration'>('speech');
  const [characterName, setCharacterName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (target) {
      // Reset state when target changes
      setText('');
      setTextType('speech');
      // Default to the first character if available
      if (target.characters && target.characters.length > 0) {
        setCharacterName(target.characters[0]);
      } else {
        setCharacterName('');
      }
    }
  }, [target]);

  if (!isOpen || !target) return null;

  const handleSubmit = async () => {
    if (!text.trim()) {
      alert('텍스트를 입력해주세요.');
      return;
    }
    if (textType === 'speech' && !characterName) {
      alert('말하는 인물을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await onRender(target, text, textType, characterName);
      onClose(); // Close modal on success
    } catch (error) {
      // Error notification is handled in App.tsx
      console.error("Text rendering failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
      <div className="bg-stone-800 border border-stone-700 rounded-2xl shadow-xl w-full max-w-lg flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
        <div className="flex justify-between items-center p-4 border-b border-stone-700">
          <h2 className="text-xl font-bold text-white">텍스트 추가</h2>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <img src={target.imageUrl} alt="Target image" className="w-24 h-24 object-cover rounded-md border-2 border-stone-600" />
            <div>
                <p className="text-sm text-stone-400">컷 #{target.cutNumber}</p>
                <p className="font-semibold text-white">이미지에 텍스트를 추가합니다.</p>
            </div>
          </div>
          
          <div>
            <label htmlFor="text-content" className="block text-sm font-medium text-stone-300 mb-1">내용</label>
            <textarea
              id="text-content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full p-2 bg-stone-700/50 rounded-md border border-stone-600 text-sm text-stone-200 focus:ring-orange-500"
              placeholder="대사 또는 나레이션을 입력하세요..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">종류</label>
            <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="textType" value="speech" checked={textType === 'speech'} onChange={() => setTextType('speech')} className="form-radio h-4 w-4 text-orange-600 bg-stone-700 border-stone-500"/>
                    말풍선
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="textType" value="narration" checked={textType === 'narration'} onChange={() => setTextType('narration')} className="form-radio h-4 w-4 text-orange-600 bg-stone-700 border-stone-500"/>
                    나레이션
                </label>
            </div>
          </div>
          
          {textType === 'speech' && (
            <div>
              <label htmlFor="character-select" className="block text-sm font-medium text-stone-300 mb-1">말하는 인물</label>
              <select
                id="character-select"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className="w-full p-2 bg-stone-700/50 rounded-md border border-stone-600 text-sm text-stone-200 focus:ring-orange-500 appearance-none"
                disabled={target.characters.length === 0}
              >
                {target.characters.length > 0 ? (
                    target.characters.map(char => <option key={char} value={char}>{char}</option>)
                ) : (
                    <option>인물 없음</option>
                )}
              </select>
            </div>
          )}
        </div>

        <div className="p-4 bg-stone-900/50 border-t border-stone-700 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full flex items-center justify-center px-6 py-3 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
          >
            {isLoading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : null}
            {isLoading ? '생성 중...' : 'AI로 텍스트 렌더링'}
          </button>
        </div>
      </div>
    </div>
  );
};
