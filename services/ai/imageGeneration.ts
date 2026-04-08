// services/ai/imageGeneration.ts — 이미지 생성/편집 + TTS 함수
// geminiService.ts에서 분리됨. 기능 변경 없음.

import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { IS_TAURI, getGeminiApiKey } from '../tauriAdapter';
import { CharacterDescription, GeneratedScript, ImageRatio, Scene, Cut, Gender } from '../../types';
import { getGeminiAI, callVisionTextModel, getVisionImageResponse, getTokenCountFromResponse, MODELS, dataUrlToBlob, blobToBase64 } from './aiCore';

export const generateOutfitImage = async (outfitDescription: string, modelName: string, seed?: number, imageRatio: string = '1:1'): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = await getGeminiAI();
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
    
    // Set aspect ratio from parameter
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
        config.imageConfig = { aspectRatio: imageRatio };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'generateOutfitImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};


export const generateSpeech = async (narration: string): Promise<{ audioBase64: string; tokenCount: number; }> => {
    const ai = await getGeminiAI();
    const response = await ai.models.generateContent({
        model: MODELS.TTS,
        contents: [{ parts: [{ text: narration }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
        },
    });
    const audioPart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioPart) throw new Error("TTS API Error");
    return { audioBase64: audioPart, tokenCount: getTokenCountFromResponse(response) };
};


export const editImageWithNano = async (baseImageUrl: string, editPrompt: string, originalPrompt: string, artStylePrompt: string, modelName: string, referenceImageUrls?: string[], maskBase64?: string, masterStyleImageUrl?: string, seed?: number, isCreativeGeneration: boolean = false, imageRatio: string = '1:1'): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> => {
    const ai = await getGeminiAI();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const parts: any[] = [{ inlineData: { mimeType, data: imageBase64 } }];
    if (maskBase64) parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });
    if (referenceImageUrls && referenceImageUrls.length > 0) { for (const refUrl of referenceImageUrls) { const { blob: rB, mimeType: rM } = await dataUrlToBlob(refUrl); parts.push({ inlineData: { mimeType: rM, data: await blobToBase64(rB) } }); } }
    
    // PDF Page 53 - Golden Rule construction + ACTING emphasis
    // MODIFIED: Strict preservation for editing, scene-adaptive acting for creative generation
    const actingInstruction = isCreativeGeneration 
        ? "[ACTING RULE]: Follow the acting and mood directions provided in the instruction. Match the scene's emotional context with appropriate body language and posing." 
        : "[STRICT CONSTRAINT]: IDENTITY PRIORITY: High. Face rendering must match the source image exactly. Preserve the original image's composition, pose, facial features, and perspective. Do not drastically reimagine the scene. Only apply the specific edit or style change requested.";

    // originalPrompt에 캐릭터 DNA/의상/씬 묘사가 포함되어 있으므로 컨텍스트로 전달
    const sceneContext = originalPrompt ? `\n[SCENE & CHARACTER CONTEXT — use this for identity, outfit, and scene details]:\n${originalPrompt}` : '';

    const geminiTextPrompt = `Modify image. Instruction: ${editPrompt}. Style: ${artStylePrompt}. ${actingInstruction}${sceneContext}`;
    console.log('[GEMINI PROMPT — editImageWithNano]', geminiTextPrompt);
    parts.push({ text: geminiTextPrompt });
    
    const config: any = {
        ...(seed !== undefined && { seed }),
    };

    // Set aspect ratio from parameter
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
        config.imageConfig = { aspectRatio: imageRatio };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts }, config });
    const visionResponse = getVisionImageResponse(response, 'editImageWithNano');
    return { ...visionResponse, tokenCount: getTokenCountFromResponse(response) };
};


export const generateCharacterMask = async (imageUrl: string, modelName: string, seed?: number): Promise<{imageUrl: string, tokenCount: number} | null> => {
    const ai = await getGeminiAI();
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


export const injectPersonalityAndCreateSignaturePose = async (baseImageUrl: string, character: CharacterDescription, modelName: string, artStylePrompt: string, seed?: number, imageRatio: string = '1:1'): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = await getGeminiAI();
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
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
        config.imageConfig = { aspectRatio: imageRatio };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'injectPersonalityAndCreateSignaturePose');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};


export const upscaleImageWithNano = async (baseImageUrl: string, modelName: string, seed?: number, imageRatio: string = '1:1'): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = await getGeminiAI();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = "Upscale this image to higher resolution. Preserve ALL details exactly: face, hair, clothing, colors, accessories. Do not change or reinterpret anything. Only increase detail and clarity.";
    
    const config: any = { ...(seed !== undefined && { seed }) };
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
        config.imageConfig = { aspectRatio: imageRatio };
    }

    const response = await ai.models.generateContent({ model: modelName as any, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config });
    const visionResponse = getVisionImageResponse(response, 'upscaleImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};


export const renderTextOnImage = async (target: { imageUrl: string, text: string, textType: string, characterName?: string }, modelName: string, seed?: number): Promise<{ imageUrl: string, tokenCount: number }> => {
    const ai = await getGeminiAI();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(target.imageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Add comic ${target.textType}: "${target.text}".`;
    const response = await ai.models.generateContent({ model: modelName, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { ...(seed !== undefined && { seed }) } });
    const visionResponse = getVisionImageResponse(response, 'renderTextOnImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};


export const replaceBackground = async (baseImageUrl: string, newBackgroundPrompt: string, modelName: string, seed?: number): Promise<{ finalImageUrl: string, totalTokenCount: number }> => {
    const ai = await getGeminiAI();
    const { blob, mimeType = 'image/png' } = await dataUrlToBlob(baseImageUrl);
    const imageBase64 = await blobToBase64(blob);
    const prompt = `Replace background: ${newBackgroundPrompt}.`;
    const response = await ai.models.generateContent({ model: modelName, contents: { parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }, config: { ...(seed !== undefined && { seed }) } });
    const visionResponse = getVisionImageResponse(response, 'replaceBackground');
    return { finalImageUrl: visionResponse.imageUrl, totalTokenCount: getTokenCountFromResponse(response) };
};


export const generateMultiCharacterImage = async (prompt: string, characters: { name: string; url: string; dna?: string }[], artStylePrompt: string, modelName: string, masterStyleImage?: string, seed?: number, imageRatio: string = '1:1'): Promise<{ imageUrl: string; tokenCount: number }> => {
    const ai = await getGeminiAI();
    
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
    
    // Build a structured prompt to prevent feature bleeding + Scene-adaptive acting
    const finalPrompt = `
# MULTI-CHARACTER GENERATION PROTOCOL
1. Focus on drawing ${charNamesStr} in one frame. Follow the acting and mood directions in the scene description below.
2. Scene Description: ${prompt}
3. Art Style: ${artStylePrompt}

# IDENTITY LOCK (MANDATORY — FACE & HAIR ONLY)
${characters.map(c => `- Character ${c.name}: Match the face and hair from its reference image exactly. For clothing, strictly follow the text description provided in the scene description. Do NOT copy the clothing from the reference image unless it matches the text.`).join('\n')}

[POSE SEPARATION]: Reference images are FACE SHEETS only. Create completely new poses, body angles, and expressions based on the scene description above. Do NOT replicate any reference image's pose, tilt, or gesture.
[GUIDANCE]: Body language must match the scene mood described above. Rebuild the scene from scratch. Do not mix features between characters. Maintain strict separation of visual traits.
`;

    console.log('[GEMINI PROMPT — generateMultiCharacterImage]', finalPrompt);
    parts.push({ text: finalPrompt });

    const config: any = {
        ...(seed !== undefined && { seed }),
    };

    // Set aspect ratio from parameter
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
        config.imageConfig = { aspectRatio: imageRatio };
    }

    const response = await ai.models.generateContent({
        model: modelName as any,
        contents: { parts },
        config
    });
    
    const visionResponse = getVisionImageResponse(response, 'generateMultiCharacterImage');
    return { imageUrl: visionResponse.imageUrl, tokenCount: getTokenCountFromResponse(response) };
};



export const outpaintImageWithNano = async (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right', modelName: string, originalPrompt?: string, seed?: number): Promise<{ imageUrl: string, textResponse: string, tokenCount: number }> => {
    try {
        const ai = await getGeminiAI();
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


export const fillImageWithNano = async (baseImageUrl: string, modelName: string, originalPrompt?: string, maskBase64?: string, seed?: number, imageRatio: string = '1:1'): Promise<{ imageUrl: string, tokenCount: number }> => {
    try {
        const ai = await getGeminiAI();
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

        // Set aspect ratio from parameter
        if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-2.5-flash-image' || modelName === 'gemini-3.1-flash-image-preview') {
            config.imageConfig = { aspectRatio: imageRatio };
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