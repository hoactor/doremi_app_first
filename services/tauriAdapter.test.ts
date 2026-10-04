import { describe, expect, test } from 'vitest';
import { mergeLegacyApiKeyStores, selectMissingLegacyApiKeys } from './tauriAdapter';

describe('legacy API key migration merge', () => {
    test('null or empty values never erase a valid key from another legacy store', () => {
        const merged = mergeLegacyApiKeyStores([
            { gemini: 'gemini-valid', claude: 'claude-valid' },
            { gemini: null, claude: '   ', fal: 'fal-valid' },
        ]);
        expect(merged).toEqual({
            gemini: 'gemini-valid',
            claude: 'claude-valid',
            fal: 'fal-valid',
        });
    });

    test('a later non-empty value and dedicated OpenAI store take intentional precedence', () => {
        const merged = mergeLegacyApiKeyStores([
            { gemini: 'old-gemini', openai: 'old-openai' },
            { gemini: 'new-gemini' },
        ], 'new-openai');
        expect(merged.gemini).toBe('new-gemini');
        expect(merged.openai).toBe('new-openai');
    });

    test('legacy values are selected only for Keychain fields that are still missing', () => {
        const selected = selectMissingLegacyApiKeys(
            { openai: 'stale-openai', gemini: 'recovered-gemini', fal: 'recovered-fal' },
            { claude: true, gemini: false, supertone: true, fal: false, openai: true },
        );
        expect(selected).toEqual({ gemini: 'recovered-gemini', fal: 'recovered-fal' });
    });
});
