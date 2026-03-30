use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

// ─── Keychain Service Name ──────────────────────────────────────────────────
// Uses the Tauri identifier to prevent conflicts with other app versions.
// Each app version has a unique identifier in tauri.conf.json.
const SERVICE_NAME: &str = "com.doremissul.studio.first";

// ─── API Keys ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
struct ApiKeys {
    claude: Option<String>,
    gemini: Option<String>,
    supertone: Option<String>,
    fal: Option<String>,
}

static API_KEYS_CACHE: Mutex<Option<ApiKeys>> = Mutex::new(None);

fn keychain_set(key_name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    entry.set_password(value)
        .map_err(|e| format!("Keychain set error: {}", e))
}

fn keychain_get(key_name: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    entry.get_password()
        .map_err(|e| format!("Keychain get error: {}", e))
}

fn keychain_delete(key_name: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Keychain entry error: {}", e))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keychain delete error: {}", e)),
    }
}

fn invalidate_keys_cache() {
    if let Ok(mut cache) = API_KEYS_CACHE.lock() {
        *cache = None;
    }
}

fn cached_keys() -> ApiKeys {
    let mut cache = API_KEYS_CACHE.lock().unwrap();
    if let Some(ref keys) = *cache {
        return keys.clone();
    }
    // Try loading unified JSON first
    let keys = match keychain_get("API_KEYS_JSON") {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => {
            // Try legacy individual keys migration
            let mut legacy = ApiKeys::default();
            if let Ok(v) = keychain_get("CLAUDE_API_KEY") { legacy.claude = Some(v); }
            if let Ok(v) = keychain_get("GEMINI_API_KEY") { legacy.gemini = Some(v); }
            if let Ok(v) = keychain_get("SUPERTONE_API_KEY") { legacy.supertone = Some(v); }
            if let Ok(v) = keychain_get("FAL_API_KEY") { legacy.fal = Some(v); }
            // Migrate to unified if any found
            if legacy.claude.is_some() || legacy.gemini.is_some() || legacy.supertone.is_some() || legacy.fal.is_some() {
                if let Ok(json) = serde_json::to_string(&legacy) {
                    let _ = keychain_set("API_KEYS_JSON", &json);
                }
                // Clean up legacy keys
                let _ = keychain_delete("CLAUDE_API_KEY");
                let _ = keychain_delete("GEMINI_API_KEY");
                let _ = keychain_delete("SUPERTONE_API_KEY");
                let _ = keychain_delete("FAL_API_KEY");
            }
            legacy
        }
    };
    *cache = Some(keys.clone());
    keys
}

fn get_api_key(field: &str) -> Result<String, String> {
    let keys = cached_keys();
    match field {
        "claude" => keys.claude.ok_or_else(|| "CLAUDE_API_KEY not set".into()),
        "gemini" => keys.gemini.ok_or_else(|| "GEMINI_API_KEY not set".into()),
        "supertone" => keys.supertone.ok_or_else(|| "SUPERTONE_API_KEY not set".into()),
        "fal" => keys.fal.ok_or_else(|| "FAL_API_KEY not set".into()),
        _ => Err(format!("Unknown key: {}", field)),
    }
}

#[tauri::command]
fn save_api_keys(keys: ApiKeys) -> Result<(), String> {
    let mut current = cached_keys();
    if let Some(v) = keys.claude { current.claude = Some(v); }
    if let Some(v) = keys.gemini { current.gemini = Some(v); }
    if let Some(v) = keys.supertone { current.supertone = Some(v); }
    if let Some(v) = keys.fal { current.fal = Some(v); }
    let json = serde_json::to_string(&current)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    keychain_set("API_KEYS_JSON", &json)?;
    invalidate_keys_cache();
    Ok(())
}

#[tauri::command]
fn load_api_keys() -> Result<ApiKeys, String> {
    Ok(cached_keys())
}

#[tauri::command]
fn check_api_keys() -> Result<serde_json::Value, String> {
    let keys = cached_keys();
    Ok(serde_json::json!({
        "claude": keys.claude.is_some(),
        "gemini": keys.gemini.is_some(),
        "supertone": keys.supertone.is_some(),
        "fal": keys.fal.is_some(),
    }))
}

#[tauri::command]
fn delete_api_key(key_name: String) -> Result<(), String> {
    let mut current = cached_keys();
    match key_name.as_str() {
        "claude" => current.claude = None,
        "gemini" => current.gemini = None,
        "supertone" => current.supertone = None,
        "fal" => current.fal = None,
        _ => return Err(format!("Unknown key: {}", key_name)),
    }
    let json = serde_json::to_string(&current)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    keychain_set("API_KEYS_JSON", &json)?;
    invalidate_keys_cache();
    Ok(())
}

// ─── Storage Paths ──────────────────────────────────────────────────────────

fn default_data_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join(SERVICE_NAME))
}

fn app_config_path() -> Result<PathBuf, String> {
    Ok(default_data_root()?.join("config.json"))
}

fn app_data_root() -> Result<PathBuf, String> {
    // Check for custom storage path in config
    if let Ok(config_path) = app_config_path() {
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(custom_path) = config.get("storage_path").and_then(|v| v.as_str()) {
                        let p = PathBuf::from(custom_path);
                        if p.exists() {
                            return Ok(p);
                        }
                    }
                }
            }
        }
    }
    default_data_root()
}

#[tauri::command]
fn get_storage_path() -> Result<String, String> {
    app_data_root().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn set_storage_path(path: String) -> Result<(), String> {
    let config_path = app_config_path()?;
    // Ensure parent dir
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir error: {}", e))?;
    }
    // Ensure target dir exists
    fs::create_dir_all(&path).map_err(|e| format!("mkdir target error: {}", e))?;
    let config = serde_json::json!({ "storage_path": path });
    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("write config error: {}", e))
}

#[tauri::command]
fn ensure_directories() -> Result<(), String> {
    let root = app_data_root()?;
    let dirs = [
        root.join("projects"),
        root.join("assets").join("characters"),
        root.join("assets").join("outfits"),
        root.join("assets").join("backgrounds"),
        root.join("thumbnails"),
    ];
    for dir in &dirs {
        fs::create_dir_all(dir).map_err(|e| format!("mkdir error: {}", e))?;
    }
    Ok(())
}

// ─── File Operations ────────────────────────────────────────────────────────

#[tauri::command]
fn save_image_file(target: String, sub_path: String, filename: String, base64_data: String) -> Result<String, String> {
    let root = app_data_root()?;
    let dir = match target.as_str() {
        "project" => root.join("projects").join(&sub_path),
        "asset" => root.join("assets").join(&sub_path),
        _ => return Err(format!("Unknown target: {}", target)),
    };
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir error: {}", e))?;

    // Strip data URL prefix if present
    let raw_b64 = if let Some(pos) = base64_data.find(",") {
        &base64_data[pos + 1..]
    } else {
        &base64_data
    };

    let bytes = BASE64.decode(raw_b64)
        .map_err(|e| format!("base64 decode error: {}", e))?;

    let file_path = dir.join(&filename);
    fs::write(&file_path, &bytes)
        .map_err(|e| format!("write error: {}", e))?;

    // Return relative path
    let relative = match target.as_str() {
        "project" => format!("projects/{}/{}", sub_path, filename),
        "asset" => format!("assets/{}/{}", sub_path, filename),
        _ => filename,
    };
    Ok(relative)
}

#[tauri::command]
fn delete_image_file(relative_path: String) -> Result<(), String> {
    let root = app_data_root()?;
    let full_path = root.join(&relative_path);
    if full_path.exists() {
        fs::remove_file(&full_path).map_err(|e| format!("delete error: {}", e))?;
    }
    // Also try deleting thumbnail
    let thumb_path = root.join("thumbnails").join(
        PathBuf::from(&relative_path).file_name().unwrap_or_default()
    );
    if thumb_path.exists() {
        let _ = fs::remove_file(&thumb_path);
    }
    Ok(())
}

#[tauri::command]
fn read_image_base64(relative_path: String) -> Result<String, String> {
    let root = app_data_root()?;
    let full_path = root.join(&relative_path);
    let bytes = fs::read(&full_path)
        .map_err(|e| format!("read error: {}", e))?;
    let encoded = BASE64.encode(&bytes);
    // Detect MIME type from extension
    let mime = match full_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn save_audio_file(sub_path: String, filename: String, base64_data: String) -> Result<String, String> {
    let root = app_data_root()?;
    let dir = root.join("projects").join(&sub_path);
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir error: {}", e))?;

    let raw_b64 = if let Some(pos) = base64_data.find(",") {
        &base64_data[pos + 1..]
    } else {
        &base64_data
    };

    let bytes = BASE64.decode(raw_b64)
        .map_err(|e| format!("base64 decode error: {}", e))?;

    let file_path = dir.join(&filename);
    fs::write(&file_path, &bytes)
        .map_err(|e| format!("write error: {}", e))?;

    Ok(format!("projects/{}/{}", sub_path, filename))
}

// ─── Project CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
fn create_project(title: String) -> Result<String, String> {
    let root = app_data_root()?;
    let project_id = format!("proj_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());
    let project_dir = root.join("projects").join(&project_id);
    fs::create_dir_all(project_dir.join("images")).map_err(|e| format!("mkdir error: {}", e))?;
    fs::create_dir_all(project_dir.join("audio")).map_err(|e| format!("mkdir error: {}", e))?;
    fs::create_dir_all(project_dir.join("characters")).map_err(|e| format!("mkdir error: {}", e))?;

    let metadata = serde_json::json!({
        "id": project_id,
        "title": title,
    });
    let meta_path = project_dir.join("project.json");
    fs::write(&meta_path, serde_json::to_string_pretty(&metadata).unwrap())
        .map_err(|e| format!("write error: {}", e))?;

    Ok(project_id)
}

#[tauri::command]
fn save_project(project_id: String, metadata_json: String) -> Result<(), String> {
    let root = app_data_root()?;
    let project_dir = root.join("projects").join(&project_id);
    fs::create_dir_all(&project_dir).map_err(|e| format!("mkdir error: {}", e))?;
    // Atomic write: write to temp, then rename
    let tmp_path = project_dir.join("project.json.tmp");
    let final_path = project_dir.join("project.json");
    fs::write(&tmp_path, &metadata_json)
        .map_err(|e| format!("write error: {}", e))?;
    fs::rename(&tmp_path, &final_path)
        .map_err(|e| format!("rename error: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_project(project_id: String) -> Result<String, String> {
    let root = app_data_root()?;
    let meta_path = root.join("projects").join(&project_id).join("project.json");
    fs::read_to_string(&meta_path)
        .map_err(|e| format!("read error: {}", e))
}

#[tauri::command]
fn list_projects() -> Result<String, String> {
    let root = app_data_root()?;
    let projects_dir = root.join("projects");
    if !projects_dir.exists() {
        return Ok("[]".to_string());
    }
    let mut projects = Vec::new();
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("readdir error: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let meta_path = path.join("project.json");
            if meta_path.exists() {
                if let Ok(content) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                        projects.push(meta);
                    }
                }
            }
        }
    }
    serde_json::to_string(&projects).map_err(|e| format!("serialize error: {}", e))
}

#[tauri::command]
fn delete_project(project_id: String) -> Result<(), String> {
    let root = app_data_root()?;
    let project_dir = root.join("projects").join(&project_id);
    if project_dir.exists() {
        fs::remove_dir_all(&project_dir)
            .map_err(|e| format!("delete error: {}", e))?;
    }
    Ok(())
}

// ─── Tauri App ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_api_keys,
            load_api_keys,
            check_api_keys,
            delete_api_key,
            get_storage_path,
            set_storage_path,
            ensure_directories,
            save_image_file,
            delete_image_file,
            read_image_base64,
            save_audio_file,
            create_project,
            save_project,
            load_project,
            list_projects,
            delete_project,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
