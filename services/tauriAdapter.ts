// services/tauriAdapter.ts — Tauri IPC Bridge
// Browser/Tauri 분기 처리. Tauri 없으면 fallback (localStorage 등)

export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let invoke: ((cmd: string, args?: any) => Promise<any>) | null = null;

async function getInvoke() {
    if (invoke) return invoke;
    if (!IS_TAURI) throw new Error('Not in Tauri environment');
    const mod = await import('@tauri-apps/api/core');
    invoke = mod.invoke;
    return invoke;
}

// ─── API Keys ───────────────────────────────────────────────────────────────

export interface ApiKeys {
    claude: string | null;
    gemini: string | null;
    supertone: string | null;
    fal: string | null;
}

export async function saveApiKeys(keys: Partial<ApiKeys>): Promise<void> {
    if (!IS_TAURI) {
        // Browser fallback: localStorage
        const existing = JSON.parse(localStorage.getItem('api_keys') || '{}');
        const merged = { ...existing, ...keys };
        localStorage.setItem('api_keys', JSON.stringify(merged));
        return;
    }
    const inv = await getInvoke();
    await inv('save_api_keys', { keys });
}

export async function loadApiKeys(): Promise<ApiKeys> {
    if (!IS_TAURI) {
        const stored = JSON.parse(localStorage.getItem('api_keys') || '{}');
        return {
            claude: stored.claude || null,
            gemini: stored.gemini || null,
            supertone: stored.supertone || null,
            fal: stored.fal || null,
        };
    }
    const inv = await getInvoke();
    return await inv('load_api_keys');
}

export async function checkApiKeys(): Promise<{ claude: boolean; gemini: boolean; supertone: boolean; fal: boolean }> {
    if (!IS_TAURI) {
        const keys = await loadApiKeys();
        return {
            claude: !!keys.claude,
            gemini: !!keys.gemini,
            supertone: !!keys.supertone,
            fal: !!keys.fal,
        };
    }
    const inv = await getInvoke();
    return await inv('check_api_keys');
}

export async function deleteApiKey(keyName: string): Promise<void> {
    if (!IS_TAURI) {
        const existing = JSON.parse(localStorage.getItem('api_keys') || '{}');
        delete existing[keyName];
        localStorage.setItem('api_keys', JSON.stringify(existing));
        return;
    }
    const inv = await getInvoke();
    await inv('delete_api_key', { keyName });
}

// ─── Storage Path ───────────────────────────────────────────────────────────

export async function getStoragePath(): Promise<string> {
    if (!IS_TAURI) return '(browser mode)';
    const inv = await getInvoke();
    return await inv('get_storage_path');
}

export async function setStoragePath(path: string): Promise<void> {
    if (!IS_TAURI) return;
    const inv = await getInvoke();
    await inv('set_storage_path', { path });
}

export async function pickStorageFolder(): Promise<string | null> {
    if (!IS_TAURI) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title: '저장소 폴더 선택' });
    return selected as string | null;
}

// ─── File Operations ────────────────────────────────────────────────────────

export async function ensureDirectories(): Promise<void> {
    if (!IS_TAURI) return;
    const inv = await getInvoke();
    await inv('ensure_directories');
}

export async function saveImageFile(target: 'project' | 'asset', subPath: string, filename: string, base64Data: string): Promise<string> {
    const inv = await getInvoke();
    return await inv('save_image_file', { target, subPath, filename, base64Data });
}

export async function deleteImageFile(relativePath: string): Promise<void> {
    const inv = await getInvoke();
    await inv('delete_image_file', { relativePath });
}

export async function readImageBase64(relativePath: string): Promise<string> {
    const inv = await getInvoke();
    return await inv('read_image_base64', { relativePath });
}

export async function saveAudioFile(subPath: string, filename: string, base64Data: string): Promise<string> {
    const inv = await getInvoke();
    return await inv('save_audio_file', { subPath, filename, base64Data });
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function createProject(title: string): Promise<string> {
    const inv = await getInvoke();
    return await inv('create_project', { title });
}

export async function saveProjectMetadata(projectId: string, metadata: object): Promise<void> {
    const inv = await getInvoke();
    await inv('save_project', { projectId, metadataJson: JSON.stringify(metadata) });
}

export async function loadProjectMetadata(projectId: string): Promise<any> {
    const inv = await getInvoke();
    const json = await inv('load_project', { projectId });
    return JSON.parse(json);
}

export async function listProjects(): Promise<any[]> {
    const inv = await getInvoke();
    const json = await inv('list_projects');
    return JSON.parse(json);
}

export async function deleteProject(projectId: string): Promise<void> {
    const inv = await getInvoke();
    await inv('delete_project', { projectId });
}

// ─── File Download ──────────────────────────────────────────────────────────

export async function downloadFile(data: Blob | string, fileName: string, filters?: { name: string; extensions: string[] }[]): Promise<boolean> {
    if (!IS_TAURI) {
        // Browser fallback
        const url = typeof data === 'string' ? data : URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        if (typeof data !== 'string') URL.revokeObjectURL(url);
        return true;
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const filePath = await save({ defaultPath: fileName, filters });
    if (!filePath) return false;
    const bytes = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(await data.arrayBuffer());
    await writeFile(filePath, bytes);
    return true;
}
