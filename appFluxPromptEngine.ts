/**
 * appFluxPromptEngine.ts — Flux 전용 프롬프트 빌더
 *
 * appStyleEngine.ts는 절대 수정하지 않음. 이 파일이 병행하는 별도 경로.
 * Flux = 디퓨전 모델. 묘사형 자연어만 이해.
 * DO NOT, [SECTION]:, # HEADER, (weight:1.4) 등 지시형/SD식 문법 금지.
 * 원하는 것만 묘사. 중요도순 배열. 80단어 이내 권장 (Flux 2 Pro 최적 30~80 words).
 */

import type { Cut, EditableCut, CharacterDescription, ArtStyle, LoRAEntry } from './types';
import { sanitizeChildSafety } from './appSafetySanitize';
import type { PromptContext } from './appStyleEngine';
import { callClaude } from './services/claudeService';
import { resolveCharId } from './appUtils';

/** Flux 프롬프트용 확장 컨텍스트 (LoRA 정보 포함) */
export interface FluxPromptContext extends PromptContext {
    loraRegistry?: LoRAEntry[];
    styleLoraId?: string;
    fluxModel?: 'flux-pro' | 'flux-flex' | 'flux-lora';
}

// ─── 화풍 → Flux 키워드 매핑 ────────────────────────────────────

const FLUX_STYLES: Record<ArtStyle, string> = {
    'moe':
        'flat pastel chibi illustration, candy colors, no shadows, thick brown outlines, sticker style',

    'dalle-chibi':
        'warm glowing chibi anime, soft airbrush shading, amber rose gold tones, dreamy sparkle particles',

    'kyoto':
        'cinematic anime illustration, natural sunlight, detailed atmospheric background, thin delicate lines',

    'vibrant':
        'glamorous idol anime, jewel tone palette, dramatic stage lighting, glossy polished rendering',

    'normal':
        'clean korean webtoon, flat cel shading, uniform black outlines, simple composition',

    'custom': '',
};

export function getFluxStyleKeywords(artStyle: ArtStyle, customArtStyle: string): string {
    if (artStyle === 'custom' && customArtStyle.trim()) {
        return customArtStyle;
    }
    return FLUX_STYLES[artStyle] || FLUX_STYLES['normal'];
}

/** artStyle에서 체형 키워드만 추출 (LoRA 모드용) */
function getBodyTypeHint(artStyle: ArtStyle, gender?: string): string {
    const g = gender === 'female' ? 'girl' : 'boy';
    switch (artStyle) {
        case 'dalle-chibi':
            return `chibi ${g}, small slim body, big head tiny body`;
        case 'moe':
            return `SD ${g}, compact body, head-to-body ratio 1:3.5, big head with slightly longer body`;
        case 'vibrant':
            return `tall slender ${g}`;
        case 'kyoto':
            return `anime ${g}, slim proportions`;
        case 'normal':
        default:
            return `webtoon ${g}, normal slim build`;
    }
}

// ─── 헬퍼 함수들 ────────────────────────────────────────────────

/** 캐릭터 묘사: LoRA 트리거워드 있으면 사용, 없으면 외모 묘사 */
function getCharacterDescriptions(cut: Cut | EditableCut, ctx: FluxPromptContext): string[] {
    const results: string[] = [];
    const rawCharacters = 'characters' in cut ? cut.characters : [];
    const characters = rawCharacters ? rawCharacters.filter((c: string) => c && c.trim()) : [];
    const registry = ctx.loraRegistry || [];

    for (const nameOrId of characters) {
        const charId = resolveCharId(nameOrId, ctx.characterDescriptions);
        const char = charId ? ctx.characterDescriptions[charId] : null;
        const displayName = char?.koreanName || nameOrId;

        if (char) {
            // Phase 6: 모델별 캐릭터 묘사 분기
            const isLoraModel = ctx.fluxModel === 'flux-lora';

            if (isLoraModel && char.loraId) {
                // LoRA 모델: 트리거워드 + 체형 힌트 (외모는 LoRA가 담당)
                const loraEntry = registry.find((e: any) => e.id === char.loraId);
                if (loraEntry?.triggerWord) {
                    const bodyHint = getBodyTypeHint(ctx.artStyle, char.gender);
                    results.push(`${loraEntry.triggerWord}, ${bodyHint}`);
                    continue;
                }
            }
            // Pro/Flex 또는 LoRA 미연결: 전체 외모 묘사 사용 (기존 로직)
            const appearance = char.baseAppearance || '';
            if (appearance) {
                results.push(appearance);
            } else {
                results.push(displayName);
            }
        } else {
            results.push(displayName);
        }
    }
    return results;
}

/** 씬 묘사 추출 (마크다운/지시문 제거, 순수 행동만) */
function extractSceneAction(cut: Cut | EditableCut, characterNames?: string[]): string {
    const useIntense = 'useIntenseEmotion' in cut && (cut as EditableCut).useIntenseEmotion === true;
    const scene = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).sceneDescriptionIntense;
            if (intense) return intense;
        }
        return 'sceneDescription' in cut ? cut.sceneDescription : '';
    })();
    if (!scene) return '';

    let cleaned = scene
        .replace(/\[.*?\]/g, '')            // [STRICT] 등 태그 제거
        .replace(/#.*$/gm, '')              // # 헤더 제거
        .replace(/\*\*.*?\*\*/g, '')        // **볼드** 제거
        .replace(/MUST|CRITICAL|MANDATORY|ABSOLUTE|DO NOT|NEVER/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // characters에 없는 인물 관계 표현 제거 (P0 방어)
    const PERSON_WORDS = /\b(boyfriend|girlfriend|husband|wife|mother|father|mom|dad|boss|colleague|friend|senior|junior|stranger|남자친구|여자친구|남친|여친|엄마|아빠|친구|동료|상사|선배|후배)\b/gi;
    cleaned = cleaned.replace(PERSON_WORDS, '');
    cleaned = cleaned.replace(/\bof\s+in\b/gi, 'in');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

// ─── Phase 6: 감정 매핑 강화 (한국어 → Flux 묘사) ────────────────

const EMOTION_MAP: [RegExp, string][] = [
    [/놀람|충격|놀란|깜짝|헉|shock|surprise|startled|gasp/,
     'white circle eyes with shrunk pupils, mouth wide open, !! marks above head, body recoiling backward'],
    [/분노|화남|격분|화가|빡친|angry|fury|rage|furious/,
     'furrowed brows, clenched teeth, anger vein mark on forehead, dark menacing aura, aggressive forward lean'],
    [/슬픔|우울|눈물|울|서러|sad|grief|sorrow|tears|cry/,
     'glistening tear tracks, trembling lips, dark gloomy cloud above head, drooped shoulders'],
    [/기쁨|행복|즐거|웃|기뻐|신남|happy|joy|delight|cheerful/,
     'star-shaped eye highlights, big open smile, rosy blush, sparkle particles radiating, bouncy posture'],
    [/당황|쩔쩔|어쩔|어버버|fluster|embarrass|awkward/,
     'eyes darting sideways, giant sweat drop on temple, spiral on flushed cheek, steam rising from head'],
    [/긴장|불안|초조|떨리|nervous|tense|anxious/,
     'wide eyes with dilated pupils, sweat beads on forehead, trembling pressed lips, rigid stiff body'],
    [/무표정|냉담|무감|차가|blank|cold|indifferent|stoic/,
     'half-lidded emotionless flat gaze, straight thin lips, cold distant atmosphere'],
    [/부드러|다정|따뜻|온화|포근|gentle|tender|warm|kind/,
     'soft gentle eyes, subtle warm smile, golden warm glow effect, relaxed open posture'],
    [/걱정|근심|염려|worry|concern|uneasy/,
     'furrowed brow, biting lower lip, fidgeting with clothing, tense raised shoulders'],
    [/자신감|의기양양|뿌듯|득의|자랑|confident|proud|triumphant/,
     'confident smirk, chin raised, hands on hips power pose, golden sparkle aura, dramatic backlighting'],
    [/능청|능글|시치미|능글맞|sly|coy|feigning|nonchalant/,
     'one eyebrow raised, playful half-closed eyes, knowing smirk, mischievous eye sparkle'],
    [/추궁|서늘|위협|압박|노려|intimidat|menac|threaten|glare/,
     'menacing dark shadow on upper face, narrowed piercing eyes, dark threatening aura, looming stance'],
    [/체념|한숨|포기|지침|탈진|resign|sigh|defeat|exhaust/,
     'heavy tired eyes, deflated cheeks, dark cloud above head, soul-wisp floating upward, slumped shoulders'],
    [/소유욕|독점|마킹|내꺼|possessiv|territorial|claiming/,
     'dark possessive narrowed eyes, territorial arm reaching protectively, intense focused gaze'],
    [/설렘|두근|심쿵|flutter|excited|heart.?skip/,
     'heart-shaped eye reflections, deep rosy blush, hand pressed on chest, pink sparkle particles floating'],
    [/단호|결연|결심|결의|각오|resolut|determin|firm/,
     'sharp focused narrowed eyes, clenched jaw, angular emphasis lines behind, dramatic backlight silhouette'],
    [/황당|어이없|뭐야|헐|말도안돼|absurd|disbelief|incredulous/,
     '???? question marks floating around head, eye twitching, blank stare, body leaning backward'],
    [/섬뜩|음흉|으스스|사악|섬찟|creepy|sinister|evil/,
     'small pupils with wide unsettling smile, dark ominous purple aura, sinister half-shadow on face'],
    [/질투|시기|부러|샘|시새|jealous|envious|resentful/,
     'sharp side-eye glare, puffed cheeks, green jealousy aura, crossed arms defensive stance'],
    [/감동|벅찬|감사|뭉클|moved|touched|grateful/,
     'happy tears at eye corners, warm trembling smile, hands clasped at chest, warm golden light rays'],
    [/코미디|웃긴|황당함|개웃|comedy|funny|hilarious|lol/,
     'spiral dizzy eyes, oversized O-shaped mouth, full-body dramatic recoil, floating !!! marks'],
    [/지배|명령|카리스마|군림|dominat|command|charisma/,
     'half-closed powerful eyes looking down, commanding palm gesture, intense power aura, low-angle view'],
    [/감정급반전|반전|충격반전|갭|whiplash|sudden.*change|twist/,
     'manga panel crack effect in background, dramatic lighting shift, shockwave lines radiating outward'],
    [/로맨스|달달|사랑|애정|키스|romantic|love|affection|sweet/,
     'soft dreamy eyes, gentle smile, pink-tinted cheeks, bloom glow effect, flower petals floating'],

    // ── 🟢 일상 감정 (10%) ──
    [/궁금|호기심|뭐지|왜지|curious|wonder|intrigued/,
     'slightly tilted head, one eyebrow raised, eyes focused with interest, small questioning expression'],
    [/의아|이상|갸우뚱|뭔가이상|puzzled|confused|perplexed/,
     'head tilted, squinted eyes, one hand touching chin, skeptical half-frown'],
    [/심심|지루|멍|따분|bored|listless|idle/,
     'chin resting on palm, half-lidded drowsy eyes, slouched posture, blank unfocused gaze'],
    [/무심|시큰둥|관심없|whatever|indifferent|unbothered/,
     'looking away with half-closed eyes, relaxed loose shoulders, one hand waving dismissively'],
    [/평온|차분|고요|잔잔|calm|serene|peaceful/,
     'soft closed-mouth smile, relaxed half-closed eyes, gentle breathing posture, warm ambient light'],

    // ── 🟡 중간 감정 (40%) ──
    [/서운|섭섭|아쉬|disappointed|let.?down|bummed/,
     'slightly downcast eyes, pressed thin lips, shoulders dropping subtly, looking down and away'],
    [/짜증|성가|귀찮|짜증나|annoy|irritat|bother|peeved/,
     'one eye twitching, tight jaw, sharp exhale through nose, arms crossed with fingers tapping, small anger vein'],
    [/민망|쑥스|부끄|쪽팔|shy|bashful|self.?conscious/,
     'hand covering mouth or rubbing back of neck, averted gaze, light pink blush on cheeks, hunched shoulders'],
    [/귀찮|번거|하기싫|reluctant|lazy|can.?t be bothered/,
     'heavy-lidded eyes, limp arms hanging, whole body slouching forward, dark lazy cloud above head'],
    [/장난|개구쟁이|짓궂|mischiev|playful|prankish|cheeky/,
     'wide cheeky grin, tongue peeking out corner of mouth, eyes sparkling with mischief, leaning forward sneakily'],

    // ── 🟠 추가 (70%) ──
    [/패닉|공황|극심한불안|panic|freak.?out|meltdown/,
     'shaking hands grabbing own head, wide spiral eyes, multiple sweat drops flying, scattered !!!! marks, chaotic motion lines'],
];

function enhanceEmotion(raw: string): string {
    if (!raw) return '';

    // ★ USS 포맷: "캐릭터명-감정(맥락)" → 감정 + 맥락 추출
    const ussMatch = raw.match(/^.+?[-–]\s*(.+?)(?:\((.+?)\))?\s*$/);
    if (ussMatch) {
        const emotionKeyword = ussMatch[1].trim();
        const context = ussMatch[2]?.trim() || '';
        // EMOTION_MAP에서 감정 키워드만으로 매칭
        for (const [pattern, description] of EMOTION_MAP) {
            if (pattern.test(emotionKeyword)) {
                return context ? `${description}, ${context}` : description;
            }
        }
        // EMOTION_MAP 미매칭 → 키워드 + 맥락 그대로 반환 (Claude가 해석)
        return context ? `${emotionKeyword}, ${context}` : emotionKeyword;
    }

    // enrichContiCuts 포맷: "한국어 — English description"
    if (raw.includes(' — ')) {
        const englishPart = raw.split(' — ').slice(1).join(' — ').trim();
        if (englishPart) return englishPart;
    }

    // 기존 EMOTION_MAP 폴백
    for (const [pattern, description] of EMOTION_MAP) {
        if (pattern.test(raw)) return description;
    }
    return raw;
}

/** 포즈/자세 묘사 추출 */
function extractPose(cut: Cut | EditableCut): string {
    const useIntense = 'useIntenseEmotion' in cut && (cut as EditableCut).useIntenseEmotion === true;
    const pose = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).characterPoseIntense;
            if (intense) return intense;
        }
        return 'characterPose' in cut ? (cut as any).characterPose : '';
    })();
    if (!pose) return '';
    // 방어 태그 제거
    return pose.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
}

/** 감정 추출 + 강화 */
function extractEmotion(cut: Cut | EditableCut): string {
    const useIntense = 'useIntenseEmotion' in cut && (cut as EditableCut).useIntenseEmotion === true;
    const emotion = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).characterEmotionAndExpressionIntense;
            if (intense) return intense;
        }
        return 'characterEmotionAndExpression' in cut ? cut.characterEmotionAndExpression : '';
    })();
    if (!emotion) return '';
    const cleaned = emotion.replace(/\[.*?\]/g, '').trim();
    return enhanceEmotion(cleaned);
}

/** 만푸 감정-효과 매핑 테이블 (스코어링용) */
const MANPU_TABLE: { id: string; pattern: RegExp; effect: string }[] = [
    { id: 'shock',       pattern: /shock|surprise|wide.?eyes|white.?circle|!!|놀람|충격|깜짝|헉/gi,                    effect: 'manga shock reaction, !! marks above head, white circle eyes, sweat drops flying, exaggerated recoil' },
    { id: 'anger',       pattern: /angry|fury|rage|clenched|anger.?vein|분노|화남|빡친|격분/gi,                        effect: 'manga anger, anger vein mark on forehead, menacing dark aura, aggressive stance' },
    { id: 'sad',         pattern: /sad|grief|sorrow|tear|cry|depress|슬픔|우울|눈물|울/gi,                              effect: 'manga sadness, glistening tear tracks, dark gloomy cloud above, blue vertical lines on face' },
    { id: 'joy',         pattern: /happy|joy|delight|sparkle|cheerful|기쁨|행복|즐거|웃|신남/gi,                        effect: 'manga joy, star-shaped eye highlights, sparkle particles radiating, flower petals floating' },
    { id: 'embarrass',   pattern: /fluster|embarrass|awkward|blush|spiral|당황|쩔쩔|어버버/gi,                          effect: 'manga embarrassment, giant sweat drop, spiral on cheek, steam rising from head' },
    { id: 'tense',       pattern: /nervous|tense|anxious|sweat|stiff|긴장|불안|초조|떨리/gi,                            effect: 'manga tension, sweat beads on forehead, shaking motion lines on hands, stiff rigid posture' },
    { id: 'blank',       pattern: /blank|cold|indifferent|stoic|무표정|냉담|무감|차가/gi,                               effect: 'cold distant atmosphere, emotionless flat gaze' },
    { id: 'gentle',      pattern: /gentle|tender|warm|kind|부드러|다정|따뜻|온화/gi,                                    effect: 'warm golden glow, soft gentle atmosphere, warm light particles' },
    { id: 'worry',       pattern: /worry|concern|uneasy|걱정|근심|염려/gi,                                             effect: 'worried expression lines, lip biting, fidgeting hands, anxious atmosphere' },
    { id: 'confident',   pattern: /confident|proud|triumphant|자신감|의기양양|뿌듯|득의/gi,                             effect: 'confident golden sparkle aura, power pose, dramatic backlighting' },
    { id: 'sly',         pattern: /sly|coy|feigning|nonchalant|능청|능글|시치미/gi,                                     effect: 'playful mischievous sparkle in eye, knowing smirk, relaxed casual lean' },
    { id: 'intimidate',  pattern: /intimidat|menac|threaten|glare|추궁|서늘|위협|노려/gi,                               effect: 'menacing dark shadow on face, intimidating dark aura, piercing narrowed eyes' },
    { id: 'resign',      pattern: /resign|sigh|defeat|exhaust|체념|한숨|포기|탈진/gi,                                   effect: 'dark cloud above head, soul-leaving-body wisp, deflated slumped shoulders' },
    { id: 'possessive',  pattern: /possessiv|territorial|claiming|소유욕|독점|마킹|내꺼/gi,                             effect: 'dark possessive aura, territorial stance, intense focused gaze' },
    { id: 'flutter',     pattern: /flutter|heart.?skip|excited|설렘|두근|심쿵/gi,                                       effect: 'heart symbols floating, pink sparkle particles, deep rosy blush' },
    { id: 'resolute',    pattern: /resolut|determin|firm|단호|결연|결심|각오/gi,                                         effect: 'sharp angular emphasis lines behind, intense focused eye lighting, dramatic silhouette' },
    { id: 'absurd',      pattern: /absurd|disbelief|incredulous|황당|어이없|뭐야|헐/gi,                                 effect: 'floating ???? question marks, eye twitching, body leaning backward in disbelief' },
    { id: 'creepy',      pattern: /creepy|sinister|evil|섬뜩|음흉|으스스|사악/gi,                                       effect: 'small pupils with wide unsettling smile, dark ominous purple aura, half-shadow face' },
    { id: 'jealous',     pattern: /jealous|envious|resentful|질투|시기|부러|샘/gi,                                      effect: 'sharp side-eye glare, green jealousy aura, crossed arms defensive stance' },
    { id: 'moved',       pattern: /moved|touched|grateful|감동|벅찬|감사|뭉클/gi,                                      effect: 'happy tears glistening, warm golden light rays, sparkle particles' },
    { id: 'comedy',      pattern: /comedy|funny|hilarious|lol|코미디|웃긴|개웃/gi,                                      effect: 'spiral dizzy eyes, oversized O-mouth reaction, floating !!! marks, exaggerated full-body recoil' },
    { id: 'dominate',    pattern: /dominat|command|charisma|지배|명령|카리스마|군림/gi,                                  effect: 'powerful half-closed eyes, commanding gesture, intense power aura, low-angle emphasis' },
    { id: 'whiplash',    pattern: /whiplash|sudden.*change|twist|감정급반전|반전|충격반전/gi,                            effect: 'manga panel crack effect, dramatic lighting shift, shockwave radiating lines' },
    { id: 'romance',     pattern: /romantic|love|affection|sweet|kiss|로맨스|달달|사랑|애정/gi,                          effect: 'soft bloom glow, floating flower petals, warm pink-gold sparkle lighting' },
    { id: 'curious',     pattern: /궁금|호기심|뭐지|curious|wonder/gi,                                                effect: 'small ? mark floating, slightly tilted head, interested expression' },
    { id: 'puzzled',     pattern: /의아|이상|갸우뚱|puzzled|confused/gi,                                              effect: 'floating ? mark, head tilt, chin-touching pose' },
    { id: 'bored',       pattern: /심심|지루|멍|따분|bored|listless/gi,                                               effect: 'droopy spiral above head, chin on palm, half-lidded eyes' },
    { id: 'unbothered',  pattern: /무심|시큰둥|관심없|unbothered|indifferent/gi,                                       effect: 'looking away dismissively, relaxed posture' },
    { id: 'calm',        pattern: /평온|차분|고요|잔잔|calm|serene/gi,                                                effect: 'warm ambient glow, gentle peaceful atmosphere' },
    { id: 'disappointed',pattern: /서운|섭섭|아쉬|disappointed|let.?down/gi,                                          effect: 'subtle downturn of lips, soft melancholic atmosphere' },
    { id: 'annoyed',     pattern: /짜증|성가|귀찮|짜증나|annoy|irritat/gi,                                            effect: 'small anger vein, tight jaw, finger tapping, sharp exhale effect' },
    { id: 'bashful',     pattern: /민망|쑥스|부끄|쪽팔|shy|bashful/gi,                                                effect: 'light pink blush, hand covering mouth, averted gaze' },
    { id: 'lazy',        pattern: /귀찮|번거|하기싫|reluctant|lazy/gi,                                                effect: 'dark lazy cloud above head, limp posture, heavy-lidded eyes' },
    { id: 'mischievous', pattern: /장난|개구쟁이|짓궂|mischiev|playful|cheeky/gi,                                     effect: 'sparkling mischief in eyes, cheeky grin, sneaky leaning pose' },
    { id: 'panic',       pattern: /패닉|공황|극심한|panic|freak.?out/gi,                                              effect: 'chaotic motion lines, spiral eyes, multiple sweat drops flying, scattered !!!! marks' },
];

/** 만푸 에너지 부스트 — 스코어링 기반 (매칭 횟수로 주감정 판별) */
function getFluxEnergyBoost(emotion: string, cut: Cut | EditableCut): string {
    const sceneDesc = 'sceneDescription' in cut ? (cut as any).sceneDescription || '' : '';
    const combined = `${emotion} ${sceneDesc}`.toLowerCase();

    let bestEffect = '';
    let bestScore = 0;

    for (const entry of MANPU_TABLE) {
        const matches = combined.match(entry.pattern);
        if (matches && matches.length > bestScore) {
            bestScore = matches.length;
            bestEffect = entry.effect;
        }
    }

    return bestEffect;
}

/** 의상 추출 */
function extractOutfits(cut: Cut | EditableCut, ctx: FluxPromptContext): string {
    const customOutfit = 'characterOutfit' in cut ? cut.characterOutfit : '';
    if (customOutfit && customOutfit.trim()) {
        // DNA 오염 패턴 제거 (hair/face/skin/eyes 관련)
        const cleaned = customOutfit
            .replace(/\[.*?:\s*/g, '')
            .replace(/\]/g, '')
            .trim();
        if (cleaned) return 'wearing ' + cleaned;
    }
    return '';
}

/** 카메라/구도 정보 (cinematographyPlan에서 추출) */
function extractCamera(cut: Cut | EditableCut, ctx: FluxPromptContext): string {
    const cutId = cut.id;
    const cineCut = ctx.cinematographyPlan?.cuts?.find((c: any) => c.cutId === cutId);
    if (cineCut) {
        const parts = [cineCut.shotSize, cineCut.cameraAngle].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
    }

    // cinematographyPlan 없으면 cut.cameraAngle 폴백
    const angle = 'cameraAngle' in cut ? cut.cameraAngle : '';
    return angle || '';
}

/** 장소 묘사 — Phase 5-d: (location, sceneLayerId) 복합 키 resolver */
function extractLocation(cut: Cut | EditableCut, ctx: FluxPromptContext): string {
    const location = cut.location || '';
    const layerId = ('sceneLayerId' in cut && cut.sceneLayerId) ? cut.sceneLayerId : '현재';
    const dna = ctx.locationVisualDNA;
    const locDNA = dna[`${location}::${layerId}`] || dna[`${location}::현재`] || dna[location] || '';
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : '';

    if (locDesc) return locDesc;
    if (locDNA) return locDNA;
    return location;
}

/** FX 효과 → Flux 묘사로 변환 */
function extractFX(cut: Cut | EditableCut): string {
    const intent = 'directorialIntent' in cut ? cut.directorialIntent : '';
    if (!intent) return '';

    const FX_MAP: Record<string, string> = {
        'Vertical Gloom Lines': 'dramatic dark shadow lines, melancholic atmosphere',
        'Speed Lines': 'dynamic motion blur, kinetic energy lines',
        'Soft Bloom': 'ethereal soft glow, dreamy romantic lighting',
        'Sparkling Aura': 'magical shimmering sparkle particles, glowing aura',
        'Impact Frame': 'dramatic impact frame, bold dynamic composition',
        'Vignette': 'dark vignette edges, focused spotlight effect',
        'Lens Flare': 'cinematic lens flare, warm golden light streaks',
    };

    for (const [key, val] of Object.entries(FX_MAP)) {
        if (intent.includes(key)) return val;
    }
    return '';
}

// ─── 메인 프롬프트 빌더 ─────────────────────────────────────────

/**
 * buildFluxPrompt — Flux 전용 최종 프롬프트
 * 중요도순: 캐릭터 → 행동 → 감정 → 의상 → 카메라 → 배경 → 화풍 → FX
 */
export function buildFluxPrompt(cut: Cut | EditableCut, ctx: FluxPromptContext): string {
    const parts: string[] = [];

    // ★ 캐릭터 수 기반 프롬프트 프리픽스
    const rawCharacters = 'characters' in cut ? cut.characters : (cut as EditableCut).character;
    const charNames = rawCharacters ? rawCharacters.filter((c: string) => c?.trim()) : [];
    const characterCount = charNames.length;
    // ★ 1인 캐릭터: "solo" 제거 — Flux 자연어 모델에서 불필요
    if (characterCount === 2) {
        parts.push('two characters in the same scene');
    } else if (characterCount >= 3) {
        parts.push(`${characterCount} characters in the same scene, group shot`);
    }

    // 1순위: 캐릭터 (LoRA 트리거워드 or 외모 묘사)
    const characters = getCharacterDescriptions(cut, ctx);
    if (characters.length > 0) {
        parts.push(characters.join(', '));
    }

    // 2순위: 핵심 행동/장면 (★ characterNames 전달)
    const scene = extractSceneAction(cut, charNames);
    if (scene) parts.push(scene);

    // 3순위: 감정/표정
    const emotion = extractEmotion(cut);
    if (emotion) parts.push(emotion);

    // 4순위: 의상
    const outfits = extractOutfits(cut, ctx);
    if (outfits) parts.push(outfits);

    // 5순위: 카메라/구도
    const camera = extractCamera(cut, ctx);
    if (camera) parts.push(camera);

    // 6순위: 배경/장소
    const location = extractLocation(cut, ctx);
    if (location) parts.push(location);

    // 7순위: 화풍
    const hasStyleLora = ctx.styleLoraId && ctx.loraRegistry?.find((e: any) => e.id === ctx.styleLoraId);
    const isLoraModelForStyle = ctx.fluxModel === 'flux-lora';

    if (isLoraModelForStyle && hasStyleLora) {
        // LoRA 모델 + 화풍 LoRA → 트리거워드만
        const styleLora = ctx.loraRegistry!.find((e: any) => e.id === ctx.styleLoraId);
        if (styleLora?.triggerWord) parts.push(styleLora.triggerWord);
    } else {
        // Pro/Flex 또는 화풍 LoRA 없음 → 텍스트 키워드
        const style = getFluxStyleKeywords(ctx.artStyle, '');
        if (style) parts.push(style);
    }

    // 8순위: FX 효과 (있으면)
    const fx = extractFX(cut);
    if (fx) parts.push(fx);

    parts.push('soft focus background');

    // ★ 최종 길이 제한 — Flux 스윗스팟 80단어
    const joined = parts.join(', ');
    const words = joined.split(/\s+/);
    if (words.length > 80) {
        console.warn(`[FluxPromptEngine] 규칙 기반 프롬프트 ${words.length}단어 → 80단어로 트리밍`);
        return words.slice(0, 80).join(' ');
    }
    return joined;
}

// ─── Flux 프롬프트 오염 방지 ──────────────────────────────────────

/** Flux 프롬프트에서 Gemini 방어 로직 오염 검출 및 제거 */
function sanitizeFluxPrompt(prompt: string): string {
    const DEFENSE_PATTERNS = [
        /\[ABSOLUTE[^\]]*\]/gi,
        /\[CRITICAL[^\]]*\]/gi,
        /\[MANDATORY[^\]]*\]/gi,
        /\bFACE MASK\b/gi,
        /\bIDENTITY PRESERVATION\b/gi,
        /\bIDENTITY LOCK\b/gi,
        /\bPOSE SEPARATION\b/gi,
        /\bGLOBAL NEGATIVE\b/gi,
        /\bDO NOT replicate\b/gi,
        /\bDO NOT reproduce\b/gi,
        /\bMUST FOLLOW\b/gi,
        /\bACTING NEGATIVES\b/gi,
        /\bNEVER replicate\b/gi,
        /# \[.*?OVERRIDE.*?\]/gi,
        /# \[.*?NEGATIVE.*?\]/gi,
    ];

    let cleaned = prompt;
    let contaminated = false;

    for (const pattern of DEFENSE_PATTERNS) {
        if (pattern.test(cleaned)) {
            contaminated = true;
            cleaned = cleaned.replace(pattern, '');
        }
    }

    if (contaminated) {
        console.warn('[FluxPromptEngine] ⚠️ Gemini 방어 로직 오염 감지 — 자동 제거됨');
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    }

    return cleaned;
}

// ─── 인서트 컷 (캐릭터 없는 배경 전용) ──────────────────────────

/**
 * buildFluxInsertPrompt — 캐릭터 없는 배경 전용 프롬프트
 */
export function buildFluxInsertPrompt(cut: Cut | EditableCut, ctx: FluxPromptContext): string {
    const scene = 'sceneDescription' in cut ? cut.sceneDescription : '';
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : '';
    const location = cut.location || '';
    const style = getFluxStyleKeywords(ctx.artStyle, '');

    return sanitizeFluxPrompt([
        locDesc || location,
        scene ? scene.replace(/\[.*?\]/g, '').trim() : '',
        'no people, empty scene, background art',
        style,
    ].filter(Boolean).join(', '));
}

// ─── Phase 7-A: Claude 프롬프트 번역 — translatePromptWithClaude 삭제됨 (Flux 오염 방지)
// 레거시 함수 제거: geminiPrompt를 그대로 받아 번역하던 경로 → 방어 로직 유입 위험

// ─── Phase 7-B: 구조화 입력 기반 스마트 프롬프트 ─────────────

interface StructuredFluxInput {
    characters: { name: string; triggerWord?: string; bodyHint: string; appearance: string; physique: string; outfit: string }[];
    action: string;
    pose: string;
    emotion: string;
    camera: string;
    location: string;
    fx: string;
    styleTrigger?: string;
}

/** 캐릭터 설정에서 체형 키워드 추출 */
function extractPhysique(char: CharacterDescription | null): string {
    if (!char) return '';
    const appearance = char.baseAppearance || '';
    const bodyMatch = appearance.match(/\b(slim|lean|athletic|petite|slender|tall|muscular|thin|small|curvy)\b/gi);
    return bodyMatch ? bodyMatch.join(' ') : '';
}

/** Cut 필드에서 개별 캐릭터 의상 추출 */
function extractCharacterOutfit(
    cut: Cut | EditableCut,
    name: string,
    char: CharacterDescription | null,
    ctx: FluxPromptContext
): string {
    const customOutfit = 'characterOutfit' in cut ? (cut as any).characterOutfit : '';
    if (customOutfit && customOutfit.trim()) {
        // 멀티 캐릭터: [이름: 의상] 패턴 추출
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\[${escapedName}:\\s*(.*?)\\]`, 'i');
        const match = customOutfit.match(regex);
        if (match?.[1]?.trim()) return match[1].trim();
        // 단일 캐릭터: 전체가 의상
        if (!customOutfit.includes('[')) return customOutfit.trim();
    }
    // 폴백: 장소별 의상 → 기본 외모. Phase 5-d: 복합 키 우선 조회.
    const location = ('location' in cut ? (cut as any).location : '') || '';
    const layerId = ('sceneLayerId' in cut && (cut as any).sceneLayerId) ? (cut as any).sceneLayerId : '현재';
    return char?.locations?.[`${location}::${layerId}`]
        || char?.locations?.[`${location}::현재`]
        || char?.locations?.[location]
        || char?.baseAppearance
        || '';
}

/** Cut 필드에서 구조화 데이터 직접 추출 (geminiPrompt 무관) */
function buildStructuredInput(
    cut: Cut | EditableCut,
    ctx: FluxPromptContext,
    characterNames: string[]
): StructuredFluxInput {
    const registry = ctx.loraRegistry || [];
    const isLoraModel = ctx.fluxModel === 'flux-lora';

    const chars = characterNames.map(nameOrId => {
        const charId = resolveCharId(nameOrId, ctx.characterDescriptions);
        const char = charId ? ctx.characterDescriptions[charId] : null;
        const displayName = char?.koreanName || nameOrId;
        const loraEntry = (isLoraModel && char?.loraId)
            ? registry.find(e => e.id === char.loraId) : null;

        return {
            name: displayName,
            triggerWord: loraEntry?.triggerWord,
            bodyHint: getBodyTypeHint(ctx.artStyle, char?.gender),
            appearance: (() => {
                // LoRA: triggerWord가 대체하므로 appearance 중요도 낮음
                if (isLoraModel && loraEntry?.triggerWord) return char?.baseAppearance || displayName;
                // Pro/Flex: 분리 DNA가 있으면 조합 (HEX 색상 포함, 더 정밀)
                // Claude가 FLUX_STRUCTURED_SYSTEM 압축 규칙에 따라 핵심만 선별
                const hair = char?.hairStyleDescription;
                const face = char?.facialFeatures;
                if (hair || face) return [hair, face].filter(Boolean).join(', ');
                return char?.baseAppearance || displayName;
            })(),
            physique: extractPhysique(char),
            outfit: extractCharacterOutfit(cut, displayName, char, ctx),
        };
    });

    // 화풍 LoRA 트리거워드 (LoRA 모델일 때만)
    let styleTrigger: string | undefined;
    if (isLoraModel && ctx.styleLoraId && ctx.loraRegistry) {
        const styleLora = ctx.loraRegistry.find(e => e.id === ctx.styleLoraId);
        styleTrigger = styleLora?.triggerWord;
    }

    return {
        characters: chars,
        action: extractSceneAction(cut, characterNames),
        pose: extractPose(cut),
        emotion: extractEmotion(cut),
        camera: extractCamera(cut, ctx),
        location: extractLocation(cut, ctx),
        fx: extractFX(cut),
        styleTrigger,
    };
}

const FLUX_STRUCTURED_SYSTEM = `You are a Flux image generation prompt writer.
Convert structured scene data into a single natural-language Flux prompt.

CRITICAL GOAL: The viewer must feel the character's emotion instantly — if they scroll past without feeling anything, you failed.

## OUTPUT FORMAT
- Output ONLY the prompt text. No markdown, headers, rules, brackets, or weight notation.
- Write in flowing descriptive prose — like describing a scene to a painter. NOT keyword lists.
- Use active present-tense verbs: "gripping" not "gripped", "lunging forward" not "lunged forward".
- STRICT LIMIT: 60 words maximum. Count carefully. Every word must earn its place.
- Preserve HEX color codes from outfit descriptions (e.g., #B8956A).

## PRIORITY ORDER (this is the order words appear in the prompt)
1. ART STYLE — begin the prompt with the art style.
   Example: "In warm glowing chibi anime style, ..."
2. CHARACTER IDENTITY — appearance + outfit merged in one phrase.
3. ACTION + EMOTION + POSE — the frozen moment.
4. CAMERA + BACKGROUND — woven into the scene.

## ART STYLE (FIRST WORDS OF PROMPT)
- Start every prompt with the art style description.
- ALL elements — characters AND backgrounds — must match this style.
- Background MUST be illustrated/stylized when style is anime/chibi.
  ✅ "illustrated anime-style police station with warm fluorescent glow"
  ❌ "realistic police station interior"

## CHARACTER + OUTFIT (MERGED — NEVER SEPARATE)
- Character = appearance + outfit in ONE continuous phrase. Never split them.
  ✅ "a brown-haired chibi boy in a wrinkled navy blazer and loosened red tie"
  ❌ "a boy with brown hair" (outfit missing)
  ❌ "a brown-haired boy. He wears a blazer." (separated into two sentences)
- Outfit is CHARACTER IDENTITY — never compress, abbreviate, or omit clothing details.
- Keep character+outfit phrase under 20 words.
- If triggerWord provided: use it as name, add bodyHint, then outfit.
  Example: "dss_boy, chibi boy small slim body, in wrinkled navy blazer, ..."

## SINGLE CHARACTER (1 person)
- Begin with art style, then character identity directly. No "solo" tag.

## TWO CHARACTERS (2 people)
- After art style, state "Two characters,"
- Describe spatial relationship: who is LEFT/RIGHT or FOREGROUND/BACKGROUND.
- Each character gets a FULL identity phrase (appearance+outfit).
- Characters MUST visually differ: different hair color/style, different clothing.

## SCENE CONSTRUCTION
- Merge Pose and Scene into one fluid freeze-frame description.
- Emotion shows through body AND face AND manga effects (sweat drops, sparkles, veins).
- Camera angle weaves into prose: "seen from below, she towers over him" not "low angle shot".

## BACKGROUND
- Background description MUST include art style prefix.
- Close-up/medium: "soft focus illustrated background"
- Wide/full: describe background in focus WITH art style modifier.
- Insert shots: describe subject in sharp detail with stylized surroundings.

## WHAT NOT TO DO
- Do NOT use negative language ("no blur", "without extra people").
  Describe what IS there: "sharp focus", "single character in frame".
- Do NOT list style keywords with commas at the end.
- Do NOT contradict art style ("photorealistic" with "chibi anime" = conflict).`;

/** 구조화 데이터 → Claude가 자연어 Flux 프롬프트로 변환 */
async function translateStructuredToFlux(
    input: StructuredFluxInput,
    artStyle: ArtStyle
): Promise<string> {
    try {
        const charDescriptions = input.characters.map(c => {
            const physique = c.physique ? `, physique="${c.physique}"` : '';
            if (c.triggerWord) {
                return `- ${c.name}: triggerWord="${c.triggerWord}", bodyType="${c.bodyHint}"${physique}, outfit="${c.outfit}"`;
            }
            return `- ${c.name}: appearance="${c.appearance}", bodyType="${c.bodyHint}"${physique}, outfit="${c.outfit}"`;
        }).join('\n');

        // ★ Claude에게 스타일 키워드를 명시적으로 전달 → 산문에 녹이게
        const styleKeywords = input.styleTrigger || getFluxStyleKeywords(artStyle, '');
        const styleLabel = `Art style to integrate naturally: ${styleKeywords}`;

        const userMessage = `Characters:
${charDescriptions}

Scene: ${input.action}
${input.pose ? `Pose: ${input.pose}` : ''}
Emotion: ${input.emotion}
Camera: ${input.camera}
Location: ${input.location}
${input.fx ? `FX: ${input.fx}` : ''}
${styleLabel}`;

        const res = await callClaude(FLUX_STRUCTURED_SYSTEM, userMessage, {
            temperature: 0.3,
            maxTokens: 500,
        });

        const translated = res.text.trim();
        if (translated) {
            // ★ Claude가 스타일을 프롬프트 안에 녹였으므로 후처리 접합 불필요
            // LoRA 트리거워드만 Claude가 모를 수 있으므로 안전장치
            let finalPrompt = translated;
            if (input.styleTrigger && !translated.includes(input.styleTrigger)) {
                finalPrompt = `${translated}, ${input.styleTrigger}`;
            }
            console.log('[FluxPromptEngine] 구조화→Flux 변환:', finalPrompt.substring(0, 80) + '...');
            return finalPrompt;
        }
        return '';
    } catch (error: any) {
        console.warn('[FluxPromptEngine] Claude 변환 실패, 규칙 기반 폴백:', error.message?.slice(0, 80));
        return '';
    }
}

// ─── P2: JSON 구조화 프롬프트 (전 씬 적용, LoRA 제외) ─────────────────────────

interface FluxJSONSubject {
    description: string;
    position: string;
    action: string;
}

interface FluxJSONPrompt {
    style: string;
    subjects: FluxJSONSubject[];
    scene: {
        description: string;
        location: string;
        camera: string;
        mood: string;
    };
}

/** 한국어 + 한국어 물음표/느낌표 제거 */
const stripKorean = (s: string): string =>
    s.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+[?!]?/g, '').replace(/\s{2,}/g, ' ').trim();

/** location에서 감정/조명 오염 제거 — 장소 정보만 남김 */
const cleanLocation = (loc: string): string =>
    loc.replace(/Lighting:.*$/i, '')
       .replace(/expression.*$/i, '')
       .replace(/tear.*visible/gi, '')
       .replace(/surprised.*$/i, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

/** baseAppearance에서 중복 HEX 라벨 제거 (Hair:#xxx Eyes:#xxx Skin:#xxx Distinctive:) */
const compressAppearance = (desc: string): string =>
    desc.replace(/Hair:#\w+\s*/gi, '')
        .replace(/Eyes:#\w+\s*/gi, '')
        .replace(/Skin:#\w+\s*/gi, '')
        .replace(/Distinctive:\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

/** 전 씬에서 JSON 구조화 프롬프트 생성 (Claude 호출 없음) */
function buildFluxJSON(
    input: StructuredFluxInput,
    artStyle: ArtStyle,
): string {
    const styleKeywords = input.styleTrigger || getFluxStyleKeywords(artStyle, '');

    // 위치 자동 배정 (최대 5인)
    const POSITIONS = [
        'left side of frame',
        'right side of frame',
        'center of frame',
        'far left background',
        'far right background',
    ];

    // 1인 씬: 위치 불필요
    const singleChar = input.characters.length <= 1;

    const subjects: FluxJSONSubject[] = input.characters.map((c, i) => {
        // 의상 → 외모 순서 (의상 우선으로 레퍼런스 이미지 의상 복제 방지)
        const identityParts: string[] = [];
        if (c.outfit) {
            identityParts.push(`MUST be wearing ${c.outfit}`);
        }
        if (c.triggerWord) {
            // ★ LoRA: triggerWord만 사용 (LoRA가 외모+proportion을 이미 학습했으므로
            //    긴 appearance/bodyHint는 오히려 방해 — fal.ai 공식 권장 "simpler prompts")
            identityParts.push(c.triggerWord);
        } else if (c.appearance) {
            // Pro/Flex: 압축 appearance + proportion 힌트
            identityParts.push(compressAppearance(c.appearance));
            if (c.bodyHint) identityParts.push(c.bodyHint);
        }

        // per-character action 분리 시도
        let charAction = stripKorean(input.action || 'standing');
        if (input.characters.length >= 2 && c.name) {
            // sceneDescription에서 캐릭터 이름 기반 문장 추출
            const sentences = input.action.split(/[,.;]\s*|(?:\s+(?:while|as|but|and)\s+)/i);
            const matched = sentences.find(s => s.includes(c.name));
            if (matched) charAction = matched.trim();
        }

        return {
            description: identityParts.join(', '),
            position: singleChar ? 'center' : (POSITIONS[i] || `position ${i + 1}`),
            action: charAction,
        };
    });

    // 0인 씬 (인서트 컷): 빈 subjects
    const artStylePrefix = artStyle.replace(/-/g, ' ');
    const styledLocation = input.location.toLowerCase().includes('illustrated')
        ? input.location
        : `illustrated ${artStylePrefix} style ${cleanLocation(input.location)}, all elements drawn in anime illustration style`;

    // ★ 장면 묘사 조립: 캐릭터를 의상으로 식별 (이중 강제)
    let sceneDescription = stripKorean(input.action || '');
    if (input.characters.length > 0 && sceneDescription) {
        const charSnippets = input.characters.map(c => {
            const outfitShort = c.outfit ? c.outfit.split(',')[0].trim() : '';
            return outfitShort ? `a person in ${outfitShort}` : (c.appearance?.split(',')[0]?.trim() || 'a character');
        });
        if (charSnippets.length === 1) {
            sceneDescription = `${charSnippets[0]} ${sceneDescription}`;
        } else if (charSnippets.length === 2) {
            sceneDescription = `${charSnippets[0]} and ${charSnippets[1]}, ${sceneDescription}`;
        } else {
            sceneDescription = `${charSnippets.join(', ')}, ${sceneDescription}`;
        }
    }

    const json: FluxJSONPrompt = {
        style: styleKeywords,
        subjects,
        scene: {
            description: sceneDescription,
            location: styledLocation,
            camera: input.camera || 'eye level medium shot',
            mood: stripKorean(input.emotion || '').replace(/^[,\s]+|[,\s]+$/g, ''),
        },
    };

    // FX가 있으면 mood에 병합
    if (input.fx) {
        const cleanFx = stripKorean(input.fx).replace(/^[,\s]+|[,\s]+$/g, '');
        if (cleanFx) {
            json.scene.mood = json.scene.mood ? `${json.scene.mood}, ${cleanFx}` : cleanFx;
        }
    }

    // pose가 있으면 첫 번째 subject의 action에 병합
    if (input.pose && subjects.length > 0) {
        subjects[0].action = subjects[0].action === 'standing'
            ? input.pose
            : `${subjects[0].action}, ${input.pose}`;
    }

    const jsonString = JSON.stringify(json, null, 2);
    console.log(`[FluxPromptEngine] buildFluxJSON (${subjects.length}명):`, jsonString.substring(0, 120) + '...');
    return jsonString;
}

// ─── P3: Claude 검수 시스템 — reviewFluxJSON ─────────────────────────

const FLUX_JSON_REVIEW_SYSTEM = `You are a Flux image prompt quality reviewer.
Given a JSON prompt for Flux image generation, check for these issues:

CHECKLIST:
1. OUTFIT MISSING: Every subject must have clothing in description. Flag if absent.
2. CHARACTER SIMILARITY: 2+ subjects with similar hair AND similar clothing = conflict.
3. STYLE MISMATCH: Location must match the style field (no "realistic" with "chibi").
4. SPATIAL AMBIGUITY: 2+ subjects need distinct positions.

OUTPUT FORMAT — JSON only, no markdown, no code fences:
{"pass":true,"fixes":[]}

Or if issues found (max 3 fixes):
{"pass":false,"fixes":[
  {"field":"subjects[1].description","issue":"no outfit","fix":"append ', wearing beige trench coat'"},
  {"field":"subjects[0].description","issue":"similar to subjects[1]","fix":"change hair to 'short black crew cut hair'"}
]}

CRITICAL RULES FOR fix VALUES:
- "fix" must be ONE of these exact patterns:
  - append 'TEXT'  — append text to the field value
  - change X to 'TEXT' — replace the first segment (before first comma) with TEXT
  - A direct replacement string (no instructions, no "remove X and replace with Y")
- The fix value must be PURE DESCRIPTIVE TEXT. Never include instructions, JSON syntax, markdown, or code fences.
- Do NOT rewrite the entire field. Minimal correction only.
- If pass=true, return exactly: {"pass":true,"fixes":[]}`;

/** P3: Claude 검수 — JSON 프롬프트 품질 체크 + 자동 패치 */
async function reviewFluxJSON(jsonPrompt: string): Promise<string> {
    try {
        const res = await callClaude(FLUX_JSON_REVIEW_SYSTEM, jsonPrompt, {
            temperature: 0,
            maxTokens: 300,
        });

        const reviewText = res.text.trim();

        // JSON 파싱 시도
        let review: { pass: boolean; fixes: { field: string; issue: string; fix: string }[] };
        try {
            review = JSON.parse(reviewText);
        } catch {
            console.warn('[FluxPromptEngine] 검수 JSON 파싱 실패, 원본 사용');
            return jsonPrompt;
        }

        if (review.pass || !review.fixes?.length) {
            console.log('[FluxPromptEngine] 검수 통과 ✅');
            return jsonPrompt;
        }

        // 자동 패치 적용
        let patched = JSON.parse(jsonPrompt);
        for (const fix of review.fixes) {
            // ★ 지시문 형태의 fix 차단 (remove/replace/rewrite/delete 등)
            if (/\b(remove|replace|rewrite|delete|instead|should)\b/i.test(fix.fix) && !fix.fix.startsWith('change ') && !fix.fix.startsWith('append ')) {
                console.warn(`[FluxPromptEngine] 지시문 fix 차단: ${fix.fix.substring(0, 60)}...`);
                continue;
            }
            console.log(`[FluxPromptEngine] 검수 패치: ${fix.field} — ${fix.issue} → ${fix.fix}`);

            // subjects[N].description 패턴 처리
            const subjectMatch = fix.field.match(/^subjects\[(\d+)\]\.(\w+)$/);
            if (subjectMatch) {
                const idx = parseInt(subjectMatch[1]);
                const key = subjectMatch[2];
                if (patched.subjects?.[idx]) {
                    if (fix.fix.startsWith('append ')) {
                        const appendText = fix.fix.replace(/^append\s+'/, '').replace(/'$/, '');
                        patched.subjects[idx][key] = (patched.subjects[idx][key] || '') + appendText;
                    } else if (fix.fix.startsWith('change ')) {
                        // change X to 'Y' 패턴에서 Y 추출하여 교체
                        const changeMatch = fix.fix.match(/change\s+\w+\s+to\s+'([^']+)'/i);
                        if (changeMatch?.[1]) {
                            patched.subjects[idx][key] = patched.subjects[idx][key]
                                .replace(/^[^,]+/, changeMatch[1]);
                            console.log(`[FluxPromptEngine] change fix applied: ${fix.field} → ${changeMatch[1]}`);
                        } else {
                            console.log(`[FluxPromptEngine] change fix unparseable: ${fix.fix}`);
                        }
                    } else {
                        patched.subjects[idx][key] = fix.fix;
                    }
                }
            } else if (fix.field === 'scene.location') {
                patched.scene.location = fix.fix;
            } else if (fix.field === 'scene.mood') {
                patched.scene.mood = fix.fix;
            }
        }

        const patchedString = JSON.stringify(patched, null, 2);
        console.log('[FluxPromptEngine] 검수 패치 완료 🔧:', patchedString.substring(0, 120) + '...');
        return patchedString;
    } catch (error: any) {
        console.warn('[FluxPromptEngine] 검수 실패, 원본 사용:', error.message?.slice(0, 80));
        return jsonPrompt;
    }
}

export async function buildFluxPromptSmart(
    cut: Cut | EditableCut,
    ctx: FluxPromptContext,
    options?: { useClaude?: boolean }
): Promise<string> {
    const rawCharacters = 'characters' in cut ? cut.characters : [];
    const characters = rawCharacters ? rawCharacters.filter((c: string) => c?.trim()) : [];

    // ★ 모든 Flux 모델(LoRA 포함) JSON 경로 사용
    //    - buildStructuredInput이 LoRA triggerWord + styleTrigger를 자동 주입
    //    - buildFluxJSON이 triggerWord 감지 시 appearance/bodyHint를 생략해 프롬프트 최소화
    //    - LoRA와 Pro/Flex의 유일한 구조적 차이는 "triggerWord로 인물을 지칭하느냐"뿐
    const structuredInput = buildStructuredInput(cut, ctx, characters);
    const jsonPrompt = buildFluxJSON(structuredInput, ctx.artStyle);

    // ★ 1인 이상 → Claude 검수 (의상 누락 / 화풍-장소 모순 / 인물 유사도 / 공간 모호성 체크)
    //    인서트 컷(0인)만 검수 스킵
    if (characters.length >= 1 && options?.useClaude !== false) {
        const reviewed = await reviewFluxJSON(jsonPrompt);
        return sanitizeChildSafety(sanitizeFluxPrompt(reviewed));
    }

    return sanitizeChildSafety(sanitizeFluxPrompt(jsonPrompt));
}

// ─── 이미지대본 직통 번역 (상세대본 → Flux) ─────────────────────────

const IMAGE_SCRIPT_FLUX_SYSTEM = `You are a Flux image generation prompt translator.
Convert Korean image descriptions into English Flux-optimized prompts.

CRITICAL GOAL: The viewer must feel the character's emotion instantly from the image alone.

Rules:
- Output ONLY the prompt text. No markdown, headers, rules, or brackets
- Translate the ENTIRE description faithfully — do not add, remove, or reinterpret
- Natural descriptive prose, not keyword lists
- Use active present-tense verbs. Write flowing prose, not keyword lists.
- Replace Korean character names with their designated trigger words or appearance descriptions
- Camera angles: translate directly (클로즈업→close-up, 미디엄샷→medium shot, 풀샷→full shot)
- Manga effects: translate to visual descriptions (땀방울→sweat drops, 별 이펙트→star burst effect)
- Preserve HEX color codes from descriptions.
- STRICT LIMIT: 60 words maximum.
- 1 character → begin with character description directly. Do NOT use "solo" tag.
- 회상 톤 → append "nostalgic warm tone, soft dreamy filter"
- 상상 장면 → append "fantasy dreamlike scene, bokeh cloud background"
- Integrate art style naturally into prose — do not list keywords with commas at the end.
- Every frame is a manga freeze-frame: mid-action, dynamic, alive`;

/** 이미지대본 전용: 이미지프롬프트 원문 → Flux 프롬프트 직통 번역 */
export async function translateImageScriptToFlux(
    imagePromptText: string,
    characters: { koreanName: string; triggerWord?: string; appearance?: string }[],
    artStyle: ArtStyle,
    options?: {
        styleLoraId?: string;
        loraRegistry?: LoRAEntry[];
        fluxModel?: 'flux-pro' | 'flux-flex' | 'flux-lora';
    }
): Promise<string> {
    // 캐릭터 매핑 빌드
    const isLoraModel = options?.fluxModel === 'flux-lora';
    const charMapping = characters.map(c => {
        if (isLoraModel && c.triggerWord) {
            return `${c.koreanName} → ${c.triggerWord}`;
        }
        return `${c.koreanName} → ${c.appearance || c.koreanName}`;
    }).join('\n');

    // 화풍 키워드
    let styleKeywords: string;
    if (isLoraModel && options?.styleLoraId && options?.loraRegistry) {
        const styleLora = options.loraRegistry.find(e => e.id === options.styleLoraId);
        styleKeywords = styleLora?.triggerWord || getFluxStyleKeywords(artStyle, '');
    } else {
        styleKeywords = getFluxStyleKeywords(artStyle, '');
    }

    // 화풍은 이름만 전달 (Claude 증폭 방지), 키워드는 후처리
    const userMessage = `Character mapping:
${charMapping}

Art style: ${artStyle}

Translate this image description to Flux prompt:
${imagePromptText}`;

    try {
        const res = await callClaude(IMAGE_SCRIPT_FLUX_SYSTEM, userMessage, {
            temperature: 0.3,
            maxTokens: 500,
        });

        const translated = res.text.trim();
        if (translated) {
            // ★ 스타일 LoRA 트리거만 보정 (Claude가 스타일을 산문에 녹임)
            let finalPrompt = translated;
            if (isLoraModel && options?.styleLoraId) {
                const styleLora = options.loraRegistry?.find(e => e.id === options.styleLoraId);
                if (styleLora?.triggerWord && !translated.includes(styleLora.triggerWord)) {
                    finalPrompt = `${translated}, ${styleLora.triggerWord}`;
                }
            }
            console.log('[FluxPromptEngine] 이미지대본 직통 번역:', finalPrompt.substring(0, 80) + '...');
            return finalPrompt;
        }
        return '';
    } catch (error: any) {
        console.warn('[FluxPromptEngine] 이미지대본 번역 실패:', error.message?.slice(0, 80));
        return '';
    }
}
