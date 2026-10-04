import { describe, expect, test } from 'vitest';
import { buildFluxPrompt } from './appFluxPromptEngine';
import { getFluxEndpoint } from './services/falService';
import type { CharacterDescription, Cut } from './types';

const character = {
  koreanName: '하나',
  canonicalName: 'Hana',
  aliases: ['여주'],
  koreanBaseAppearance: '',
  baseAppearance: 'young woman with short black hair',
  gender: 'female',
  personality: '',
  locations: { 교실: 'blue school uniform' },
  koreanLocations: {},
} as CharacterDescription;

const cut = {
  id: 'cut-1',
  cutNumber: '1',
  narration: '',
  characters: ['여주'],
  location: '교실',
  characterPose: 'raising one hand',
  characterEmotionAndExpression: 'bright smile',
  characterOutfit: 'blue school uniform',
  sceneDescription: 'Hana waves to a friend',
  cameraAngle: 'medium shot',
  locationDescription: 'sunlit classroom',
  imageUrls: [],
  imageLoading: false,
  audioDataUrls: [],
  audioDuration: null,
  directorialIntent: '',
  imagePrompt: '',
} as Cut;

describe('Flux prompt safety', () => {
  test('uses descriptive prose without structured or directive syntax', () => {
    const prompt = buildFluxPrompt(cut, {
      characterDescriptions: { char_hana: character },
      locationVisualDNA: {},
      cinematographyPlan: null,
      artStyle: 'normal',
      imageRatio: '9:16',
      fluxModel: 'flux-2-flex',
    });
    expect(prompt).toContain('young woman with short black hair');
    expect(prompt).not.toMatch(/[{}]|```|\bDO\s+NOT\b|\bMUST\b|\[[A-Z _-]+\]\s*:|\([^():]+:\s*\d/iu);
  });

  test('unknown and missing models fall back to Flux 2 Flex', () => {
    expect(getFluxEndpoint()).toBe('fal-ai/flux-2-flex');
    expect(getFluxEndpoint('unknown-model')).toBe('fal-ai/flux-2-flex');
    expect(getFluxEndpoint('flux-pro')).toBe('fal-ai/flux-2-pro');
  });
});
