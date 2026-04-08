# Flux 통합 작업계획서 — 도레미썰 스튜디오

> **작성일**: 2026-03-20  
> **목적**: fal.ai Flux API를 기존 Gemini 파이프라인과 **병행 운영** 가능하도록 통합  
> **핵심 원칙**: 기존 Gemini 경로 일절 수정 없음. Flux는 옆에 새 경로를 추가하는 방식  
> **API 키**: fal.ai 가입 완료, 키 발급 완료

---

## 전체 구조 요약

```
App.tsx (사이드바)
  └─ Engine 토글: [Gemini] / [Flux]
       │
       ▼
AppContext.tsx
  └─ getVisionModelName() → 엔진별 모델명 반환
  └─ handleEditImageWithNanoWithRetry() → 엔진별 분기
       │
       ▼
appImageEngine.ts (라우팅)
  ├─ engine === 'gemini' → imageGeneration.ts (기존 그대로)
  └─ engine === 'flux'  → falService.ts (신규)
                              └─ @fal-ai/client SDK
```

---

## Phase 1: 기반 인프라 (Day 1)

### 1-1. 패키지 설치

```bash
npm install @fal-ai/client
```

### 1-2. types.ts — 타입 추가

```typescript
// 기존 NanoModel 타입 아래에 추가
export type ImageEngine = 'gemini' | 'flux';
export type FluxModel = 'flux-dev' | 'flux-2-flex' | 'flux-general';
```

**AppState에 추가할 필드:**
```typescript
selectedImageEngine: ImageEngine;    // 기본값: 'gemini'
selectedFluxModel: FluxModel;        // 기본값: 'flux-2-flex'
```

### 1-3. tauriAdapter.ts — ApiKeys에 fal 추가

```typescript
export interface ApiKeys {
    claude: string | null;
    gemini: string | null;
    supertone: string | null;
    fal: string | null;      // ★ 추가
}
```

**관련 함수들도 수정:**
- `saveApiKeys()` — fal 키 저장
- `loadApiKeys()` — fal 키 로드  
- `checkApiKeys()` — fal 키 존재 확인

**추가할 함수:**
```typescript
export async function getFalApiKey(): Promise<string> {
    if (IS_TAURI) {
        const keys = await loadApiKeys();
        return keys.fal || '';
    }
    return (import.meta as any).env?.VITE_FAL_KEY || '';
}
```

### 1-4. src-tauri/src/main.rs — Rust 백엔드

```rust
#[derive(Serialize, Deserialize)]
struct ApiKeys {
    claude: Option<String>,
    gemini: Option<String>,
    supertone: Option<String>,
    fal: Option<String>,      // ★ 추가
}
```

**save_api_keys 함수에 추가:**
```rust
if let Some(k) = &keys.fal {
    if !k.is_empty() { keychain_set("FAL_API_KEY", k)?; }
}
```

**load_api_keys 함수에 추가:**
```rust
fal: keychain_get("FAL_API_KEY").ok(),
```

**check_api_keys 함수에 추가:**
```rust
"fal": keychain_exists("FAL_API_KEY"),
```

### 1-5. ApiKeySettings.tsx — UI에 fal 필드 추가

```typescript
// keyFields 배열에 추가
{ 
  id: 'fal', 
  label: 'fal.ai API', 
  desc: 'Flux 이미지 생성', 
  link: 'https://fal.ai/dashboard/keys' 
},
```

**상태/상태체크도 fal 포함하도록 확장:**
- `keys` 초기값에 `fal: null` 추가
- `status` 타입에 `fal: boolean` 추가

### 1-6. Tauri 네트워크 허용 — capabilities/default.json

```
src-tauri/capabilities/default.json에는 HTTP 허용 도메인 설정이 없음.
Tauri v2에서는 Rust reqwest로 호출하므로 CORS/도메인 제한 없음.
→ Rust 프록시 커맨드가 필요할 수 있음 (Phase 1에서는 브라우저 환경 직접 fetch로 테스트)
```

**검토 필요:** fal.ai SDK가 브라우저에서 직접 fetch하는 방식이면 문제 없음.  
Tauri 환경에서 CORS 이슈 발생 시 Rust 프록시 커맨드 추가 필요.

---

## Phase 2: falService.ts 구현 (Day 1~2)

### 2-1. 파일 생성: `services/falService.ts`

**핵심 설계:**
- imageGeneration.ts의 함수들과 **동일한 입출력 시그니처** 유지
- fal CDN URL → 즉시 base64 변환 (기존 앱이 base64 data URL 기반)

```typescript
// services/falService.ts

import { fal } from "@fal-ai/client";
import { getFalApiKey } from './tauriAdapter';

// ─── 초기화 ─────────────────────────────────────────────────────
let initialized = false;

export async function initFalClient(): Promise<void> {
    if (initialized) return;
    const key = await getFalApiKey();
    if (key) {
        fal.config({ credentials: key });
        initialized = true;
    }
}

// ─── 유틸: fal CDN URL → base64 data URL 변환 ───────────────────
async function falUrlToDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ─── 유틸: base64 data URL → fal 전송용 URL 변환 ────────────────
// fal API는 URL 또는 data URI 모두 수용
function prepareImageUrl(dataUrl: string): string {
    return dataUrl; // data:image/png;base64,... 그대로 전달 가능
}
```

### 2-2. 핵심 함수 구현 (imageGeneration.ts 대응)

| imageGeneration.ts (Gemini) | falService.ts (Flux) | Flux 엔드포인트 |
|---|---|---|
| `editImageWithNano()` | `editImageWithFlux()` | `fal-ai/flux-general/image-to-image` |
| `generateMultiCharacterImage()` | `generateMultiCharWithFlux()` | `fal-ai/flux-general` (IP-Adapter) |
| `generateOutfitImage()` | `generateOutfitWithFlux()` | `fal-ai/flux-general` (txt2img) |
| `generateCharacterMask()` | (Gemini 유지) | Flux에 마스크 기능 없음 |
| `renderTextOnImage()` | (Gemini 유지) | Gemini가 텍스트 삽입에 강함 |
| `upscaleImageWithNano()` | `upscaleWithFlux()` | `fal-ai/flux-general` (고해상도) |
| `replaceBackground()` | `replaceBackgroundWithFlux()` | `fal-ai/flux-general/image-to-image` |
| `injectPersonalityAndCreateSignaturePose()` | `adjustPoseWithFlux()` | `fal-ai/flux-general/image-to-image` + ControlNet |
| `outpaintImageWithNano()` | (Phase 3) | Flux Fill 엔드포인트 |
| `fillImageWithNano()` | (Phase 3) | Flux Fill 엔드포인트 |

**중요:** `generateCharacterMask()`와 `renderTextOnImage()`는 Flux 전환 대상이 아님.  
마스크 생성은 비전 모델의 영역이고, 텍스트 삽입은 Gemini LLM이 훨씬 정확함.  
→ 이 두 함수는 엔진 설정과 무관하게 항상 Gemini를 사용.

### 2-3. editImageWithFlux() 구현 예시

```typescript
export async function editImageWithFlux(
    baseImageUrl: string,
    prompt: string,           // ★ Flux 최적화된 프롬프트 (adaptForFlux 거친 결과)
    options?: {
        referenceImageUrls?: string[];
        loraUrls?: { path: string; scale: number }[];
        controlImageUrl?: string;
        controlMode?: 'canny' | 'depth' | 'openpose';
        strength?: number;
        seed?: number;
        imageSize?: { width: number; height: number };
    }
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    await initFalClient();
    
    const input: any = {
        prompt,
        image_url: prepareImageUrl(baseImageUrl),
        strength: options?.strength ?? 0.75,
        image_size: options?.imageSize ?? { width: 768, height: 1344 }, // 9:16
        num_inference_steps: 28,
        guidance_scale: 3.5,
        seed: options?.seed,
        output_format: "png",
        enable_safety_checker: false,
    };
    
    // LoRA 적용
    if (options?.loraUrls?.length) {
        input.loras = options.loraUrls;
    }
    
    // ControlNet 적용
    if (options?.controlImageUrl && options?.controlMode) {
        input.controlnet_unions = [{
            path: "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0",
            control_image_url: options.controlImageUrl,
            conditioning_scale: 0.7,
            control_mode: options.controlMode,
        }];
    }
    
    // IP-Adapter (얼굴/스타일 참조)
    if (options?.referenceImageUrls?.length) {
        input.ip_adapters = [{
            path: "h94/IP-Adapter",
            image_url: prepareImageUrl(options.referenceImageUrls[0]),
            scale: 0.6,
        }];
    }
    
    const result = await fal.subscribe("fal-ai/flux-general/image-to-image", { input });
    
    // fal CDN URL → base64 변환 (기존 앱 호환)
    const dataUrl = await falUrlToDataUrl(result.data.images[0].url);
    
    return {
        imageUrl: dataUrl,
        textResponse: '',      // Flux는 텍스트 응답 없음
        tokenCount: 0,         // 토큰 대신 이미지 수로 과금
    };
}
```

### 2-4. 이미지 비율 매핑

```typescript
// 기존 imageRatio → Flux image_size 변환
function getFluxImageSize(imageRatio: string): { width: number; height: number } {
    switch (imageRatio) {
        case '9:16': return { width: 768, height: 1344 };
        case '16:9': return { width: 1344, height: 768 };
        case '1:1':  return { width: 1024, height: 1024 };
        case '3:4':  return { width: 768, height: 1024 };
        case '4:3':  return { width: 1024, height: 768 };
        default:     return { width: 768, height: 1344 }; // 기본 9:16 (쇼츠)
    }
}
```

---

## Phase 3: 프롬프트 어댑터 (Day 2~3)

### 3-1. 파일 생성: `appFluxPromptEngine.ts`

**핵심:** 기존 `appStyleEngine.ts`는 건드리지 않음.  
Flux 전용 프롬프트 빌더를 별도로 만듦.

```typescript
// appFluxPromptEngine.ts — Flux 전용 프롬프트 빌더

import type { Cut, EditableCut, CharacterDescription, ArtStyle } from './types';
import type { PromptContext } from './appStyleEngine';
```

### 3-2. 화풍 → Flux 키워드 매핑

```typescript
export function getFluxStyleKeywords(artStyle: ArtStyle, customArtStyle: string): string {
    if (artStyle === 'custom' && customArtStyle.trim()) {
        return customArtStyle; // 커스텀은 그대로
    }
    
    const FLUX_STYLES: Record<ArtStyle, string> = {
        'pastel-chibi': 
            'cute flat pastel chibi illustration, thick warm brown outlines, ' +
            'solid pastel candy color fills, no shadows, baby pink and cream yellow palette, ' +
            'simplified mitten hands, large round eyes with single white highlight, ' +
            'sticker style, white or simple pattern background',
            
        'glow-chibi': 
            'warm glowing chibi anime illustration, soft airbrush gradients, ' +
            'amber and rose gold color palette, magical rim lighting with halo effect, ' +
            'sparkle particles, dreamy bloom filter, glossy multi-layer eye reflections, ' +
            'warm dark brown outlines, premium idol merchandise quality',
            
        'cinema-mood': 
            'kyoto animation cinematic quality anime illustration, ' +
            'transparent azure and emerald palette, natural sunlight with komorebi effect, ' +
            'individual hair strands with light interaction, thin delicate lines, ' +
            'detailed atmospheric background, soft colored shadows, film-quality rendering',
            
        'sparkle-glam': 
            'glamorous idol anime illustration, deep rose and royal purple jewel tones, ' +
            'dramatic stage lighting with colored rim lights, decorative star eyes, ' +
            'sharp specular hair highlights, glossy polished rendering, ' +
            'confident black outlines, bokeh sparkle background',
            
        'clean-webtoon': 
            'clean korean webtoon digital art, flat cel shading with two tones per surface, ' +
            'uniform black outlines at consistent weight, even functional lighting, ' +
            'simple readable composition, standard anime eyes with basic highlight',
            
        'custom': '',
    };
    
    return FLUX_STYLES[artStyle] || FLUX_STYLES['clean-webtoon'];
}
```

### 3-3. Flux용 최종 프롬프트 빌더

```typescript
export function buildFluxPrompt(cut: Cut | EditableCut, ctx: PromptContext): string {
    // [중요도순 배열 — Flux는 앞에 올수록 중요]
    
    const parts: string[] = [];
    
    // 1순위: 캐릭터 (LoRA 트리거워드 or 외모 묘사)
    const characters = getCharacterDescriptions(cut, ctx);
    if (characters.length > 0) {
        parts.push(characters.join(', '));
    }
    
    // 2순위: 핵심 행동/장면
    const scene = extractSceneAction(cut);
    if (scene) parts.push(scene);
    
    // 3순위: 감정/표정
    const emotion = extractEmotion(cut);
    if (emotion) parts.push(emotion);
    
    // 4순위: 의상 (DNA에서 추출)
    const outfits = extractOutfits(cut, ctx);
    if (outfits) parts.push(outfits);
    
    // 5순위: 카메라/구도
    const camera = extractCamera(cut, ctx);
    if (camera) parts.push(camera);
    
    // 6순위: 배경/장소
    const location = extractLocation(cut, ctx);
    if (location) parts.push(location);
    
    // 7순위: 화풍 키워드
    const style = getFluxStyleKeywords(ctx.artStyle, '');
    parts.push(style);
    
    // 8순위: FX 효과 (있으면)
    const fx = extractFX(cut);
    if (fx) parts.push(fx);
    
    return parts.join(', ');
}
```

### 3-4. 변환 헬퍼 함수들

```typescript
// 캐릭터 묘사: LoRA 있으면 트리거워드, 없으면 외모 묘사
function getCharacterDescriptions(cut: Cut | EditableCut, ctx: PromptContext): string[] {
    const results: string[] = [];
    const characters = ('characters' in cut ? cut.characters : [])
        .filter(c => c && c.trim());
    
    for (const name of characters) {
        const key = Object.keys(ctx.characterDescriptions)
            .find(k => ctx.characterDescriptions[k].koreanName === name);
        
        if (key) {
            const char = ctx.characterDescriptions[key];
            
            // LoRA 트리거워드가 있으면 사용, 없으면 외모 묘사
            if (char.loraTrigerWord) {
                results.push(char.loraTrigerWord);
            } else {
                const hair = char.hairStyleDescription || '';
                const face = char.facialFeatures || '';
                results.push(`${name} with ${hair} and ${face}`.trim());
            }
        }
    }
    return results;
}

// 씬 묘사 추출 (지시문 제거, 순수 행동만)
function extractSceneAction(cut: Cut | EditableCut): string {
    const scene = 'sceneDescription' in cut ? cut.sceneDescription : '';
    if (!scene) return '';
    
    // 마크다운/지시 구문 제거
    return scene
        .replace(/\[.*?\]/g, '')          // [STRICT] 등 태그 제거
        .replace(/#.*$/gm, '')            // # 헤더 제거
        .replace(/\*\*.*?\*\*/g, '')      // **볼드** 제거
        .replace(/MUST|CRITICAL|MANDATORY|ABSOLUTE|DO NOT|NEVER/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// 감정 추출
function extractEmotion(cut: Cut | EditableCut): string {
    const emotion = 'characterEmotionAndExpression' in cut 
        ? cut.characterEmotionAndExpression : '';
    if (!emotion) return '';
    return emotion.replace(/\[.*?\]/g, '').trim();
}

// 의상 추출
function extractOutfits(cut: Cut | EditableCut, ctx: PromptContext): string {
    const customOutfit = 'characterOutfit' in cut ? cut.characterOutfit : '';
    if (customOutfit && customOutfit.trim()) {
        return 'wearing ' + customOutfit.replace(/\[.*?:\s*/g, '').replace(/\]/g, '');
    }
    return '';
}

// 카메라 정보 (간결하게)
function extractCamera(cut: Cut | EditableCut, ctx: PromptContext): string {
    // cinematographyPlan에서 추출
    const cutId = cut.id;
    const cineCut = ctx.cinematographyPlan?.cuts?.find(c => c.cutId === cutId);
    if (!cineCut) return '';
    
    const parts = [cineCut.shotSize, cineCut.cameraAngle].filter(Boolean);
    return parts.join(' ');
}

// 장소 묘사
function extractLocation(cut: Cut | EditableCut, ctx: PromptContext): string {
    const location = cut.location || '';
    const locDNA = ctx.locationVisualDNA[location] || '';
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : '';
    
    if (locDesc) return locDesc;
    if (locDNA) return locDNA;
    return location;
}

// FX 효과 → Flux 묘사로 변환
function extractFX(cut: Cut | EditableCut): string {
    const intent = 'directorialIntent' in cut ? cut.directorialIntent : '';
    if (!intent) return '';
    
    const FX_MAP: Record<string, string> = {
        'Vertical Gloom Lines': 'dramatic dark shadow lines, melancholic atmosphere',
        'Speed Lines': 'dynamic motion blur, kinetic energy lines',
        'Soft Bloom': 'ethereal soft glow, dreamy romantic lighting',
        'Sparkling Aura': 'magical shimmering sparkle particles, glowing aura',
    };
    
    for (const [key, val] of Object.entries(FX_MAP)) {
        if (intent.includes(key)) return val;
    }
    return '';
}
```

### 3-5. 인서트 컷 (캐릭터 없는 배경 전용)

```typescript
export function buildFluxInsertPrompt(cut: Cut | EditableCut, ctx: PromptContext): string {
    const scene = 'sceneDescription' in cut ? cut.sceneDescription : '';
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : '';
    const location = cut.location || '';
    const style = getFluxStyleKeywords(ctx.artStyle, '');
    
    // 배경 전용: 장소 묘사가 가장 중요
    return [
        locDesc || location,
        scene ? scene.replace(/\[.*?\]/g, '').trim() : '',
        'no people, empty scene, background art',
        style,
    ].filter(Boolean).join(', ');
}
```

---

## Phase 4: 엔진 라우팅 (Day 3)

### 4-1. appReducer.ts — 상태 추가

```typescript
// initialState에 추가
selectedImageEngine: 'gemini' as ImageEngine,
selectedFluxModel: 'flux-2-flex' as FluxModel,

// case 추가
case 'SET_IMAGE_ENGINE': return { ...state, selectedImageEngine: action.payload };
case 'SET_FLUX_MODEL': return { ...state, selectedFluxModel: action.payload };
```

### 4-2. AppContext.tsx — 분기 로직

```typescript
// getVisionModelName 아래에 추가
const getFluxModelName = useCallback(() => {
    switch (stateRef.current.selectedFluxModel) {
        case 'flux-dev': return 'fal-ai/flux/dev';
        case 'flux-general': return 'fal-ai/flux-general';
        case 'flux-2-flex': 
        default: return 'fal-ai/flux-2-flex';
    }
}, []);

// handleEditImageWithNanoWithRetry 수정
const handleEditImageWithNanoWithRetry = useCallback(async (...) => {
    const engine = stateRef.current.selectedImageEngine;
    
    if (engine === 'flux') {
        // Flux 경로
        const fluxPrompt = buildFluxPrompt(/* ... */); // Flux 프롬프트 어댑터
        const res = await editImageWithFlux(baseImageUrl, fluxPrompt, { ... });
        handleAddUsage(1, 'fal'); // 이미지 수 기반 과금 추적
        return res;
    }
    
    // 기존 Gemini 경로 (변경 없음)
    const artStylePrompt = artStylePromptOverride || getArtStylePrompt();
    const modelName = getVisionModelName();
    const res = await editImageWithRetry(...);
    handleAddUsage(res.tokenCount, 'gemini');
    return res;
}, [...]);
```

### 4-3. appImageEngine.ts — generateImageForCut 분기

```typescript
// generateImageForCut 함수 상단에 엔진 체크 추가
export async function generateImageForCut(
    cut: Cut,
    prompt: string,        // Gemini 프롬프트 (기존)
    fluxPrompt: string,    // Flux 프롬프트 (신규 — buildFluxPrompt 결과)
    engine: ImageEngine,   // ★ 추가
    ctx: CutGenerationContext,
    editWithRetry: (...) => Promise<...>,
): Promise<{ imageUrl: string; tokenCount: number }> {
    
    if (engine === 'flux') {
        return generateImageForCutFlux(cut, fluxPrompt, ctx);
    }
    
    // 기존 Gemini 로직 그대로
    // ...
}
```

### 4-4. App.tsx — 사이드바 UI

```tsx
{/* Engine 선택 — 기존 모델 버튼 위에 추가 */}
<div className="space-y-2">
    <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">
        Engine
    </h3>
    <div className="grid grid-cols-2 gap-1.5">
        {([['gemini','Gemini'],['flux','Flux']] as const).map(([val,label]) => (
            <button key={val} 
                onClick={() => dispatch({ type: 'SET_IMAGE_ENGINE', payload: val })}
                className={`py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                    state.selectedImageEngine === val 
                    ? val === 'flux' 
                        ? 'bg-transparent border-teal-500/60 text-teal-400' 
                        : 'bg-transparent border-orange-500/60 text-orange-400'
                    : 'bg-transparent border-zinc-700/50 text-zinc-500 hover:border-zinc-600'
                }`}
            >{label}</button>
        ))}
    </div>
</div>

{/* 모델 선택 — 엔진에 따라 변경 */}
<div className="grid grid-cols-3 gap-1.5">
    {state.selectedImageEngine === 'gemini' 
        ? ([['nano-2.5','N-2.5'],['nano-3.1','N-3.1'],['nano-3pro','N-3Pro']] as const).map(...)
        : ([['flux-2-flex','Flex'],['flux-dev','Dev'],['flux-general','General']] as const).map(([val,label]) => (
            <button key={val}
                onClick={() => dispatch({ type: 'SET_FLUX_MODEL', payload: val })}
                className={`py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                    state.selectedFluxModel === val 
                    ? 'bg-transparent border-teal-500/60 text-teal-400'
                    : 'bg-transparent border-zinc-700/50 text-zinc-500'
                }`}
            >{label}</button>
        ))
    }
</div>
```

---

## Phase 5: ProportionStudio Flux 연동 (Day 4~5)

### 5-1. ProportionStudioModal.tsx — 엔진 선택 추가

```typescript
// 기존 PROPORTION_MODEL 상수 아래에
const [proportionEngine, setProportionEngine] = useState<'gemini' | 'flux'>('gemini');
```

**UI: 모달 상단에 토글 추가**
```tsx
<div className="flex gap-2 mb-4">
    <button onClick={() => setProportionEngine('gemini')}
        className={proportionEngine === 'gemini' ? 'active' : ''}>
        Gemini
    </button>
    <button onClick={() => setProportionEngine('flux')}
        className={proportionEngine === 'flux' ? 'active' : ''}>
        Flux + Pose
    </button>
</div>
```

### 5-2. Flux 비율 조정 로직

```typescript
// falService.ts에 추가
export async function adjustProportionWithFlux(
    sourceImageUrl: string,
    targetRatio: number,
    artStyleKeywords: string,
    options?: { seed?: number; strength?: number }
): Promise<{ imageUrl: string }> {
    await initFalClient();
    
    const prompt = `same character, ${targetRatio}-head-tall body proportion, ` +
        `full body standing pose, ${artStyleKeywords}`;
    
    const result = await fal.subscribe("fal-ai/flux-general/image-to-image", {
        input: {
            prompt,
            image_url: prepareImageUrl(sourceImageUrl),
            strength: options?.strength ?? 0.7,
            image_size: { width: 768, height: 1344 },
            num_inference_steps: 28,
            guidance_scale: 3.5,
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
            ip_adapters: [{
                path: "h94/IP-Adapter",
                image_url: prepareImageUrl(sourceImageUrl),
                scale: 0.6,
            }],
        }
    });
    
    const dataUrl = await falUrlToDataUrl(result.data.images[0].url);
    return { imageUrl: dataUrl };
}
```

---

## Phase 6: LoRA 학습 + 적용 (Day 5~7, 점진적)

### 6-1. LoRA 학습은 앱 외부에서 진행

fal.ai Dashboard 또는 API로 직접 학습:

**캐릭터 LoRA:**
- 남자 캐릭터 이미지 20~30장 zip → `fal-ai/flux-2-trainer`
- `trigger_word: "doremi_boy"`, `is_style: false`
- 학습비: ~$8 (1000 steps)

**스타일 LoRA:**
- 잘 나온 pastel-chibi 컷 30장 zip → `fal-ai/flux-lora-fast-training`
- `trigger_word: "drms_pastel style"`, `is_style: true`
- 학습비: ~$2~8

### 6-2. 앱에 LoRA URL 저장 구조

```typescript
// types.ts에 추가
interface LoRAConfig {
    url: string;          // fal.ai 학습 결과 URL
    triggerWord: string;  // "doremi_boy" 등
    scale: number;        // 0.0 ~ 1.0 (기본 0.8)
    type: 'character' | 'style';
}

// CharacterDescription에 추가
loraConfig?: LoRAConfig;

// AppState에 추가
styleLoraConfig?: LoRAConfig;  // 전역 화풍 LoRA
```

### 6-3. LoRA를 프롬프트/API에 적용

```typescript
// falService.ts의 editImageWithFlux에서
if (characterLoRA) {
    input.loras = input.loras || [];
    input.loras.push({ path: characterLoRA.url, scale: characterLoRA.scale });
}
if (styleLoRA) {
    input.loras = input.loras || [];
    input.loras.push({ path: styleLoRA.url, scale: styleLoRA.scale });
}
```

---

## 수정 파일 체크리스트

### 신규 파일 (3개)
- [ ] `services/falService.ts` — fal.ai API 클라이언트 + 이미지 생성 함수들
- [ ] `appFluxPromptEngine.ts` — Flux 전용 프롬프트 빌더
- [ ] `FLUX_INTEGRATION_WORKPLAN.md` — 본 문서

### 수정 파일 (8개)
- [ ] `types.ts` — ImageEngine, FluxModel 타입 + LoRA 관련 타입
- [ ] `appReducer.ts` — selectedImageEngine, selectedFluxModel 상태 + 액션
- [ ] `AppContext.tsx` — 엔진 분기 로직 (handleEditImageWithNanoWithRetry)
- [ ] `appImageEngine.ts` — generateImageForCut에 engine 파라미터 추가
- [ ] `App.tsx` — 사이드바 Engine/Model 토글 UI
- [ ] `services/tauriAdapter.ts` — ApiKeys에 fal 추가 + getFalApiKey()
- [ ] `components/ApiKeySettings.tsx` — fal.ai 키 입력 필드
- [ ] `src-tauri/src/main.rs` — Rust ApiKeys struct + keyring

### 수정하지 않는 파일 (확인용)
- [x] `services/ai/imageGeneration.ts` — 기존 Gemini 함수 그대로 유지
- [x] `appStyleEngine.ts` — 기존 화풍 프롬프트 그대로 유지
- [x] `components/SceneCard.tsx` — 변경 없음 (엔진 무관)
- [x] `components/ImageStudio.tsx` — 변경 없음
- [x] `components/CharacterStudio.tsx` — 변경 없음
- [x] `appGenerationActions.ts` — 변경 없음 (AppContext 분기에 의존)

### 후속 수정 (Phase 5~6)
- [ ] `components/ProportionStudioModal.tsx` — Flux 엔진 선택 UI
- [ ] `package.json` — @fal-ai/client 의존성

---

## 작업 우선순위 (Claude Code에서)

```
Day 1 (기반):
  1. npm install @fal-ai/client
  2. types.ts 타입 추가
  3. tauriAdapter.ts + main.rs (API키)
  4. ApiKeySettings.tsx (fal 필드)
  5. falService.ts 기본 구조 + initFalClient + editImageWithFlux
  6. 브라우저 환경에서 단일 이미지 생성 테스트

Day 2 (프롬프트):
  7. appFluxPromptEngine.ts 전체 구현
  8. falService.ts 나머지 함수들
  9. 프롬프트 변환 품질 테스트 (Playground에서 비교)

Day 3 (연결):
  10. appReducer.ts 상태 추가
  11. AppContext.tsx 엔진 분기
  12. appImageEngine.ts 분기
  13. App.tsx 사이드바 UI
  14. 통합 테스트 (Gemini↔Flux 토글)

Day 4~5 (비율 + 안정화):
  15. ProportionStudioModal Flux 연동
  16. 에러 핸들링 + 재시도 로직
  17. fal CDN URL 만료 대응 (즉시 base64 변환 확인)

Day 5~7 (LoRA, 점진적):
  18. 캐릭터 LoRA 학습 (fal.ai Dashboard)
  19. 스타일 LoRA 학습
  20. 앱에 LoRA 설정 UI 추가
```

---

## 주의사항

### fal.ai 이미지 URL 만료
- 반환 URL은 CDN 임시 URL (수시간~수일 후 만료)
- `falUrlToDataUrl()`로 **즉시** base64 변환 필수
- 기존 `persistImageToDisk()` 패턴과 동일하게 처리

### Gemini 전용 기능 (Flux 미전환)
- `generateCharacterMask()` — 비전 분석 기능, Gemini 유지
- `renderTextOnImage()` — 텍스트 삽입, Gemini LLM이 우위
- `generateSpeech()` — TTS, Gemini 유지 (이미지 무관)

### Flux 프롬프트 금기
- `DO NOT`, `NEVER`, `MUST NOT` 등 네거티브 지시 → 무시됨
- `[SECTION]:`, `# HEADER`, `**볼드**` 등 마크다운 → 무시됨
- `(keyword:1.4)` SD식 가중치 → Flux에서 동작 안함
- 원하는 것만 묘사. "하지 마"가 아니라 "이것을 그려"

### 토큰/비용 추적
- Gemini: tokenCount 기반 → handleAddUsage(tokenCount, 'gemini')
- Flux: 이미지 수 기반 → handleAddUsage(1, 'fal') + 별도 가격 계산
