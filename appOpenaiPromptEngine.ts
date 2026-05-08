// appOpenaiPromptEngine.ts — Phase B: gpt-image-2 전용 프롬프트 빌더
// appStyleEngine.ts(Gemini)와 평등 위치, 완전 격리.
// Phase A.5의 ContiCut 자연어 필드를 [Scene/Subject/Details/Camera/Style/Layout/Constraints/Use case]에 직접 매핑.

import type {
    Cut, ContiCut, EditableCut,
    CharacterDescription,
    SceneLayer, ToneModifier, ScenarioAnalysis,
    ArtStyle, ImageRatio,
    ContextSceneDesign,
} from './types';
import { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';

/**
 * 멀티 캐릭터 reference 매핑. collectCharacterReferences에서 출력됨.
 * 프롬프트 [Subject] 섹션의 Image N 라벨링에 사용.
 */
export interface ReferenceImageMapping {
    rawKey: string;
    resolvedKey: string;
    imageIndex: number;
}

// ───────────────────────────────────────────────────────────────
// 5종 화풍 자연어 매핑 (Gemini의 [STYLE: ...] 블록을 자연어로 재구성)
// ───────────────────────────────────────────────────────────────

const STYLE_PROMPTS_OPENAI: Record<ArtStyle, string> = {
    'normal':
        'standard Korean webtoon style, clean cel-shaded lineart, ' +
        'bright clean digital colors, even flat lighting, casual approachable mood',

    'moe':
        'super-deformed chibi anime style with 1:2.5 head-to-body ratio ' +
        '(big head, tiny body), warm pastel color palette of soft pink, cream yellow, ' +
        'and peach tones, soft diffused lighting with bloom effect, ' +
        'large sparkling expressive eyes, cute bubbly cheerful mood',

    'dalle-chibi':
        'premium high-detail chibi illustration, super-deformed proportions, ' +
        'warm creamy glowing color palette of soft amber, rose gold, warm beige, ' +
        'and pastel pink tones, magical rim lighting with halo effect around character, ' +
        'soft bloom filter, sparkling particles in the air, glossy eyes with complex ' +
        'multi-point highlights, romantic dreamy idol-merchandise quality',

    'vibrant':
        'mature webtoon style with adult proportions (1:7 head-to-body ratio), ' +
        'high contrast deeply saturated colors of royal blue, magenta, and gold, ' +
        'dramatic Rembrandt or chiaroscuro studio lighting, glossy skin highlights, ' +
        'sharp jawlines and intense gaze, sexy intense dynamic mood',

    'kyoto':
        'Kyoto Animation style high-fidelity anime, cool transparent color palette ' +
        'of azure blue, emerald green, and pure white, cinematic magic-hour or ' +
        'bright daylight lighting with strong rim backlighting and lens flares, ' +
        'detailed light reflections in eyes, delicate hair strands, ' +
        'intricate Makoto-Shinkai-style background art, emotional nostalgic mood',

    'custom': '',
};

export function buildOpenAIArtStyle(artStyle: ArtStyle, customArtStyle: string): string {
    if (artStyle === 'custom' && customArtStyle.trim()) return customArtStyle.trim();
    return STYLE_PROMPTS_OPENAI[artStyle] || STYLE_PROMPTS_OPENAI['normal'];
}

/**
 * cut.imagePrompt가 buildGptImage2Prompt가 만든 OpenAI 자연어 형식인지 감지.
 * - OpenAI 형식: [Scene] / [Subject] / [Style] / [Camera] / [Layout] / [Constraints] 등 섹션 헤더로 시작
 * - Gemini SD 형식: "masterpiece, best quality, ..." 같은 콤마 나열
 * Gemini/Flux 경로에서 OpenAI 형식이 캐싱돼 있으면 무시하고 새로 빌드해야 함.
 */
export function isOpenAIFormatPrompt(prompt: string): boolean {
    if (!prompt) return false;
    return /^\s*\[(Scene|Subject|Style|Camera|Layout|Details|Constraints|Use case|Scene Setting|Characters|Mood Arc|Sequence)\]/m.test(prompt);
}

// ───────────────────────────────────────────────────────────────
// 톤 modifier → 자연어 (회상/상상)
// ───────────────────────────────────────────────────────────────

const TONE_MAP: Record<ToneModifier, string> = {
    'none': '',
    'sepia': 'sepia tone, warm yellow-brown color cast, vintage photograph feel',
    'desaturated': 'desaturated muted colors, low saturation, melancholic palette',
    'cool-blue': 'cool blue tone, slightly icy color temperature, distant mood',
    'soft-focus': 'soft-focus dreamy blur, slight glow, ethereal atmosphere',
    'warm-vintage': 'warm vintage color grading, slight grain, nostalgic 90s-2000s feel',
    'dream-blur': 'dreamlike soft edges, floating particles, surreal atmosphere',
    'sketchy': 'pencil sketch lines, rough hand-drawn texture, unfinished feel',
    'custom': '',
};

export function toneModifierToVisualStyle(layer: SceneLayer | null | undefined): string {
    if (!layer || !layer.toneModifier || layer.toneModifier === 'none') return '';
    if (layer.toneModifier === 'custom' && layer.customToneText) return layer.customToneText;
    return TONE_MAP[layer.toneModifier] ?? '';
}

// ───────────────────────────────────────────────────────────────
// 캐릭터 묘사 (variant 우선)
// ───────────────────────────────────────────────────────────────

export function buildCharacterAnchorText(
    characterKey: string,
    characterDescriptions: { [key: string]: CharacterDescription },
    sceneLayerId: string | undefined,
): string {
    const char = characterDescriptions[characterKey];
    if (!char) return '';
    if (sceneLayerId && sceneLayerId !== DEFAULT_SCENE_LAYER_ID && char.variants) {
        const variant = char.variants.find(v => v.appliedToLayerId === sceneLayerId);
        if (variant) return variant.baseAppearance;
    }
    return char.baseAppearance;
}

// ───────────────────────────────────────────────────────────────
// SD 문법 cleansing (Phase A.5 자연어 없는 fallback용)
// ───────────────────────────────────────────────────────────────

export function cleanseSdSyntax(text: string): string {
    if (!text) return '';
    return text
        .replace(/\([\w\s,]+:[\d.]+\)/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\bMUST NOT\b/gi, 'do not')
        .replace(/\bMUST\b/gi, 'should')
        .replace(/\bMANDATORY\b/gi, 'important')
        .replace(/\bABSOLUTE\b/gi, 'most important')
        .replace(/\bCRITICAL\b/gi, 'important')
        .replace(/\bNEVER\b/gi, 'do not')
        .replace(/\bALWAYS\b/gi, '')
        .replace(/^#+\s+\[?[^\n\]]+\]?\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractEnglishExpression(raw: string): string {
    if (!raw) return '';
    if (raw.includes(' — ')) {
        const englishPart = raw.split(' — ').slice(1).join(' — ').trim();
        if (englishPart.length > 5) return englishPart;
    }
    return raw;
}

// ───────────────────────────────────────────────────────────────
// 섹션 빌더 (Phase A.5 자연어 우선, 없으면 SD fallback)
// ───────────────────────────────────────────────────────────────

function buildSceneSection(cut: any): string {
    if (typeof cut.sceneNarrative === 'string' && cut.sceneNarrative.trim()) {
        return cut.sceneNarrative.trim();
    }
    const location = cut.location ?? '';
    const locDesc = cleanseSdSyntax(cut.locationDescription ?? cut.locationDetail ?? '');
    return `${location}${locDesc ? `, ${locDesc}` : ''}`.trim();
}

function buildSubjectSection(
    cut: any,
    characterDescriptions: { [key: string]: CharacterDescription },
    sceneLayerId: string | undefined,
    referenceImageMapping?: ReferenceImageMapping[],
    batchAnchorIndex?: number,
    batchAnchorLabel?: string,
): string {
    const characters: string[] = cut.characters ?? cut.character ?? [];
    const lines: string[] = [];

    // Phase B v3 Stage 1: 배치 anchor reference가 첫 슬롯에 있으면 명시
    if (batchAnchorIndex !== undefined && batchAnchorIndex >= 0) {
        lines.push(
            `Image ${batchAnchorIndex + 1} (batch anchor): visual continuity reference for ${batchAnchorLabel || 'this batch'} — match its lighting, color palette, costume, and background style exactly.`
        );
    }

    if (characters.length === 0) {
        return lines.join('\n');
    }

    characters.forEach(key => {
        const anchor = buildCharacterAnchorText(key, characterDescriptions, sceneLayerId);
        if (!anchor) return;
        const cleaned = cleanseSdSyntax(anchor);
        // ★ OpenAI cookbook 권장: 멀티 이미지 입력 시 "Image N (character "X"): ..." 라벨링
        const refMap = referenceImageMapping?.find(m => m.rawKey === key || m.resolvedKey === key);
        if (refMap !== undefined) {
            lines.push(`Image ${refMap.imageIndex + 1} (character "${key}"): ${cleaned}`);
        } else {
            lines.push(cleaned);
        }
    });

    // ★ 멀티 캐릭터 시 명시적 매핑 지시 추가 — 모델이 어느 reference가 누구인지 정확히 알도록
    const labeledCount = lines.filter(l => l.startsWith('Image ')).length;
    if (labeledCount >= 2 && referenceImageMapping && referenceImageMapping.length >= 2) {
        lines.push('');
        lines.push('All characters above appear together in this single scene. Match each character to their reference image exactly:');
        characters.forEach(key => {
            const refMap = referenceImageMapping.find(m => m.rawKey === key || m.resolvedKey === key);
            if (refMap !== undefined) {
                lines.push(`- Character "${key}" must match Image ${refMap.imageIndex + 1} exactly in face, hair, body, and outfit.`);
            }
        });
    }

    return lines.join('\n');
}

function buildDetailsSection(cut: any): string {
    const parts: string[] = [];

    if (typeof cut.detailsNarrative === 'string' && cut.detailsNarrative.trim()) {
        parts.push(cut.detailsNarrative.trim());
    } else {
        const sceneDesc = cleanseSdSyntax(cut.sceneDescription ?? cut.visualDescription ?? '');
        if (sceneDesc) parts.push(`Scene action: ${sceneDesc}`);
        const emotion = cleanseSdSyntax(extractEnglishExpression(
            cut.characterEmotionAndExpression ?? cut.emotionBeat ?? ''
        ));
        if (emotion) parts.push(`Expression: ${emotion}`);
        const pose = cleanseSdSyntax(cut.characterPose ?? '');
        if (pose) parts.push(`Pose: ${pose}`);
    }

    const outfit = cleanseSdSyntax(cut.characterOutfit ?? '');
    if (outfit && !parts.some(p => p.includes(outfit))) parts.push(`Outfit: ${outfit}`);

    const intent = cleanseSdSyntax(cut.directorialIntent ?? cut.direction ?? '');
    if (intent) parts.push(`Directorial intent: ${intent}`);

    return parts.join('\n');
}

function buildCameraSection(cut: any, cineCut: any): string {
    if (typeof cut.cameraNote === 'string' && cut.cameraNote.trim()) return cut.cameraNote.trim();
    if (cineCut) {
        const head = [cineCut.shotSize, cineCut.cameraAngle, cineCut.cameraMovement].filter(Boolean).join(', ');
        const eyeline = cineCut.eyelineDirection ? `eyeline: ${cineCut.eyelineDirection}` : '';
        const lighting = cineCut.lightingNote ? `lighting: ${cineCut.lightingNote}` : '';
        return [head, eyeline, lighting].filter(Boolean).join(', ');
    }
    return '';
}

function buildStyleSection(
    artStyle: ArtStyle,
    customArtStyle: string,
    layer: SceneLayer | null | undefined,
    cut: any,
    customStyleBlock?: string,
): string {
    // OpenAI 화풍 레지스트리에서 명시적으로 선택한 styleBlock이 있으면 우선.
    // 없으면 기존 ArtStyle 매핑(Gemini 5개)으로 폴백 → 회귀 없음.
    const styleBase = (customStyleBlock && customStyleBlock.trim())
        ? customStyleBlock.trim()
        : buildOpenAIArtStyle(artStyle, customArtStyle);
    const tone = toneModifierToVisualStyle(layer);
    const moodNote = (typeof cut.moodNote === 'string' && cut.moodNote.trim()) ? cut.moodNote.trim() : '';
    return [styleBase, tone, moodNote].filter(Boolean).join(', ');
}

function buildLayoutSection(imageRatio: ImageRatio | string): string {
    if (imageRatio === '9:16') {
        return 'Vertical 9:16 mobile composition. Character fills the frame, ' +
               'upper-body or close-up framing preferred for emotional emphasis.';
    }
    if (imageRatio === '16:9') {
        return 'Widescreen 16:9 cinematic composition. Rule of thirds, character at 1/3 ' +
               'or 2/3 horizontal position. Detailed atmospheric background.';
    }
    return 'Square 1:1 balanced composition. Character occupies 60-80% of frame.';
}

function buildConstraintsSection(cut: any, hasReference: boolean): string {
    const constraints: string[] = [
        'Avoid distorted anatomy, extra fingers, or blurry rendering.',
        'Do not add text, captions, speech bubbles, or floating labels in the image.',
        'No watermarks or signatures.',
    ];
    if (hasReference) {
        constraints.unshift(
            'Preserve character identity, art style, and visual mood from reference image 1 — ' +
            'do not redesign face, hair, outfit, or art style. Match the lighting tone and color palette.'
        );
    }
    const directionText = `${cut.directorialIntent ?? ''} ${cut.sceneDescription ?? ''}`;
    const negMatches = directionText.match(/\bNO\s+\w[\w\s]*/gi) ?? [];
    for (const neg of negMatches) {
        const cleaned = neg.replace(/^NO\s+/i, '').trim();
        if (cleaned && cleaned.length < 50) constraints.push(`Avoid ${cleaned}.`);
    }
    return constraints.map(c => `- ${c}`).join('\n');
}

// ───────────────────────────────────────────────────────────────
// 메인 빌더
// ───────────────────────────────────────────────────────────────

export interface BuildPromptInput {
    cut: Cut | ContiCut | EditableCut;
    characterDescriptions: { [key: string]: CharacterDescription };
    scenarioAnalysis: ScenarioAnalysis | null;
    cinematographyPlan?: any;
    artStyle: ArtStyle;
    customArtStyle: string;
    imageRatio: ImageRatio;
    /** reference 이미지 첨부 여부 — 있으면 [Constraints]에 preserve 지시 추가 */
    hasReference: boolean;
    /** 인서트 컷에 들어갈 한글 텍스트 (있으면) */
    insertText?: string;
    /** ★ Phase B 패치: 멀티 캐릭터 reference 매핑 — Image N 라벨링용 */
    referenceImageMapping?: ReferenceImageMapping[];
    /**
     * Phase B v3 Stage 1: 배치 anchor reference가 첨부된 인덱스 (0-based).
     * undefined면 anchor 없음. Context 모드 + 후속 컷일 때만 채워짐.
     */
    batchAnchorIndex?: number;
    /** Phase B v3 Stage 1: anchor 라벨 (UI/프롬프트 컨텍스트용). 예: "거실 · 현재" */
    batchAnchorLabel?: string;
    /**
     * OpenAIStyleRegistry에서 사용자가 명시적으로 선택한 styleBlock.
     * 채워져 있으면 [Style] 섹션을 이걸로 대체. 비어있으면 기존 artStyle 매핑 폴백.
     */
    customStyleBlock?: string;
}

export function buildGptImage2Prompt(input: BuildPromptInput): string {
    const {
        cut, characterDescriptions, scenarioAnalysis,
        cinematographyPlan, artStyle, customArtStyle,
        imageRatio, hasReference, insertText, referenceImageMapping,
        batchAnchorIndex, batchAnchorLabel, customStyleBlock,
    } = input;

    const layerId = (cut as any).sceneLayerId || DEFAULT_SCENE_LAYER_ID;
    const layer = scenarioAnalysis?.sceneLayers?.find(l => l.id === layerId) ?? null;
    const cineCut = cinematographyPlan?.cuts?.find((c: any) => c.cutId === cut.id);

    const sections: string[] = [];

    const sceneSection = buildSceneSection(cut);
    if (sceneSection) sections.push(`[Scene]\n${sceneSection}`);

    const subjectSection = buildSubjectSection(cut, characterDescriptions, layerId, referenceImageMapping, batchAnchorIndex, batchAnchorLabel);
    if (subjectSection) sections.push(`[Subject]\n${subjectSection}`);

    const detailsSection = buildDetailsSection(cut);
    if (detailsSection) sections.push(`[Details]\n${detailsSection}`);

    const cameraSection = buildCameraSection(cut, cineCut);
    if (cameraSection) sections.push(`[Camera]\n${cameraSection}`);

    const styleSection = buildStyleSection(artStyle, customArtStyle, layer, cut, customStyleBlock);
    if (styleSection) sections.push(`[Style]\n${styleSection}`);

    sections.push(`[Layout]\n${buildLayoutSection(imageRatio)}`);

    if (insertText && insertText.trim()) {
        sections.push(
            `[Text in image (verbatim, no extra characters)]\n` +
            `"${insertText.trim()}"\n` +
            `Typography: bold sans-serif, clear and readable, no decorative effects`
        );
    }

    sections.push(`[Constraints]\n${buildConstraintsSection(cut, hasReference)}`);
    sections.push(`[Use case]\nDoReMiSsul Studio cut #${(cut as any).cutNumber ?? cut.id}`);

    return sections.join('\n\n');
}

// ───────────────────────────────────────────────────────────────
// 편집용 프롬프트 (인물 삭제/표정 변경 등)
// ───────────────────────────────────────────────────────────────

export function buildGptImage2EditPrompt(
    baseDescription: string,
    changeInstruction: string,
    preserveList: string[] = ['face', 'hair', 'outfit', 'pose', 'camera angle', 'lighting'],
): string {
    return [
        `Edit the image as follows:`,
        ``,
        `[Change]`,
        changeInstruction,
        ``,
        `[Preserve]`,
        `Keep these identical from the reference: ${preserveList.join(', ')}`,
        `Do NOT redesign or alter ${preserveList.join(', ')}.`,
        ``,
        `[Context]`,
        baseDescription,
    ].join('\n');
}

// ───────────────────────────────────────────────────────────────
// Phase A.6: 씬 일괄 생성 프롬프트 — gpt-image-2 n=N 호출용
// ───────────────────────────────────────────────────────────────

export interface BuildScenePromptInput {
    design: ContextSceneDesign;
    characterDescriptions: { [key: string]: CharacterDescription };
    sceneLayerId?: string;
    artStyle: ArtStyle;
    customArtStyle: string;
    imageRatio: ImageRatio;
    /** 멀티 캐릭터 reference 매핑 (collectCharacterReferences 출력 그대로) */
    referenceImageMapping?: ReferenceImageMapping[];
    /** OpenAIStyleRegistry에서 명시 선택한 styleBlock. 비어있으면 artStyle 매핑 폴백. */
    customStyleBlock?: string;
}

export function buildScenePrompt(input: BuildScenePromptInput): string {
    const {
        design, characterDescriptions, sceneLayerId,
        artStyle, customArtStyle, imageRatio, referenceImageMapping, customStyleBlock,
    } = input;

    const sections: string[] = [];

    // [Scene Setting]
    sections.push(`[Scene Setting]\n${design.sourceSession.location}\n${design.sceneNarrative}`);

    // [Characters] — 멀티 캐릭터 매핑 (rawKey/resolvedKey 형식 정정 반영)
    if (referenceImageMapping && referenceImageMapping.length > 0) {
        const charLines = referenceImageMapping.map(m => {
            const lookupKey = m.resolvedKey ?? m.rawKey;
            const displayKey = m.rawKey ?? m.resolvedKey;
            const anchor = buildCharacterAnchorText(lookupKey, characterDescriptions, sceneLayerId);
            return `Image ${m.imageIndex + 1} (character "${displayKey}"): ${cleanseSdSyntax(anchor)}`;
        });
        sections.push(`[Characters]\n${charLines.join('\n')}`);

        if (referenceImageMapping.length >= 2) {
            const matchLines = referenceImageMapping.map(m => {
                const displayKey = m.rawKey ?? m.resolvedKey;
                return `- Character "${displayKey}" must match Image ${m.imageIndex + 1} exactly in face, hair, body, and outfit`;
            });
            sections.push(
                `[Character Matching]\nAll characters appear together. Each must match their reference exactly:\n${matchLines.join('\n')}`
            );
        }
    }

    // [Mood Arc]
    if (design.moodArc) sections.push(`[Mood Arc]\n${design.moodArc}`);

    // [Camera Approach]
    if (design.cameraIntent) sections.push(`[Camera Approach]\n${design.cameraIntent}`);

    // [Style] — OpenAIStyleRegistry styleBlock이 명시되면 우선, 아니면 artStyle 매핑
    const styleText = (customStyleBlock && customStyleBlock.trim())
        ? customStyleBlock.trim()
        : buildOpenAIArtStyle(artStyle, customArtStyle);
    sections.push(`[Style]\n${styleText}`);

    // [Layout]
    sections.push(`[Layout]\n${buildLayoutSection(imageRatio)}`);

    // ★ [Sequence] — 핵심: N컷 일괄 생성 지시
    const sequenceLines = design.plannedCuts.slice(0, design.targetCutCount).map(cut => {
        const role = cut.role === 'anchor' ? ' (Anchor — defines the scene)' : '';
        const lines = [
            `Cut ${cut.cutIndex}${role}:`,
            `  Moment: ${cut.momentDescription}`,
            `  Camera: ${cut.cameraNote}`,
        ];
        if (cut.role === 'follow') lines.push(`  Action: ${cut.actionDelta}`);
        lines.push(`  Mood: ${cut.moodPoint}`);
        return lines.join('\n');
    });

    sections.push(
        `[Sequence — generate ${design.targetCutCount} connected cuts in this order]\n` +
        sequenceLines.join('\n\n')
    );

    // [Continuity Requirements]
    sections.push(
        `[Continuity Requirements]\n` +
        `- All ${design.targetCutCount} cuts share the SAME character identity, SAME outfit, SAME location, SAME lighting, SAME art style\n` +
        `- Time progression: continuous within minutes (not days)\n` +
        `- Each cut shows a DIFFERENT visual moment of the same scene\n` +
        `- Camera angles and compositions MUST vary between cuts (avoid duplicate compositions)\n` +
        `- Cut 1 (Anchor) defines the scene's visual baseline\n` +
        `- Cuts 2~${design.targetCutCount} show progression while preserving Cut 1's character/outfit/space`
    );

    // [Constraints]
    sections.push(
        `[Constraints]\n` +
        `- Avoid distorted anatomy, extra fingers, blurry rendering\n` +
        `- Do not add text, captions, speech bubbles, or floating labels in any cut\n` +
        `- No watermarks or signatures\n` +
        `- Each cut must clearly differ in moment, camera angle, or action — duplicates are FORBIDDEN\n` +
        `- Preserve character identity from reference images exactly`
    );

    sections.push(`[Use case]\nDoReMiSsul Studio scene "${design.sessionKey}" — ${design.targetCutCount}-cut sequence`);

    return sections.join('\n\n');
}
