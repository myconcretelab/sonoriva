use std::{collections::HashMap, path::PathBuf, sync::Arc};

use reqwest::header::AUTHORIZATION;
use serde::Deserialize;
use tokio::{fs, io::AsyncWriteExt, sync::RwLock};

use crate::{
    audio::AudioEngine,
    config::{BridgeConfig, ConfigStore},
    models::{BridgeTrack, ProjectManifest},
};

const MAX_REMOTE_PREVIEW_BYTES: u64 = 50 * 1024 * 1024;

pub struct Runtime {
    pub config: RwLock<BridgeConfig>,
    pub device_token: RwLock<Option<String>>,
    pub local_token: RwLock<Option<String>>,
    pub audio: std::sync::Mutex<AudioEngine>,
    pub store: ConfigStore,
    client: reqwest::Client,
    download_locks: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    cache_access: RwLock<()>,
    pub downloads: std::sync::Mutex<HashMap<String, (u64, u64)>>,
    pub cancelled_launches: std::sync::Mutex<HashMap<String, u128>>,
    pub launch_generations: std::sync::Mutex<HashMap<String, u64>>,
}

struct DownloadCleanup<'a> {
    downloads: &'a std::sync::Mutex<HashMap<String, (u64, u64)>>,
    id: &'a str,
    temporary: PathBuf,
}

impl Drop for DownloadCleanup<'_> {
    fn drop(&mut self) {
        if let Ok(mut downloads) = self.downloads.lock() {
            downloads.remove(self.id);
        }
        let _ = std::fs::remove_file(&self.temporary);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingClaim {
    device_id: String,
    device_token: String,
    local_token: String,
    server_url: String,
}

impl Runtime {
    pub fn load() -> Result<Arc<Self>, String> {
        let store = ConfigStore::new()?;
        let config = store.load();
        let (device_token, local_token) = store.load_tokens();
        Ok(Arc::new(Self {
            config: RwLock::new(config),
            device_token: RwLock::new(device_token),
            local_token: RwLock::new(local_token),
            audio: std::sync::Mutex::new(AudioEngine::new()),
            store,
            download_locks: tokio::sync::Mutex::new(HashMap::new()),
            cache_access: RwLock::new(()),
            downloads: std::sync::Mutex::new(HashMap::new()),
            cancelled_launches: std::sync::Mutex::new(HashMap::new()),
            launch_generations: std::sync::Mutex::new(HashMap::new()),
            client: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(10))
                .read_timeout(std::time::Duration::from_secs(15))
                .user_agent(format!("SonoRiva-Bridge/{}", env!("CARGO_PKG_VERSION")))
                .build()
                .map_err(|error| error.to_string())?,
        }))
    }

    pub async fn paired(&self) -> bool {
        let config = self.config.read().await;
        config.server_url.is_some()
            && config.device_id.is_some()
            && self.device_token.read().await.is_some()
            && self.local_token.read().await.is_some()
    }

    pub async fn migrate_legacy_tokens(&self) -> Result<bool, String> {
        if self.device_token.read().await.is_some() && self.local_token.read().await.is_some() {
            return Ok(false);
        }
        let store = self.store.clone();
        let migrated = tokio::task::spawn_blocking(move || store.migrate_legacy_tokens())
            .await
            .map_err(|error| error.to_string())??;
        let Some((device_token, local_token)) = migrated else {
            return Ok(false);
        };
        *self.device_token.write().await = Some(device_token);
        *self.local_token.write().await = Some(local_token);
        Ok(true)
    }

    pub async fn claim_pairing(&self, ticket: &str, server_url: &str) -> Result<(), String> {
        let parsed_server = url::Url::parse(server_url)
            .map_err(|_| "Adresse du serveur SonoRiva invalide.".to_string())?;
        let allowed = (parsed_server.scheme() == "https"
            && parsed_server.host_str() == Some("app.sonoriva.fr"))
            || (parsed_server.scheme() == "http"
                && matches!(parsed_server.host_str(), Some("localhost" | "127.0.0.1")));
        if !allowed {
            return Err("Ce serveur n’est pas autorisé pour l’association.".to_string());
        }
        let server_url = server_url.trim_end_matches('/');
        let name = hostname::get()
            .ok()
            .and_then(|value| value.into_string().ok())
            .unwrap_or_else(|| default_device_name().to_string());
        let response = self
            .client
            .post(format!("{server_url}/api/bridge/pairings/claim"))
            .json(
                &serde_json::json!({ "ticket": ticket, "name": name, "platform": platform_name() }),
            )
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(response
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|body| body.get("error")?.as_str().map(str::to_string))
                .unwrap_or_else(|| "Association refusée par SonoRiva.".to_string()));
        }
        let claim = response
            .json::<PairingClaim>()
            .await
            .map_err(|error| error.to_string())?;
        self.store
            .save_tokens(&claim.device_token, &claim.local_token)?;
        let next_config = BridgeConfig {
            server_url: Some(claim.server_url),
            device_id: Some(claim.device_id),
            main_output_id: Some("default".to_string()),
            preview_output_id: Some("default".to_string()),
        };
        self.store.save(&next_config)?;
        *self.config.write().await = next_config;
        *self.device_token.write().await = Some(claim.device_token);
        *self.local_token.write().await = Some(claim.local_token);
        Ok(())
    }

    pub async fn ensure_track(&self, track: &BridgeTrack) -> Result<PathBuf, String> {
        validate_track_id(&track.id)?;
        let _access = self.cache_access.read().await;
        let lock = self
            .download_locks
            .lock()
            .await
            .entry(track.id.clone())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        let _download = lock.lock().await;
        let _cleanup = DownloadCleanup {
            downloads: &self.downloads,
            id: &track.id,
            temporary: self.store.cache_dir.join(format!("{}.part", track.id)),
        };
        self.download_track(track).await
    }

    async fn download_track(&self, track: &BridgeTrack) -> Result<PathBuf, String> {
        let path = self.store.cache_dir.join(format!("{}.audio", track.id));
        if let Ok(metadata) = fs::metadata(&path).await {
            if metadata.len() == track.size_bytes {
                return Ok(path);
            }
        }
        self.downloads
            .lock()
            .map_err(|_| "État du téléchargement indisponible.".to_string())?
            .insert(track.id.clone(), (0, track.size_bytes));
        let config = self.config.read().await.clone();
        let server_url = config
            .server_url
            .ok_or_else(|| "Le bridge n’est pas associé à SonoRiva.".to_string())?;
        let device_token = self
            .device_token
            .read()
            .await
            .clone()
            .ok_or_else(|| "Le jeton du bridge est introuvable.".to_string())?;
        let mut response = self
            .client
            .get(format!("{server_url}/api/bridge/tracks/{}/audio", track.id))
            .header(AUTHORIZATION, format!("Bearer {device_token}"))
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Téléchargement de « {} » refusé ({}).",
                track.title,
                response.status()
            ));
        }
        let temporary = self.store.cache_dir.join(format!("{}.part", track.id));
        let mut file = fs::File::create(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        let mut received = 0_u64;
        while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
            received += chunk.len() as u64;
            self.downloads
                .lock()
                .map_err(|_| "État du téléchargement indisponible.".to_string())?
                .insert(track.id.clone(), (received, track.size_bytes));
            if received > track.size_bytes.max(1) {
                let _ = fs::remove_file(&temporary).await;
                return Err("Le fichier reçu dépasse la taille annoncée.".to_string());
            }
            file.write_all(&chunk)
                .await
                .map_err(|error| error.to_string())?;
        }
        file.flush().await.map_err(|error| error.to_string())?;
        drop(file);
        if received != track.size_bytes {
            let _ = fs::remove_file(&temporary).await;
            return Err("Le fichier audio reçu est incomplet.".to_string());
        }
        if fs::try_exists(&path)
            .await
            .map_err(|error| error.to_string())?
        {
            fs::remove_file(&path)
                .await
                .map_err(|error| error.to_string())?;
        }
        fs::rename(&temporary, &path)
            .await
            .map_err(|error| error.to_string())?;
        Ok(path)
    }

    pub async fn ensure_remote_preview(
        &self,
        preview_id: &str,
        preview_url: &str,
    ) -> Result<PathBuf, String> {
        validate_track_id(preview_id)?;
        validate_remote_preview_url(preview_url)?;
        let path = self
            .store
            .cache_dir
            .join(format!("openverse-{preview_id}.preview"));
        if let Ok(mut entries) = fs::read_dir(&self.store.cache_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let candidate = entry.path();
                if candidate != path
                    && candidate.extension().and_then(|value| value.to_str()) == Some("preview")
                {
                    let _ = fs::remove_file(candidate).await;
                }
            }
        }
        if fs::try_exists(&path)
            .await
            .map_err(|error| error.to_string())?
        {
            return Ok(path);
        }
        let mut response = self
            .client
            .get(preview_url)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        validate_remote_preview_url(response.url().as_str())?;
        if !response.status().is_success() {
            return Err(format!(
                "Préécoute Openverse indisponible ({}).",
                response.status()
            ));
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_REMOTE_PREVIEW_BYTES)
        {
            return Err("La préécoute Openverse dépasse 50 Mo.".to_string());
        }
        let temporary = self
            .store
            .cache_dir
            .join(format!("openverse-{preview_id}.part"));
        let mut file = fs::File::create(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        let mut received = 0_u64;
        while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
            received += chunk.len() as u64;
            if received > MAX_REMOTE_PREVIEW_BYTES {
                let _ = fs::remove_file(&temporary).await;
                return Err("La préécoute Openverse dépasse 50 Mo.".to_string());
            }
            file.write_all(&chunk)
                .await
                .map_err(|error| error.to_string())?;
        }
        file.flush().await.map_err(|error| error.to_string())?;
        drop(file);
        if received == 0 {
            let _ = fs::remove_file(&temporary).await;
            return Err("La préécoute Openverse est vide.".to_string());
        }
        fs::rename(&temporary, &path)
            .await
            .map_err(|error| error.to_string())?;
        Ok(path)
    }

    pub async fn sync_project(&self, project_id: &str) -> Result<usize, String> {
        validate_track_id(project_id)?;
        let config = self.config.read().await.clone();
        let server_url = config
            .server_url
            .ok_or_else(|| "Le bridge n’est pas associé à SonoRiva.".to_string())?;
        let device_token = self
            .device_token
            .read()
            .await
            .clone()
            .ok_or_else(|| "Le jeton du bridge est introuvable.".to_string())?;
        let response = self
            .client
            .get(format!("{server_url}/api/bridge/projects/{project_id}"))
            .header(AUTHORIZATION, format!("Bearer {device_token}"))
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Synchronisation refusée ({}).", response.status()));
        }
        let manifest = response
            .json::<ProjectManifest>()
            .await
            .map_err(|error| error.to_string())?;
        let mut cached = 0;
        for item in manifest.tracks {
            self.ensure_track(&item.track).await?;
            cached += 1;
        }
        Ok(cached)
    }

    pub async fn cache_inventory(&self) -> Result<serde_json::Value, String> {
        let mut tracks = HashMap::new();
        let mut entries = fs::read_dir(&self.store.cache_dir)
            .await
            .map_err(|error| error.to_string())?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| error.to_string())?
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) == Some("audio") {
                if let (Some(id), Ok(metadata)) = (
                    path.file_stem().and_then(|value| value.to_str()),
                    entry.metadata().await,
                ) {
                    if metadata.is_file() && metadata.len() > 0 {
                        tracks.insert(id.to_string(), metadata.len());
                    }
                }
            }
        }
        Ok(
            serde_json::json!({ "tracks": tracks, "downloads": *self.downloads.lock().map_err(|_| "État du téléchargement indisponible.".to_string())? }),
        )
    }

    pub async fn cache_stats(&self) -> (usize, u64) {
        std::fs::read_dir(&self.store.cache_dir)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .fold((0, 0), |(files, bytes), entry| {
                let is_audio =
                    entry.path().extension().and_then(|value| value.to_str()) == Some("audio");
                (
                    files + usize::from(is_audio),
                    bytes + entry.metadata().map(|metadata| metadata.len()).unwrap_or(0),
                )
            })
    }

    pub async fn clear_cache(&self) -> Result<usize, String> {
        let _access = self.cache_access.write().await;
        let mut removed = 0;
        let mut entries = fs::read_dir(&self.store.cache_dir)
            .await
            .map_err(|error| error.to_string())?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| error.to_string())?
        {
            if matches!(
                entry.path().extension().and_then(|value| value.to_str()),
                Some("audio" | "preview" | "part")
            ) {
                fs::remove_file(entry.path())
                    .await
                    .map_err(|error| error.to_string())?;
                removed += 1;
            }
        }
        Ok(removed)
    }

    pub async fn save_output(&self, channel: &str, device_id: String) -> Result<(), String> {
        let mut config = self.config.write().await;
        match channel {
            "main" => config.main_output_id = Some(device_id),
            "preview" => config.preview_output_id = Some(device_id),
            _ => return Err("Canal de sortie inconnu.".to_string()),
        }
        self.store.save(&config)
    }
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn default_device_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "PC SonoRiva"
    } else if cfg!(target_os = "macos") {
        "Mac SonoRiva"
    } else {
        "SonoRiva Bridge"
    }
}

fn validate_track_id(value: &str) -> Result<(), String> {
    if value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        Ok(())
    } else {
        Err("Identifiant de média invalide.".to_string())
    }
}

fn validate_remote_preview_url(value: &str) -> Result<(), String> {
    let url = url::Url::parse(value).map_err(|_| "Adresse de préécoute invalide.".to_string())?;
    if url.scheme() == "https"
        && url.host_str().is_some_and(|host| {
            host == "cdn.freesound.org"
                || (host.starts_with("prod-") && host.ends_with(".storage.jamendo.com"))
                || host == "upload.wikimedia.org"
                || host == "ccmixter.org"
                || host.ends_with(".ccmixter.org")
        })
    {
        Ok(())
    } else {
        Err("Cette source de préécoute Openverse n’est pas autorisée.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_remote_preview_url, validate_track_id};

    #[tokio::test]
    async fn persists_shared_downloads_and_cleans_incomplete_files() {
        use super::*;
        use std::sync::atomic::{AtomicUsize, Ordering};
        let directory =
            std::env::temp_dir().join(format!("sonoriva-cache-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).await.unwrap();
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = requests.clone();
        let router = axum::Router::new().route(
            "/api/bridge/tracks/{id}/audio",
            axum::routing::get(move || {
                let counter = counter.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    vec![1_u8, 2, 3, 4]
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let server_url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let state = Runtime {
            config: RwLock::new(BridgeConfig {
                server_url: Some(server_url),
                ..Default::default()
            }),
            device_token: RwLock::new(Some("test".into())),
            local_token: RwLock::new(None),
            audio: std::sync::Mutex::new(AudioEngine::new()),
            store: ConfigStore::for_test(&directory),
            client: reqwest::Client::new(),
            download_locks: tokio::sync::Mutex::new(HashMap::new()),
            cache_access: RwLock::new(()),
            downloads: std::sync::Mutex::new(HashMap::new()),
            launch_generations: std::sync::Mutex::new(HashMap::new()),
            cancelled_launches: std::sync::Mutex::new(HashMap::new()),
        };
        let mut track: BridgeTrack = serde_json::from_value(serde_json::json!({
            "id": "sound", "title": "Sound", "originalFilename": "sound.wav", "mimeType": "audio/wav", "sizeBytes": 4,
            "startTimeMs": 0, "volume": 1, "loop": false, "fadeInMs": 0, "fadeOutMs": 0
        })).unwrap();
        let (first, second) = tokio::join!(state.ensure_track(&track), state.ensure_track(&track));
        assert_eq!(first.unwrap(), second.unwrap());
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        assert_eq!(state.cache_inventory().await.unwrap()["tracks"]["sound"], 4);
        // A fresh per-track lock still reuses the completed file on disk.
        state.download_locks.lock().await.clear();
        state.ensure_track(&track).await.unwrap();
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        track.id = "incomplete".into();
        track.size_bytes = 8;
        assert!(state.ensure_track(&track).await.is_err());
        assert!(!directory.join("incomplete.part").exists());
        assert!(state.downloads.lock().unwrap().is_empty());
        assert!(
            state.cache_inventory().await.unwrap()["tracks"]
                .get("incomplete")
                .is_none()
        );
        state.clear_cache().await.unwrap();
        assert_eq!(
            state.cache_inventory().await.unwrap()["tracks"],
            serde_json::json!({})
        );
        server.abort();
        fs::remove_dir_all(directory).await.unwrap();
    }

    #[test]
    fn accepts_uuid_identifiers_and_rejects_paths() {
        assert!(validate_track_id("11111111-1111-4111-8111-111111111111").is_ok());
        assert!(validate_track_id("../../Library/secret").is_err());
        assert!(validate_track_id("track/name").is_err());
    }

    #[test]
    fn accepts_only_openverse_preview_urls() {
        assert!(validate_remote_preview_url("https://cdn.freesound.org/previews/1/1.mp3").is_ok());
        assert!(
            validate_remote_preview_url(
                "https://prod-1.storage.jamendo.com/?trackid=1&format=mp32"
            )
            .is_ok()
        );
        assert!(
            validate_remote_preview_url(
                "https://upload.wikimedia.org/wikipedia/commons/a/audio.ogg"
            )
            .is_ok()
        );
        assert!(validate_remote_preview_url("https://ccmixter.org/content/audio.mp3").is_ok());
        assert!(validate_remote_preview_url("http://cdn.freesound.org/previews/1/1.mp3").is_err());
        assert!(validate_remote_preview_url("https://example.com/audio.mp3").is_err());
    }
}
