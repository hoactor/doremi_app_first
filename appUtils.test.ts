import { describe, expect, test } from 'vitest';
import { resolveCharId, shouldSubmitPromptRefinement } from './appUtils';
import type { CharacterDescription } from './types';

const character = {
  koreanName: '김하나',
  canonicalName: 'Hana Kim',
  aliases: ['여주', '하나'],
  koreanBaseAppearance: '',
  baseAppearance: '',
  gender: 'female',
  personality: '',
  locations: {},
  koreanLocations: {},
} as CharacterDescription;

describe('resolveCharId', () => {
  const descriptions = { char_hana: character };

  test.each(['char_hana', '김하나', 'Hana Kim', 'hana kim', '여주', '여주 (주인공)', '여주（주인공）'])(
    'resolves %s through the shared identity map',
    name => expect(resolveCharId(name, descriptions)).toBe('char_hana'),
  );

  test('returns null for an unrelated character', () => {
    expect(resolveCharId('모르는 사람', descriptions)).toBeNull();
  });
});

describe('prompt refinement keyboard shortcut', () => {
  test('ordinary Enter and Ctrl+Enter remain text input', () => {
    expect(shouldSubmitPromptRefinement({ key: 'Enter', metaKey: false, ctrlKey: true, isComposing: false }, '수정')).toBe(false);
    expect(shouldSubmitPromptRefinement({ key: 'Enter', metaKey: false, isComposing: false }, '수정')).toBe(false);
  });

  test('only Command+Enter with non-empty text submits', () => {
    expect(shouldSubmitPromptRefinement({ key: 'Enter', metaKey: true, isComposing: false }, '수정')).toBe(true);
    expect(shouldSubmitPromptRefinement({ key: 'Enter', metaKey: true, isComposing: false }, '   ')).toBe(false);
    expect(shouldSubmitPromptRefinement({ key: 'Enter', metaKey: true, isComposing: true }, '수정')).toBe(false);
  });
});
