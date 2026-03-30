
import { Modality } from "@google/genai";
import { CharacterDescription, Gender, Scene, Cut, EditableScene, EditableCut } from '../../types';
import {
    MODELS,
    SFW_SYSTEM_INSTRUCTION,
    SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
    SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION,
    createGeminiClient,
    dataUrlToBlob,
    blobToBase64,
    getResponseText,
    getTokenCountFromResponse,
    parseJsonResponse,
    analyzeStoryContext,
} from './aiCore';

// ─── analyzeHairStyle ─────────────────────────────────────────────────────────
export const analyzeHairStyle = async (imageDataUrl: string, characterName: string, seed?: number): Promise<{ hairDescription: string, facialFeatures: string, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const { blob, mimeType } = await dataUrlToBlob(imageDataUrl);
    const imageBase64 = await blobToBase64(blob);

    const prompt = `
    # Role: Character Visual DNA Extractor
    # Task: Analyze the hairstyle of the character in the image and provide a VERY MINIMAL English description.

    # CRITICAL RULES (IDENTITY PRESERVATION):
    1. Focus ONLY on physical features of the hair: Color, simple length, shape, and ANY accessories like ribbons or pins.
    2. Example: "short black hair", "long pink ponytail with a white ribbon".
    3. Max 4-6 words. ABSOLUTELY NO stylistic descriptions like "beautiful", "manga style".
    4. Format: A single phrase. No full sentences.

    Character Name: ${characterName}
    `;

    const response = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: {
            parts: [
                { inlineData: { mimeType, data: imageBase64 } },
                { text: prompt }
            ]
        },
        config: {
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
        }
    });

    const tokenCount = getTokenCountFromResponse(response);
    const hairDescription = getResponseText(response, 'analyzeHairStyle');

    return {
        hairDescription: hairDescription,
        facialFeatures: 'Preserve facial visage',
        tokenCount
    };
};

export const analyzeCharacterVisualDNA = analyzeHairStyle;

// ─── enrichScriptWithDirections ───────────────────────────────────────────────
export const enrichScriptWithDirections = async (script: string, seed?: number, artStyle: string = 'normal', onProgress?: (textLength: number) => void): Promise<{ enrichedScript: string, tokenCount: number }> => {
    const ai = await createGeminiClient();

    // [Step 1] Analyze Global Context first
    const { context: storyContext, tokenCount: contextTokenCount } = await analyzeStoryContext(script, seed);

    let styleStrategy = "";

    if (artStyle === 'moe' || artStyle === 'dalle-chibi') {
        styleStrategy = `
### 🎀 [스타일 가이드: 모에/치비]
1. **표정 연출:** "눈물이 쏟아짐(ㅠㅠ)", "눈이 반짝반짝 빛남(✨)", "볼을 빵빵하게 부풀림(뿌우)".
2. **행동 묘사:** "두 주먹을 꽉 쥐고 파닥거림", "총총걸음으로 다가옴", "고개를 갸웃거리며 물음표 띄움".
`;
    } else if (artStyle === 'kyoto') {
        styleStrategy = `
### ✨ [스타일 가이드: 교토 애니메이션 (Vivid)]
1. **빛과 감정의 동기화:** 인물의 감정이 고조될 때 '역광(Backlight)'이나 '렌즈 플레어', '보케(Bokeh)' 효과를 적극적으로 지시하십시오.
2. **섬세한 제스처:** "머리카락을 귀 뒤로 넘김", "바람에 치마가 살짝 날림", "눈동자가 흔들림" 등 미세한 움직임을 포착하십시오.
3. **배경 강조:** 인물의 심리 상태를 대변하는 '청량한 하늘', '반짝이는 수면', '흩날리는 벚꽃' 등의 배경 요소를 컷에 포함시키십시오.
`;
    } else {
        styleStrategy = `
### 💋 [스타일 가이드: 로맨스 웹툰]
1. **신체 라인 강조 (SFW):** 가녀린 목선, 깊게 패인 쇄골 라인, 잘록한 허리와 골반으로 이어지는 S라인.
2. **플러팅 제스처:** 머리카락을 귀 뒤로 넘기기, 상체를 살짝 숙여 눈 맞추기, 입술을 살짝 깨물기.
`;
    }

    const prompt = `
# Persona: 웹툰 총감독 및 각색가 (Script Doctor)
당신은 대본의 '숨은 의미'를 파악하여 시각적 연출 지시문을 작성하는 전문가입니다.

# [GLOBAL CONTEXT - MUST READ]
The following is the overall context of the story. You MUST use this to ensure every cut contributes to the whole.
${storyContext}

# 핵심 미션:
사용자가 입력한 대본의 행간을 읽어, 이를 시청자에게 강렬하게 전달할 수 있는 **[카메라 앵글, 상징적 소품, 웹툰 전용 효과]**를 설계하십시오.
# 연출 원칙 (MANDATORY):
1. **심리적 구도 자동화:**
 - 인물이 절망, 슬픔, 고립감을 느낄 때 -> 반드시 **'High Angle (부감)'**을 제안하여 인물을 초라하게 만드십시오.
 - 인물이 자신감, 위압감을 가질 때 -> **'Low Angle (앙금)'**을 제안하십시오.
2. **스토리텔링 소품 (Symbolic Props):**
 - 대본에 언급된 금전적 가치나 상황적 아이러니를 소품으로 시각화하십시오. (예: "5만원 커피" -> "한 모금만 마신 비싼 커피잔과 덩그러니 남겨진 계산서")
3. **웹툰 전용 효과 (Visual FX):**
 - 분위기에 따라 다음 중 하나를 반드시 선택하십시오: [Vertical Gloom Lines, Speed Lines, Soft Bloom, Sparkling Aura].
# 규칙 (ABSOLUTE):
- **1줄 1컷:** 원본 대본의 각 줄은 하나의 독립된 컷입니다.
- **원본 불변:** 대본 텍스트는 단 한 글자도 수정하지 마십시오.
- **형식:** "원본 문장 [앵글, 소품, 효과]" 형태로 출력하십시오.
- **메타데이터 보존:** 만약 문장이 '(', '['로 시작하면 이는 메타데이터이므로 연출을 붙이지 말고 그대로 출력하십시오.
${styleStrategy}
# 원본 대본:
\`\`\`
${script}
\`\`\`
`;

    const responseStream = await ai.models.generateContentStream({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
            temperature: 0.7,
        },
    });

    let enrichedScript = '';
    let tokenCount = 0;

    for await (const chunk of responseStream) {
        const c = chunk as any;
        if (c.text) {
            enrichedScript += c.text;
            if (onProgress) {
                onProgress(enrichedScript.length);
            }
        }
        if (c.usageMetadata) {
            tokenCount = c.usageMetadata.totalTokenCount;
        }
    }

    return {
        enrichedScript: enrichedScript.trim(),
        tokenCount: tokenCount + contextTokenCount,
    };
};

// ─── regenerateSingleCutDraft ─────────────────────────────────────────────────
export const regenerateSingleCutDraft = async (
    cut: EditableCut,
    gender: Gender,
    seed?: number
): Promise<Partial<EditableCut> & { tokenCount: number }> => {
    const ai = await createGeminiClient();
    const prompt = `
# Role: YouTube Shorts Visual Director (Cinematographer)
# Task: Propose a DIFFERENT and SPECIFIC visual direction for this cut.
# Current Cut Context:
- **Narration:** "${cut.narrationText}"
- **Characters:** ${cut.character.join(', ')}
- **Location:** ${cut.location}
# Output JSON Schema:
{
"directorialIntent": "string (Specific Visual Direction: [Angle/Lighting] + Action. NO abstract emotions)",
"sceneDescription": "string (Detailed Korean visual description including camera and lighting)",
"characterPose": "string (New dynamic pose with body weight shift)",
"characterEmotionAndExpression": "string (New exaggerated facial expression)",
"otherNotes": "string (New camera angle/technique)"
}
`;

    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
            temperature: 0.8,
        },
    });

    const tokenCount = getTokenCountFromResponse(response);
    const data = parseJsonResponse<Partial<EditableCut>>(response, 'regenerateSingleCutDraft');
    return { ...data, tokenCount };
};

// ─── analyzeCharacters ────────────────────────────────────────────────────────
export const analyzeCharacters = async (script: string, gender: Gender, artStylePrompt: string, selectedArtStyle: string, isDetailedScript: boolean = false, seed?: number, onProgress?: (textLength: number) => void): Promise<{ characters: { [key: string]: CharacterDescription }, firstScenePrompt: string, title: string, tokenCount: number }> => {

    const ai = await createGeminiClient();

    let styleContext = "";
    if (selectedArtStyle === 'kyoto') {
        styleContext = `
# [ART STYLE CONSTRAINT: Kyoto Animation / Vivid]
- Character descriptions must emphasize "Crystal Clear Eyes", "Delicate Hair Strands", and "Soft, Emotional Expressions".
- Avoid rugged or gritty descriptions. Focus on "Beautiful", "Clean", and "High-Detail" visuals.
- Base appearance should mention: "High-quality anime style, detailed light reflections in eyes".
`;
    } else if (selectedArtStyle === 'moe' || selectedArtStyle === 'dalle-chibi') {
        styleContext = `
# [ART STYLE CONSTRAINT: Moe / Chibi]
- Character descriptions should focus on "Cute", "Round", and "Simple" features.
- Emphasize distinct traits that translate well to SD (Super Deformed) proportions (Large eyes, small body).
`;
    }

    let sceneAnalysisInstruction = `
3. Design detailed outfits for EVERY UNIQUE SCENE/LOCATION identified in the script.
# 장면 및 장소 전수 조사 (CRITICAL):
- 대본 전체를 읽고 [SCENE], [장소: ...], 또는 장소 변화가 일어나는 모든 지점을 파악하십시오.
- **분석된 모든 장면에 대해 캐릭터별 의상을 각각 생성해야 합니다.**
- **고유 장소 키 생성 (ABSOLUTE RULE):**
- 장소 키는 **'주인공의 방 (저녁)'** 처럼 **"공간명 (시간대)"** 형식으로 추론하고 정제해야 합니다. 단, 사용자가 '[장소: 헬스장/야외 (밤)]' 처럼 적어두었다면 그 텍스트 그대로 키로 사용하십시오.
- **[CRITICAL: LOCATION EXTRACTION GUARANTEE]**
- 원본 대본에 '[장소: A]', '[장소: B]' 처럼 명시적인 장소 태그가 여러 개 있다면, AI는 이를 임의로 병합하거나 생략해서는 절대 안 됩니다.
- 캐릭터가 여러 장소에 등장한다면, 'locations' 객체에 **각 장소별로 반드시 별도의 키를 생성**해야 합니다. (예: "헬스장/야외 (밤)": "운동복...", "술집 (밤)": "캐주얼...")
- 절대 여러 장소를 하나의 키로 묶거나(예: "헬스장 및 술집"), 일부 장소를 누락하지 마십시오. 대본에 등장하는 모든 고유 장소는 빠짐없이 추출되어야 합니다.
`;

    if (isDetailedScript) {
        sceneAnalysisInstruction += `
- **[상세 대본 모드 활성화]:** 사용자가 명시적으로 적어둔 '[장소: ...]' 태그들을 100% 신뢰하고, 하나도 빠짐없이 모두 'locations' 키로 등록하십시오. 대본에 등장하는 모든 장소 태그를 무조건 추출하여 개별 키로 만들어야 합니다.
`;
    }

    const prompt = `
Please analyze the following webtoon script.
1. Identify ALL characters (Protagonists, Supporting roles).
2. Create profiles for each identified character.
${sceneAnalysisInstruction}
${styleContext}
# IDENTITY PRESERVATION PROTOCOL (CRITICAL):
- **OUTFIT STRING REUSE:** Once an outfit is defined for a character in a specific context (e.g., school uniform, military uniform), you MUST reuse the EXACT same detailed description string for every scene where they wear that outfit.
- **DO NOT SUMMARIZE:** Never simplify "Navy blue school blazer with gold buttons" to "school uniform".
- **DETAIL ENFORCEMENT:** Include fabric, fit, and specific colors with HEX codes.
# SINGLE SOURCE OF TRUTH (NEW):
- **ENGLISH ONLY:** Generate outfit descriptions ONLY in English. Do NOT generate Korean translations for outfits.
- Populate 'locations' with English descriptions.
- 'koreanLocations' field is NOT required, but if schema demands it, simply copy the English text into it.
# Output JSON Structure (CRITICAL):
{
"title": "Short title",
"firstScenePrompt": "Description",
"characters": {
 "character_id_1": {
 "koreanName": "Name",
 "koreanBaseAppearance": "...",
 "baseAppearance": "...",
 "gender": "male" | "female",
 "personality": "Detailed movement style and personality",
 "locations": { "Location Name": "Literal English outfit description" },
 "koreanLocations": { "Location Name": "Literal English outfit description" }
 },
 "character_id_2": { ... }
}
}
**Script:**
\`\`\`
${script}
\`\`\`
`;

    // Use generateContentStream to avoid hanging and show progress
    const responseStream = await ai.models.generateContentStream({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
        },
    });

    let fullText = '';
    let tokenCount = 0;
    let finishReason: string | undefined = undefined;

    for await (const chunk of responseStream) {
        const c = chunk as any;
        if (c.text) {
            fullText += c.text;
            if (onProgress) {
                onProgress(fullText.length);
            }
        }
        if (c.usageMetadata) {
            tokenCount = c.usageMetadata.totalTokenCount;
        }
        if (c.candidates && c.candidates[0] && c.candidates[0].finishReason) {
            finishReason = c.candidates[0].finishReason;
        }
    }

    // Mock response object for parseJsonResponse
    const mockResponse: any = {
        text: fullText,
        candidates: [{
            content: { parts: [{ text: fullText }] },
            finishReason: finishReason || 'STOP'
        }]
    };

    const parsedJson = parseJsonResponse<{ characters: { [key: string]: CharacterDescription }, firstScenePrompt: string, title: string }>(mockResponse, 'analyzeCharacters');

    return {
        characters: parsedJson.characters,
        firstScenePrompt: parsedJson.firstScenePrompt,
        title: parsedJson.title,
        tokenCount,
    };
};

// ─── generateTitleSuggestions ──────────────────────────────────────────────────
export const generateTitleSuggestions = async (script: string, seed?: number): Promise<{ titles: string[], tokenCount: number }> => {
    const ai = await createGeminiClient();
    const prompt = `Analyze the script and generate 3 catchy viral YouTube-style Korean titles. Output JSON: { "titles": ["...", "...", "..."] }. Script: ${script}`;
    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SFW_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
        },
    });
    const tokenCount = getTokenCountFromResponse(response);
    const parsedJson = parseJsonResponse<{ titles: string[] }>(response, 'generateTitleSuggestions');
    return { titles: parsedJson.titles, tokenCount };
};

// ─── generateOutfitsForLocations ──────────────────────────────────────────────
export const generateOutfitsForLocations = async (characterName: string, gender: Gender, signatureOutfitDescription: string, locations: string[], seed?: number): Promise<{ tokenCount: number, locationOutfits: { [location: string]: string } }> => {
    const ai = await createGeminiClient();
    const prompt = `Design detailed outfits for locations: ${locations.join(', ')}.
# Requirements:
1. Match the base style: ${signatureOutfitDescription}.
2. Include HEX codes for every item.
3. Describe fabric textures and garment fit.
4. ABSOLUTELY NO mention of facial expressions, poses, or emotions. Describe the OUTFIT only.
5. **LITERAL CONSISTENCY:** Ensure the core elements of the uniform (blazer, tie, etc.) use the EXACT same words across all locations unless a change is logically required by the environment.
6. **ENGLISH ONLY:** Return descriptions ONLY in English.
7. Output JSON { "locationOutfits": { "Loc": "English description" } }`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SFW_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });

    // Explicitly typing the response to match the single string structure
    const result = parseJsonResponse<{ locationOutfits: { [location: string]: string } }>(response, 'generateOutfitsForLocations');

    // Map to the expected structure of { korean, english } where both are English, to satisfy existing interfaces if needed,
    // OR change the return type. Changing return type to simplify.
    return { locationOutfits: result.locationOutfits, tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateOutfitDescription ──────────────────────────────────────────────
export const regenerateOutfitDescription = async (originalDescription: string, userRequest: string, characterName: string, gender: 'male' | 'female', seed?: number): Promise<{ newDescription: string, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const prompt = `Modify outfit. Original: ${originalDescription}, Request: ${userRequest}.
Keep HEX codes and high physical detail. DO NOT include emotions or expressions.
Output JSON { "newDescription": "..." } (English Only)`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SFW_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    const result = parseJsonResponse<{ newDescription: string; }>(response, 'regenerateOutfitDescription');
    return { newDescription: result.newDescription, tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateImagePrompts ───────────────────────────────────────────────────
export const regenerateImagePrompts = async (params: { narration: string; sceneSettingPrompt: string; originalImagePrompt: string; characters?: string[]; cameraAngle?: string; }, seed?: number): Promise<{ koreanImagePrompt: string; imagePrompt: string; tokenCount: number; }> => {
    const ai = await createGeminiClient();
    const prompt = `Create high-quality AI prompt. JSON { "koreanImagePrompt": "...", "imagePrompt": "..." }. Context: ${params.narration}`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { ...parseJsonResponse<{ koreanImagePrompt: string; imagePrompt: string; }>(response, 'regenerateImagePrompts'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateSceneFromModification ──────────────────────────────────────────
export const regenerateSceneFromModification = async (currentCut: Cut, elementName: string, elementValue: string, seed?: number): Promise<{ newSceneDescription: string, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const prompt = `Regenerate sceneDescription. User changed ${elementName} to "${elementValue}". Context: ${currentCut.location}, ${currentCut.narration}. Focus on physical composition. Output JSON { "newSceneDescription": "..." }`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { ...parseJsonResponse<{ newSceneDescription: string }>(response, 'regenerateSceneFromModification'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── extractFieldsFromSceneDescription ────────────────────────────────────────
export const extractFieldsFromSceneDescription = async (newSceneDescription: string, currentCut: Cut, seed?: number): Promise<{ characterPose: string; characterEmotionAndExpression: string; characterOutfit: string; locationDescription: string; otherNotes: string; tokenCount: number; }> => {
    const ai = await createGeminiClient();
    const prompt = `Extract fields from: "${newSceneDescription}". JSON Output. Ensure all fields are strings.`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { ...parseJsonResponse<any>(response, 'extractFieldsFromSceneDescription'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateSingleCutDraft (already above) ─────────────────────────────────

// ─── verifyAndEnrichCutPrompt ─────────────────────────────────────────────────
export const verifyAndEnrichCutPrompt = async (cut: EditableCut, characterDescriptions: { [key: string]: CharacterDescription }, seed?: number): Promise<{ newSceneDescription: string; newCharacterOutfit: string; tokenCount: number; }> => {
    const ai = await createGeminiClient();

    // Inject hair DNA directly into outfit field
    let hairContext = "";
    let profileOutfitFallback = "";
    (cut.character || []).forEach(name => {
        const key = Object.keys(characterDescriptions).find(k => characterDescriptions[k].koreanName === name);
        if (key && characterDescriptions[key]) {
             if (characterDescriptions[key].hairStyleDescription) {
                hairContext += `${name} has ${characterDescriptions[key].hairStyleDescription}. `;
             }
             // Get the location-based outfit from the profile as a fallback (using 'locations' English now)
             const outfitFromProfile = characterDescriptions[key].locations?.[cut.location];
             if (outfitFromProfile) {
                profileOutfitFallback += `[${name}'s base outfit for ${cut.location}: ${outfitFromProfile}] `;
             }
        }
    });

    // PDF Page 61 - Golden consistency logic
    const prompt = `Continuity check. Location: ${cut.location}, Characters: ${cut.character.join(', ')}.
# Goal:
1. Ensure 'characterOutfit' is a detailed physical description with HEX codes.
2. IMPORTANT: Prepend the hair descriptions into the start of 'characterOutfit'.
3. **LITERAL PRESERVATION:** If you update the outfit, you MUST use the provided Profile Outfit Fallback as your base string. DO NOT SUMMARIZE IT.
# Reference Hair DNA:
${hairContext}
# Profile Outfit Fallback (MANDATORY SOURCE):
${profileOutfitFallback}
JSON output.`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { ...parseJsonResponse<{ newSceneDescription: string; newCharacterOutfit: string; }>(response, 'verifyAndEnrichCutPrompt'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateCutFieldsForCharacterChange ────────────────────────────────────
export const regenerateCutFieldsForCharacterChange = async (originalCut: Cut, newCharacters: string[], characterDescriptions: { [key: string]: CharacterDescription }, location: string, seed?: number): Promise<{ regeneratedCut: Partial<Cut>, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const prompt = `Change characters to: ${newCharacters.join(', ')}. JSON output. Ensure 'characterOutfit' is a string with HEX codes.`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: prompt, config: { responseMimeType: "application/json", systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { regeneratedCut: parseJsonResponse<Partial<Cut>>(response, 'regenerateCutFieldsForCharacterChange'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── regenerateCutFieldsForIntentChange ───────────────────────────────────────
export const regenerateCutFieldsForIntentChange = async (originalCut: Cut | EditableCut, newIntent: string, characterDescriptions: { [key: string]: CharacterDescription }, seed?: number): Promise<{ regeneratedCut: Partial<Cut>, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const narration = 'narration' in originalCut ? originalCut.narration : (originalCut as EditableCut).narrationText;
    const location = originalCut.location;
    const characters = 'characters' in originalCut ? originalCut.characters : (originalCut as EditableCut).character;

    const prompt = `
# Persona: Master Webtoon Visual Director
# Task: Update ONLY the ACTING and SCENE fields for a cut based on the user's "Directorial Intent".
# [중요] 역동적 연기 프로토콜 (DYNAMIC PERFORMANCE):
- 인물의 포즈('characterPose')를 설계할 때 "평범한 자세 금지" 원칙을 적용하십시오.
- 인물의 감정이 온몸으로 표현되도록 하십시오. (예: "좌절하여 바닥을 치며 절규함", "기뻐서 발꿈치를 들고 한 바퀴 돎")
- 만화적 기호를 표정 묘사에 반드시 포함하십시오.
# CRITICAL RULE (DO NOT CHANGE IDENTITY):
- DO NOT generate descriptions for clothing or hair. The 'characterOutfit' field is handled by a separate system and MUST NOT be part of your output.
- Your ONLY job is to describe the character's PERFORMANCE (pose, expression) and the ENVIRONMENT (scene, location details).
# Context:
- **Location:** ${location}
- **Characters:** ${characters.join(', ')}
- **Narration:** "${narration}"
- **User's Directorial Intent:** "${newIntent}"
# Output JSON Schema (STRICTLY adhere to this schema, DO NOT include characterOutfit):
{
"sceneDescription": "string",
"characterPose": "string (Dynamic, action-oriented manga pose)",
"characterEmotionAndExpression": "string (Exaggerated facial expression with Manpu)",
"locationDescription": "string",
"otherNotes": "string"
}
`;
    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
            temperature: 0.1
        }
    });
    return { regeneratedCut: parseJsonResponse<Partial<Cut>>(response, 'regenerateCutFieldsForIntentChange'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── purifyImagePromptForSafety ───────────────────────────────────────────────
export const purifyImagePromptForSafety = async (prompt: string, seed?: number): Promise<{ text: string, tokenCount: number }> => {
    const ai = await createGeminiClient();
    const fullPrompt = `Make SFW: "${prompt}"`;
    const response = await ai.models.generateContent({ model: MODELS.TEXT, contents: fullPrompt, config: { systemInstruction: SFW_SYSTEM_INSTRUCTION, ...(seed !== undefined && { seed }) } });
    return { text: getResponseText(response, 'purifyImagePromptForSafety'), tokenCount: getTokenCountFromResponse(response) };
};

// ─── generateSpeech ───────────────────────────────────────────────────────────
export const generateSpeech = async (narration: string): Promise<{ audioBase64: string; tokenCount: number; }> => {
    const ai = await createGeminiClient();
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

// ─── normalizeScriptCuts ──────────────────────────────────────────────────────
export const normalizeScriptCuts = (script: string): string => {
    if (!script) return "";

    const isCutMarker = (line: string) => {
        const t = line.trim();
        return /^(컷|cut|#)\s*\d+/i.test(t) || /^\d+\.$/.test(t);
    };

    const isSceneContext = (line: string) => {
        const t = line.trim();
        if (/^(scene|s#|씬)\s*\d+/i.test(t)) return true;
        if (/^\[?(장소|시간|배경)\s*[:：]/i.test(t)) return true;

        if (t.startsWith('[') && t.endsWith(']')) {
             if (/(등장인물|연출의도|이미지프롬프트)/.test(t)) return false;
             return true;
        }
        return false;
    };

    const isCutContext = (line: string) => {
        const t = line.trim();
        if (/^\[?(등장인물|연출의도|이미지프롬프트)\s*[:：]/i.test(t)) return true;
        if (t.startsWith('(') && t.endsWith(')')) return true;
        return false;
    };

    const lines = script.split('\n').map(l => l.trim()).filter(l => l !== '');

    let hasCutMarkers = false;
    for (const line of lines) {
        if (isCutMarker(line)) {
            hasCutMarkers = true;
            break;
        }
    }

    const normalizedBlocks: string[] = [];
    let currentSceneContext = "";
    let pendingCutContext = "";

    if (hasCutMarkers) {
        let currentCut = "";

        for (const line of lines) {
            if (isCutMarker(line)) {
                if (currentCut) {
                    normalizedBlocks.push(currentCut.trim());
                }
                currentCut = "";
                if (currentSceneContext) currentCut += currentSceneContext + " ";
                if (pendingCutContext) currentCut += pendingCutContext + " ";
                currentCut += line;
                pendingCutContext = "";
            } else if (isSceneContext(line)) {
                if (currentCut) {
                    normalizedBlocks.push(currentCut.trim());
                    currentCut = "";
                    currentSceneContext = line;
                } else {
                    currentSceneContext = currentSceneContext ? currentSceneContext + " " + line : line;
                }
            } else if (isCutContext(line)) {
                if (currentCut) {
                    currentCut += " " + line;
                } else {
                    pendingCutContext = pendingCutContext ? pendingCutContext + " " + line : line;
                }
            } else {
                if (currentCut) {
                    currentCut += " " + line;
                } else {
                    pendingCutContext = pendingCutContext ? pendingCutContext + " " + line : line;
                }
            }
        }
        if (currentCut) {
            normalizedBlocks.push(currentCut.trim());
        } else if (pendingCutContext || currentSceneContext) {
            const trailing = [currentSceneContext, pendingCutContext].filter(Boolean).join(" ");
            if (normalizedBlocks.length > 0) {
                normalizedBlocks[normalizedBlocks.length - 1] += " " + trailing;
            } else {
                normalizedBlocks.push(trailing);
            }
        }
    } else {
        // No cut markers. Use double newlines if they exist.
        if (script.includes('\n\n')) {
            const blocks = script.split(/\n\s*\n/).map(b => b.trim().replace(/\n/g, ' ')).filter(b => b !== '');
            for (const block of blocks) {
                if (isSceneContext(block)) {
                    currentSceneContext = block;
                } else {
                    let finalBlock = block;
                    if (currentSceneContext && !block.includes(currentSceneContext)) {
                        finalBlock = currentSceneContext + " " + block;
                    }
                    normalizedBlocks.push(finalBlock);
                }
            }
        } else {
            return lines.join('\n');
        }
    }

    return normalizedBlocks.join('\n');
};

// ─── generateCinematicBlueprint ───────────────────────────────────────────────
export const generateCinematicBlueprint = async (
    enrichedScript: string,
    seed?: number,
    onProgress?: (textLength: number) => void
): Promise<{ blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } }, tokenCount: number }> => {
    const ai = await createGeminiClient();

    // PDF Page 67 - cinematography planning
    const prompt = `
# Persona: 천재 영화 촬영 감독
당신은 '연출 강화 대본'에 포함된 연출 태그([ ])를 완벽하게 데이터화하여 촬영 계획을 수립합니다.
# 미션:
1. 입력된 대본의 줄 수 및 순서와 똑같은 수의 컷 계획을 수립하십시오.
2. **연출 태그 최우선 반영:** 대본 문장 뒤의 \`[ ]\` 태그 안에 명시된 앵글이나 상황이 있다면 이를 'camera_angle' 및 'intent_reason'에 정확히 반영하십시오.
3. 예: "커피값 5만원 [부감, 아이러니 소품]" -> camera_angle: "High Angle (부감)", intent_reason: "화려한 배경 속 비참함을 강조하기 위한 부감 연출 및 아이러니 소품 배치"
# 장소 필드 작성 원칙 (CRITICAL):
- 'camera_angle'이나 'shot_size' 지침을 절대 'location' 정보로 취급하지 마십시오.
- 장소는 항상 물리적 환경이어야 합니다.
# 입력 대본:
\`\`\`
${enrichedScript}
\`\`\`
# 출력 형식 (MANDATORY JSON):
{
"blueprint": {
 "cut_1": { "shot_size": "...", "camera_angle": "...", "intent_reason": "..." },
 ...
}
}
`;

    const responseStream = await ai.models.generateContentStream({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
        },
    });

    let fullText = '';
    let tokenCount = 0;

    for await (const chunk of responseStream) {
        const c = chunk as any;
        if (c.text) {
            fullText += c.text;
            if (onProgress) {
                onProgress(fullText.length);
            }
        }
        if (c.usageMetadata) {
            tokenCount = c.usageMetadata.totalTokenCount;
        }
    }

    const parsed = parseJsonResponse<{ blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } } }>(fullText, 'generateCinematicBlueprint');
    return { blueprint: parsed.blueprint, tokenCount };
};

// ─── generateLocationProps ────────────────────────────────────────────────────
export const generateLocationProps = async (
    location: string,
    characterProfiles: string,
    scriptContext: string,
    artStylePrompt: string,
    seed?: number
): Promise<{ ambientProps: string[]; keyProps: string[]; contextualProps: string[]; spatialDNA: string; tokenCount: number; }> => {
    const ai = await createGeminiClient();

    let styleGuide = "";
    if (artStylePrompt === 'kyoto') {
        styleGuide = `
[ART STYLE: Kyoto Animation / Vivid]
- **Lighting & Atmosphere:** Emphasize "Crystal Clear Lighting", "Lens Flare", "Dappled Sunlight (Komorebi)". The space should feel airy and vibrant.
- **Detail Level:** Ultra-detailed background art. Every prop should have a "lived-in" but polished look.
- **Color Palette:** High saturation, avoid dull greys.
`;
    }

    const prompt = `
# Persona: AI Art Director & Set Dresser
# Task: Generate a detailed list of props for a specific location in a webtoon.
# Contextual Information:
- **Location:** ${location}
- **Character Profiles:** ${characterProfiles}
- **Script Snippets (Crucial for symbolic props):**
${scriptContext}
- **Art Style/Genre:** ${artStylePrompt}
${styleGuide}
# Logic Pipeline:
1. **Analyze Context:** Based on the location name, character personalities, and ESPECIALLY the script snippets, brainstorm suitable props.
2. **Identify Symbolic Items:** Look for specific objects mentioned in the script or implied by the dialogue (e.g., "expensive coffee", "bill", "abandoned ring").
3. **Categorize Props:**
 * **ambientProps:** General background items. List 3-4 items.
 * **keyProps:** Items essential for potential character actions in this location (e.g., monitor, chair for a desk scene). List 2-3 items.
 * **contextualProps:** "Signature" items that reveal character personality, story irony, or emotional weight. Be creative and specific. (e.g., "a single luxury coffee cup", "a discarded receipt for a large amount"). List 1-2 unique items.
4. **Format Output:** Provide the result as a clean JSON object.
# Output JSON Schema:
{
"ambientProps": ["string"],
"keyProps": ["string"],
"contextualProps": ["string"],
"spatialDNA": "string"
}
# IMPORTANT: All string values MUST be on a single line. Do NOT use unescaped newlines inside strings.
`;
    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            systemInstruction: SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION,
            ...(seed !== undefined && { seed }),
            temperature: 0.5,
        },
    });

    const tokenCount = getTokenCountFromResponse(response);
    const parsed = parseJsonResponse<{ ambientProps: string[]; keyProps: string[]; contextualProps: string[]; spatialDNA: string; }>(response, 'generateLocationProps');
    return { ...parsed, tokenCount };
};

// ─── generateEditableStoryboardChunk (internal) ───────────────────────────────
const generateEditableStoryboardChunk = async (
    chunkBlueprint: any,
    chunkOriginalScript: string,
    chunkEnrichedScript: string,
    locationProps: any,
    characterProfilesString: string,
    chunkInfo: { current: number, total: number, startCutId: string },
    previousCutContext: string,
    seed?: number,
    artStyle?: string
): Promise<{ scenes: EditableScene[], tokenCount: number }> => {
    const ai = await createGeminiClient();

    // Conditional Directing Guidance based on Art Style
    let directingGuide = `
# [중요] 연기 지침 (HIGH PERFORMANCE ACTING):
- 'characterPose' 필드에 절대 "그냥 서 있다", "앉아 있다" 같은 정적인 설명을 쓰지 마십시오.
- 인물의 심리 상태가 신체 실루엣으로 드러나게 과장하십시오. (예: "기뻐서 팔다리를 대자로 뻗고 공중 부양함", "충격으로 무릎을 꿇고 고개를 푹 숙인 채 사시나무 떨듯 떪")
- 'characterEmotionAndExpression'에는 만화적 기호(땀방울, 불꽃, 하트)를 명시하십시오.
    `;

    if (artStyle === 'kyoto') {
        directingGuide = `
# [중요] 연기 지침 (KYOTO ANIMATION STYLE):
- 'characterPose': 과장된 동작보다는 **"섬세한 제스처"**에 집중하십시오. (예: "바람에 머리카락을 귀 뒤로 넘김", "손끝으로 컵을 만지작거림")
- 'characterEmotionAndExpression': 만화적 기호(땀방울 등)는 최소화하고, **"눈빛의 떨림", "미묘한 홍조", "입술 깨물기"** 등 사실적이고 감성적인 묘사를 사용하십시오.
- 'sceneDescription': **"빛(Lighting)"과 "바람(Wind)"** 요소를 반드시 포함하여 감성적인 분위기를 연출하십시오. (예: "노을빛이 역광으로 비침", "벚꽃잎이 흩날리는 바람")
        `;
    }

    const prompt = `
# Persona: Cinematic Webtoon Storyboard Artist (Chunk Processor)
# Task: Generate detailed storyboard JSON for Part ${chunkInfo.current} of ${chunkInfo.total}.
# [CRITICAL: ANIMATION-LIKE FLOW]
- Treat this storyboard as keyframes for an animation.
- Ensure smooth visual transitions between cuts.
- If a character starts an action in Cut N, they should be in the middle or end of that action in Cut N+1 unless time has passed.
- Maintain spatial continuity (180-degree rule) unless a new scene starts.
- Use "Match Cuts" or "Action Cuts" where appropriate to link scenes.
${directingGuide}
# [CRITICAL: SCENE COMPOSITION & INSERT CUT PRIORITIES]
You must determine whether a cut includes a character or is an "Insert Cut" (where the 'character' array is empty \`[]\`) based on the following STRICT priorities:

1. **PRIORITY 1: Detailed Script (상세대본) Instructions**
   - If the input script explicitly describes a scene WITHOUT characters (e.g., focusing only on an object, background, text message, or scenery), you MUST make it an Insert Cut (empty 'character' array).
   - Do NOT force a character into the scene if the detailed script does not imply one.

2. **PRIORITY 2: Directorial & Camera Grammar (연출/카메라 문법)**
   - For basic scripts without detailed visual instructions, follow standard film grammar.
   - Use an Insert Cut (empty 'character' array) for:
     a. Establishing Shots (showing a new location).
     b. Extreme Close-ups of crucial objects (e.g., a ringing phone, a dropped letter, a ticking clock).
     c. Shots showing the passage of time (e.g., clouds moving, sun setting).
     d. Building atmosphere before a character is revealed.

3. **PRIORITY 3: Character Assignment (인물 배당)**
   - ONLY if the cut does not fall under Priority 1 or Priority 2, you should assign the relevant character(s) to the 'character' array.
   - If a character is speaking, thinking, or reacting, and it's not an intentional insert cut, assign them so the viewer can visually follow the emotional flow.

# [ADVANCED PARSING RULE: MANUAL OVERRIDE]
The original script input may contain explicit instructions in parentheses or brackets, e.g. "Narration line.\n(Context: ...)" or "[장소: ...]".
IF parentheses or brackets containing keywords like "장소:", "배경:", "Location:", "등장인물:", "인물:", "캐릭터:", "Character:", "연출의도:", "연출:", "Intent:", "이미지프롬프트:", "이미지:", "그림:", "프롬프트:", "Image:" are detected attached to a narration line:
1. Extract '장소'/'배경'/'Location' -> Override 'location' field.
2. Extract '등장인물'/'인물'/'캐릭터'/'Character' -> Override 'character' array.
3. Extract '연출의도'/'연출'/'Intent' -> Override 'directorialIntent'.
4. Extract '이미지프롬프트'/'이미지'/'그림'/'프롬프트'/'Image' -> Override 'sceneDescription'.
5. Use these values STRICTLY instead of generating creative content for those fields.
6. The 'narrationText' should NOT contain the bracketed instruction.

# Previous Scene Context (STRICT CONTINUITY):
"${previousCutContext || "Starting of the story."}"
# 촬영 계획 (Cinematic Blueprint for this chunk):
\`\`\`json
${JSON.stringify(chunkBlueprint, null, 2)}
\`\`\`
# 장소별 소품 목록 (Set Dresser Data):
\`\`\`json
${JSON.stringify(locationProps, null, 2)}
\`\`\`
# [중요] 1줄 1컷 절대 법칙 (STRICT 1:1 MAPPING):
- 입력된 '원본 대본'의 모든 줄을 순차적으로 처리하십시오.
- 시작 컷 번호는 **'${chunkInfo.startCutId}'** 부터입니다.
- 임의로 컷을 합치거나 누락하지 마십시오.
- **CRITICAL:** The input script has EXACTLY ${chunkOriginalScript.split('\n').length} lines. You MUST return EXACTLY ${chunkOriginalScript.split('\n').length} cuts in the JSON array. Do NOT summarize or skip lines.
# [CRITICAL: LOCATION FIELD RULE]
- The 'location' field must be a physical PLACE NAME (e.g., 'Classroom', 'Street', 'Bedroom', 'Cafe').
- DO NOT put camera angles or object descriptions here (e.g., "Close-up of hand" is NOT a location).
- If it's a close-up, the location is still the room/place where it happens.
- Use 'sceneDescription' or 'directorialIntent' for visual details like "Close-up focus on...".
# [중요] 의상 복제 법칙 (LITERAL OUTFIT CLONING):
- Character Wardrobe Data에 명시된 해당 장소의 의상 설명을 **글자 하나 틀리지 말고 그대로 'characterOutfit' 필드에 복제하십시오.**
- 절대 "교복", "군복" 같은 짧은 단어로 요약하거나 새로운 설명을 창작하지 마십시오.
- **원본 이미지의 의상을 무시하고, 반드시 Wardrobe Data에 정의된 의상을 우선적으로 적용하십시오.**
# [CRITICAL: SCENE SPLITTING RULE]
- You MUST group cuts into \`scenes\` based on LOCATION and TIME.
- If the \`location\` changes between cuts (e.g., from "헬스장/야외 (밤)" to "술집 (밤)"), you MUST end the current scene and start a NEW scene in the \`scenes\` array.
- Do NOT put cuts with different locations into the same scene.

# [CRITICAL: FIELD DEFINITIONS & RULES]
- **narrationText**: The EXACT line from the original script. Do not modify.
- **character**: Array of character names present in the cut.
- **location**: The PHYSICAL PLACE NAME only (e.g., "Classroom"). NO camera angles.
- **locationDescription**: Visual details of the background, lighting, and atmosphere (e.g., "Sunlight streaming through the window, dust motes dancing").
- **sceneDescription**: The MAIN VISUAL ACTION. What is happening? (e.g., "A holds out a hand to B").
- **characterEmotionAndExpression**: Facial expressions and manga symbols (e.g., "Blushing with steam coming out of ears").
- **characterPose**: Dynamic body language (e.g., "Leaning forward aggressively").
- **otherNotes**: Technical camera instructions (e.g., "Close-up", "Low angle", "Focus on hand").
- **directorialIntent**: The narrative mood or "why" this cut exists (e.g., "To show the tension between them").

# Output JSON Structure (MANDATORY):
{
"scenes": [
 {
 "sceneNumber": 1,
 "title": "Scene Title",
 "cuts": [
 {
 "id": "cut_N",
 "narrationText": "...",
 "character": ["CharacterName"],
 "location": "...",
 "sceneDescription": "...",
 "characterEmotionAndExpression": "Expressive manga expression with Manpu symbols",
 "characterPose": "High-energy acting pose with body weight shift",
 "characterOutfit": "LITERAL COPY FROM WARDROBE DATA",
 "locationDescription": "...",
 "otherNotes": "...",
 "directorialIntent": "..."
 }
 ]
 }
]
}
**원본 대본 (Chunk):**
\`\`\`
${chunkOriginalScript}
\`\`\`
**연출 강화 대본 (Chunk):**
\`\`\`
${chunkEnrichedScript}
\`\`\`
**Character Wardrobe Data (STRICT BASE):**
\`\`\`json
${characterProfilesString}
\`\`\`
`;

    // Removed maxOutputTokens as per Gemini SDK guidelines.
    let response;
    try {
        response = await ai.models.generateContent({
            model: MODELS.TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                systemInstruction: SFW_SYSTEM_INSTRUCTION, // Use SFW instruction to prevent PROHIBITED_CONTENT
                ...(seed !== undefined && { seed }),
                temperature: 0.1
            },
        });
    } catch (error: any) {
        console.warn("First attempt failed, retrying with higher temperature and no seed to bypass potential safety blocks...", error);
        response = await ai.models.generateContent({
            model: MODELS.TEXT,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                systemInstruction: SFW_SYSTEM_INSTRUCTION,
                temperature: 0.4 // Higher temp can sometimes bypass strict deterministic blocks
            },
        });
    }

    const tokenCount = getTokenCountFromResponse(response);
    const parsed = parseJsonResponse<any>(response, 'generateEditableStoryboardChunk');

    let scenes = parsed.scenes;
    if (!scenes && Array.isArray(parsed)) {
        scenes = parsed;
    } else if (!scenes && parsed.scene) {
        scenes = parsed.scene;
    } else if (!scenes && parsed.storyboard) {
        scenes = parsed.storyboard;
    }

    if (!scenes || !Array.isArray(scenes)) {
        console.error("Failed to extract scenes from parsed JSON:", parsed);
        scenes = []; // Fallback to empty array to prevent "not iterable" error
    }

    return { scenes, tokenCount };
};

// ─── generateEditableStoryboard ───────────────────────────────────────────────
export const generateEditableStoryboard = async (
    originalScript: string,
    enrichedScript: string,
    blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } },
    gender: Gender,
    characterDescriptions: { [key: string]: CharacterDescription },
    seed?: number,
    artStyle?: string,
    onProgress?: (part: number, total: number) => void
): Promise<{ storyboard: EditableScene[], locationDNAMap: { [location: string]: string }, tokenCount: number }> => {
    let totalTokenCount = 0;

    // Note: We use 'locations' (English) here instead of 'koreanLocations' because we switched to English-only costumes.
    const characterProfilesString = JSON.stringify(Object.values(characterDescriptions || {}).map(char => ({
        koreanName: char.koreanName,
        gender: char.gender,
        personality: char.personality,
        outfitsByLocation: char.locations,
        hairStyle: char.hairStyleDescription || 'Standard'
    })), null, 2);

    const allLocations = new Set<string>();
    Object.values(characterDescriptions || {}).forEach(char => {
        if (char && char.locations) {
            Object.keys(char.locations || {}).forEach(loc => allLocations.add(loc));
        }
    });

    const locationPropsCache: { [location: string]: any } = {};
    const locationDNAMap: { [location: string]: string } = {};

    // Preprocess scripts to merge metadata lines
    // We keep the original unmerged lines for chunking logic to ensure 1:1 mapping with the user's view
    const originalLinesRaw = originalScript.split('\n').filter(l => l.trim() !== '');
    const enrichedLinesRaw = enrichedScript.split('\n').filter(l => l.trim() !== '');

    // 1. 장소별 DNA 및 소품 생성 (Parallelized for performance)
    const locationPromises = Array.from(allLocations).map(async (location) => {
        try {
            const relevantLines = originalLinesRaw.filter(line => line.includes(location.split('(')[0].trim())).join('\n');
            const { tokenCount, spatialDNA, ...props } = await generateLocationProps(location, characterProfilesString, relevantLines || originalScript, artStyle || 'normal', seed);
            return { location, tokenCount, spatialDNA, props };
        } catch (error) {
            console.warn(`Failed to generate props for location ${location}:`, error);
            return { location, tokenCount: 0, spatialDNA: "Consistent visual background.", props: { ambientProps: [], keyProps: [], contextualProps: [] } };
        }
    });

    const locationResults = await Promise.all(locationPromises);
    locationResults.forEach(res => {
        totalTokenCount += res.tokenCount;
        locationPropsCache[res.location] = { ...res.props, spatialDNA: res.spatialDNA };
        locationDNAMap[res.location] = res.spatialDNA;
    });

    // 2. 컷 분할 처리
    const CHUNK_SIZE = 18;
    // Use the raw lines for total cuts to match the user's input exactly
    const totalCuts = originalLinesRaw.length;

    const combinedScenes: EditableScene[] = [];
    let previousCutContext = "";

    let currentCutIndex = 0;
    let chunkIndex = 0;

    while (currentCutIndex < totalCuts) {
        // Estimate total chunks based on remaining cuts
        const estimatedRemainingChunks = Math.ceil((totalCuts - currentCutIndex) / CHUNK_SIZE);
        const estimatedTotalChunks = chunkIndex + estimatedRemainingChunks;

        if (onProgress) onProgress(chunkIndex + 1, estimatedTotalChunks);

        const startIdx = currentCutIndex;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, totalCuts);

        // Use the raw lines for the chunk to ensure the model sees exactly what the user sees
        const chunkOriginal = originalLinesRaw.slice(startIdx, endIdx).join('\n');
        const chunkEnriched = enrichedLinesRaw.slice(startIdx, endIdx).join('\n');
        const chunkBlueprint: any = {};
        for (let k = startIdx; k < endIdx; k++) {
            const cutId = `cut_${k + 1}`;
            if (blueprint[cutId]) chunkBlueprint[cutId] = blueprint[cutId];
        }

        let chunkScenes: EditableScene[] = [];
        let tokenCount = 0;

        try {
            const result = await generateEditableStoryboardChunk(
                chunkBlueprint,
                chunkOriginal,
                chunkEnriched,
                locationPropsCache,
                characterProfilesString,
                { current: chunkIndex + 1, total: estimatedTotalChunks, startCutId: `cut_${startIdx + 1}` },
                previousCutContext,
                seed,
                artStyle // Pass the art style
            );
            chunkScenes = result.scenes;
            tokenCount = result.tokenCount;
        } catch (error) {
            console.error(`Failed to generate chunk ${chunkIndex + 1}:`, error);
            // Fallback: Create a dummy scene for the failed chunk to prevent infinite loops
            chunkScenes = [{
                sceneNumber: chunkIndex + 1,
                title: "Failed Scene",
                cuts: chunkOriginal.split('\n').map((line, i) => ({
                    id: `cut_${startIdx + i + 1}`,
                    cutNumber: String(startIdx + i + 1),
                    narrationText: line,
                    character: [],
                    location: "Unknown",
                    sceneDescription: "Failed to generate visual description.",
                    characterEmotionAndExpression: "Neutral",
                    characterPose: "Standing",
                    characterOutfit: "Default",
                    locationDescription: "Unknown",
                    otherNotes: "Generation failed.",
                    directorialIntent: "None"
                }))
            }];
        }

        totalTokenCount += tokenCount;
        combinedScenes.push(...chunkScenes);

        // Count how many cuts were actually generated
        let returnedCutsCount = 0;
        let lastGeneratedNarration = "";
        for (const scene of chunkScenes) {
            if (scene.cuts && Array.isArray(scene.cuts)) {
                returnedCutsCount += scene.cuts.length;
                if (scene.cuts.length > 0) {
                    lastGeneratedNarration = scene.cuts[scene.cuts.length - 1].narrationText || "";
                }
            }
        }

        let linesToAdvance = returnedCutsCount;
        const chunkLines = chunkOriginal.split('\n');

        if (returnedCutsCount === 0) {
            console.warn(`Model returned 0 cuts for chunk starting at index ${startIdx}. Advancing by 1 to prevent infinite loop.`);
            linesToAdvance = 1;
        } else {
            // Try to find how many lines were actually processed by matching the last narration
            let matchIndex = -1;
            if (lastGeneratedNarration) {
                // Clean up strings for better matching
                const cleanLast = lastGeneratedNarration.replace(/\s+/g, '').toLowerCase();
                // Search from the end to find the LAST matching line
                for (let i = chunkLines.length - 1; i >= 0; i--) {
                    const cleanL = chunkLines[i].replace(/\s+/g, '').toLowerCase();
                    if (cleanL.includes(cleanLast) || cleanLast.includes(cleanL)) {
                        matchIndex = i;
                        break;
                    }
                }
            }

            if (matchIndex !== -1) {
                linesToAdvance = matchIndex + 1;
                console.log(`Matched last cut to line ${matchIndex + 1} of ${chunkLines.length}. Advancing by ${linesToAdvance}.`);
            } else {
                // If we can't match, assume the model summarized the entire chunk to prevent infinite repeating loops
                console.warn(`Could not match last cut narration to original script. Assuming full chunk processed. Advancing by ${chunkLines.length}.`);
                linesToAdvance = chunkLines.length;
            }
        }

        currentCutIndex += linesToAdvance;

        const lastSceneInChunk = chunkScenes[chunkScenes.length - 1];
        if (lastSceneInChunk && lastSceneInChunk.cuts && lastSceneInChunk.cuts.length > 0) {
            const lastCut = lastSceneInChunk.cuts[lastSceneInChunk.cuts.length - 1];
            previousCutContext = `Up to cut ${lastCut.id}, the situation was: ${lastCut.narrationText}. The visual scene was described as: ${lastCut.sceneDescription}`;
        }

        chunkIndex++;
    }

    // 3. [SCENE MERGING] Fix fragmentation caused by chunking
    const mergedScenes: EditableScene[] = [];
    if (combinedScenes.length > 0) {
        let currentScene = { ...combinedScenes[0], cuts: [...combinedScenes[0].cuts] }; // Deep copy cuts array

        for (let i = 1; i < combinedScenes.length; i++) {
            const nextScene = combinedScenes[i];
            const lastCutOfCurrent = currentScene.cuts[currentScene.cuts.length - 1];
            const firstCutOfNext = nextScene.cuts[0];

            // Heuristic: If locations are identical, it's likely the same scene split by chunk limit
            if (lastCutOfCurrent && firstCutOfNext && lastCutOfCurrent.location === firstCutOfNext.location) {
                currentScene.cuts = [...currentScene.cuts, ...nextScene.cuts];
            } else {
                mergedScenes.push(currentScene);
                currentScene = { ...nextScene, cuts: [...nextScene.cuts] };
            }
        }
        mergedScenes.push(currentScene);
    } else {
        // Fallback if no scenes generated
    }

    // [SEQUENTIAL RENUMBERING] Force sequential cut IDs to close gaps from chunking/merging
    let globalCutIndex = 1;
    const normalizedScenes = mergedScenes.map((scene, sIdx) => ({
        ...scene,
        sceneNumber: sIdx + 1,
        cuts: scene.cuts.map(cut => {
            const newCutNumber = `${globalCutIndex++}`;
            return {
                ...cut,
                // We keep the internal ID as the newly generated number for consistency in referencing
                id: newCutNumber,
                // Ensure display number is also sequential
                cutNumber: newCutNumber,
            };
        })
    }));

    return { storyboard: normalizedScenes, locationDNAMap, tokenCount: totalTokenCount };
};

// ─── generateFinalStoryboardFromEditable ──────────────────────────────────────
export const generateFinalStoryboardFromEditable = (editableScenes: EditableScene[], characterDescriptions: { [key: string]: CharacterDescription }, animationStyle: string): { scenes: Scene[], tokenCount: number } => {
    const scenes: Scene[] = editableScenes.map(editableScene => ({
        sceneNumber: editableScene.sceneNumber, title: editableScene.title, settingPrompt: '',
        cuts: editableScene.cuts.map(editableCut => ({
            id: window.crypto.randomUUID(), cutNumber: editableCut.id, narration: editableCut.narrationText,
            characters: editableCut.character, location: editableCut.location, cameraAngle: editableCut.otherNotes,
            sceneDescription: editableCut.sceneDescription, characterEmotionAndExpression: editableCut.characterEmotionAndExpression,
            characterPose: editableCut.characterPose, characterOutfit: String(editableCut.characterOutfit || 'Casual clothes'),
            locationDescription: editableCut.locationDescription, otherNotes: editableCut.otherNotes, imageUrls: [], imageLoading: false, selectedImageId: null, directorialIntent: editableCut.directorialIntent
        }))
    }));
    return { scenes, tokenCount: 0 };
};

// ─── formatTextWithSemanticBreaks ─────────────────────────────────────────────
export const formatTextWithSemanticBreaks = async (text: string, seed?: number): Promise<{ formattedText: string, tokenCount: number }> => {
    if (text.includes('\n')) {
        return { formattedText: text, tokenCount: 0 };
    }

    const ai = await createGeminiClient();
    const prompt = `
 [시스템 명령]
 설명이나 분석 없이, 아래 입력된 문장을 3단계 줄바꿈 알고리즘을 적용한 '최종 결과물'로만 변환하십시오.
 규칙을 어기고 분석글이나 접두사를 포함하면 안 됩니다.
 입력: ${text}
 `;

    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            systemInstruction: SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION,
            temperature: 0.1,
            ...(seed !== undefined && { seed }),
        },
    });

    const formattedText = getResponseText(response, 'formatTextWithSemanticBreaks');
    const tokenCount = getTokenCountFromResponse(response);

    // PDF Page 69 - clean-up logic
    const cleanedText = formattedText
        .replace(/^(출력|결과|최종 결과물|변환 결과|입력):\s*/i, '')
        .replace(/^\*\*.*?\*\*\n?/g, '') // 마크다운 볼드 설명 제거
        .replace(/\[알고리즘.*?\]/g, '') // 알고리즘 단계 태그 제거
        .trim();

    return { formattedText: cleanedText, tokenCount };
};

// ─── formatMultipleTextsWithSemanticBreaks ─────────────────────────────────────
export const formatMultipleTextsWithSemanticBreaks = async (texts: string[], seed?: number): Promise<{ formattedTexts: string[], tokenCount: number }> => {
    const ai = await createGeminiClient();

    // Filter out texts that already have newlines or are empty
    const textsToProcess = texts.map((text, index) => ({ text, index })).filter(item => !item.text.includes('\n') && item.text.trim() !== '');

    if (textsToProcess.length === 0) {
        return { formattedTexts: texts, tokenCount: 0 };
    }

    const prompt = `
[시스템 명령]
다음 JSON 배열에 포함된 각 문장들을 3단계 줄바꿈 알고리즘을 적용하여 변환하십시오.
결과는 반드시 동일한 순서의 JSON 배열(문자열 배열)로만 출력해야 합니다.
설명, 분석, 마크다운 코드 블록(\`\`\`json 등)을 절대 포함하지 말고 오직 JSON 배열만 출력하십시오.

입력:
${JSON.stringify(textsToProcess.map(t => t.text))}
`;

    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            systemInstruction: SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION,
            temperature: 0.1,
            responseMimeType: "application/json",
            ...(seed !== undefined && { seed }),
        },
    });

    try {
        const resultTexts = parseJsonResponse<string[]>(response, 'formatMultipleTextsWithSemanticBreaks');
        const tokenCount = getTokenCountFromResponse(response);

        const finalTexts = [...texts];
        textsToProcess.forEach((item, i) => {
            if (resultTexts[i]) {
                finalTexts[item.index] = resultTexts[i]
                    .replace(/^(출력|결과|최종 결과물|변환 결과|입력):\s*/i, '')
                    .replace(/^\*\*.*?\*\*\n?/g, '')
                    .replace(/\[알고리즘.*?\]/g, '')
                    .trim();
            }
        });

        return { formattedTexts: finalTexts, tokenCount };
    } catch (error) {
        console.error("Failed to parse multiple semantic breaks:", error);
        return { formattedTexts: texts, tokenCount: getTokenCountFromResponse(response) };
    }
};
