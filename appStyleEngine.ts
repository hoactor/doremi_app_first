import { ArtStyle, Cut, EditableCut, CharacterDescription } from './types';

// ── Art-style prompt builder (extracted from AppContext.getArtStylePrompt) ──

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

// ── Final-prompt composer (extracted from AppContext.calculateFinalPrompt) ──

export function buildFinalPrompt(
    cut: Cut | EditableCut,
    context: {
        characterDescriptions: Record<string, CharacterDescription>;
        locationVisualDNA: Record<string, string>;
        artStylePrompt: string;          // not used in body but kept for parity
        activeArtStyle: ArtStyle;        // resolved per-cut style
    },
): string {
    const { characterDescriptions: charDescriptions, locationVisualDNA: locDNA, activeArtStyle: activeStyle } = context;
    const rawCharacters = 'characters' in cut ? cut.characters : (cut as EditableCut).character;
    const characters = rawCharacters ? rawCharacters.filter(c => c && c.trim() !== '') : [];

    const location = cut.location;
    const locDesc = 'locationDescription' in cut ? cut.locationDescription : (cut as EditableCut).locationDescription;
    const other = 'otherNotes' in cut ? cut.otherNotes : (cut as EditableCut).otherNotes;
    const intent = 'directorialIntent' in cut ? cut.directorialIntent : (cut as EditableCut).directorialIntent;
    const pose = 'characterPose' in cut ? cut.characterPose : (cut as EditableCut).characterPose;
    const emotion = 'characterEmotionAndExpression' in cut ? cut.characterEmotionAndExpression : (cut as EditableCut).characterEmotionAndExpression;

    // --- Insert-cut handling (no characters) ---
    if (characters.length === 0) {
        const spatialDNA = locDNA[location] || 'Consistent visual background.';
        return `
# [SCENE INSERT / BACKGROUND ONLY]
- **TYPE:** Background Art / Scenery / Object Insert / Close-up of props.
- **CRITICAL NEGATIVE:** NO HUMANS. NO CHARACTERS. NO PEOPLE. Do not draw any person. The scene must be empty of people.
- **LOCATION:** ${location}
- **SPATIAL DNA:** ${spatialDNA}
- **VISUAL DESCRIPTION:** ${locDesc}
- **ATMOSPHERE/INTENT:** ${intent || 'Atmospheric shot reflecting the story context'}
- **DETAILS:** ${other}
- **QUALITY:** Highly detailed webtoon background art, establishing shot or emotional landscape.
        `.trim();
    }

    // --- Step 1: Mechanical identity DNA ---
    const mechanicalIdentityParts: string[] = [];
    const customOutfit = 'characterOutfit' in cut ? cut.characterOutfit : (cut as EditableCut).characterOutfit;

    characters.forEach(name => {
        const key = Object.keys(charDescriptions).find(k => charDescriptions[k].koreanName === name);
        if (key && charDescriptions[key]) {
            const char = charDescriptions[key];
            let profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';

            if (customOutfit && customOutfit.trim().length > 2) {
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\[${escapedName}:\\s*(.*?)\\]`, 'i');
                const match = customOutfit.match(regex);

                if (match && match[1] && match[1].trim().length > 2) {
                    profileOutfit = match[1].trim();
                } else if (characters.length === 1 && !customOutfit.includes('[')) {
                    profileOutfit = customOutfit;
                }
            }

            if (!profileOutfit || profileOutfit.length < 3 || profileOutfit.toLowerCase() === 'none' || profileOutfit.toLowerCase() === 'n/a') {
                profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';
            }

            const hair = char.hairStyleDescription || 'Standard hairstyle';
            const features = char.facialFeatures || 'Match facial visage exactly';

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

    // --- Step 2: Spatial DNA ---
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

    // --- Step 3: Proportion override ---
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

    const lockInstruction = `[ABSOLUTE IDENTITY PRESERVATION & DYNAMIC ACTING]
- **FACE LOCK (PRIORITY #1):** The facial features in the reference image (or Identity DNA) are the GROUND TRUTH. You must NOT change the face to match the style. Style applies to *rendering*, not *identity*.
- MANDATORY: Match the hair, face, and clothing of the character(s) EXACTLY to the "IDENTITY DNA" section below.
- WARDROBE OVERRIDE: You MUST change the character's clothing to match the "IDENTITY DNA" section. Do NOT copy the clothing from the reference image unless it matches the DNA.
- ACTING FOCUS: Perform a high-energy, exaggerated manga-style pose. Avoid static standing. Ensure clear weight distribution and expressive silhouettes.
- MANPU USAGE: Incorporate visual manga symbols ONLY IF they match the specific emotion. Do NOT add sweat drops (💧) unless the emotion is 'nervous', 'tired', or 'confused'.
- COMPOSITIONAL FREEDOM: Completely ignore the reference image's background and camera distance.
- ZERO PERSISTENCE: Do NOT repeat the pose of the reference. Create an ENTIRELY NEW visual composition.
${proportionInstruction}
${technicalFX}`;

    return `
${lockInstruction}

# [CRITICAL: IDENTITY PRIORITY - HIGHEST]
${identityDNA}

# LAYER 2: SCENE DYNAMICS (FLEXIBLE)
- Dynamic Intent: ${intent}. Rebuild the scene with a fresh perspective and high-energy performance.
- Action/Pose: ${pose}. Do not copy the pose from the reference. Focus on dynamic posture and hand gestures.
- Facial Expression: ${emotion}. Use exaggerated manga-style facial features.

# LAYER 3: ENVIRONMENT & SPATIAL DNA
- Precise Location: ${finalLocationString}
- Spatial Architecture (DNA): ${spatialDNA}
- Environment Detail: ${locDesc}
- Technical Specs: ${other}

[FINAL GUIDANCE]: Treat the reference image/DNA as a **FACE MASK**. Even if the scene changes, the face must look like the EXACT SAME PERSON.
`.trim();
}
