
import React, { useState } from 'react';
import { XIcon, CheckIcon, SparklesIcon } from './icons';
import { useAppContext } from '../AppContext';

interface StyleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (style: 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto', customText: string) => void;
}

const NORMAL_STYLE_TEXT = `[핵심 연출] 인물들의 담백한 리액션과 화사한 미모를 가장 균형 있게 표현합니다.
- 캐릭터 비율 1:7 (표준형)
- 감정 표현: 인물의 표정보다는 만화적 기호(땀방울, 반짝임)를 70% 비중으로 사용
- 모바일 가독성에 최적화된 깨끗한 선화 스타일`;

const VIBRANT_STYLE_TEXT = `[핵심 연출] 시청자의 시각적 자극을 극대화합니다. 인물의 실루엣과 조명 효과를 강조하여 도파민 발산을 유도합니다.
- 캐릭터 비율 1:5~1:6 (성숙형)
- 감정 표현: 시네마틱한 명암 대비와 강렬한 눈빛 강조
- 성인 타겟의 고퀄리티 웹툰 연출에 최적화`;

const KYOTO_STYLE_TEXT = `[핵심 연출] 섬세한 작화에 선명하고 화사한 색감을 더해 '칙칙함'을 완전히 제거했습니다.
- 색감: (Vivid Soft) 회색기를 걷어내고, 신카이 마코토 풍의 쨍하고 투명한 고채도 컬러 사용
- 디테일: 쿄애니 특유의 작화 밀도는 유지하되, 명암 대비를 높여 시원한 느낌 강조
- 분위기: 흐린 날씨가 갠 듯한 청량하고 맑은 고퀄리티 애니메이션 무드`;

const MOE_STYLE_TEXT = `[핵심 연출] 캐릭터의 귀여움을 극대화하여 쇼츠 특유의 빠른 호흡과 개그 연출을 강화합니다.
- 캐릭터 비율 1:2 (SD/치비)
- 감정 표현: 거대한 식은땀, 분노 마크, 하트 눈 등 '만푸' 기호를 90% 이상 활용
- 캔디 컬러 톤의 팝한 색감`;

const DALLE_CHIBI_STYLE_TEXT = `[핵심 연출] 굿즈나 캐릭터 카드 수준의 프리미엄 일러스트를 제공합니다.
- 캐릭터 비율 1:3 (프리미엄 치비)
- 색감: (Warm & Blooming) 로즈골드, 앰버, 파스텔 핑크 등 따뜻하고 몽환적인 필터 적용
- 조명: 캐릭터 뒤에서 비추는 화사한 역광(Backlight)과 뽀샤시한 블룸(Bloom) 효과
- 디테일: 보석 같은 눈동자, 섬세한 머릿결, 공중에 떠다니는 빛 입자`;

interface StyleOptionProps {
    value: 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto';
    title: string;
    description: string;
    styleText: string;
    isSelected: boolean;
    onSelect: (value: 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto') => void;
    isLast?: boolean;
}

const StyleOption: React.FC<StyleOptionProps> = ({ value, title, description, styleText, isSelected, onSelect, isLast=false }) => (
      <div className="relative">
          {!isLast && <div className="absolute left-[9px] top-6 bottom-[-1rem] w-px bg-stone-700 z-0"></div>}
          
          <div className="relative flex items-start">
              <div className="absolute left-0 top-1 flex flex-col items-center">
                  <input
                      type="radio"
                      name="style-option"
                      checked={isSelected}
                      onChange={() => onSelect(value)}
                      className="w-5 h-5 text-orange-600 bg-stone-700 border-stone-500 focus:ring-orange-500 cursor-pointer z-10"
                  />
              </div>

              <label
                  className={`ml-8 w-full p-4 border-2 rounded-xl cursor-pointer transition-all ${isSelected ? 'border-orange-500 bg-orange-900/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-stone-700 hover:border-stone-500 bg-stone-800/40'}`}
                  onClick={() => onSelect(value)}
              >
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="font-bold text-white text-lg">{title}</p>
                          <p className="text-sm text-stone-400 mt-1">{description}</p>
                      </div>
                      {isSelected && <SparklesIcon className="w-5 h-5 text-orange-400 animate-pulse" />}
                  </div>
                  <div className="mt-3 p-3 bg-black/40 rounded-lg text-xs text-stone-300 font-medium leading-relaxed whitespace-pre-wrap border border-stone-700/50">
                      {styleText}
                  </div>
              </label>
          </div>
      </div>
);

export const StyleSelectionModal: React.FC<StyleSelectionModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { state } = useAppContext();
  // Set default selection to 'custom' and pre-fill customText from context
  const [selectedStyle, setSelectedStyle] = useState<'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto'>(state.artStyle || 'custom');
  const [customText, setCustomText] = useState(state.customArtStyle || '');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedStyle, customText);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-stone-900 border border-stone-700 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <header className="flex justify-between items-center p-6 border-b border-stone-800 bg-stone-900/50 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Visual Strategy Selection</h2>
            <p className="text-xs text-stone-500 mt-1 font-bold uppercase tracking-widest">흥행을 위한 최적의 화풍을 선택하세요</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700 transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-grow">
          <div className="space-y-4">
            <StyleOption
              value="normal"
              title="정통 썰툰 (Standard)"
              description="[추천] 동질감과 도파민의 황금 밸런스"
              styleText={NORMAL_STYLE_TEXT}
              isSelected={selectedStyle === 'normal'}
              onSelect={setSelectedStyle}
            />
             <StyleOption
              value="vibrant"
              title="도파민 로맨스 (Mature)"
              description="매력적인 캐릭터의 비주얼을 극대화하는 성인향 연출"
              styleText={VIBRANT_STYLE_TEXT}
              isSelected={selectedStyle === 'vibrant'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="kyoto"
              title="감성 작화 (Kyoto Animation)"
              description="빛과 눈동자의 디테일이 살아있는 고품질 애니메이션"
              styleText={KYOTO_STYLE_TEXT}
              isSelected={selectedStyle === 'kyoto'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="moe"
              title="극강 귀요미 SD (Shorts)"
              description="인물의 리액션을 기호로 극대화하는 개그 연출"
              styleText={MOE_STYLE_TEXT}
              isSelected={selectedStyle === 'moe'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="dalle-chibi"
              title="프리미엄 캐릭터 (Premium)"
              description="소장 가치가 높은 고밀도 일러스트 스타일"
              styleText={DALLE_CHIBI_STYLE_TEXT}
              isSelected={selectedStyle === 'dalle-chibi'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="custom"
              title="커스텀 스타일"
              description="원하는 연출 방식을 직접 정의"
              styleText="아래 텍스트 창에 직접 입력하세요."
              isSelected={selectedStyle === 'custom'}
              onSelect={setSelectedStyle}
              isLast={true}
            />
          </div>
          {selectedStyle === 'custom' && (
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={10}
              className="w-full p-4 bg-stone-950/50 rounded-xl text-sm text-stone-200 border border-stone-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-inner leading-relaxed"
              placeholder="여기에 화풍 프롬프트를 입력하세요..."
            />
          )}
        </main>
        <footer className="p-6 bg-stone-900 border-t border-stone-800 flex justify-end flex-shrink-0">
          <button 
            onClick={handleConfirm} 
            className="flex items-center gap-3 px-10 py-4 font-black text-white bg-orange-600 hover:bg-orange-500 rounded-2xl shadow-[0_0_20px_rgba(234,88,12,0.4)] transition-all active:scale-95 uppercase tracking-tighter"
          >
            <CheckIcon className="w-6 h-6" />
            Apply Strategy
          </button>
        </footer>
      </div>
    </div>
  );
};
