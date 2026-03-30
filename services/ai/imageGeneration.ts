
import { CharacterDescription, Gender } from '../../types';
import {
    MODELS,
    SFW_SYSTEM_INSTRUCTION,
    SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
    createGeminiClient,
    dataUrlToBlob,
    blobToBase64,
    getVisionImageResponse,
    getTokenCountFromResponse,
    parseJsonResponse,
} from './aiCore';

// ─── editImageWithNano ────────────────────────────────────────────────────────
export const editImageWithNano = async (baseImageUrl: string, editPrompt: string, originalPrompt: string, artStylePrompt: string, modelName: string, referenceImageUrl?: string, maskBase64?: string, masterStyleImageUrl?: string, seed?: number, isCreativeGeneration: boolean = false): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const parts: any[] = [{ inlineData: { mimeType, data: imageBase64 } }];
    if (maskBase64) parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });
    if (referenceImageUrl) { const { blob: rB, mimeType: rM } = await dataUrlToBlob(referenceImageUrl); parts.push({ inlineData: { mimeType: rM, data: await blobToBase64(rB) } }); }

    // PDF Page 53 - Golden Rule construction + ACTING emphasis
    // MODIFIED: Use a strict preservation instruction for editing, and dynamic acting for creative generation
    const actingInstruction = isCreativeGeneration
        ? "[ACTING RULE]: High-energy performance, dynamic manga silhouettes, expressive acting."
        : "[STRICT CONSTRAINT]: IDENTITY PRIORITY: High. Face rendering must match the source image exactly. Preserve the original image's composition, pose, facial features, and perspective. Do not drastically reimagine the scene. Only apply the specific edit or style change requested.";

    parts.push({ text: `Modify image. Instruction: ${editPrompt}. Style: ${artStylePrompt}. ${actingInstruction}` });

    const config: any = {
        ...(seed !== undefined && { seed }),
    };

    // Explicitly set 1:1 aspect ratio to prevent random landscape generations
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
        config.imageConfig = { aspectRatio: "1:1" };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts }, config });
    const visionResponse = getVisionImageResponse(response, 'editImageWithNano');
    return { ...visionResponse, tokenCount: getTokenCountFromResponse(response) };
};

// ─── generateOutfitImage ──────────────────────────────────────────────────────
export const generateOutfitImage = async (outfitDescription: string, modelName: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = createGeminiClient();
    // Strengthened prompt to prevent model refusal regarding human generation by explicitly requesting a product photography flat lay of objects only.
    const prompt = `
    Generate a photorealistic flat lay image of clothing.
    **STRICT CONSTRAINT: CLOTHING OBJECTS ONLY. NO HUMANS. NO SKIN. NO BODY PARTS.**
    Background: Neutral gray studio background.
    Lighting: Soft studio lighting, high detail textures.
    Outfit Description: ${outfitDescription}
    `;

    const config: any = {
        ...(seed !== undefined && { seed }),
    };

    // Explicitly set 1:1 aspect ratio to prevent random landscape generations
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
        config.imageConfig = { aspectRatio: "1:1" };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'generateOutfitImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};

// ─── generateCharacterMask ────────────────────────────────────────────────────
export const generateCharacterMask = async (imageUrl: string, modelName: string, seed?: number): Promise<{imageUrl: string, tokenCount: number} | null> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(imageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = "Black and white mask for protagonist. Character white, background black.";
    try {
        const response = await ai.models.generateContent({ model: modelName, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { ...(seed !== undefined && { seed }) } });
        const visionResponse = getVisionImageResponse(response, 'generateCharacterMask');
        return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
    } catch (e) {
        console.error("Error in generateCharacterMask:", e);
        return null;
    }
};

// ─── injectPersonalityAndCreateSignaturePose ──────────────────────────────────
export const injectPersonalityAndCreateSignaturePose = async (baseImageUrl: string, character: CharacterDescription, modelName: string, artStylePrompt: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    // PDF Page 65 - signature pose logic
    // MODIFIED: Added specific face lock instruction to improve identity preservation
    const prompt = `
# TASK: POSE MODIFICATION ONLY
# GOAL: Change ONLY the character's pose.
# RULES (ABSOLUTE):
1. **PRESERVE EVERYTHING:** You MUST perfectly preserve the character's hair (${character.hairStyleDescription || 'Default'}), clothing, ALL colors, the specific art style, and the entire background from the original image.
2. **DO NOT CHANGE:** Do not alter colors, lighting, clothing design, or art style. The output must look like the same artist drew it in the same scene just moments apart.
3. **[FACE LOCK]:** Do not change the facial features or proportions of the original image. Maintain the exact same face structure.
4. **NEW DYNAMIC POSE:** Redraw the character in a cool, dynamic, and exaggerated "signature pose" that reflects their personality: "${character.personality}". Avoid stiff posture.
The final image must be identical to the original in every way except for the character's pose.
`;

    const config: any = { ...(seed !== undefined && { seed }) };
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
        config.imageConfig = { aspectRatio: "1:1" };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'injectPersonalityAndCreateSignaturePose');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};

// ─── upscaleImageWithNano ─────────────────────────────────────────────────────
export const upscaleImageWithNano = async (baseImageUrl: string, modelName: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = "Upscale resolution, preserve identity.";

    const config: any = { ...(seed !== undefined && { seed }) };
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
        config.imageConfig = { aspectRatio: "1:1" };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'upscaleImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};

// ─── renderTextOnImage ────────────────────────────────────────────────────────
export const renderTextOnImage = async (target: { imageUrl: string, text: string, textType: string, characterName?: string }, modelName: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(target.imageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Add comic ${target.textType}: "${target.text}".`;
    const response = await ai.models.generateContent({ model: modelName, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { ...(seed !== undefined && { seed }) } });
    const visionResponse = getVisionImageResponse(response, 'renderTextOnImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};

// ─── replaceBackground ────────────────────────────────────────────────────────
export const replaceBackground = async (baseImageUrl: string, newBackgroundPrompt: string, modelName: string, seed?: number): Promise<{ finalImageUrl: string, totalTokenCount: number }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Replace background: ${newBackgroundPrompt}.`;
    const response = await ai.models.generateContent({ model: modelName, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { ...(seed !== undefined && { seed }) } });
    const visionResponse = getVisionImageResponse(response, 'replaceBackground');
    return { finalImageUrl: visionResponse.imageUrl, totalTokenCount: getTokenCountFromResponse(response) };
};

// ─── generateMultiCharacterImage ──────────────────────────────────────────────
export const generateMultiCharacterImage = async (prompt: string, characters: { name: string; url: string; dna?: string }[], artStylePrompt: string, modelName: string, masterStyleImage?: string, seed?: number): Promise<{ imageUrl: string; tokenCount: number }> => {
    const ai = createGeminiClient();

    const parts: any[] = [];
    const [c1, c2, c3] = characters;

    // Character 1 Identity
    if (c1) {
        const { blob: b1, mimeType: m1 } = await dataUrlToBlob(c1.url);
        parts.push({ inlineData: { mimeType: m1, data: await blobToBase64(b1) } });
    }

    // Character 2 Identity
    if (c2) {
        const { blob: b2, mimeType: m2 } = await dataUrlToBlob(c2.url);
        parts.push({ inlineData: { mimeType: m2, data: await blobToBase64(b2) } });
    }

    // Character 3 Identity
    if (c3) {
        const { blob: b3, mimeType: m3 } = await dataUrlToBlob(c3.url);
        parts.push({ inlineData: { mimeType: m3, data: await blobToBase64(b3) } });
    }

    const charNamesStr = characters.map(c => c.name).join(', ').replace(/, ([^,]*)$/, ' and $1');

    // Build a structured prompt to prevent feature bleeding + Acting focus
    const finalPrompt = `
# MULTI-CHARACTER GENERATION PROTOCOL
1. Focus on drawing ${charNamesStr} in one frame with EXAGGERATED MANGA ACTING.
2. Scene Description: ${prompt}
3. Art Style: ${artStylePrompt}

# IDENTITY LOCK (MANDATORY)
${characters.map(c => `- Character ${c.name}: Match the face and hair from its reference image exactly. For clothing, strictly follow the text description provided in the scene description. Do NOT copy the clothing from the reference image unless it matches the text.`).join('\n')}

[GUIDANCE]: Body language must be high-energy and communicative. Use dynamic angles and silhouettes. Do not mix features between characters. Maintain strict separation of visual traits.
`;

    parts.push({ text: finalPrompt });

    const config: any = {
        ...(seed !== undefined && { seed }),
    };

    // Explicitly set 1:1 aspect ratio to prevent random landscape generations
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
        config.imageConfig = { aspectRatio: "1:1" };
    }

    const response = await ai.models.generateContent({
        model: modelName as any,
        contents: { parts },
        config
    });

    const visionResponse = getVisionImageResponse(response, 'generateMultiCharacterImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};

// ─── outpaintImageWithNano ────────────────────────────────────────────────────
export const outpaintImageWithNano = async (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right', modelName: string, originalPrompt?: string, seed?: number): Promise<{ imageUrl: string, textResponse: string, tokenCount: number }> => {
    try {
        const ai = createGeminiClient();
        const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
        const imageBase64 = await blobToBase64(blob);

        // Improved prompt for outpainting with context
        const prompt = `OUTPAINTING TASK: Extend this image towards the ${direction}.
Original Content: ${originalPrompt || 'unknown'}.
STRICT RULE: The new area must be a seamless, high-quality continuation of the existing scene.
Remove any black or empty borders by filling them with matching content, lighting, and style.`;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: imageBase64 } },
                    { text: prompt }
                ]
            },
            config: {
                ...(seed !== undefined && { seed }),
                temperature: 0.7
            }
        });

        const visionResponse = getVisionImageResponse(response, 'outpaint');
        return { imageUrl: visionResponse.imageUrl, textResponse: visionResponse.textResponse, tokenCount: getTokenCountFromResponse(response) };
    } catch (error) {
        console.error("Error in outpaintImageWithNano:", error);
        throw error;
    }
};

// ─── fillImageWithNano ────────────────────────────────────────────────────────
export const fillImageWithNano = async (baseImageUrl: string, modelName: string, originalPrompt?: string, maskBase64?: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    try {
        const ai = createGeminiClient();
        const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
        const imageBase64 = await blobToBase64(blob);

        const parts: any[] = [{ inlineData: { mimeType, data: imageBase64 } }];
        if (maskBase64) {
            parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });
        }

        // Improved prompt for filling/inpainting with context
        const prompt = `FILLING TASK: This image has empty borders because it was scaled down.
Original Content: ${originalPrompt || 'unknown'}.
STRICT RULE: You MUST remove all empty borders by extending the central content to fill the entire frame.
Seamlessly blend the new content with the existing parts, maintaining the exact same artistic style, colors, and lighting.
The final image must have NO black or empty areas. Ensure the newly generated parts perfectly match the perspective and scale of the original image.`;

        parts.push({ text: prompt });

        const config: any = {
            ...(seed !== undefined && { seed }),
            temperature: 0.5
        };

        // Explicitly set 1:1 aspect ratio
        if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image') {
            config.imageConfig = { aspectRatio: "1:1" };
        }

        const response = await ai.models.generateContent({
            model: modelName as any,
            contents: { parts },
            config
        });

        const visionResponse = getVisionImageResponse(response, 'fillImage');
        return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
    } catch (error) {
        console.error("Error in fillImageWithNano:", error);
        throw error;
    }
};

// ─── analyzeCostumeFromImage ──────────────────────────────────────────────────
export const analyzeCostumeFromImage = async (imageDataUrl: string, characterName: string, gender: Gender, seed?: number): Promise<{ tokenCount: number, englishDescription: string, koreanDescription: string }> => {
    const ai = createGeminiClient();
    const { blob, mimeType } = await dataUrlToBlob(imageDataUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Analyze the outfit. Provide extremely detailed description with HEX codes for each garment. Focus strictly on CLOTHING and ACCESSORIES. NO EMOTIONS. Output JSON { "englishDescription": "..." }. Name: ${characterName}, Gender: ${gender}`;
    const response = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] },
        config: { responseMimeType: "application/json", systemInstruction: SFW_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) }
    });
    const tokenCount = getTokenCountFromResponse(response);
    const result = parseJsonResponse<{ englishDescription: string; }>(response, 'analyzeCostumeFromImage');
    return { englishDescription: result.englishDescription, koreanDescription: result.englishDescription, tokenCount };
};

// ─── analyzeCostumesFromTwoShotImage ──────────────────────────────────────────
export const analyzeCostumesFromTwoShotImage = async (imageDataUrl: string, seed?: number): Promise<{ tokenCount: number, male: { englishDescription: string, koreanDescription: string }, female: { englishDescription: string, koreanDescription: string } }> => {
    const ai = createGeminiClient();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(imageDataUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Analyze two characters. Focus strictly on clothes and accessories. Include HEX codes. Output JSON { "male": { "english": "..." }, "female": { "english": "..." } } (English Only)`;
    const response = await ai.models.generateContent({ model: MODELS.VISION, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { responseMimeType: "application/json", systemInstruction: SFW_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    const result = parseJsonResponse<{ male: { english: string }, female: { english: string } }>(response, 'analyzeCostumesFromTwoShotImage');

    return {
        male: { englishDescription: result.male.english, koreanDescription: result.male.english },
        female: { englishDescription: result.female.english, koreanDescription: result.female.english },
        tokenCount: getTokenCountFromResponse(response)
    };
};
