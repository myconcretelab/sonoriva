use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use directories::ProjectDirs;
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "fr.sonoriva.bridge";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeConfig {
    pub server_url: Option<String>,
    pub device_id: Option<String>,
    pub user_id: Option<String>,
    pub main_output_id: Option<String>,
    pub preview_output_id: Option<String>,
}

#[derive(Clone)]
pub struct ConfigStore {
    config_path: PathBuf,
    credentials_path: PathBuf,
    pub cache_dir: PathBuf,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeCredentials {
    device_token: String,
    local_token: String,
}

impl ConfigStore {
    #[cfg(test)]
    pub fn for_test(directory: &Path) -> Self {
        Self {
            config_path: directory.join("config.json"),
            credentials_path: directory.join("credentials.json"),
            cache_dir: directory.to_path_buf(),
        }
    }

    pub fn new() -> Result<Self, String> {
        #[cfg(debug_assertions)]
        if let Some(root) = std::env::var_os("SONORIVA_BRIDGE_TEST_DATA") {
            let root = PathBuf::from(root);
            fs::create_dir_all(root.join("audio")).map_err(|e| e.to_string())?;
            return Ok(Self {
                config_path: root.join("config.json"),
                credentials_path: root.join("credentials.json"),
                cache_dir: root.join("audio"),
            });
        }

        let project_dirs = ProjectDirs::from("fr", "SonoRiva", "SonoRiva Bridge")
            .ok_or_else(|| "Dossier de données utilisateur introuvable.".to_string())?;
        let data_dir = project_dirs.data_local_dir();
        fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
        let cache_dir = data_dir.join("audio");
        migrate_audio_cache(&project_dirs.cache_dir().join("audio"), &cache_dir)?;
        fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
        Ok(Self {
            config_path: data_dir.join("config.json"),
            credentials_path: data_dir.join("credentials.json"),
            cache_dir,
        })
    }

    pub fn data_dir(&self) -> PathBuf {
        self.config_path
            .parent()
            .expect("configuration directory")
            .to_path_buf()
    }

    pub fn load(&self) -> BridgeConfig {
        fs::read(&self.config_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, config: &BridgeConfig) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?;
        crate::desktop_store::atomic_write(&self.config_path, &bytes)
    }

    pub fn load_tokens(&self) -> (Option<String>, Option<String>) {
        if let Some(credentials) = self.read_credentials() {
            return (
                Some(credentials.device_token),
                Some(credentials.local_token),
            );
        }
        (None, None)
    }

    pub fn migrate_legacy_tokens(&self) -> Result<Option<(String, String)>, String> {
        let device_token = read_secret("device-token");
        let local_token = read_secret("local-token");
        let (Some(device_token), Some(local_token)) = (device_token, local_token) else {
            return Ok(None);
        };
        self.save_tokens(&device_token, &local_token)?;
        Ok(Some((device_token, local_token)))
    }

    pub fn save_tokens(&self, device_token: &str, local_token: &str) -> Result<(), String> {
        let credentials = BridgeCredentials {
            device_token: device_token.to_string(),
            local_token: local_token.to_string(),
        };
        let bytes = serde_json::to_vec_pretty(&credentials).map_err(|error| error.to_string())?;
        write_private_file(&self.credentials_path, &bytes)
    }

    fn read_credentials(&self) -> Option<BridgeCredentials> {
        let bytes = fs::read(&self.credentials_path).ok()?;
        restrict_file_permissions(&self.credentials_path).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
}

fn read_secret(account: &str) -> Option<String> {
    Entry::new(SERVICE, account).ok()?.get_password().ok()
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    restrict_file_permissions(path)
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> Result<(), String> {
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ConfigStore;
    use std::fs;
    use uuid::Uuid;

    fn test_store() -> (ConfigStore, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("sonoriva-config-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("temporary data directory");
        let store = ConfigStore {
            config_path: root.join("config.json"),
            credentials_path: root.join("credentials.json"),
            cache_dir: root.join("audio"),
        };
        (store, root)
    }

    #[test]
    fn stores_tokens_in_the_private_credentials_file() {
        let (store, root) = test_store();
        store
            .save_tokens("device-secret", "local-secret")
            .expect("credentials written");

        let (device_token, local_token) = store.load_tokens();
        assert_eq!(device_token.as_deref(), Some("device-secret"));
        assert_eq!(local_token.as_deref(), Some("local-secret"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(root.join("credentials.json"))
                .expect("credentials metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }

        fs::remove_dir_all(root).expect("temporary data removed");
    }
}

fn migrate_audio_cache(legacy: &Path, durable: &Path) -> Result<(), String> {
    fs::create_dir_all(durable).map_err(|e| e.to_string())?;
    if durable.join(".legacy-migrated").is_file() || legacy == durable || !legacy.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(legacy).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("audio") {
            continue;
        }
        let target = durable.join(entry.file_name());
        if target.is_file()
            && fs::metadata(&target).map_err(|e| e.to_string())?.len()
                == entry.metadata().map_err(|e| e.to_string())?.len()
        {
            continue;
        }
        let temporary = durable.join(format!(".migration-{}.part", uuid::Uuid::new_v4()));
        fs::copy(entry.path(), &temporary)
            .map_err(|e| format!("Migration du cache audio impossible : {e}"))?;
        OpenOptions::new()
            .write(true)
            .open(&temporary)
            .and_then(|file| file.sync_all())
            .map_err(|e| e.to_string())?;
        fs::rename(temporary, target).map_err(|e| e.to_string())?;
    }
    crate::desktop_store::atomic_write(&durable.join(".legacy-migrated"), b"1")
}
