// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Emitter;
use tauri::Manager;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, Mutex};

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client")
    })
}

const SERVICE_NAME: &str = "doremissul-studio";
const UNIFIED_KEY: &str = "API_KEYS_JSON";

// ─── Keychain 저수준 헬퍼 ──────────────────────────────────────────

fn keychain_set(key_name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    entry.set_password(value)
        .map_err(|e| format!("Keychain set error: {e}"))
}

fn keychain_get(key_name: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    entry.get_password()
        .map_err(|e| format!("{key_name} not found in Keychain: {e}"))
}

fn keychain_delete(key_name: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    entry.delete_credential()
        .map_err(|e| format!("Keychain delete error: {e}"))
}

// ─── 단일 항목 API 키 관리 (Keychain 승인 1회) ───────────────────

#[derive(Serialize, Deserialize, Clone, Default)]
struct ApiKeys {
    claude: Option<String>,
    gemini: Option<String>,
    supertone: Option<String>,
    fal: Option<String>,
}

/// 메모리 캐시 — 키체인 접근 1회로 제한
static API_KEYS_CACHE: Mutex<Option<ApiKeys>> = Mutex::new(None);

/// 캐시에서 키 로드 (없으면 마이그레이션 후 키체인에서 1회 읽어 캐시)
fn cached_keys() -> ApiKeys {
    let mut cache = API_KEYS_CACHE.lock().unwrap();
    if let Some(ref keys) = *cache {
        return keys.clone();
    }
    // 첫 접근 시 레거시 마이그레이션 실행
    drop(cache); // lock 해제 후 마이그레이션 (내부에서 keychain 접근)
    migrate_legacy_keys();
    let mut cache = API_KEYS_CACHE.lock().unwrap();
    // 마이그레이션 중 다른 스레드가 채웠을 수 있으므 재확인
    if let Some(ref keys) = *cache {
        return keys.clone();
    }
    let keys = keychain_get(UNIFIED_KEY)
        .ok()
        .and_then(|json| serde_json::from_str::<ApiKeys>(&json).ok())
        .unwrap_or_default();
    *cache = Some(keys.clone());
    keys
}

/// 캐시 무효화 (저장 후 호출)
fn invalidate_keys_cache() {
    let mut cache = API_KEYS_CACHE.lock().unwrap();
    *cache = None;
}

/// 기존 개별 키 → 단일 JSON 항목으로 마이그레이션
/// 기존 키가 있고 새 통합 키가 없을 때만 실행
fn migrate_legacy_keys() {
    // 이미 통합 키가 있으면 스킵
    if keychain_get(UNIFIED_KEY).is_ok() {
        return;
    }
    // 기존 개별 키 중 하나라도 있으면 마이그레이션
    let claude = keychain_get("CLAUDE_API_KEY").ok();
    let gemini = keychain_get("GEMINI_API_KEY").ok();
    let supertone = keychain_get("SUPERTONE_API_KEY").ok();
    let fal = keychain_get("FAL_API_KEY").ok();

    if claude.is_none() && gemini.is_none() && supertone.is_none() && fal.is_none() {
        return; // 아무 키도 없음 → 신규 설치
    }

    let keys = ApiKeys { claude, gemini, supertone, fal };
    if let Ok(json) = serde_json::to_string(&keys) {
        if keychain_set(UNIFIED_KEY, &json).is_ok() {
            // 마이그레이션 성공 → 기존 개별 키 삭제 (실패해도 무시)
            let _ = keychain_delete("CLAUDE_API_KEY");
            let _ = keychain_delete("GEMINI_API_KEY");
            let _ = keychain_delete("SUPERTONE_API_KEY");
            let _ = keychain_delete("FAL_API_KEY");
            println!("[Keychain] 기존 개별 키 → 단일 JSON 마이그레이션 완료");
        }
    }
}

/// 통합 JSON에서 특정 키 꺼내기 (proxy 함수용) — 캐시 사용
fn get_api_key(field: &str) -> Result<String, String> {
    let keys = cached_keys();
    match field {
        "claude" => keys.claude.filter(|s| !s.is_empty()).ok_or_else(|| "CLAUDE_API_KEY not found".to_string()),
        "gemini" => keys.gemini.filter(|s| !s.is_empty()).ok_or_else(|| "GEMINI_API_KEY not found".to_string()),
        "supertone" => keys.supertone.filter(|s| !s.is_empty()).ok_or_else(|| "SUPERTONE_API_KEY not found".to_string()),
        "fal" => keys.fal.filter(|s| !s.is_empty()).ok_or_else(|| "FAL_API_KEY not found".to_string()),
        _ => Err(format!("Unknown key field: {field}")),
    }
}

/// 통합 JSON에서 현재 키 로드 — 캐시 사용
fn load_unified_keys() -> ApiKeys {
    cached_keys()
}

/// 통합 JSON에 키 저장 (Keychain 접근 1회)
fn save_unified_keys(keys: &ApiKeys) -> Result<(), String> {
    let json = serde_json::to_string(keys)
        .map_err(|e| format!("JSON 직렬화 실패: {e}"))?;
    let result = keychain_set(UNIFIED_KEY, &json);
    invalidate_keys_cache(); // 저장 후 캐시 갱신
    result
}

#[tauri::command]
fn save_api_keys(keys: ApiKeys) -> Result<(), String> {
    // 기존 값 로드 → 변경된 필드만 머지
    let mut current = load_unified_keys();
    if let Some(k) = &keys.claude {
        if !k.is_empty() { current.claude = Some(k.clone()); }
    }
    if let Some(k) = &keys.gemini {
        if !k.is_empty() { current.gemini = Some(k.clone()); }
    }
    if let Some(k) = &keys.supertone {
        if !k.is_empty() { current.supertone = Some(k.clone()); }
    }
    if let Some(k) = &keys.fal {
        if !k.is_empty() { current.fal = Some(k.clone()); }
    }
    save_unified_keys(&current)
}

#[tauri::command]
fn load_api_keys() -> Result<ApiKeys, String> {
    Ok(load_unified_keys())
}

#[tauri::command]
fn check_api_keys() -> Result<serde_json::Value, String> {
    let keys = load_unified_keys();
    Ok(serde_json::json!({
        "claude": keys.claude.as_ref().map_or(false, |k| !k.is_empty()),
        "gemini": keys.gemini.as_ref().map_or(false, |k| !k.is_empty()),
        "supertone": keys.supertone.as_ref().map_or(false, |k| !k.is_empty()),
        "fal": keys.fal.as_ref().map_or(false, |k| !k.is_empty()),
    }))
}

#[tauri::command]
fn delete_api_key(key_name: String) -> Result<(), String> {
    let mut keys = load_unified_keys();
    match key_name.as_str() {
        "CLAUDE_API_KEY" => keys.claude = None,
        "GEMINI_API_KEY" => keys.gemini = None,
        "SUPERTONE_API_KEY" => keys.supertone = None,
        "FAL_API_KEY" => keys.fal = None,
        _ => return Err(format!("알 수 없는 키: {key_name}")),
    }
    save_unified_keys(&keys)
}

#[derive(Deserialize)]
struct ClaudeRequest {
    system: Option<String>,
    messages: serde_json::Value,
    model: Option<String>,
    max_tokens: Option<u32>,
    temperature: Option<f64>,
    #[allow(dead_code)]
    stream: Option<bool>,
}

#[tauri::command]
async fn proxy_claude(request: ClaudeRequest) -> Result<serde_json::Value, String> {
    let api_key = get_api_key("claude")?;
    let mut body = serde_json::json!({
        "model": request.model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
        "max_tokens": request.max_tokens.unwrap_or(8192),
        "messages": request.messages,
    });
    if let Some(sys) = &request.system {
        body["system"] = serde_json::json!(sys);
    }
    if let Some(temp) = request.temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    let resp = client()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude request failed: {e}"))?;
    let status = resp.status().as_u16();
    let resp_body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
    if status != 200 {
        return Err(format!("Claude API error ({}): {}", status, resp_body));
    }
    Ok(resp_body)
}

#[tauri::command]
async fn proxy_claude_stream(
    window: tauri::Window,
    request: ClaudeRequest,
    event_id: String,
) -> Result<(), String> {
    let api_key = get_api_key("claude")?;
    let mut body = serde_json::json!({
        "model": request.model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
        "max_tokens": request.max_tokens.unwrap_or(8192),
        "messages": request.messages,
        "stream": true,
    });
    if let Some(sys) = &request.system {
        body["system"] = serde_json::json!(sys);
    }
    if let Some(temp) = request.temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    let resp = client()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude stream request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude stream error ({}): {}", status, err_body));
    }
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    let _ = window.emit(&event_id, serde_json::json!({"done": true}));
                    return Ok(());
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    let _ = window.emit(&event_id, event);
                }
            }
        }
    }
    let _ = window.emit(&event_id, serde_json::json!({"done": true}));
    Ok(())
}

#[derive(Deserialize)]
struct GeminiProxyRequest {
    url_path: String,
    body: serde_json::Value,
}

#[tauri::command]
async fn proxy_gemini(request: GeminiProxyRequest) -> Result<serde_json::Value, String> {
    let api_key = get_api_key("gemini")?;
    let url = format!(
        "https://generativelanguage.googleapis.com/{}?key={}",
        request.url_path, api_key
    );
    let resp = client()
        .post(&url)
        .header("content-type", "application/json")
        .json(&request.body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;
    let status = resp.status().as_u16();
    let resp_body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
    if status != 200 {
        return Err(format!("Gemini API error ({}): {}", status, resp_body));
    }
    Ok(resp_body)
}

#[derive(Deserialize)]
struct SupertoneRequest {
    voice_id: String,
    text: String,
    language: Option<String>,
    style_label: Option<String>,
}

#[tauri::command]
async fn proxy_supertone(request: SupertoneRequest) -> Result<Vec<u8>, String> {
    let api_key = get_api_key("supertone")?;
    let body = serde_json::json!({
        "voice_id": request.voice_id,
        "text": request.text,
        "language": request.language.unwrap_or_else(|| "ko".to_string()),
        "style_label": request.style_label.unwrap_or_else(|| "default".to_string()),
    });
    let resp = client()
        .post("https://supertoneapi.com/v1/text-to-speech")
        .header("x-api-key", &api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Supertone request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Supertone API error ({}): {}", status, err_body));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Supertone response read error: {e}"))
}

#[derive(Deserialize)]
struct GenericFetchRequest {
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<serde_json::Value>,
}

#[tauri::command]
async fn proxy_fetch(request: GenericFetchRequest) -> Result<serde_json::Value, String> {
    let method = request.method.unwrap_or_else(|| "GET".to_string());
    let mut req = match method.to_uppercase().as_str() {
        "POST" => client().post(&request.url),
        "PUT" => client().put(&request.url),
        "DELETE" => client().delete(&request.url),
        "PATCH" => client().patch(&request.url),
        _ => client().get(&request.url),
    };
    if let Some(headers) = request.headers {
        for (k, v) in headers {
            req = req.header(&k, &v);
        }
    }
    if let Some(body) = request.body {
        req = req.json(&body);
    }
    let resp = req.send().await.map_err(|e| format!("Fetch error: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| format!("Read error: {e}"))?;
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(json) => Ok(serde_json::json!({"status": status, "data": json})),
        Err(_) => Ok(serde_json::json!({"status": status, "data": text})),
    }
}

// ─── 로컬 스토리지: 공용 유틸 ──────────────────────────────────────

/// 앱 설정 파일 위치 (항상 고정) — 저장 경로 등 앱 설정 보관
fn app_config_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME 환경변수 없음".to_string())?;
    Ok(std::path::PathBuf::from(home)
        .join("Library/Application Support/com.doremissul.studio/config.json"))
}

/// 기본 데이터 루트 (config 없을 때 폴백)
fn default_data_root() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME 환경변수 없음".to_string())?;
    Ok(std::path::PathBuf::from(home)
        .join("Library/Application Support/com.doremissul.studio"))
}

/// 앱 데이터 루트: config.json의 storage_path 우선, 없으면 기본값
fn app_data_root() -> Result<std::path::PathBuf, String> {
    if let Ok(config_path) = app_config_path() {
        if config_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&config_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(p) = val.get("storage_path").and_then(|v| v.as_str()) {
                        if !p.is_empty() {
                            return Ok(std::path::PathBuf::from(p));
                        }
                    }
                }
            }
        }
    }
    default_data_root()
}

/// 현재 저장 경로 반환
#[tauri::command]
fn get_storage_path() -> Result<String, String> {
    app_data_root().map(|p| p.to_string_lossy().to_string())
}

/// 저장 경로 변경 — config.json에 기록
#[tauri::command]
fn set_storage_path(path: String) -> Result<(), String> {
    let config_path = app_config_path()?;
    // config 디렉토리 보장 (기본 경로)
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("config 디렉토리 생성 실패: {e}"))?;
    }
    // 새 경로 디렉토리 미리 생성
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("저장 경로 생성 실패: {e}"))?;
    let config = serde_json::json!({ "storage_path": path });
    std::fs::write(&config_path, config.to_string())
        .map_err(|e| format!("config 저장 실패: {e}"))?;
    Ok(())
}

/// base64 → PNG 파일 저장 + 200×200 썸네일 자동 생성
fn save_image_internal(
    dir: &std::path::Path,
    filename: &str,
    base64_data: &str,
) -> Result<(), String> {
    // base64 디코딩 (data:image/...;base64, 접두사 제거)
    let raw = if let Some(pos) = base64_data.find(",") {
        &base64_data[pos + 1..]
    } else {
        base64_data
    };
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("base64 디코딩 실패: {e}"))?;

    // 원본 저장
    std::fs::create_dir_all(dir).map_err(|e| format!("디렉토리 생성 실패: {e}"))?;
    let file_path = dir.join(filename);
    std::fs::write(&file_path, &bytes).map_err(|e| format!("파일 저장 실패: {e}"))?;

    // 썸네일 생성 (200×200)
    let root = app_data_root()?;
    let thumb_dir = root.join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| format!("썸네일 디렉토리 생성 실패: {e}"))?;

    let thumb_name = format!("thumb_{}", filename);
    let thumb_path = thumb_dir.join(&thumb_name);

    if let Ok(img) = image::load_from_memory(&bytes) {
        let thumb = img.thumbnail(200, 200);
        thumb.save(&thumb_path).map_err(|e| format!("썸네일 저장 실패: {e}"))?;
    }

    Ok(())
}

// ─── 로컬 스토리지: 디렉토리 보장 ──────────────────────────────────

#[tauri::command]
fn ensure_directories() -> Result<(), String> {
    let root = app_data_root()?;
    let dirs = [
        root.join("projects"),
        root.join("assets/characters"),
        root.join("assets/outfits"),
        root.join("assets/backgrounds"),
        root.join("thumbnails"),
    ];
    for d in &dirs {
        std::fs::create_dir_all(d)
            .map_err(|e| format!("디렉토리 생성 실패 {:?}: {e}", d))?;
    }
    Ok(())
}

// ─── 로컬 스토리지: 이미지 저장/삭제 ───────────────────────────────

#[tauri::command]
fn save_image_file(
    target: String,     // "project" | "asset"
    sub_path: String,   // e.g. "proj_abc/images" 또는 "characters"
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    let root = app_data_root()?;
    let dir = if target == "asset" {
        root.join("assets").join(&sub_path)
    } else {
        root.join("projects").join(&sub_path)
    };

    save_image_internal(&dir, &filename, &base64_data)?;

    // 상대 경로 반환
    let rel = if target == "asset" {
        format!("assets/{}/{}", sub_path, filename)
    } else {
        format!("projects/{}/{}", sub_path, filename)
    };
    Ok(rel)
}

#[tauri::command]
fn delete_image_file(relative_path: String) -> Result<(), String> {
    let root = app_data_root()?;
    let full = root.join(&relative_path);
    if full.exists() {
        std::fs::remove_file(&full).map_err(|e| format!("파일 삭제 실패: {e}"))?;
    }

    // 썸네일도 삭제
    if let Some(fname) = std::path::Path::new(&relative_path).file_name() {
        let thumb = root.join("thumbnails").join(format!("thumb_{}", fname.to_string_lossy()));
        if thumb.exists() {
            let _ = std::fs::remove_file(&thumb);
        }
    }
    Ok(())
}

// ─── 로컬 스토리지: 오디오 저장 ────────────────────────────────────

#[tauri::command]
fn save_audio_file(
    sub_path: String,
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    let root = app_data_root()?;
    let dir = root.join("projects").join(&sub_path);
    std::fs::create_dir_all(&dir).map_err(|e| format!("디렉토리 생성 실패: {e}"))?;

    let raw = if let Some(pos) = base64_data.find(",") {
        &base64_data[pos + 1..]
    } else {
        &base64_data
    };
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("base64 디코딩 실패: {e}"))?;

    let file_path = dir.join(&filename);
    std::fs::write(&file_path, &bytes).map_err(|e| format!("오디오 저장 실패: {e}"))?;

    Ok(format!("projects/{}/{}", sub_path, filename))
}

// ─── 로컬 스토리지: 프로젝트 CRUD ──────────────────────────────────

#[tauri::command]
fn create_project(title: String) -> Result<String, String> {
    let root = app_data_root()?;
    let id = format!("proj_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let proj_dir = root.join("projects").join(&id);

    // 하위 폴더 생성
    std::fs::create_dir_all(proj_dir.join("images"))
        .map_err(|e| format!("프로젝트 폴더 생성 실패: {e}"))?;
    std::fs::create_dir_all(proj_dir.join("audio"))
        .map_err(|e| format!("오디오 폴더 생성 실패: {e}"))?;
    std::fs::create_dir_all(proj_dir.join("characters"))
        .map_err(|e| format!("캐릭터 폴더 생성 실패: {e}"))?;

    // 빈 project.json
    let now = chrono_now();
    let meta = serde_json::json!({
        "version": 2,
        "id": &id,
        "title": &title,
        "createdAt": &now,
        "updatedAt": &now,
    });
    let json_path = proj_dir.join("project.json");
    std::fs::write(&json_path, serde_json::to_string_pretty(&meta).unwrap())
        .map_err(|e| format!("project.json 저장 실패: {e}"))?;

    // project_list.json 업데이트
    update_project_list_entry(&root, &id, &title, &now, 0, None, None)?;

    Ok(id)
}

#[tauri::command]
fn save_project(project_id: String, metadata_json: String) -> Result<(), String> {
    let root = app_data_root()?;
    let proj_dir = root.join("projects").join(&project_id);
    if !proj_dir.exists() {
        return Err(format!("프로젝트 없음: {}", project_id));
    }

    // 임시 파일 → rename (안전한 저장)
    let json_path = proj_dir.join("project.json");
    let tmp_path = proj_dir.join("project.json.tmp");
    std::fs::write(&tmp_path, &metadata_json)
        .map_err(|e| format!("임시 파일 저장 실패: {e}"))?;
    std::fs::rename(&tmp_path, &json_path)
        .map_err(|e| format!("project.json rename 실패: {e}"))?;

    // project_list 업데이트 (title, cutCount 추출)
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&metadata_json) {
        let title = parsed["title"].as_str().unwrap_or("").to_string();
        let cut_count = parsed["scenes"]
            .as_array()
            .map(|scenes| {
                scenes.iter().map(|s| s["cuts"].as_array().map_or(0, |c| c.len())).sum::<usize>()
            })
            .unwrap_or(0);
        let thumb = parsed["scenes"]
            .as_array()
            .and_then(|s| s.first())
            .and_then(|s| s["cuts"].as_array())
            .and_then(|c| c.first())
            .and_then(|c| c["selectedImagePath"].as_str().or(c["imagePaths"][0].as_str()))
            .map(|s| s.to_string());
        let art_style = parsed["artStyle"].as_str().map(|s| s.to_string());
        let now = chrono_now();
        let _ = update_project_list_entry(&root, &project_id, &title, &now, cut_count, thumb, art_style);
    }

    Ok(())
}

#[tauri::command]
fn load_project(project_id: String) -> Result<String, String> {
    let root = app_data_root()?;
    let json_path = root.join("projects").join(&project_id).join("project.json");
    std::fs::read_to_string(&json_path)
        .map_err(|e| format!("프로젝트 로드 실패: {e}"))
}

#[tauri::command]
fn list_projects() -> Result<String, String> {
    let root = app_data_root()?;
    let list_path = root.join("project_list.json");
    if list_path.exists() {
        std::fs::read_to_string(&list_path)
            .map_err(|e| format!("목록 로드 실패: {e}"))
    } else {
        Ok(r#"{"projects":[]}"#.to_string())
    }
}

#[tauri::command]
fn delete_project(project_id: String) -> Result<(), String> {
    let root = app_data_root()?;
    let proj_dir = root.join("projects").join(&project_id);
    if proj_dir.exists() {
        std::fs::remove_dir_all(&proj_dir)
            .map_err(|e| format!("프로젝트 삭제 실패: {e}"))?;
    }

    // project_list에서 제거
    let list_path = root.join("project_list.json");
    if list_path.exists() {
        if let Ok(text) = std::fs::read_to_string(&list_path) {
            if let Ok(mut list) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = list["projects"].as_array_mut() {
                    arr.retain(|p| p["id"].as_str() != Some(&project_id));
                    let _ = std::fs::write(&list_path, serde_json::to_string_pretty(&list).unwrap());
                }
            }
        }
    }

    // 관련 썸네일 정리
    let thumb_dir = root.join("thumbnails");
    if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().contains(&project_id) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    Ok(())
}

/// project_list.json에 항목 추가/업데이트
fn update_project_list_entry(
    root: &std::path::Path,
    id: &str,
    title: &str,
    updated_at: &str,
    cut_count: usize,
    thumbnail_path: Option<String>,
    art_style: Option<String>,
) -> Result<(), String> {
    let list_path = root.join("project_list.json");
    let mut list: serde_json::Value = if list_path.exists() {
        let text = std::fs::read_to_string(&list_path).unwrap_or_else(|_| r#"{"projects":[]}"#.to_string());
        serde_json::from_str(&text).unwrap_or(serde_json::json!({"projects": []}))
    } else {
        serde_json::json!({"projects": []})
    };

    let entry = serde_json::json!({
        "id": id,
        "title": title,
        "cutCount": cut_count,
        "thumbnailPath": thumbnail_path,
        "updatedAt": updated_at,
        "artStyle": art_style,
    });

    if let Some(arr) = list["projects"].as_array_mut() {
        // 기존 항목 제거 후 맨 앞에 추가 (최신 순)
        arr.retain(|p| p["id"].as_str() != Some(id));
        arr.insert(0, entry);
    }

    std::fs::write(&list_path, serde_json::to_string_pretty(&list).unwrap())
        .map_err(|e| format!("project_list.json 저장 실패: {e}"))?;
    Ok(())
}

/// 30일 이상 업데이트되지 않은 프로젝트 자동 삭제
#[tauri::command]
fn cleanup_old_projects(max_age_days: Option<u64>) -> Result<String, String> {
    let root = app_data_root()?;
    let list_path = root.join("project_list.json");
    if !list_path.exists() {
        return Ok(r#"{"deleted":[]}"#.to_string());
    }

    let text = std::fs::read_to_string(&list_path)
        .map_err(|e| format!("목록 로드 실패: {e}"))?;
    let mut list: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or(serde_json::json!({"projects": []}));

    let max_age_secs = (max_age_days.unwrap_or(30) as u64) * 24 * 60 * 60;
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut deleted: Vec<String> = Vec::new();

    if let Some(arr) = list["projects"].as_array_mut() {
        let mut to_delete: Vec<String> = Vec::new();

        for proj in arr.iter() {
            let id = proj["id"].as_str().unwrap_or("").to_string();
            let updated = proj["updatedAt"].as_str().unwrap_or("");

            // ISO 8601 파싱: "2025-03-01T12:00:00.000Z" → epoch
            if let Some(epoch) = parse_iso_to_epoch(updated) {
                if now_secs > epoch && (now_secs - epoch) > max_age_secs {
                    to_delete.push(id);
                }
            }
        }

        for id in &to_delete {
            // 프로젝트 폴더 삭제
            let proj_dir = root.join("projects").join(id);
            if proj_dir.exists() {
                if let Err(e) = std::fs::remove_dir_all(&proj_dir) {
                    eprintln!("[cleanup] 프로젝트 폴더 삭제 실패 {}: {}", id, e);
                    continue; // 삭제 실패 시 목록에서도 제거하지 않음
                }
            }
            // 썸네일 정리
            let thumb_dir = root.join("thumbnails");
            if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
                for entry in entries.flatten() {
                    if entry.file_name().to_string_lossy().contains(id.as_str()) {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
            deleted.push(id.clone());
        }

        // project_list에서 제거
        arr.retain(|p| {
            let pid = p["id"].as_str().unwrap_or("");
            !deleted.iter().any(|d| d == pid)
        });

        std::fs::write(&list_path, serde_json::to_string_pretty(&list).unwrap())
            .map_err(|e| format!("project_list.json 저장 실패: {e}"))?;
    }

    let result = serde_json::json!({ "deleted": deleted });
    Ok(result.to_string())
}

/// ISO 8601 문자열 → epoch 초 (외부 크레이트 없이 간이 파싱)
fn parse_iso_to_epoch(iso: &str) -> Option<u64> {
    // "2025-03-01T12:30:45" or "2025-03-01T12:30:45.000Z"
    let parts: Vec<&str> = iso.split('T').collect();
    if parts.len() < 2 { return None; }
    let date_parts: Vec<u64> = parts[0].split('-').filter_map(|s| s.parse().ok()).collect();
    if date_parts.len() < 3 { return None; }
    let (year, month, day) = (date_parts[0], date_parts[1], date_parts[2]);

    let time_str = parts[1].trim_end_matches('Z').split('.').next().unwrap_or("0:0:0");
    let time_parts: Vec<u64> = time_str.split(':').filter_map(|s| s.parse().ok()).collect();
    let (hour, min, sec) = (
        *time_parts.first().unwrap_or(&0),
        *time_parts.get(1).unwrap_or(&0),
        *time_parts.get(2).unwrap_or(&0),
    );

    // 간이 epoch 계산 (윤년 근사)
    let days_from_epoch = (year - 1970) * 365 + (year - 1969) / 4
        + match month {
            1 => 0, 2 => 31, 3 => 59, 4 => 90, 5 => 120, 6 => 151,
            7 => 181, 8 => 212, 9 => 243, 10 => 273, 11 => 304, 12 => 334,
            _ => 0,
        } + day - 1;
    Some(days_from_epoch * 86400 + hour * 3600 + min * 60 + sec)
}

// ─── 로컬 스토리지: 에셋 CRUD ──────────────────────────────────────

#[tauri::command]
fn save_asset(
    asset_type: String,   // "character" | "outfit" | "background"
    filename: String,
    base64_data: String,
    metadata_json: String,
) -> Result<String, String> {
    let root = app_data_root()?;
    let id = format!("asset_{}_{}", &asset_type[..3.min(asset_type.len())],
        uuid::Uuid::new_v4().to_string().replace("-", "")[..8].to_string());

    // 에셋 타입별 하위 폴더
    let sub = match asset_type.as_str() {
        "character" => "characters",
        "outfit" => "outfits",
        "background" => "backgrounds",
        _ => return Err(format!("잘못된 에셋 타입: {}", asset_type)),
    };
    let dir = root.join("assets").join(sub);
    let actual_filename = format!("{}_{}", id, filename);
    save_image_internal(&dir, &actual_filename, &base64_data)?;

    let image_path = format!("assets/{}/{}", sub, actual_filename);
    let thumb_path = format!("thumbnails/thumb_{}", actual_filename);

    // 메타데이터 파싱 + catalog에 추가
    let mut meta: serde_json::Value = serde_json::from_str(&metadata_json)
        .unwrap_or(serde_json::json!({}));
    meta["id"] = serde_json::json!(&id);
    meta["type"] = serde_json::json!(&asset_type);
    meta["imagePath"] = serde_json::json!(&image_path);
    meta["thumbnailPath"] = serde_json::json!(&thumb_path);
    meta["createdAt"] = serde_json::json!(chrono_now());

    // asset_catalog.json 업데이트
    let catalog_path = root.join("asset_catalog.json");
    let mut catalog: serde_json::Value = if catalog_path.exists() {
        let text = std::fs::read_to_string(&catalog_path).unwrap_or_else(|_| r#"{"version":1,"assets":[]}"#.to_string());
        serde_json::from_str(&text).unwrap_or(serde_json::json!({"version": 1, "assets": []}))
    } else {
        serde_json::json!({"version": 1, "assets": []})
    };

    if let Some(arr) = catalog["assets"].as_array_mut() {
        arr.insert(0, meta);
    }

    std::fs::write(&catalog_path, serde_json::to_string_pretty(&catalog).unwrap())
        .map_err(|e| format!("에셋 카탈로그 저장 실패: {e}"))?;

    Ok(id)
}

#[tauri::command]
fn load_asset_catalog() -> Result<String, String> {
    let root = app_data_root()?;
    let catalog_path = root.join("asset_catalog.json");
    if catalog_path.exists() {
        std::fs::read_to_string(&catalog_path)
            .map_err(|e| format!("에셋 카탈로그 로드 실패: {e}"))
    } else {
        Ok(r#"{"version":1,"assets":[]}"#.to_string())
    }
}

// ─── Phase 6: LoRA 레지스트리 ──────────────────────────────────

#[tauri::command]
fn save_lora_registry(json: String) -> Result<(), String> {
    // JSON 유효성 검증
    let parsed: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("LoRA 레지스트리 JSON 파싱 실패: {e}"))?;
    let validated = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("LoRA 레지스트리 직렬화 실패: {e}"))?;
    let root = app_data_root()?;
    let path = root.join("lora_registry.json");
    std::fs::write(&path, &validated)
        .map_err(|e| format!("LoRA 레지스트리 저장 실패: {e}"))
}

#[tauri::command]
fn load_lora_registry() -> Result<String, String> {
    let root = app_data_root()?;
    let path = root.join("lora_registry.json");
    if path.exists() {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("LoRA 레지스트리 로드 실패: {e}"))
    } else {
        Ok(r#"{"version":1,"entries":[]}"#.to_string())
    }
}

#[tauri::command]
fn delete_asset(asset_id: String) -> Result<(), String> {
    let root = app_data_root()?;
    let catalog_path = root.join("asset_catalog.json");

    if catalog_path.exists() {
        let text = std::fs::read_to_string(&catalog_path)
            .map_err(|e| format!("카탈로그 읽기 실패: {e}"))?;
        let mut catalog: serde_json::Value = serde_json::from_str(&text)
            .unwrap_or(serde_json::json!({"version": 1, "assets": []}));

        // 에셋 찾아서 파일 삭제
        if let Some(arr) = catalog["assets"].as_array() {
            for asset in arr {
                if asset["id"].as_str() == Some(&asset_id) {
                    if let Some(img_path) = asset["imagePath"].as_str() {
                        let full = root.join(img_path);
                        let _ = std::fs::remove_file(&full);
                    }
                    if let Some(thumb_path) = asset["thumbnailPath"].as_str() {
                        let full = root.join(thumb_path);
                        let _ = std::fs::remove_file(&full);
                    }
                    break;
                }
            }
        }

        // 카탈로그에서 제거
        if let Some(arr) = catalog["assets"].as_array_mut() {
            arr.retain(|a| a["id"].as_str() != Some(&asset_id));
        }

        std::fs::write(&catalog_path, serde_json::to_string_pretty(&catalog).unwrap())
            .map_err(|e| format!("카탈로그 저장 실패: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
fn update_asset_metadata(asset_id: String, metadata_json: String) -> Result<(), String> {
    let root = app_data_root()?;
    let catalog_path = root.join("asset_catalog.json");

    if !catalog_path.exists() {
        return Err("에셋 카탈로그 없음".to_string());
    }

    let text = std::fs::read_to_string(&catalog_path)
        .map_err(|e| format!("카탈로그 읽기 실패: {e}"))?;
    let mut catalog: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("카탈로그 파싱 실패: {e}"))?;
    let updates: serde_json::Value = serde_json::from_str(&metadata_json)
        .map_err(|e| format!("메타데이터 파싱 실패: {e}"))?;

    if let Some(arr) = catalog["assets"].as_array_mut() {
        for asset in arr.iter_mut() {
            if asset["id"].as_str() == Some(&asset_id) {
                // 업데이트 필드 머지 (id, type, imagePath, thumbnailPath는 보호)
                if let Some(obj) = updates.as_object() {
                    for (k, v) in obj {
                        if !["id", "type", "imagePath", "thumbnailPath", "createdAt"].contains(&k.as_str()) {
                            asset[k] = v.clone();
                        }
                    }
                }
                break;
            }
        }
    }

    std::fs::write(&catalog_path, serde_json::to_string_pretty(&catalog).unwrap())
        .map_err(|e| format!("카탈로그 저장 실패: {e}"))?;
    Ok(())
}

// ─── 로컬 스토리지: 파일 읽기 (asset:// 대안) ──────────────────────

#[tauri::command]
fn read_image_base64(relative_path: String) -> Result<String, String> {
    let root = app_data_root()?;
    let full = root.join(&relative_path);
    let bytes = std::fs::read(&full)
        .map_err(|e| format!("이미지 읽기 실패: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    // MIME 추정
    let ext = full.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn get_app_data_path() -> Result<String, String> {
    app_data_root().map(|p| p.to_string_lossy().to_string())
}

// ─── 유틸 ──────────────────────────────────────────────────────────

fn chrono_now() -> String {
    use std::time::SystemTime;
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    // ISO 8601 근사 (외부 크레이트 없이)
    let secs = d.as_secs();
    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = remaining / 3600;
    let minutes = (remaining % 3600) / 60;
    let seconds = remaining % 60;

    // 1970-01-01 기준 날짜 계산
    let mut y: i64 = 1970;
    let mut rem_days = days as i64;
    loop {
        let is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
        let ydays: i64 = if is_leap { 366 } else { 365 };
        if rem_days < ydays { break; }
        rem_days -= ydays;
        y += 1;
    }
    let is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let month_days = [31, if is_leap {29} else {28}, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if rem_days < md as i64 { m = i + 1; break; }
        rem_days -= md as i64;
    }
    let day = rem_days + 1;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, day, hours, minutes, seconds)
}

// ─── 에셋 카탈로그 독립 윈도우 ──────────────────────────────────
#[tauri::command]
async fn open_asset_catalog(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    // 이미 열려있으면 포커스만
    if let Some(win) = app.get_webview_window("asset-catalog") {
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "asset-catalog",
        tauri::WebviewUrl::App("/?view=asset-catalog".into()),
    )
    .title("에셋 카탈로그")
    .inner_size(1000.0, 700.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    // 마이그레이션은 첫 키 접근 시 lazy 실행 (cached_keys 내부)

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // 기존 API
            save_api_keys,
            load_api_keys,
            check_api_keys,
            delete_api_key,
            proxy_claude,
            proxy_claude_stream,
            proxy_gemini,
            proxy_supertone,
            proxy_fetch,
            // 로컬 스토리지: 파일시스템
            ensure_directories,
            save_image_file,
            delete_image_file,
            save_audio_file,
            read_image_base64,
            get_app_data_path,
            get_storage_path,
            set_storage_path,
            // 로컬 스토리지: 프로젝트
            create_project,
            save_project,
            load_project,
            list_projects,
            delete_project,
            cleanup_old_projects,
            // 로컬 스토리지: 에셋
            save_asset,
            load_asset_catalog,
            delete_asset,
            update_asset_metadata,
            // Phase 6: LoRA 레지스트리
            save_lora_registry,
            load_lora_registry,
            // 멀티윈도우
            open_asset_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("도레미썰 스튜디오 실행 오류");
}
