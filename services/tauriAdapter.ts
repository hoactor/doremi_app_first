/**
 * Tauri Adapter — 프론트엔드 ↔ Rust 백엔드 브릿지
 * 
 * Tauri 환경에서는 invoke()로 Rust 커맨드 호출
 * 브라우저 환경에서는 기존 fetch 방식 폴백 (개발용)
 */

// Tauri 환경 감지
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Tauri invoke wrapper — 동적 import로 번들 크기 절약
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!IS_TAURI) {
        throw new Error(`Tauri not available for command: ${cmd}`);
    }
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
}

// Tauri event listener
export async function listen(event: string, handler: (payload: any) => void): Promise<() => void> {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    const unlisten = await tauriListen(event, (e) => handler(e.payload));
    return unlisten;
}

// Tauri event emitter
export async function emit(event: string, payload?: any): Promise<void> {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    await tauriEmit(event, payload);
}

// ─── 멀티윈도우 ─────────────────────────────────────────────────

export async function openAssetCatalog(): Promise<void> {
    return invoke('open_asset_catalog');
}

// ─── API Key Management ─────────────────────────────────────────

export interface ApiKeys {
    claude: string | null;
    gemini: string | null;
    supertone: string | null;
    fal: string | null;
}

// API 키: localStorage 전용 (dev 빌드 코드서명이 매번 달라 Keychain 접근 거부됨)
const _KEYS_STORE = 'doremissul_api_keys';
function _readKeys(): ApiKeys {
    const s = JSON.parse(localStorage.getItem(_KEYS_STORE) || '{}');
    return { claude: s.claude || null, gemini: s.gemini || null, supertone: s.supertone || null, fal: s.fal || null };
}

export async function saveApiKeys(keys: Partial<ApiKeys>): Promise<void> {
    localStorage.setItem(_KEYS_STORE, JSON.stringify({ ..._readKeys(), ...keys }));
}

export async function loadApiKeys(): Promise<ApiKeys> {
    return _readKeys();
}

export async function checkApiKeys(): Promise<{ claude: boolean; gemini: boolean; supertone: boolean; fal: boolean }> {
    const k = _readKeys();
    return { claude: !!k.claude, gemini: !!k.gemini, supertone: !!k.supertone, fal: !!k.fal };
}

/** fal.ai API key를 가져오기 (falService 초기화용) */
export async function getFalApiKey(): Promise<string> {
    if (IS_TAURI) {
        const keys = await loadApiKeys();
        if (!keys.fal) throw new Error('fal.ai API 키가 설정되지 않았습니다.');
        return keys.fal;
    } else {
        const key = (import.meta as any).env?.VITE_FAL_KEY;
        if (!key) throw new Error('VITE_FAL_KEY 환경변수가 설정되지 않았습니다.');
        return key;
    }
}

// ─── Claude API ─────────────────────────────────────────────────

interface ClaudeRequest {
    system?: string;
    messages: any;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
}

interface ClaudeResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

/** Claude non-streaming call via Rust proxy */
export async function callClaudeTauri(
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const request: ClaudeRequest = {
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature,
    };

    const data = await invoke<any>('proxy_claude', { request });
    const textContent = data.content?.find((c: any) => c.type === 'text');

    return {
        text: textContent?.text?.trim() || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
}

/** Claude streaming call via Rust proxy + Tauri events */
export async function callClaudeStreamTauri(
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (textLength: number) => void,
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const eventId = `claude-stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    return new Promise<ClaudeResponse>(async (resolve, reject) => {
        const unlisten = await listen(eventId, (event: any) => {
            if (event.done) {
                unlisten();
                resolve({
                    text: fullText.trim(),
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                });
                return;
            }

            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                fullText += event.delta.text;
                if (onProgress) onProgress(fullText.length);
            }
            if (event.type === 'message_delta' && event.usage) {
                outputTokens = event.usage.output_tokens || 0;
            }
            if (event.type === 'message_start' && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
            }
        });

        try {
            const request: ClaudeRequest = {
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                max_tokens: options?.maxTokens || 8192,
                temperature: options?.temperature,
                stream: true,
            };
            await invoke('proxy_claude_stream', { request, eventId });
        } catch (err) {
            unlisten();
            reject(err);
        }
    });
}

/** Claude Vision via Rust proxy */
export async function callClaudeVisionTauri(
    systemPrompt: string,
    userPrompt: string,
    imageBase64: string,
    mimeType: string = 'image/png',
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const request: ClaudeRequest = {
        system: systemPrompt,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                { type: 'text', text: userPrompt },
            ],
        }],
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
    };

    const data = await invoke<any>('proxy_claude', { request });
    const textContent = data.content?.find((c: any) => c.type === 'text');

    return {
        text: textContent?.text?.trim() || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
}

// ─── Gemini API ─────────────────────────────────────────────────

/** Gemini proxy — Rust가 API key를 주입 */
export async function callGeminiTauri(urlPath: string, body: any): Promise<any> {
    return invoke<any>('proxy_gemini', {
        request: { url_path: urlPath, body },
    });
}

/** Gemini API key를 Rust에서 가져오기 (GoogleGenAI 초기화용) */
export async function getGeminiApiKey(): Promise<string> {
    const keys = await loadApiKeys();
    if (!keys.gemini) throw new Error('Gemini API 키가 설정되지 않았습니다.');
    return keys.gemini;
}

// ─── Supertone API ──────────────────────────────────────────────

/** Supertone TTS via Rust proxy — CORS 문제 없음! */
export async function callSupertoneTauri(
    voiceId: string,
    text: string,
    language?: string,
    styleLabel?: string
): Promise<Blob> {
    const bytes = await invoke<number[]>('proxy_supertone', {
        request: {
            voice_id: voiceId,
            text,
            language: language || 'ko',
            style_label: styleLabel || 'default',
        },
    });
    return new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
}

// ─── Generic Fetch (CORS-free) ──────────────────────────────────

export async function fetchViaTauri(
    url: string,
    options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: any;
    }
): Promise<{ status: number; data: any }> {
    return invoke('proxy_fetch', {
        request: {
            url,
            method: options?.method,
            headers: options?.headers,
            body: options?.body,
        },
    });
}

// ─── File Download Helper (Tauri + Browser) ─────────────────────

/** Tauri-safe file download. Uses native save dialog in Tauri, createElement('a') in browser. */
export async function downloadFile(
    data: Blob | string,
    fileName: string,
    filters?: { name: string; extensions: string[] }[]
): Promise<boolean> {
    if (IS_TAURI) {
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
            const filePath = await save({
                defaultPath: fileName,
                filters: filters || [{ name: 'Files', extensions: [fileName.split('.').pop() || '*'] }],
            });
            if (!filePath) return false; // User cancelled

            if (typeof data === 'string') {
                await writeTextFile(filePath, data);
            } else {
                const arrayBuffer = await data.arrayBuffer();
                await writeFile(filePath, new Uint8Array(arrayBuffer));
            }
            return true;
        } catch (err) {
            console.error('Tauri download failed:', err);
            throw err;
        }
    } else {
        // Browser fallback
        const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }
}

// ─── 로컬 스토리지: 파일시스템 ──────────────────────────────────────

/** 앱 시작 시 필수 디렉토리 구조 생성 */
export async function ensureDirectories(): Promise<void> {
    if (!IS_TAURI) return;
    return invoke('ensure_directories');
}

/** base64 이미지 → 로컬 파일 저장. 상대 경로 반환. */
export async function saveImageFile(
    target: 'project' | 'asset',
    subPath: string,
    filename: string,
    base64Data: string
): Promise<string> {
    return invoke<string>('save_image_file', {
        target,
        subPath: subPath,
        filename,
        base64Data: base64Data,
    });
}

/** 로컬 이미지 파일 + 썸네일 삭제 */
export async function deleteImageFile(relativePath: string): Promise<void> {
    return invoke('delete_image_file', { relativePath });
}

/** base64 오디오 → 로컬 파일 저장. 상대 경로 반환. */
export async function saveAudioFile(
    subPath: string,
    filename: string,
    base64Data: string
): Promise<string> {
    return invoke<string>('save_audio_file', {
        subPath,
        filename,
        base64Data: base64Data,
    });
}

/** 로컬 파일 → data:image/... base64 URL 반환 */
export async function readImageBase64(relativePath: string): Promise<string> {
    return invoke<string>('read_image_base64', { relativePath });
}

/** 앱 데이터 루트 경로 반환 */
export async function getAppDataPath(): Promise<string> {
    return invoke<string>('get_app_data_path');
}

/** 현재 저장 경로 반환 (config 기반, 없으면 기본값) */
export async function getStoragePath(): Promise<string> {
    return invoke<string>('get_storage_path');
}

/** 저장 경로 변경 — config.json에 기록 */
export async function setStoragePath(path: string): Promise<void> {
    return invoke('set_storage_path', { path });
}

/** 폴더 선택 다이얼로그 */
export async function pickStorageFolder(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ directory: true, multiple: false, title: '저장 폴더 선택' });
    if (!result) return null;
    return Array.isArray(result) ? result[0] : result;
}

/**
 * 이미지 URL 변환: 상대 경로 → 표시 가능한 URL
 * - Tauri: Rust에서 base64로 읽어서 반환 (asset:// 대신 안정적)
 * - 브라우저: 그대로 반환 (base64 문자열이므로)
 */
export async function resolveImageUrl(pathOrBase64: string): Promise<string> {
    // 이미 data:URL이면 그대로
    if (pathOrBase64.startsWith('data:')) return pathOrBase64;
    // blob:URL이면 그대로
    if (pathOrBase64.startsWith('blob:')) return pathOrBase64;
    // http(s)면 그대로
    if (pathOrBase64.startsWith('http')) return pathOrBase64;
    // Tauri: 로컬 파일 → base64 읽기
    if (IS_TAURI) {
        return readImageBase64(pathOrBase64);
    }
    // 브라우저: fallback
    return pathOrBase64;
}

// ─── 로컬 스토리지: 프로젝트 ────────────────────────────────────────

export interface ProjectListEntry {
    id: string;
    title: string;
    cutCount: number;
    thumbnailPath: string | null;
    updatedAt: string;
    artStyle?: string | null;
}

/** 새 프로젝트 생성 → ID 반환 */
export async function createProject(title: string): Promise<string> {
    return invoke<string>('create_project', { title });
}

/** 프로젝트 메타데이터 저장 (project.json) */
export async function saveProjectMetadata(projectId: string, metadata: object): Promise<void> {
    return invoke('save_project', {
        projectId,
        metadataJson: JSON.stringify(metadata),
    });
}

/** 프로젝트 메타데이터 로드 */
export async function loadProjectMetadata(projectId: string): Promise<any> {
    const json = await invoke<string>('load_project', { projectId });
    return JSON.parse(json);
}

/** 전체 프로젝트 목록 */
export async function listProjects(): Promise<ProjectListEntry[]> {
    const json = await invoke<string>('list_projects');
    const data = JSON.parse(json);
    return data.projects || [];
}

/** 프로젝트 삭제 (폴더 전체) */
export async function deleteProject(projectId: string): Promise<void> {
    return invoke('delete_project', { projectId });
}

/** 30일 이상 업데이트 안 된 프로젝트 자동 삭제 */
export async function cleanupOldProjects(maxAgeDays: number = 30): Promise<{ deleted: string[] }> {
    const result: string = await invoke('cleanup_old_projects', { maxAgeDays });
    return JSON.parse(result);
}

// ─── 로컬 스토리지: 에셋 ────────────────────────────────────────────

export interface AssetCatalogEntry {
    id: string;
    type: 'character' | 'outfit' | 'background';
    name: string;
    imagePath: string;
    thumbnailPath: string;
    tags: {
        character: string | null;
        artStyle: string | null;
        location: string | null;
        description: string | null;
    };
    visualDNA: any | null;
    outfitData: any | null;
    spatialDNA: string | null;
    prompt: string | null;
    createdAt: string;
}

/** 에셋 저장 (이미지 + 메타데이터) → ID 반환 */
export async function saveAsset(
    assetType: 'character' | 'outfit' | 'background',
    filename: string,
    base64Data: string,
    metadata: Partial<AssetCatalogEntry>
): Promise<string> {
    return invoke<string>('save_asset', {
        assetType,
        filename,
        base64Data: base64Data,
        metadataJson: JSON.stringify(metadata),
    });
}

/** 전체 에셋 카탈로그 로드 */
export async function loadAssetCatalog(): Promise<AssetCatalogEntry[]> {
    const json = await invoke<string>('load_asset_catalog');
    const data = JSON.parse(json);
    return data.assets || [];
}

/** 에셋 삭제 (이미지 + 썸네일 + 카탈로그에서 제거) */
export async function deleteAsset(assetId: string): Promise<void> {
    return invoke('delete_asset', { assetId });
}

/** 에셋 메타데이터 업데이트 (태그 편집 등) */
export async function updateAssetMetadata(
    assetId: string,
    metadata: Partial<AssetCatalogEntry>
): Promise<void> {
    return invoke('update_asset_metadata', {
        assetId,
        metadataJson: JSON.stringify(metadata),
    });
}

// ─── Phase 6: LoRA 레지스트리 ────────────────────────────────────

import type { LoRAEntry } from '../types';

/** 기본 LoRA 프리셋 (레지스트리 비어있으면 자동 시드) */
const DEFAULT_LORA_PRESETS: LoRAEntry[] = [
    {
        id: 'preset-dss-boy',
        name: '남주',
        url: 'https://v3b.fal.media/files/b/0a9304f4/4RrrXV7kR4hDy23f_3a3q_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_boy',
        scale: 0.9,
        type: 'character',
        createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
        id: 'preset-dss-girl',
        name: '여주',
        url: 'https://v3b.fal.media/files/b/0a9304fa/Fn5DMZXXAoxG55C4EhC5I_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_girl',
        scale: 0.9,
        type: 'character',
        createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
        id: 'preset-dss-chibi',
        name: '치비',
        url: 'https://v3b.fal.media/files/b/0a930562/bSnkQnaviH-Zi0fFsJ84A_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_chibi style',
        scale: 0.9,
        type: 'style',
        createdAt: '2026-03-01T00:00:00.000Z',
    },
    // ── 선후배 LoRA 세트 ──
    {
        id: 'dss_sunbae_f',
        name: '여후배',
        url: 'https://v3b.fal.media/files/b/0a938f7d/5-yTmwXdsmKmuPqwB_I7O_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_sunbae_f',
        scale: 0.9,
        type: 'character',
        baseAppearance: 'light brown wavy long hair with small bun on right side tied with red ribbon, large golden amber sparkling eyes',
        createdAt: '2026-03-25T00:00:00.000Z',
    },
    {
        id: 'dss_sunbae_m',
        name: '남선배',
        url: 'https://v3b.fal.media/files/b/0a939027/xinOFgqQn6jdfaqwtuFkW_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_sunbae_m',
        scale: 0.9,
        type: 'character',
        baseAppearance: 'dark brown (not black) messy curly wavy short hair with volume, sharp dark brown eyes',
        createdAt: '2026-03-25T00:00:00.000Z',
    },
    {
        id: 'dss_chibi_style01',
        name: '선후배_치비',
        url: 'https://v3b.fal.media/files/b/0a93908f/IDLoG3ydnWhCVWHIbA0Pc_pytorch_lora_weights.safetensors',
        triggerWord: 'dss_chibi_style01',
        scale: 0.9,
        type: 'style',
        createdAt: '2026-03-25T00:00:00.000Z',
    },
];

/** LoRA 레지스트리 저장 */
export async function saveLoraRegistry(entries: LoRAEntry[]): Promise<void> {
    const json = JSON.stringify({ version: 1, entries }, null, 2);
    return invoke('save_lora_registry', { json });
}

/** LoRA 레지스트리 로드 (비어있으면 기본 프리셋 자동 시드) */
export async function loadLoraRegistry(): Promise<LoRAEntry[]> {
    const json = await invoke<string>('load_lora_registry');
    const data = JSON.parse(json);
    const entries: LoRAEntry[] = data.entries || [];

    // 레지스트리 비어있으면 기본 프리셋 전체 시드
    if (entries.length === 0) {
        console.log(`[LoRA] 레지스트리 비어있음 → 기본 프리셋 ${DEFAULT_LORA_PRESETS.length}개 시드`);
        await saveLoraRegistry(DEFAULT_LORA_PRESETS);
        return [...DEFAULT_LORA_PRESETS];
    }

    // 기존 레지스트리에 누락된 프리셋 자동 병합
    const existingIds = new Set(entries.map(e => e.id));
    const missing = DEFAULT_LORA_PRESETS.filter(p => !existingIds.has(p.id));
    if (missing.length > 0) {
        console.log(`[LoRA] 누락 프리셋 ${missing.length}개 자동 추가:`, missing.map(m => m.name).join(', '));
        const merged = [...entries, ...missing];
        await saveLoraRegistry(merged);
        return merged;
    }

    return entries;
}

/** ★ 창 크기 초기화 (1728×1200, 화면 중앙) */
export async function resetWindowSize(): Promise<void> {
    if (!IS_TAURI) return;
    try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(1728, 1200));
        await win.center();
        console.log('[Window] Reset to 1728×1200, centered');
    } catch (err) {
        console.error('[Window] resetWindowSize failed:', err);
    }
}
