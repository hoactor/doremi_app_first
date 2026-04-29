// services/ai/contextModeGeneration.ts — Phase A.6: Context 모드 씬 일괄 생성
// gpt-image-2 n=N 호출. Legacy 트랙 무관.

import type {
    ContextSceneDesign, ContextSceneGeneration,
    OpenAIImageQuality, CharacterDescription, ImageRatio, ArtStyle,
} from '../../types';
import { editWithGptImage2, generateWithGptImage2, collectCharacterReferences } from '../openaiImageService';
import { buildScenePrompt } from '../../appOpenaiPromptEngine';
import { sanitizeChildSafety } from '../../appSafetySanitize';

export interface GenerateContextSceneOptions {
    design: ContextSceneDesign;
    /** 등장 인물 (extractCharactersForSession 결과) */
    characters: string[];
    characterDescriptions: { [key: string]: CharacterDescription };
    sceneLayerId?: string;
    artStyle: ArtStyle;
    customArtStyle: string;
    imageRatio: ImageRatio;
    quality: OpenAIImageQuality;
    onProgress?: (message: string) => void;
}

export async function generateContextScene(
    opts: GenerateContextSceneOptions,
): Promise<ContextSceneGeneration> {
    const {
        design, characters, characterDescriptions, sceneLayerId,
        artStyle, customArtStyle, imageRatio, quality, onProgress,
    } = opts;

    // 1. 캐릭터 reference 수집
    onProgress?.('캐릭터 reference 수집 중...');
    const { base64Images, mapping } = await collectCharacterReferences(
        characterDescriptions,
        characters,
        sceneLayerId,
    );

    // 2. 씬 프롬프트 빌드
    const rawPrompt = buildScenePrompt({
        design,
        characterDescriptions,
        sceneLayerId,
        artStyle,
        customArtStyle,
        imageRatio,
        referenceImageMapping: mapping,
    });
    const prompt = sanitizeChildSafety(rawPrompt);

    // 3. 사이즈
    const size = imageRatio === '9:16' ? '1024x1536'
               : imageRatio === '16:9' ? '1536x1024'
               : '1024x1024';

    onProgress?.(`gpt-image-2 호출 중 (${design.targetCutCount}컷, quality=${quality})...`);

    // 4. n=N 일괄 호출 (inputFidelity는 gpt-image-2 미지원 — 전달 안 함)
    const result = base64Images.length > 0
        ? await editWithGptImage2({
            prompt,
            referenceImagesBase64: base64Images,
            quality,
            sourceCutNumber: design.sessionKey,
            size,
            n: design.targetCutCount,
        })
        : await generateWithGptImage2({
            prompt,
            quality,
            sourceCutNumber: design.sessionKey,
            size,
            n: design.targetCutCount,
        });

    // 5. 결과 매핑
    const images = result.images.slice(0, design.targetCutCount).map((img, idx) => {
        const planned = design.plannedCuts[idx];
        return {
            cutIndex: planned?.cutIndex ?? (idx + 1),
            imageUrl: img.imageUrl,
            momentDescription: planned?.momentDescription ?? '',
        };
    });

    return {
        sessionKey: design.sessionKey,
        images,
        promptUsed: prompt,
        quality,
        generatedAt: new Date().toISOString(),
        estimatedCostUsd: result.estimatedCostUsd,
    };
}
