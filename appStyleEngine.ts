// appStyleEngine.ts — React 의존 제로, 순수 함수만
// 화풍 프롬프트 빌더 + 최종 이미지 프롬프트 조립기

import type { Cut, EditableCut, CharacterDescription, ArtStyle, CinematographyPlan } from './types';

// ─── 화풍 프롬프트 빌더 ─────────────────────────────────────────────
export function buildArtStylePrompt(
    artStyle: ArtStyle,
    customArtStyle: string,
    overrideStyle?: ArtStyle,
    overrideCustomText?: string,
): string {
    const targetStyle = overrideStyle || artStyle;
    const targetCustomText = overrideCustomText !== undefined ? overrideCustomText : customArtStyle;

    const IDENTITY_PROTECTION_CLAUSE = `
# [CRITICAL: IDENTITY PROTECTION]
- **ABSOLUTE PRIORITY:** The facial features (eyes, nose, mouth shape, bone structure) defined in the 'Master Identity DNA' or provided in the reference image MUST be preserved 100%.
- **STYLE vs IDENTITY:** Apply the art style (coloring, lighting, line weight) to the *rendering*, but NEVER change the *geometry* of the character's face.
- **NO BABY FACE:** Do not make adult characters look like toddlers unless specified. Maintain their original age and maturity.
`;

    const COMMON_NEGATIVE = `(nsfw, low quality, worst quality:1.4), (text, signature, watermark:1.3)`;

    const MOE_PROMPT = `
[STYLE: Moe / Super-Deformed]
[COLOR PALETTE]: **Warm & Pastel**. Primary colors: Soft Pink, Cream Yellow, Peach. Avoid dark blacks; use dark browns or deep purples for outlines.
[LIGHTING]: Soft, diffused lighting with a "Bloom" effect. No harsh shadows.
[CHARACTER]: Head-to-body ratio 1:2.5. Large expressive eyes with sparkling highlights.
[VIBE]: Cute, bubbly, energetic, cheerful.`;

    const KYOTO_PROMPT = `
[STYLE: Kyoto Animation / High-Fidelity Anime]
[COLOR PALETTE]: **Cool & Transparent**. Primary colors: Azure Blue, Emerald Green, Pure White. High saturation but distinct "clear air" feel.
[LIGHTING]: Cinematic "Magic Hour" or Bright Daylight. Strong rim lighting (backlight) and lens flares. Detailed light reflections in eyes.
[DETAILS]: Delicate hair strands, intricate background art (Makoto Shinkai style clouds/sky).
[VIBE]: Emotional, nostalgic, high-budget production value.`;

    const VIBRANT_PROMPT = `
[STYLE: Mature Webtoon / Dopamine]
[COLOR PALETTE]: **High Contrast & Deep Saturation**. Primary colors: Royal Blue, Magenta, Gold. Deep, rich shadows (not grey).
[LIGHTING]: Dramatic studio lighting. "Rembrandt" lighting or strong Chiaroscuro. Glossy skin highlights.
[CHARACTER]: Adult proportions (1:7). Sharp jawlines, intense gaze.
[VIBE]: Sexy, intense, dynamic, impactful.`;

    const DALLE_CHIBI_PROMPT = `
[STYLE: Premium High-Detail SD Illustration]
[COLOR PALETTE]: **Warm, Creamy & Glowing**. Use a specific color grading: Soft Amber, Rose Gold, Warm Beige, and Pastel Pink. Avoid cold or dull grey tones. The image should look like it has a "Warm Filter" applied.
[LIGHTING]: **Magical Backlight & Bloom**. Strong rim lighting causing a "halo" effect around the character. Soft "Bloom" filter applied to the whole image. Sparkling particles in the air.
[RENDERING]: High-quality anime illustration. Soft gradients on hair and skin. Glossy eyes with complex reflections. NOT 3D, NOT Clay.
[VIBE]: Romantic, dreamy, cute, "idol merchandise" quality.`;

    const NORMAL_PROMPT = `
[STYLE: Standard Webtoon]
[COLOR PALETTE]: Bright, clean, standard digital art colors.
[LIGHTING]: Even, flat lighting for readability.
[RENDERING]: Cel-shading with hard edges.
[VIBE]: Casual, approachable, easy to read.`;

    const TECHNICAL_CONSTRAINTS = `ABSOLUTELY NO American cartoon, western comics, realism, or 3D rendering styles (unless specified). High quality illustration. Clear line art.
[HIGH PERFORMANCE GUIDANCE]: Focus on EXAGGERATED MANGA EXPRESSIONS. Body language must be dynamic with clear weight shifts.`;

    const fullPrompt = targetStyle === 'custom' && targetCustomText.trim()
        ? targetCustomText
        : (() => {
            switch (targetStyle) {
                case 'vibrant': return `${TECHNICAL_CONSTRAINTS}\n\n${VIBRANT_PROMPT}`;
                case 'moe': return `${TECHNICAL_CONSTRAINTS}\n\n${MOE_PROMPT}`;
                case 'dalle-chibi': return DALLE_CHIBI_PROMPT;
                case 'kyoto': return `${TECHNICAL_CONSTRAINTS}\n\n${KYOTO_PROMPT}`;
                case 'normal': default: return `${TECHNICAL_CONSTRAINTS}\n\n${NORMAL_PROMPT}`;
            }
        })();

    return `${IDENTITY_PROTECTION_CLAUSE}\n\n${fullPrompt}`;
}

/**
 * 비율 스튜디오 전용 — 비율 관련 네거티브를 제거한 스타일 프롬프트
 */
export function buildProportionStylePrompt(
    artStyle: ArtStyle,
    customArtStyle: string
): string {
    const full = buildArtStylePrompt(artStyle, customArtStyle);

    return full
        .replace(/\(realistic proportions[^)]*\),?\s*/g, '')
        .replace(/\(chibi,?\s*SD,?\s*super-deformed[^)]*\),?\s*/g, '')
        .replace(/\(small body[^)]*\),?\s*/g, '')
        .replace(/\(modest proportions[^)]*\),?\s*/g, '')
        .replace(/\(childlike body[^)]*\),?\s*/g, '')
        .replace(
            'This is a manga/chibi-style YouTube Shorts illustration.',
            'This is a manga-style illustration.'
        );
}

// ─── 씬 무드 감지 시스템 ─────────────────────────────────────────────
type SceneMood = 'calm' | 'energetic' | 'romantic' | 'tense' | 'neutral';

interface MoodPattern {
    mood: SceneMood;
    pattern: RegExp;
}

const MOOD_PATTERNS: MoodPattern[] = [
    // calm: 조용한/차분한/잠든/눕기/이불/밤/어둠/고요
    { mood: 'calm', pattern: /\b(close-?up|blanket|bed|sleep|dark|quiet|still|lying|rest|phone.*light|dim|dawn|dusk|alone|silent|solitude|contemplat|gaze|stare|lean|sit quietly|이불|침대|잠|어둠|고요|혼자|멍|누워|조용|차분|새벽)\b/i },
    // energetic: 뛰기/싸움/놀람/흥분/빠른 동작
    { mood: 'energetic', pattern: /\b(run|jump|fight|punch|kick|chase|rush|dash|slam|shout|yell|burst|explode|crash|surprise|shock|angry|rage|fury|storm|뛰|달리|싸|때리|놀라|흥분|소리|폭발|분노|급하|빠르)\b/i },
    // romantic: 로맨스/따뜻/감동/사랑
    { mood: 'romantic', pattern: /\b(romantic|tender|gentle|embrace|hug|kiss|blush|love|warm|sweet|soft touch|hand hold|lean.*shoulder|cuddle|nostalg|로맨|따뜻|사랑|감동|포옹|안기|기대|볼빨간|설레|추억|다정)\b/i },
    // tense: 긴장/공포/충격/불안
    { mood: 'tense', pattern: /\b(tense|nervous|anxious|fear|dread|creep|shadow|threat|confront|stare down|frozen|sweat|tremble|gulp|whisper|sneak|hide|긴장|불안|공포|두려|떨리|숨|위협|대치|얼어|식은땀)\b/i },
];

function detectSceneMood(sceneDesc: string, emotion: string, intent: string, shotSize?: string): SceneMood {
    const combined = `${sceneDesc} ${emotion} ${intent}`.toLowerCase();
    
    // 점수 기반 판정: 여러 패턴이 매칭되면 가장 강한 것 선택
    const scores: Record<SceneMood, number> = { calm: 0, energetic: 0, romantic: 0, tense: 0, neutral: 0 };
    
    for (const { mood, pattern } of MOOD_PATTERNS) {
        const matches = combined.match(new RegExp(pattern.source, 'gi'));
        if (matches) {
            scores[mood] += matches.length;
        }
    }
    
    // 클로즈업/익스트림 클로즈업 샷이면 calm 가중치 부스트 (하이에너지 포즈가 물리적으로 안 맞음)
    if (shotSize) {
        const shotLower = shotSize.toLowerCase();
        if (shotLower.includes('close') || shotLower.includes('ecu') || shotLower.includes('cu')) {
            scores.calm += 1;
        }
        if (shotLower.includes('wide') || shotLower.includes('full') || shotLower.includes('long')) {
            scores.energetic += 0.5;
        }
    }
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'neutral';
    
    return (Object.entries(scores) as [SceneMood, number][])
        .sort((a, b) => b[1] - a[1])[0][0];
}

function buildActingDirection(mood: SceneMood): string {
    switch (mood) {
        case 'calm':
            return `- ACTING FOCUS: Quiet but ALIVE. Restrained pose with subtle manga expressiveness — a soft tilt of the head, gentle hand placement, visible eye emotion. NOT frozen or stiff. The character is calm, not a mannequin.
- ENERGY: Medium-low. Subtle but visible manga micro-expressions (soft eyes, slight lip curve). Natural posture with gentle weight shift.
- COMPOSITION: Prioritize the scene description's framing. Even in stillness, the character should feel like a single frame from a living manga panel.`;
        case 'energetic':
            return `- ACTING FOCUS: Maximum manga energy. Exaggerated chibi-style pose with dramatic weight shifts, flying hair, expressive silhouettes. Go BIG — this is a YouTube Shorts highlight moment.
- ENERGY: Very high. Speed lines, impact frames, dynamic motion blur feel. Arms and legs in full action.
- COMPOSITION: Full body or action framing. Movement direction should guide the viewer's eye. Camera angle should amplify the energy.`;
        case 'romantic':
            return `- ACTING FOCUS: Warm and expressive manga romance. Visible blush, sparkling eyes, gentle but clear body language — leaning in, shy hand gestures, tender eye contact or cute aversion.
- ENERGY: Medium. Dreamy but animated. Manga sparkle effects, soft pink tones. Characters should look endearing, not static.
- COMPOSITION: Focus on emotional connection. Intimate framing with manga romance visual language (flower petals, soft glow, heart motifs).`;
        case 'tense':
            return `- ACTING FOCUS: Visible manga tension. Clenched fists, stiff shoulders, wide eyes, sweat drops, jaw tension. The body should SCREAM discomfort even if the face tries to stay composed.
- ENERGY: High but contained. Coiled spring energy — the viewer should feel something is about to snap. Manga tension markers (dark aura lines, sharp shadows).
- COMPOSITION: Dramatic angles (low angle, dutch tilt) enhance claustrophobia. Tight framing with visible body tension details.`;
        case 'neutral':
        default:
            return `- ACTING FOCUS: Expressive manga everyday acting. Create a fresh, dynamic pose — clear weight shift, interesting hand placement, head angle that shows personality. Think "best frame from a manga page" not "reference photo recreation." Characters should look like they're MID-ACTION in their daily life.
- ENERGY: Medium-high. Lively and characterful. Manga-style expressiveness is the DEFAULT — exaggerated reactions, visible emotions, dynamic body language. Avoid stiff, symmetrical, or passport-photo poses.
- COMPOSITION: Rebuild the scene from scratch with cinematic manga framing. The reference image is a face sheet, not a pose template.`;
    }
}


// ─── 최종 이미지 프롬프트 조립기 ─────────────────────────────────────
export interface PromptContext {
    characterDescriptions: { [key: string]: CharacterDescription };
    locationVisualDNA: { [key: string]: string };
    cinematographyPlan: CinematographyPlan | null;
    imageRatio: string;
    artStyle: ArtStyle;
}

/**
 * 안전망: sceneDescription에서 카메라 프레이밍 키워드를 추출.
 * designCinematography의 vis 힌트가 누락되거나 플랜과 씬 묘사가 충돌할 때
 * 씬 묘사의 프레이밍 의도가 우선되도록 보강한다.
 */
const extractFramingFromScene = (desc: string | undefined | null): string | null => {
    if (!desc) return null;
    const lower = desc.toLowerCase();
    const patterns: [RegExp, string][] = [
        [/\b(extreme close-?up|ecu)\b/, 'extreme close-up'],
        [/\b(close-?up|closeup)\b/, 'close-up'],
        [/\b(bust shot)\b/, 'bust'],
        [/\b(medium shot)\b/, 'medium'],
        [/\b(full shot|full-body)\b/, 'full'],
        [/\b(wide shot|wide view|wide angle)\b/, 'wide'],
    ];
    for (const [regex, shot] of patterns) {
        if (regex.test(lower)) return shot;
    }
    return null;
};

export function buildFinalPrompt(cut: Cut | EditableCut, ctx: PromptContext): string {
    const { characterDescriptions: charDescriptions, locationVisualDNA: locDNA, cinematographyPlan, imageRatio, artStyle } = ctx;
    const rawCharacters = 'characters' in cut ? cut.characters : (cut as EditableCut).character;
    const characters = rawCharacters ? rawCharacters.filter(c => c && c.trim() !== '') : [];
    
    const activeStyle = ('artStyleOverride' in cut && cut.artStyleOverride) 
        ? cut.artStyleOverride 
        : artStyle;

    const cutId = cut.id;
    const cineCut = cinematographyPlan?.cuts?.find(c => c.cutId === cutId);

    let compositionGuide = '';
    if (imageRatio === '16:9') {
        compositionGuide = `[COMPOSITION - WIDESCREEN 16:9]
- Use **Rule of Thirds**: Place characters at 1/3 or 2/3 horizontal position, NEVER centered.
- Background occupies 50-70% of the frame. Make backgrounds detailed and atmospheric.
- Establish clear foreground/midground/background depth layers.
- Cinematic letterbox feel. Wide establishing shots benefit greatly from this ratio.`;
    } else if (imageRatio === '9:16') {
        compositionGuide = `[COMPOSITION - VERTICAL 9:16]
- Character fills the vertical frame prominently. Upper body framing works best.
- Background is narrow — use strong vertical elements (pillars, doors, tall buildings).
- Expression and emotion are the focus. Close-up and bust shots work best.
- Mobile-first composition: key action in the center-upper area.`;
    } else {
        compositionGuide = `[COMPOSITION - SQUARE 1:1]
- Balanced, centered composition. Character occupies 60-80% of the frame.
- Simple, focused framing. Avoid complex depth layers.`;
    }

    const location = cut.location;
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : (cut as EditableCut).locationDescription;
    const other = 'otherNotes' in cut ? cut.otherNotes : (cut as EditableCut).otherNotes;
    const intent = 'directorialIntent' in cut ? cut.directorialIntent : (cut as EditableCut).directorialIntent;
    const useIntense = 'useIntenseEmotion' in cut && (cut as EditableCut).useIntenseEmotion === true;

    const pose = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).characterPoseIntense;
            if (intense) return intense;
        }
        return 'characterPose' in cut ? cut.characterPose : (cut as EditableCut).characterPose;
    })();

    const emotion = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).characterEmotionAndExpressionIntense;
            if (intense) return intense;
        }
        return 'characterEmotionAndExpression' in cut ? cut.characterEmotionAndExpression : (cut as EditableCut).characterEmotionAndExpression;
    })();

    const sceneDesc = (() => {
        if (useIntense) {
            const intense = (cut as EditableCut).sceneDescriptionIntense;
            if (intense) return intense;
        }
        return 'sceneDescription' in cut ? cut.sceneDescription : (cut as EditableCut).sceneDescription;
    })();
    
    // --- [인서트 컷 처리 로직] ---
    if (characters.length === 0) {
        const spatialDNA = locDNA[location] || 'Consistent visual background.';
        const lightingNote = cineCut?.lightingNote || '';
        return `
# [SCENE INSERT / BACKGROUND ONLY]
- **TYPE:** Background Art / Scenery / Object Insert / Close-up of props.
- **CRITICAL NEGATIVE:** NO HUMANS. NO CHARACTERS. NO PEOPLE. Do not draw any person. The scene must be empty of people.
- **LOCATION:** ${location}
- **SPATIAL DNA:** ${spatialDNA}
- **VISUAL DESCRIPTION:** ${locDesc}
- **SCENE:** ${sceneDesc || ''}
- **ATMOSPHERE/INTENT:** ${intent || 'Atmospheric shot reflecting the story context'}
- **DETAILS:** ${other}
${lightingNote ? `- **LIGHTING:** ${lightingNote}` : ''}
${compositionGuide}
- **QUALITY:** Highly detailed webtoon background art, establishing shot or emotional landscape.
        `.trim();
    }

    // --- [1단계: 기계적 DNA 추출] ---
    const mechanicalIdentityParts: string[] = [];
    const customOutfit = 'characterOutfit' in cut ? cut.characterOutfit : (cut as EditableCut).characterOutfit;

    // [A1] DNA 오염 감지 패턴: 인물 외모 묘사 키워드가 있으면 의상이 아님
    const DNA_POLLUTION_PATTERN = /\b(hair|face|skin|eyes|jawline|forehead|wavy texture|cheekbone|eyebrow|eyelid|complexion|freckle|dimple|nose bridge|lip shape)\b/i;

    characters.forEach(name => {
        // canonicalName 우선 매칭, 없으면 koreanName 폴백 (기존 프로젝트 호환)
        const key = Object.keys(charDescriptions).find(k => {
            const cd = charDescriptions[k];
            return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name;
        });
        if (key && charDescriptions[key]) {
            const char = charDescriptions[key];
            let profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';
            
            if (customOutfit && customOutfit.trim().length > 2) {
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\[${escapedName}:\\s*(.*?)\\]`, 'i');
                const match = customOutfit.match(regex);
                
                if (match && match[1] && match[1].trim().length > 2) {
                    const candidateOutfit = match[1].trim();
                    // [A1] DNA 오염 검증: 인물 외모 키워드가 포함되어 있으면 의상이 아님 → 무시
                    if (!DNA_POLLUTION_PATTERN.test(candidateOutfit)) {
                        profileOutfit = candidateOutfit;
                    } else {
                        console.warn(`[buildFinalPrompt] DNA pollution detected in customOutfit for ${name}, falling back to location outfit`);
                    }
                } else if (characters.length === 1 && !customOutfit.includes('[')) {
                    // [A1] 단일 캐릭터 customOutfit도 DNA 오염 검증
                    if (!DNA_POLLUTION_PATTERN.test(customOutfit)) {
                        profileOutfit = customOutfit;
                    } else {
                        console.warn(`[buildFinalPrompt] DNA pollution detected in single-char customOutfit, falling back to location outfit`);
                    }
                }
            }

            if (!profileOutfit || profileOutfit.length < 3 || profileOutfit.toLowerCase() === 'none' || profileOutfit.toLowerCase() === 'n/a') {
                 profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';
            }

            const hair = char.hairStyleDescription || 'Standard hairstyle';
            const features = char.facialFeatures || 'Match facial visage exactly';
            const bodyDNA = ('characterIdentityDNA' in cut && cut.characterIdentityDNA) ? cut.characterIdentityDNA : '';
            // bodyDNA에서 해당 캐릭터 부분만 추출
            let bodyLine = '';
            if (bodyDNA) {
                const bodyRegex = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*?)(?:\\||$)`, 'i');
                const bodyMatch = bodyDNA.match(bodyRegex);
                bodyLine = bodyMatch ? bodyMatch[1].trim() : '';
            }
            
            mechanicalIdentityParts.push(`# IDENTITY DNA FOR ${name.toUpperCase()}:
- HAIR (ABSOLUTE): ${hair}
- VISAGE (MANDATORY): ${features}
- CLOTHING: ${profileOutfit}`);
        }
    });
    const identityDNA = mechanicalIdentityParts.join('\n\n');

    const cameraKeywords = ['close up', 'zoom', 'shot', '클로즈업', '바스트', '풀샷', '앵글', '샷'];
    const isPolluted = cameraKeywords.some(k => location.toLowerCase().includes(k));
    const finalLocationString = isPolluted ? `the consistent physical environment described as: ${locDesc}` : location;
    
    const spatialDNA = locDNA[location] || 'consistent visual style';

    const fxMap: { [key: string]: string } = {
        "Vertical Gloom Lines": "Dramatic vertical gloom hatching lines, melancholic shadow gradients, heavy emotional burden, classic manga gloom effect.",
        "Speed Lines": "Dynamic radial speed lines, kinetic energy blur, intense high-motion impact, classic action manga lines.",
        "Soft Bloom": "Ethereal soft bloom glow, dreamy romantic lighting, gentle aura highlights, shoujo-manga atmosphere.",
        "Sparkling Aura": "Magical shimmering particles, glowing shoujo-manga sparkles, cute radiant aura, glittering fairy-dust effect."
    };
    
    let technicalFX = "";
    if (intent) {
        technicalFX = Object.keys(fxMap).filter(key => intent.includes(key)).map(key => fxMap[key]).join(" ");
    }
    // [A4] intent가 비어있을 때 emotion/sceneDescription에서 FX 자동 매칭
    if (!technicalFX) {
        const emotionText = emotion || '';
        const fxSource = `${sceneDesc} ${emotionText}`.toLowerCase();
        const emotionFxMap: { pattern: RegExp; fx: string }[] = [
            // #1 놀람/충격
            { pattern: /\b(shock|surprise|startl|gasp|놀람|충격|놀란|깜짝|헉)\b/i,
              fx: "!! exclamation marks floating above head, eyes turned to white circles with shrunk pupils, multiple sweat drops spraying outward, body jerking backward." },
            // #2 분노/격분
            { pattern: /\b(angry|fury|rage|furious|분노|화남|격분|빡친)\b/i,
              fx: "Anger vein mark (💢) pulsing on forehead and temple, ゴゴゴ menacing kanji symbols behind, clenched teeth visible, dark aggressive aura, sharp angular effect lines." },
            // #3 슬픔/우울
            { pattern: /\b(sad|grief|sorrow|tear|cry|depress|gloom|despair|슬픔|우울|눈물|울|서러)\b/i,
              fx: "Glistening tear tracks on cheeks, dark gloomy cloud hovering above head, blue vertical depression lines on face, soul-wisp floating out, deflated body language." },
            // #4 기쁨/환희
            { pattern: /\b(happy|joy|delight|cheerful|기쁨|행복|즐거|웃|기뻐|신남)\b/i,
              fx: "Star-shaped eye highlights, rosy warm blush on cheeks, sparkle particles radiating outward, flower petals floating around, bouncy energetic glow." },
            // #5 당황/쩔쩔
            { pattern: /\b(fluster|embarrass|awkward|당황|쩔쩔|어쩔|어버버)\b/i,
              fx: "Giant sweat drop on temple, spiral embarrassment pattern on cheek, steam rising from head, manga-style wavy vertical lines beside face." },
            // #6 긴장/불안
            { pattern: /\b(nervous|tense|anxious|긴장|불안|초조|떨리)\b/i,
              fx: "Small sweat beads on forehead, tight cross-hatching shadow on face, shaking motion lines on hands, stiff rigid body posture." },
            // #7 무표정/냉담
            { pattern: /\b(blank|cold|indifferent|stoic|무표정|냉담|무감|차가)\b/i,
              fx: "Cold atmosphere effect, half-lidded emotionless eyes, straight-line mouth, silent stillness with faint dark aura." },
            // #8 다정/온화
            { pattern: /\b(gentle|tender|warm|kind|부드러|다정|따뜻|온화|포근)\b/i,
              fx: "Warm golden glow effect around character, soft-focus bloom, gentle light particles, rosy warm tint on cheeks, comfortable relaxed atmosphere." },
            // #9 걱정/근심
            { pattern: /\b(worry|concern|uneasy|걱정|근심|염려)\b/i,
              fx: "Furrowed brow wrinkles, lip-biting motion, fidgeting hand motion lines, anxious darting gaze direction indicators." },
            // #10 자신감/득의
            { pattern: /\b(confident|proud|triumphant|자신감|의기양양|뿌듯|득의|자랑)\b/i,
              fx: "Golden sparkle aura behind character, power pose emphasis, one corner of lips raised in smirk, dramatic backlighting halo effect." },
            // #11 능청/시치미
            { pattern: /\b(sly|coy|feigning|nonchalant|능청|능글|시치미)\b/i,
              fx: "One eyebrow raised playfully, mischievous sparkle in one eye, casual lean pose, slight manga smirk effect, relaxed confident aura." },
            // #12 추궁/위협
            { pattern: /\b(intimidat|menac|threaten|glare|추궁|서늘|위협|압박|노려)\b/i,
              fx: "ゴゴゴ menacing manga symbols floating around, dramatic dark shadow cast on upper face, narrowed piercing eyes, dark purple intimidating aura." },
            // #13 체념/한숨
            { pattern: /\b(resign|sigh|defeat|exhaust|체념|한숨|포기|지침|탈진)\b/i,
              fx: "Dark gloomy cloud hovering above head, soul-leaving-body wisp effect, blue vertical depression lines, completely deflated shoulder drop." },
            // #14 소유욕/독점
            { pattern: /\b(possessiv|territorial|claiming|소유욕|독점|마킹|내꺼)\b/i,
              fx: "Dark possessive aura emanating from character, territorial marking stance, sharp narrowed eyes with intense focus, dominant hand emphasis glow." },
            // #15 설렘/두근
            { pattern: /\b(flutter|heart.?skip|설렘|두근|심쿵|떨림)\b/i,
              fx: "Heart-shaped reflections in eyes, deep rosy blush on cheeks, hand on chest, pink sparkle particles floating, small heart symbols drifting upward." },
            // #16 단호/결연
            { pattern: /\b(resolut|determin|firm|stern|단호|결연|결심|결의|각오)\b/i,
              fx: "Sharp angular manga emphasis lines behind character, intense focused lighting on eyes, tight jaw with firm stance, dramatic backlight silhouette." },
            // #17 황당/어이없
            { pattern: /\b(absurd|disbelief|incredulous|황당|어이없|뭐야|헐|말도안돼)\b/i,
              fx: "???? question marks floating above and around head, one eye twitching, body leaning backward in disbelief, blank white-out expression moment." },
            // #18 섬뜩/사악
            { pattern: /\b(creepy|sinister|menacing|evil|섬뜩|음흉|으스스|사악)\b/i,
              fx: "Small pupils with wide unsettling smile, looking up through bangs with half-shadowed face, dark purple ominous aura, eerie atmosphere effect." },
            // #19 질투/시기
            { pattern: /\b(jealous|envious|resentful|질투|시기|부러|샘|시새)\b/i,
              fx: "Side-eye glare with slightly puffed cheeks, crossed arms defensive posture, green jealousy flame/aura effect, tight lips and narrowed eyes." },
            // #20 감동/벅찬
            { pattern: /\b(moved|touched|grateful|감동|벅찬|감사|뭉클)\b/i,
              fx: "Happy tears glistening in eyes, grateful warm smile, both hands clasped at chest, warm golden light rays with sparkle particles." },
            // #21 코미디/웃김
            { pattern: /\b(comedy|comic|funny|hilarious|lol|코미디|웃긴|황당함|개웃)\b/i,
              fx: "Spiral dizzy eyes or white-out eyes, oversized O-mouth reaction, full-body exaggerated recoil, floating !!! and star swirl marks." },
            // #22 지배/카리스마
            { pattern: /\b(dominat|command|charisma|지배|명령|카리스마|군림)\b/i,
              fx: "Looking down with half-closed powerful eyes, commanding palm-out gesture, power aura glow, dramatic low-angle perspective emphasis." },
            // #23 감정급반전
            { pattern: /\b(whiplash|sudden.*change|twist|감정급반전|반전|충격반전|갭)\b/i,
              fx: "Manga panel crack/shatter effect in background, sudden lighting shift from warm to cold, visible shockwave radiating lines, dramatic zoom effect." },
            // #24 로맨스/달달
            { pattern: /\b(romantic|love|affection|sweet|kiss|로맨스|달달|사랑|애정|키스)\b/i,
              fx: "Soft bloom glow effect, flower petals floating and drifting, sparkle particles in warm pink-gold lighting, dreamy atmosphere with gentle lens flare." },
            // 기존: 액션 스피드
            { pattern: /\b(rush|run|fast|speed|chase|punch|kick|action|fight|dash|급하|달리|빠르|싸움|액션)\b/i, fx: fxMap["Speed Lines"] },
        ];
        for (const { pattern, fx } of emotionFxMap) {
            if (pattern.test(fxSource)) { technicalFX = fx; break; }
        }
    }

    let proportionInstruction = "";
    if (activeStyle === 'moe' || activeStyle === 'dalle-chibi') {
        proportionInstruction = `
[CRITICAL: BODY PROPORTION OVERRIDE]
- **TARGET STYLE**: SD (Super Deformed) / Chibi.
- **RULE**: IGNORE the body proportions of the reference image.
- **EXECUTION**: You MUST draw the character with a **1:2.5 Head-to-Body ratio** (Big head, tiny body).
- **ADAPTATION**: Keep the face identity and outfit design, but squish/shorten the body to fit the cute SD proportion.`;
    } else if (activeStyle === 'vibrant') {
        proportionInstruction = `[PROPORTION]: Maintain mature, tall adult proportions (1:7 to 1:8 ratio). Long legs, stylish silhouette.`;
    } else {
        proportionInstruction = `[PROPORTION]: Standard Webtoon proportions (1:6 to 1:7 ratio).`;
    }

    let cinematographyBlock = '';
    if (cineCut) {
        cinematographyBlock = `
# LAYER 1.5: CINEMATOGRAPHY PLAN
- **Shot Size:** ${cineCut.shotSize}
- **Camera Angle:** ${cineCut.cameraAngle}
- **Camera Movement:** ${cineCut.cameraMovement}
- **Eyeline Direction:** Character(s) looking ${cineCut.eyelineDirection}
- **Transition:** ${cineCut.transitionFrom}
- **Lighting:** ${cineCut.lightingNote}`;
    }

    // ① IDENTITY LOCK — 8줄 방어 (복원)
    const identityLock = `[ABSOLUTE IDENTITY PRESERVATION — FACE & HAIR ONLY]
- **FACE LOCK (PRIORITY #1):** The facial features in the reference image (or Identity DNA) are the GROUND TRUTH. You must NOT change the face to match the style. Style applies to *rendering*, not *identity*.
- MANDATORY: Match the hair and face of the character(s) EXACTLY to the "IDENTITY DNA" section below.
- WARDROBE OVERRIDE: You MUST change the character's clothing to match the "IDENTITY DNA" section. Do NOT copy the clothing from the reference image unless it matches the DNA.
- **POSE SEPARATION (CRITICAL):** The reference image is ONLY for face/hair identity. You MUST create a COMPLETELY NEW pose, body angle, and gesture based on the scene description below. Do NOT replicate the reference image's body position, tilt, lean, or hand placement.
- **EXPRESSION OVERRIDE:** The character's facial expression must match the EMOTION field below, NOT the reference image's expression. If the reference shows tears but the scene is happy, draw a happy face with NO tears.
- COMPOSITIONAL FREEDOM: Completely ignore the reference image's background, camera distance, and framing.
- ZERO PERSISTENCE: Do NOT repeat the pose of the reference. Create an ENTIRELY NEW visual composition.
${proportionInstruction}`;

    // ② SCENE MOOD 감지 + ACTING DIRECTION 동적 생성
    const sceneMood = detectSceneMood(sceneDesc || '', emotion || '', intent || '', cineCut?.shotSize);
    const actingDirection = buildActingDirection(sceneMood);

    // ★ E: dynamicActing — MANPU 가이드 + mood 표시 복원
    const dynamicActing = `[SCENE-ADAPTIVE ACTING — mood: ${sceneMood}]
${actingDirection}
- MANPU USAGE: Incorporate visual manga symbols ONLY IF they match the specific emotion. Do NOT add sweat drops (💧) unless the emotion is 'nervous', 'tired', or 'confused'.
${technicalFX ? `- VISUAL FX: ${technicalFX}` : ''}`;

    // ③ SCENE DESCRIPTION — CRITICAL + PRIORITY 복원
    const sceneDescBlock = sceneDesc
        ? `# [CRITICAL: SCENE DESCRIPTION — MUST FOLLOW]\n${sceneDesc}\n- The above scene description defines WHAT TO DRAW. Camera angle, character position, lighting, and framing described here take PRIORITY over generic acting directions.`
        : '';

    const cameraInfo = (() => {
        // 안전망: sceneDescription의 프레이밍 힌트가 cinematographyPlan보다 우선
        const sceneFraming = extractFramingFromScene(sceneDesc);
        if (cineCut) {
            const finalShot = sceneFraming || cineCut.shotSize;
            return `${finalShot}, ${cineCut.cameraAngle}, ${cineCut.cameraMovement}`;
        }
        return other || 'Standard medium shot';
    })();

    const poseInfo = cineCut
        ? (pose ? `${pose}. Eyeline: looking ${cineCut.eyelineDirection}.` : `Eyeline: looking ${cineCut.eyelineDirection}. Follow the scene description for character positioning.`)
        : (pose ? pose : `Follow scene description for character positioning.`);

    const expressionForPrompt = (() => {
        const raw = emotion || '';
        // " — " 뒤에 영어 물리묘사가 있으면 그대로 사용
        if (raw.includes(' — ')) {
            const englishPart = raw.split(' — ').slice(1).join(' — ').trim();
            if (englishPart.length > 20) return englishPart;  // 충분히 상세하면 그대로
        }
        // 빈약하면 emotionPatterns에서 보강
        const emotionPatterns: { pattern: RegExp; expr: string }[] = [
            { pattern: /충격|놀람|놀란|shock|surprise|startl/i,
              expr: "eyes shot wide open as white circles with shrunk pupils, mouth dropped open in shock, !! marks above head, sweat drops spraying from forehead" },
            { pattern: /분노|화남|격분|angry|fury|rage/i,
              expr: "eyebrows V-angled in fury, anger vein on temple, teeth clenched showing canines, sharp intimidating glare" },
            { pattern: /당황|쩔쩔|flustered|embarrass/i,
              expr: "eyes darting sideways, deep blush on cheeks, nervous sweat drop on temple, mouth in awkward half-smile" },
            { pattern: /슬픔|우울|sad|grief|cry/i,
              expr: "glistening tear tracks on cheeks, downturned mouth, drooping eyebrows, blue vertical lines on face" },
            { pattern: /기쁨|행복|happy|joy|delight/i,
              expr: "star-shaped eye highlights, wide bright smile, rosy blush on cheeks, sparkle effects around face" },
            { pattern: /긴장|불안|nervous|tense|anxious/i,
              expr: "small sweat beads on forehead, eyes slightly widened, lip bitten nervously, stiff expression" },
            { pattern: /무표정|냉담|blank|cold|stoic/i,
              expr: "half-lidded emotionless eyes, straight flat mouth, zero muscle movement, cool steady gaze" },
            { pattern: /자신감|득의|confident|proud/i,
              expr: "chin raised proudly, confident smirk, one eyebrow raised, golden sparkle in eyes" },
            { pattern: /추궁|위협|intimidat|threaten|glare/i,
              expr: "eyes narrowed into sharp slits, dark shadow on upper face, one eyebrow raised in accusation" },
            { pattern: /체념|한숨|resign|sigh|defeat/i,
              expr: "half-dead eyes with flat pupils, drooping mouth, soul-wisp floating from head, blue vertical lines" },
            { pattern: /소유욕|독점|possessiv|territorial/i,
              expr: "sharp possessive glint in narrowed eyes, confident slight smile, intense focused gaze" },
            { pattern: /설렘|두근|심쿵|flutter|heart/i,
              expr: "heart-shaped highlights in eyes, deep blush consuming both cheeks, slightly parted lips, steam from ears" },
            { pattern: /패닉|해명|panic/i,
              expr: "spiral eyes from panic, mouth sputtering, massive sweat drops spraying in all directions" },
            { pattern: /코미디|웃|funny|comedy/i,
              expr: "spiral dizzy eyes or white-out eyes, oversized O-mouth, exaggerated facial reaction" },
            { pattern: /달달|애틋|sweet|affection/i,
              expr: "softened eyes looking through lashes, gentle warm smile, rosy blush, tiny heart near face" },
            { pattern: /의아|궁금|뭐지|curious|puzzled|wonder/i,
              expr: "one eyebrow slightly raised, head tilted 10 degrees, eyes focused with mild interest, small ? mark near head" },
            { pattern: /귀찮|짜증|annoy|bother|irritat/i,
              expr: "half-lidded unamused eyes, slight frown, one corner of mouth pulled down, lazy exhale" },
            { pattern: /멍|어리둥절|daze|blank|confused/i,
              expr: "empty stare with dot-eyes, slightly open mouth, frozen mid-thought, small ... dots above head" },
            { pattern: /민망|쑥스|shy|awkward|sheepish/i,
              expr: "eyes looking away to the side, light blush on one cheek, tight-lipped awkward smile, one hand touching back of neck" },
            { pattern: /기대|두근두근|anticipat|excit/i,
              expr: "slightly widened bright eyes, lips pressed together holding back a smile, subtle forward lean, small sparkle near eye" },
        ];
        for (const { pattern, expr } of emotionPatterns) {
            if (pattern.test(raw)) return expr;
        }
        // 매칭 안 되면 원본 (한국어 키워드 제거만)
        return raw.replace(/^[^a-zA-Z]*—\s*/, '').trim() || raw;
    })();

    // ★ G: ACTING NEGATIVES 자동 추출
    const actingNegatives = (() => {
        const allDirectionText = `${intent || ''} ${sceneDesc || ''} ${emotion || ''}`;
        const negativeMatches = allDirectionText.match(/\b(NOT?\s+\w[\w\s,]*|NO\s+\w[\w\s,]*)/gi) || [];
        return negativeMatches.length > 0
            ? `\n# [ACTING NEGATIVES — DO NOT VIOLATE]\n${negativeMatches.map(n => '- ' + n.trim()).join('\n')}`
            : '';
    })();

    // ★ I: GLOBAL NEGATIVE 5줄 복원
    const globalNegative = `# [GLOBAL NEGATIVE — MANDATORY]
- NO text overlay, NO speech bubbles, NO floating text, NO caption in the image
- NO Korean text, NO English text, NO any language text rendered inside the image
- NO emotion labels, NO character name labels, NO sound effect text
- EXCEPTION: Text is allowed ONLY if the direction field contains text in single quotes (e.g., 'ㅋㅋ' or '30분 일찍 출근')
- If no single-quoted text appears in the direction, the image must contain ZERO text of any kind`;

    // ★ D: BODY DNA 라인 복원
    const bodyLine = (cut as any).characterIdentityDNA || '';

    // 최종 프롬프트 조립
    return `
${identityLock}

${sceneDescBlock}

# [CRITICAL: IDENTITY PRIORITY — HIGHEST]
${identityDNA}${bodyLine ? `\n- BODY: ${bodyLine}` : ''}
${cinematographyBlock}

${compositionGuide}
${(() => {
    switch (activeStyle) {
        case 'dalle-chibi': return '[RENDER STYLE]: Sparkling particles in air, glossy eyes with multiple highlight points, warm rim lighting glow, dreamy bloom effect.';
        case 'moe': return '[RENDER STYLE]: Warm pastel fills, soft bloom lighting, cute SD proportions, sparkling highlights.';
        case 'vibrant': return '[RENDER STYLE]: Jewel-tone palette, dramatic stage lighting, glossy rendering, adult proportions.';
        case 'kyoto': return '[RENDER STYLE]: Cinematic natural lighting, detailed hair strands, transparent watercolor atmosphere.';
        case 'normal': return '[RENDER STYLE]: Clean cel shading, uniform black outlines, even flat lighting.';
        default: return '';
    }
})()}

# LAYER 2: SCENE DYNAMICS
${dynamicActing}
- **Camera/Angle:** ${cameraInfo}
- Dynamic Intent: ${intent}. Rebuild the scene with a fresh perspective — do NOT recreate the reference image.
- Action/Pose: ${poseInfo}. Do not copy the pose from the reference. Focus on posture and hand gestures matching the scene mood.
- Facial Expression: ${expressionForPrompt}. Draw THIS emotion, ignoring whatever expression the reference image shows.
${actingNegatives}

# LAYER 3: ENVIRONMENT & SPATIAL DNA
- Precise Location: ${finalLocationString}
- Spatial Architecture (DNA): ${spatialDNA}
- Environment Detail: ${locDesc}
${cineCut?.lightingNote ? `- **Lighting Design:** ${cineCut.lightingNote}` : ''}

${globalNegative}

[FINAL GUIDANCE]: Treat the reference image/DNA as a **FACE MASK**. Even if the scene changes, the face must look like the EXACT SAME PERSON.
`.trim();
}
