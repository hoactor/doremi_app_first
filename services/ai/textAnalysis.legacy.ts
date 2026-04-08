// services/ai/textAnalysis.legacy.ts — 레거시 보관 파일
// Phase 9 enrichScript 재설계 시 분리됨 (2026-03-17)
// generateEditableStoryboard + generateEditableStoryboardChunk: 상세대본 전용 경로였음
// 현재 사용되지 않음. 참고/롤백용 보관.

import { CharacterDescription, Gender, EditableScene, EditableCut } from '../../types';
import { callTextModel, parseJsonResponse, SFW_SYSTEM_INSTRUCTION, SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION } from './aiCore';
import { generateLocationProps } from './textAnalysis';

// ─── Helper ──────────────────────────────────────────────────────

const mergeMetaLines = (script: string): string[] => {
    const lines = script.split('\n').filter(l => l.trim() !== '');
    const merged: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if ((trimmed.startsWith('(') || trimmed.startsWith('[')) && merged.length > 0) {
            merged[merged.length - 1] += `\n${trimmed}`;
        } else {
            merged.push(line);
        }
    }
    return merged;
};

// ─── generateEditableStoryboardChunk ────────────────────────────

const generateEditableStoryboardChunk = async (
    chunkBlueprint: any,
    chunkOriginalScript: string,
    chunkEnrichedScript: string,
    locationProps: any,
    characterProfilesString: string,
    chunkInfo: { current: number, total: number, startCutId: string },
    previousCutContext: string,
    seed?: number
): Promise<{ scenes: EditableScene[], tokenCount: number }> => {

    const directingGuide = `
# [중요] 연기 지침 (HIGH PERFORMANCE ACTING):
- 'characterPose' 필드에 절대 "그냥 서 있다", "앉아 있다" 같은 정적인 설명을 쓰지 마십시오.
- 인물의 심리 상태가 신체 언어로 드러나는 구체적 동작을 기술하십시오.
  (예: "한 손으로 뒷목을 감싸 쥐며 시선을 피함", "두 손을 가슴 앞에 모으고 상체를 살짝 앞으로 기울임", "의자 등받이에 깊이 기대며 팔짱을 끼고 턱을 치켜올림")
- 'characterEmotionAndExpression'에는 눈, 입, 볼 등 얼굴 부위별 구체적인 변화를 기술하십시오.
  (예: "눈이 반달 모양으로 휘며 입꼬리가 한껏 올라감", "미간이 좁혀지고 입술을 꽉 다물며 눈가에 물기", "눈을 크게 뜨며 입이 살짝 벌어진 채 굳어짐")
- 'sceneDescription'에는 장면의 조명/분위기를 전달하는 환경 묘사를 포함하십시오.
    `;

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

    let result;
    try {
        result = await callTextModel(SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, {
            responseMimeType: 'application/json',
            seed,
            temperature: 0.1,
            maxTokens: 32768,
        });
    } catch (error: any) {
        console.warn("First attempt failed, retrying with higher temperature...", error);
        result = await callTextModel(SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxTokens: 32768,
        });
    }

    const tokenCount = result.tokenCount;
    const parsed = parseJsonResponse<any>(result.text, 'generateEditableStoryboardChunk');
    
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
        scenes = [];
    }
    
    return { scenes, tokenCount };
};


// ─── generateEditableStoryboard ─────────────────────────────────

export const generateEditableStoryboard = async (
    originalScript: string,
    enrichedScript: string,
    blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } },
    gender: Gender,
    characterDescriptions: { [key: string]: CharacterDescription },
    seed?: number,
    onProgress?: (part: number, total: number) => void
): Promise<{ storyboard: EditableScene[], locationDNAMap: { [location: string]: string }, tokenCount: number }> => {
    let totalTokenCount = 0;
    
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
    
    const originalLinesRaw = originalScript.split('\n').filter(l => l.trim() !== '');
    const enrichedLinesRaw = enrichedScript.split('\n').filter(l => l.trim() !== '');
    
    const locationPromises = Array.from(allLocations).map(async (location) => {
        try {
            const relevantLines = originalLinesRaw.filter(line => line.includes(location.split('(')[0].trim())).join('\n');
            const { tokenCount, spatialDNA, ...props } = await generateLocationProps(location, characterProfilesString, relevantLines || originalScript, seed);
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

    const CHUNK_SIZE = 50;
    const totalCuts = originalLinesRaw.length;
    
    const combinedScenes: EditableScene[] = [];
    let previousCutContext = "";

    let currentCutIndex = 0;
    let chunkIndex = 0;

    while (currentCutIndex < totalCuts) {
        const estimatedRemainingChunks = Math.ceil((totalCuts - currentCutIndex) / CHUNK_SIZE);
        const estimatedTotalChunks = chunkIndex + estimatedRemainingChunks;
        
        if (onProgress) onProgress(chunkIndex + 1, estimatedTotalChunks);

        const startIdx = currentCutIndex;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, totalCuts);
        
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
                seed
            );
            chunkScenes = result.scenes;
            tokenCount = result.tokenCount;
        } catch (error) {
            console.error(`Failed to generate chunk ${chunkIndex + 1}:`, error);
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
            let matchIndex = -1;
            if (lastGeneratedNarration) {
                const cleanLast = lastGeneratedNarration.replace(/\s+/g, '').toLowerCase();
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
            } else {
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

    const mergedScenes: EditableScene[] = [];
    if (combinedScenes.length > 0) {
        let currentScene = { ...combinedScenes[0], cuts: [...combinedScenes[0].cuts] };
        
        for (let i = 1; i < combinedScenes.length; i++) {
            const nextScene = combinedScenes[i];
            const lastCutOfCurrent = currentScene.cuts[currentScene.cuts.length - 1];
            const firstCutOfNext = nextScene.cuts[0];

            if (lastCutOfCurrent && firstCutOfNext && lastCutOfCurrent.location === firstCutOfNext.location) {
                currentScene.cuts = [...currentScene.cuts, ...nextScene.cuts];
            } else {
                mergedScenes.push(currentScene);
                currentScene = { ...nextScene, cuts: [...nextScene.cuts] };
            }
        }
        mergedScenes.push(currentScene);
    }

    let globalCutIndex = 1;
    const normalizedScenes = mergedScenes.map((scene, sIdx) => ({
        ...scene,
        sceneNumber: sIdx + 1,
        cuts: scene.cuts.map(cut => {
            const newCutNumber = `${globalCutIndex++}`;
            return {
                ...cut,
                id: newCutNumber, 
                cutNumber: newCutNumber, 
            };
        })
    }));

    return { storyboard: normalizedScenes, locationDNAMap, tokenCount: totalTokenCount };
};
