import { describe, expect, test } from 'vitest';
import { filterCutFieldChangesForRequest } from './services/ai/textAnalysisRefine';

describe('prompt edit field allowlist', () => {
  const modelResponse = {
    characterEmotionAndExpression: 'angry expression',
    characterOutfit: 'red dress',
    location: 'school',
    locationDescription: 'bright classroom',
    cameraAngle: 'low angle',
  };

  test('an emotion-only request cannot alter location, outfit, or camera', () => {
    expect(filterCutFieldChangesForRequest('표정을 화나게 바꿔줘', modelResponse)).toEqual({
      characterEmotionAndExpression: 'angry expression',
    });
  });

  test('a background request allows only location fields', () => {
    expect(filterCutFieldChangesForRequest('배경을 학교 교실로 바꿔줘', modelResponse)).toEqual({
      location: 'school',
      locationDescription: 'bright classroom',
    });
  });

  test('an explicit camera and outfit request allows those fields', () => {
    expect(filterCutFieldChangesForRequest('의상을 빨간 드레스로 하고 로우앵글로 바꿔줘', modelResponse)).toEqual({
      characterOutfit: 'red dress',
      cameraAngle: 'low angle',
    });
  });
});
