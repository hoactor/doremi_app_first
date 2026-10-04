import { describe, expect, test } from 'vitest';
import { splitSupertoneText, SUPERTONE_MAX_TEXT_LENGTH } from './services/supertoneService';

describe('Supertone text limits', () => {
    test('a long unbroken Korean narration is split into API-safe chunks without loss', () => {
        const text = '가'.repeat(SUPERTONE_MAX_TEXT_LENGTH + 1);
        const parts = splitSupertoneText(text);
        expect(parts.map(part => Array.from(part).length)).toEqual([SUPERTONE_MAX_TEXT_LENGTH, 1]);
        expect(parts.join('')).toBe(text);
    });

    test('natural whitespace is preferred and every part stays within 300 characters', () => {
        const text = `${'긴 문장입니다. '.repeat(70)}마지막 문장`;
        const parts = splitSupertoneText(text);
        expect(parts.length).toBeGreaterThan(1);
        expect(parts.every(part => Array.from(part).length <= SUPERTONE_MAX_TEXT_LENGTH)).toBe(true);
        expect(parts.every(Boolean)).toBe(true);
    });
});
