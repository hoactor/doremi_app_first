
import React, { useState } from 'react';
import { XIcon, CheckIcon, SparklesIcon } from './icons';
import { useAppContext } from '../AppContext';

interface StyleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (style: 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto', customText: string) => void;
}

const GLOW_CHIBI_STYLE_TEXT = `[핵심 연출] 굿즈나 캐릭터 카드 수준의 프리미엄 일러스트를 제공합니다.
- 캐릭터 비율 1:2.5 (프리미엄 SD)
- 색감: 로즈골드, 앰버, 파스텔 핑크 — 따뜻하고 몽환적인 워밍 필터
- 조명: 캐릭터 뒤에서 비추는 화사한 역광(Backlight)과 블룸(Bloom) 효과
- 디테일: 보석 같은 눈동자, 섬세한 머릿결, 공중에 떠다니는 빛 입자`;

const PASTEL_CHIBI_STYLE_TEXT = `[핵심 연출] LINE 스티커·산리오 느낌의 극강 귀여움.
- 캐릭터 비율 1:2.5 (SD/치비)
- 색감: 순수 파스텔 — 베이비 핑크, 크림 옐로우, 라벤더, 민트
- 렌더링: 완전 평면 단색 채움, 그라디언트 없음
- 선화: 굵고 둥근 갈색/보라 아웃라인, 스티커처럼 모든 형태 테두리`;

const CINEMA_MOOD_STYLE_TEXT = `[핵심 연출] 바이올렛 에버가든 수준의 극장판 퀄리티.
- 캐릭터 비율 1:6~7 (사실적)
- 색감: 투명하고 맑은 고채도 — 공기가 보이는 느낌
- 조명: 시네마틱 자연광, 머리카락 한 올 한 올에 빛이 감싸는 림 라이팅
- 감정: 미세한 눈빛/입술 변화로 전달 (만화적 과장 없음)`;

const SPARKLE_GLAM_STYLE_TEXT = `[핵심 연출] 최애의 아이 스타일 — 스타 파워와 글래머러스 매력.
- 캐릭터 비율 1:7~8 (성인 등신)
- 눈동자: 별/하트/은하수 등 장식 요소가 들어간 보석 같은 눈
- 조명: 무대 스팟라이트 + 컬러 림 라이트 (핑크/퍼플/블루)
- 체형: 글래머러스한 실루엣 강조, 아이돌 화보 분위기`;

const CLEAN_WEBTOON_STYLE_TEXT = `[핵심 연출] 가독성 최우선의 깔끔한 한국 웹툰 스타일.
- 캐릭터 비율 1:6~7 (표준형)
- 렌더링: 2단 셀셰이딩 (기본색 + 그림자 1단계), 날카로운 경계
- 선화: 균일한 검정 아웃라인, 기계적이고 정밀한 펜툴 느낌
- 감정: 땀방울, 분노맥 등 만화적 기호로 표현`;

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
          {!isLast && <div className="absolute left-[9px] top-6 bottom-[-1rem] w-px bg-zinc-700 z-0"></div>}
          
          <div className="relative flex items-start">
              <div className="absolute left-0 top-1 flex flex-col items-center">
                  <input
                      type="radio"
                      name="style-option"
                      checked={isSelected}
                      onChange={() => onSelect(value)}
                      className="w-5 h-5 accent-teal-500 bg-zinc-700 border-zinc-500 focus:ring-teal-500 cursor-pointer z-10"
                  />
              </div>

              <label
                  className={`ml-8 w-full p-4 border-2 rounded-xl cursor-pointer transition-all ${isSelected ? 'border-orange-500 bg-orange-900/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/40'}`}
                  onClick={() => onSelect(value)}
              >
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="font-bold text-white text-lg">{title}</p>
                          <p className="text-sm text-zinc-400 mt-1">{description}</p>
                      </div>
                      {isSelected && <SparklesIcon className="w-5 h-5 text-teal-400 animate-pulse" />}
                  </div>
                  <div className="mt-3 p-3 bg-black/40 rounded-lg text-xs text-zinc-300 font-medium leading-relaxed whitespace-pre-wrap border border-zinc-700/50">
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <header className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Visual Strategy Selection</h2>
            <p className="text-xs text-zinc-500 mt-1 font-bold uppercase tracking-widest">흥행을 위한 최적의 화풍을 선택하세요</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700 transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-grow">
          <div className="space-y-4">
            <StyleOption
              value="dalle-chibi"
              title="프리미엄 (프리미엄)"
              description="따뜻한 빛번짐과 블룸이 특징인 고급 SD 일러스트"
              styleText={GLOW_CHIBI_STYLE_TEXT}
              isSelected={selectedStyle === 'dalle-chibi'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="moe"
              title="극강 귀요미 (극강 귀요미)"
              description="편평한 파스텔 면채움과 굵은 선의 스티커 느낌 SD"
              styleText={PASTEL_CHIBI_STYLE_TEXT}
              isSelected={selectedStyle === 'moe'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="kyoto"
              title="시네마 감성 (감성)"
              description="투명한 빛과 섬세한 감정의 극장판 퀄리티 애니메이션"
              styleText={CINEMA_MOOD_STYLE_TEXT}
              isSelected={selectedStyle === 'kyoto'}
              onSelect={setSelectedStyle}
            />
            <StyleOption
              value="vibrant"
              title="도파민 (도파민)"
              description="최애의 아이 스타일 — 별 눈동자와 글래머러스한 연출"
              styleText={SPARKLE_GLAM_STYLE_TEXT}
              isSelected={selectedStyle === 'vibrant'}
              onSelect={setSelectedStyle}
            />
             <StyleOption
              value="normal"
              title="정통 썰툰 (정통 썰툰)"
              description="깔끔한 셀셰이딩과 가독성 중심의 한국 웹툰 스타일"
              styleText={CLEAN_WEBTOON_STYLE_TEXT}
              isSelected={selectedStyle === 'normal'}
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
              className="w-full p-4 bg-zinc-950/50 rounded-xl text-sm text-zinc-200 border border-zinc-700 focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-inner leading-relaxed"
              placeholder="여기에 화풍 프롬프트를 입력하세요..."
            />
          )}
        </main>
        <footer className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-end flex-shrink-0">
          <button 
            onClick={handleConfirm} 
            className="flex items-center gap-3 px-10 py-4 font-black text-white bg-orange-600 hover:bg-orange-500 rounded-2xl shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all active:scale-95 uppercase tracking-tighter"
          >
            <CheckIcon className="w-6 h-6" />
            Apply Strategy
          </button>
        </footer>
      </div>
    </div>
  );
};
