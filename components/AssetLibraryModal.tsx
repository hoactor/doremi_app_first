
import React, { useState, useMemo, useRef } from 'react';
import { LibraryAsset } from '../types';
import { XIcon, UploadIcon, TrashIcon, DownloadIcon } from './icons';

interface AssetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: LibraryAsset[];
  onSelect: (asset: LibraryAsset) => void;
  onDelete: (id: string) => void;
  onImportFromFile: (file: File) => void;
  mode?: 'background' | 'guest' | 'normal';
}

export const AssetLibraryModal: React.FC<AssetLibraryModalProps> = ({
  isOpen,
  onClose,
  assets,
  onSelect,
  onDelete,
  onImportFromFile,
  mode = 'normal',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'character' | 'background'>('all');
  const importFileRef = useRef<HTMLInputElement>(null);

  // When replacement mode is activated, automatically filter to show only backgrounds.
  React.useEffect(() => {
    if (mode === 'background') {
      setCategoryFilter('background');
    } else if (mode === 'guest') {
      setCategoryFilter('character');
    } else {
      setCategoryFilter('all');
    }
  }, [mode]);


  const filteredAssets = useMemo(() => {
    const sortedAssets = [...assets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return sortedAssets.filter(asset => {
      // Category Filter
      if (categoryFilter !== 'all') {
        const assetCategory = asset.tags.category || [];
        const targetCategory = categoryFilter === 'character' ? '인물' : '배경';
        if (!assetCategory.includes(targetCategory)) {
          return false;
        }
      }

      // Search Term Filter
      if (!searchTerm.trim()) {
        return true;
      }
      const lowercasedTerm = searchTerm.toLowerCase();
      const tags = asset.tags;
      const tagString = [
        ...(tags.location || []),
        ...(tags.objects || []),
        ...(tags.mood || []),
        ...(tags.category || []),
        tags.time || ''
      ].join(' ').toLowerCase();
      
      return (
        asset.prompt.toLowerCase().includes(lowercasedTerm) ||
        tagString.includes(lowercasedTerm) ||
        asset.source.name.toLowerCase().includes(lowercasedTerm)
      );
    });
  }, [assets, searchTerm, categoryFilter]);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation(); // Prevent onSelect from firing
    if (window.confirm(`'${name}'에서 생성된 이 에셋을 삭제하시겠습니까?`)) {
      onDelete(id);
    }
  };
  
  const handleDownload = (e: React.MouseEvent, asset: LibraryAsset) => {
      e.stopPropagation();
      const link = document.createElement('a');
      link.href = asset.imageDataUrl;
      link.download = `${asset.source.name.replace(/\s+/g, '_')}_${asset.id.substring(0, 4)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }
  
  const handleImportClick = () => {
    importFileRef.current?.click();
  }
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
        onImportFromFile(e.target.files[0]);
        e.target.value = '';
      }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-stone-800 rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        <input type="file" ref={importFileRef} className="hidden" accept="image/*" onChange={handleFileChange} />
        <div className="flex justify-between items-center p-4 border-b border-stone-700">
          <h2 className="text-xl font-bold text-white">에셋 라이브러리</h2>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 border-b border-stone-700 flex justify-between items-center gap-4">
            <input
                type="text"
                placeholder="태그(예: 인물, 배경), 프롬프트, 출처로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 bg-stone-700 rounded-md text-sm border border-stone-600 focus:ring-orange-500"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setCategoryFilter('all')} disabled={mode !== 'normal'} className={`px-3 py-1 text-sm rounded-full ${categoryFilter === 'all' ? 'bg-orange-600 text-white' : 'bg-stone-600 hover:bg-stone-500'} ${mode !== 'normal' ? 'cursor-not-allowed opacity-50' : ''}`}>전체</button>
                <button onClick={() => setCategoryFilter('character')} disabled={mode !== 'normal'} className={`px-3 py-1 text-sm rounded-full ${categoryFilter === 'character' ? 'bg-orange-600 text-white' : 'bg-stone-600 hover:bg-stone-500'} ${mode !== 'normal' ? 'cursor-not-allowed opacity-50' : ''}`}>인물</button>
                <button onClick={() => setCategoryFilter('background')} disabled={mode !== 'normal'} className={`px-3 py-1 text-sm rounded-full ${categoryFilter === 'background' ? 'bg-orange-600 text-white' : 'bg-stone-600 hover:bg-stone-500'} ${mode !== 'normal' ? 'cursor-not-allowed opacity-50' : ''}`}>배경</button>
                <button onClick={handleImportClick} className="inline-flex items-center px-3 py-1 text-sm rounded-full bg-orange-600 text-white hover:bg-orange-700">
                  <UploadIcon className="w-4 h-4 mr-1" />
                  파일에서 추가
                </button>
            </div>
        </div>

        <div className="flex-grow p-4 overflow-y-auto">
          {mode === 'background' && <p className="mb-4 text-center text-orange-400 font-semibold bg-orange-900/30 p-2 rounded-md">교체할 배경을 선택하세요.</p>}
          {mode === 'guest' && <p className="mb-4 text-center text-orange-400 font-semibold bg-orange-900/30 p-2 rounded-md">게스트로 추가할 인물 이미지를 선택하세요.</p>}
          {filteredAssets.length === 0 ? (
            <p className="text-stone-400 text-center mt-8">
              {assets.length === 0 ? '라이브러리가 비어있습니다. DALL-E로 이미지를 생성하면 자동으로 추가됩니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredAssets.map(asset => (
                <div key={asset.id} className="group relative" onClick={() => onSelect(asset)}>
                  <div className="aspect-square w-full bg-stone-700 rounded-lg overflow-hidden">
                    <img
                      src={asset.imageDataUrl}
                      alt={asset.prompt}
                      className="w-full h-full object-cover rounded-lg cursor-pointer transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end text-white text-xs rounded-lg">
                     <p className="font-bold truncate" title={asset.prompt}>{asset.prompt}</p>
                     <p className="text-stone-300">출처: {asset.source.name}</p>
                  </div>
                  <button 
                    onClick={(e) => handleDownload(e, asset)}
                    className="absolute top-1 left-1 p-1.5 bg-green-600/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="에셋 다운로드"
                  >
                    <DownloadIcon className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, asset.id, asset.source.name)}
                    className="absolute top-1 right-1 p-1.5 bg-red-600/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="에셋 삭제"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
