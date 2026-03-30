import React, { useState, useRef } from 'react';
import { ClosetCharacter } from '../types';
import { XIcon, UploadIcon, TrashIcon, SpinnerIcon } from './icons';

interface CharacterClosetModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: ClosetCharacter[];
  onSelect: (character: ClosetCharacter) => void;
  onUpload: (name: string, imageDataUrl: string) => Promise<void>;
  onDelete: (id: string) => void;
  isReplacementMode: boolean;
}

export const CharacterClosetModal: React.FC<CharacterClosetModalProps> = ({
  isOpen,
  onClose,
  characters,
  onSelect,
  onUpload,
  onDelete,
  isReplacementMode,
}) => {
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterImage, setNewCharacterImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCharacterImage(reader.result as string);
      };
      reader.readAsDataURL(file);
      if (!newCharacterName) {
        setNewCharacterName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSave = async () => {
    if (!newCharacterName || !newCharacterImage) {
      alert('인물 이름과 이미지를 모두 선택해주세요.');
      return;
    }
    setIsUploading(true);
    try {
      await onUpload(newCharacterName, newCharacterImage);
      setNewCharacterName('');
      setNewCharacterImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error("Upload failed", error);
      alert('업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    onDelete(id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
      <div className="bg-stone-800 rounded-2xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
        <div className="flex justify-between items-center p-4 border-b border-stone-700">
          <h2 className="text-xl font-bold text-white">
            인물 라이브러리 {isReplacementMode && <span className="text-base font-normal text-orange-400">(교체할 인물 선택)</span>}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="flex flex-grow overflow-hidden">
          <div className="w-2/3 p-4 overflow-y-auto border-r border-stone-700">
            <h3 className="font-semibold text-stone-300 mb-2">
              {isReplacementMode ? '저장된 인물 (클릭하여 선택)' : '저장된 인물'}
            </h3>
            {characters.length === 0 ? (
                <p className="text-stone-400 text-center mt-8">라이브러리가 비어있습니다. 우측 패널에서 새 인물을 업로드하세요.</p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {characters.map(char => (
                    <div key={char.id} className="group relative">
                        <img
                            src={char.imageDataUrl}
                            alt={char.name}
                            onClick={() => isReplacementMode && onSelect(char)}
                            className={`w-full aspect-square object-cover rounded-lg ${isReplacementMode ? 'cursor-pointer transition-transform duration-200 group-hover:scale-105' : 'cursor-default'}`}
                        />
                        <p className="text-xs text-center mt-1 truncate text-stone-300">{char.name}</p>
                        <button 
                            onClick={() => handleDelete(char.id, char.name)}
                            className="absolute top-1 right-1 p-1 bg-red-600/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            title="삭제"
                        >
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                </div>
            )}
          </div>
          <div className="w-1/3 p-4 bg-stone-800/50 flex flex-col">
            <div className="space-y-4">
                <h3 className="font-semibold text-stone-300">파일에서 새 인물 추가</h3>
                <div 
                    onClick={handleUploadClick}
                    className="w-full aspect-square bg-stone-700 rounded-lg flex items-center justify-center cursor-pointer border-2 border-dashed border-stone-500 hover:border-orange-500"
                >
                    {newCharacterImage ? (
                        <img src={newCharacterImage} alt="Preview" className="w-full h-full object-cover rounded-md" />
                    ) : (
                        <div className="text-center text-stone-400">
                            <UploadIcon className="w-10 h-10 mx-auto mb-2" />
                            <p className="text-sm">이미지 선택</p>
                        </div>
                    )}
                </div>
                <input type="file" accept="image/png, image/jpeg, image/webp" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <div>
                    <label htmlFor="char-name" className="block text-sm font-medium text-stone-300 mb-1">인물 이름</label>
                    <input
                        id="char-name"
                        type="text"
                        value={newCharacterName}
                        onChange={(e) => setNewCharacterName(e.target.value)}
                        className="w-full p-2 bg-stone-700 rounded-md text-sm text-stone-200 border border-stone-500 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="예: 주인공 (평상복)"
                    />
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={isUploading || !newCharacterImage || !newCharacterName}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-orange-400"
                >
                    {isUploading ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <UploadIcon className="w-5 h-5 mr-2" />}
                    {isUploading ? '저장 중...' : '업로드하여 라이브러리에 저장'}
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};