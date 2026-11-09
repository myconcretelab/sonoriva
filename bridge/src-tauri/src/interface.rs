use crate::desktop_store::atomic_write;
use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

const MAX_PACKAGE_BYTES: usize = 24 * 1024 * 1024;
pub const UPDATE_URL: &str = "https://github.com/myconcretelab/sonoriva/releases/download/interface-latest/sonoriva-interface.json";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    format: u32,
    protocol: u32,
    min_bridge_version: String,
    pub revision: String,
    version: String,
    files: Vec<Asset>,
}
#[derive(Clone, Deserialize, Serialize)]
struct Asset {
    path: String,
    mime: String,
    content: String,
}
#[derive(Deserialize)]
struct Envelope {
    payload: String,
    signature: String,
}
#[derive(Default, Deserialize, Serialize)]
struct Versions {
    active: Option<String>,
    previous: Option<String>,
    pending: Option<String>,
    rejected: Option<String>,
}
#[derive(Default)]
struct State {
    versions: Versions,
    packages: HashMap<String, Package>,
    error: Option<String>,
}

pub struct Interfaces {
    root: PathBuf,
    state: Mutex<State>,
    pub operation: tokio::sync::Mutex<()>,
}

impl Package {
    fn validate(&self) -> Result<(), String> {
        if self.format != 1
            || self.protocol != 1
            || semver::Version::parse(&self.min_bridge_version)
                .map_err(|_| "Version minimale invalide.")?
                > semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?
        {
            return Err("Cette interface nécessite une mise à jour du Bridge.".into());
        }
        if self.revision.len() != 40 || !self.revision.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Révision d’interface invalide.".into());
        }
        let mut seen = std::collections::HashSet::new();
        let mut total = 0;
        if self.files.len() > 1000 {
            return Err("Trop de fichiers dans l’interface.".into());
        }
        for asset in &self.files {
            if !valid_path(&asset.path)
                || !seen.insert(asset.path.clone())
                || asset.mime.contains(['\r', '\n'])
            {
                return Err("Chemin ou type de fichier d’interface invalide.".into());
            }
            total += STANDARD
                .decode(&asset.content)
                .map_err(|_| "Fichier d’interface incomplet.")?
                .len();
            if total > MAX_PACKAGE_BYTES {
                return Err("Interface trop volumineuse.".into());
            }
        }
        if !seen.contains("index.html")
            || !self
                .files
                .iter()
                .any(|file| file.path.starts_with("assets/") && file.path.ends_with(".js"))
        {
            return Err("L’interface est incomplète.".into());
        }
        Ok(())
    }
}

fn valid_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() < 256
        && path.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        })
}

pub fn verify(bytes: &[u8], public_key: &str) -> Result<Package, String> {
    if bytes.len() > MAX_PACKAGE_BYTES {
        return Err("Interface trop volumineuse.".into());
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| "Paquet d’interface invalide.")?;
    let payload = STANDARD
        .decode(&envelope.payload)
        .map_err(|_| "Paquet d’interface incomplet.")?;
    let key = String::from_utf8(
        STANDARD
            .decode(public_key)
            .map_err(|_| "Clé de vérification invalide.")?,
    )
    .map_err(|_| "Clé de vérification invalide.")?;
    let signature = String::from_utf8(
        STANDARD
            .decode(&envelope.signature)
            .map_err(|_| "Signature d’interface invalide.")?,
    )
    .map_err(|_| "Signature d’interface invalide.")?;
    PublicKey::decode(&key)
        .and_then(|key| {
            Signature::decode(&signature)
                .and_then(|signature| key.verify(&payload, &signature, true))
        })
        .map_err(
            |_| "La signature de l’interface a été refusée. La version installée est conservée.",
        )?;
    let package: Package =
        serde_json::from_slice(&payload).map_err(|_| "Contenu d’interface invalide.")?;
    package.validate()?;
    Ok(package)
}

impl Interfaces {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        Ok(Self {
            root,
            state: Mutex::new(State::default()),
            operation: tokio::sync::Mutex::new(()),
        })
    }
    pub fn initialize(&self, embedded: &[u8], key: &str) -> Result<(), String> {
        let builtin: Package = serde_json::from_slice(embedded)
            .map_err(|_| "L’interface intégrée est absente ou illisible.")?;
        builtin.validate()?;
        let mut state = self.state.lock().map_err(|_| "Interface indisponible.")?;
        state.versions = match fs::read(self.root.join("versions.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| "Historique des interfaces illisible.")?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Versions::default(),
            Err(e) => return Err(e.to_string()),
        };
        state
            .packages
            .insert(builtin.revision.clone(), builtin.clone());
        for revision in [
            state.versions.active.clone(),
            state.versions.previous.clone(),
            state.versions.pending.clone(),
        ]
        .into_iter()
        .flatten()
        {
            if state.packages.contains_key(&revision) {
                continue;
            }
            if revision.len() != 40 || !revision.bytes().all(|b| b.is_ascii_hexdigit()) {
                continue;
            }
            match fs::read(self.root.join(format!("{revision}.json")))
                .map_err(|e| e.to_string())
                .and_then(|bytes| verify(&bytes, key))
                .and_then(|package| {
                    if package.revision == revision {
                        Ok(package)
                    } else {
                        Err("Révision d’interface incohérente.".into())
                    }
                }) {
                Ok(package) => {
                    state.packages.insert(revision, package);
                }
                Err(error) => state.error = Some(error),
            }
        }
        if !state
            .versions
            .active
            .as_ref()
            .is_some_and(|id| state.packages.contains_key(id))
        {
            state.versions.active = Some(builtin.revision);
        }
        if !state
            .versions
            .previous
            .as_ref()
            .is_some_and(|id| state.packages.contains_key(id))
        {
            state.versions.previous = None;
        }
        if !state
            .versions
            .pending
            .as_ref()
            .is_some_and(|id| state.packages.contains_key(id))
        {
            state.versions.pending = None;
        }
        self.save(&state)?;
        Ok(())
    }
    fn save(&self, state: &State) -> Result<(), String> {
        atomic_write(
            &self.root.join("versions.json"),
            &serde_json::to_vec(&state.versions).map_err(|e| e.to_string())?,
        )
    }
    pub fn status(&self) -> Value {
        let Ok(state) = self.state.lock() else {
            return json!({"ready":false});
        };
        json!({"ready":state.versions.active.is_some(),"revision":state.versions.active,"pending":state.versions.pending,"previous":state.versions.previous,"error":state.error,"version":state.versions.active.as_ref().and_then(|id|state.packages.get(id)).map(|p|&p.version)})
    }
    pub fn set_error(&self, error: String) {
        if let Ok(mut state) = self.state.lock() {
            state.error = Some(error);
        }
    }
    pub fn stage(&self, bytes: &[u8], key: &str) -> Result<(), String> {
        let package = verify(bytes, key)?;
        let mut state = self.state.lock().map_err(|_| "Interface indisponible.")?;
        if state.versions.active.as_deref() == Some(&package.revision)
            || state.versions.rejected.as_deref() == Some(&package.revision)
        {
            state.error = None;
            return Ok(());
        }
        atomic_write(&self.root.join(format!("{}.json", package.revision)), bytes)?;
        let previous = state.versions.pending.clone();
        state.versions.pending = Some(package.revision.clone());
        if let Err(error) = self.save(&state) {
            state.versions.pending = previous;
            return Err(error);
        }
        state.packages.insert(package.revision.clone(), package);
        state.error = None;
        Ok(())
    }
    pub fn activate(&self, rollback: bool) -> Result<String, String> {
        let mut state = self.state.lock().map_err(|_| "Interface indisponible.")?;
        let next = if rollback {
            state.versions.previous.clone()
        } else {
            state.versions.pending.clone()
        }
        .or_else(|| state.versions.active.clone())
        .ok_or("Aucune interface disponible.")?;
        if !state.packages.contains_key(&next) {
            return Err("Cette interface est absente du disque.".into());
        }
        let before = serde_json::to_vec(&state.versions).map_err(|e| e.to_string())?;
        if state.versions.active.as_deref() != Some(&next) {
            if rollback {
                state.versions.rejected = state.versions.active.clone();
            }
            state.versions.previous = state.versions.active.replace(next.clone());
            state.versions.pending = None;
            if let Err(error) = self.save(&state) {
                state.versions = serde_json::from_slice(&before).map_err(|e| e.to_string())?;
                return Err(error);
            }
        }
        Ok(next)
    }
    pub fn asset(&self, revision: Option<&str>, path: &str) -> Option<(String, Vec<u8>)> {
        if !valid_path(path) {
            return None;
        }
        let state = self.state.lock().ok()?;
        let id = revision.or(state.versions.active.as_deref())?;
        let package = state.packages.get(id)?;
        let asset = package.files.iter().find(|asset| asset.path == path)?;
        Some((asset.mime.clone(), STANDARD.decode(&asset.content).ok()?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn package() -> Package {
        Package {
            format: 1,
            protocol: 1,
            min_bridge_version: "1.1.0".into(),
            revision: "a".repeat(40),
            version: "1.0.0".into(),
            files: vec![
                Asset {
                    path: "index.html".into(),
                    mime: "text/html".into(),
                    content: STANDARD.encode("html"),
                },
                Asset {
                    path: "assets/app.js".into(),
                    mime: "text/javascript".into(),
                    content: STANDARD.encode("script"),
                },
            ],
        }
    }
    #[test]
    fn rejects_unsafe_paths_incompatible_protocols_and_incomplete_packages() {
        for path in [
            "../secret",
            "/etc/passwd",
            "assets/../../secret",
            "assets\\secret",
            "a//b",
            "a?b",
        ] {
            assert!(!valid_path(path));
        }
        let mut p = package();
        assert!(p.validate().is_ok());
        p.protocol = 2;
        assert!(p.validate().is_err());
        p.protocol = 1;
        p.files.pop();
        assert!(p.validate().is_err());
    }
    #[test]
    fn verifies_signed_updates_rejects_tampering_and_keeps_rollback_across_restart() {
        let key = include_str!("../test-fixtures/public-key.txt").trim();
        let first = include_bytes!("../test-fixtures/interface-a.json");
        let second = include_bytes!("../test-fixtures/interface-b.json");
        assert!(verify(first, key).is_ok());
        let mut tampered: Value = serde_json::from_slice(second).unwrap();
        tampered["payload"] = json!(STANDARD.encode(serde_json::to_vec(&package()).unwrap()));
        assert!(verify(&serde_json::to_vec(&tampered).unwrap(), key).is_err());
        let root = std::env::temp_dir().join(format!("sonoriva-signed-{}", uuid::Uuid::new_v4()));
        let interfaces = Interfaces::new(root.clone()).unwrap();
        let builtin = serde_json::to_vec(&package()).unwrap();
        interfaces.initialize(&builtin, key).unwrap();
        interfaces.stage(second, key).unwrap();
        assert_eq!(interfaces.status()["revision"], "a".repeat(40));
        assert_eq!(interfaces.status()["pending"], "b".repeat(40));
        interfaces.activate(false).unwrap();
        drop(interfaces);
        let interfaces = Interfaces::new(root.clone()).unwrap();
        interfaces.initialize(&builtin, key).unwrap();
        assert_eq!(interfaces.status()["revision"], "b".repeat(40));
        assert_eq!(interfaces.activate(true).unwrap(), "a".repeat(40));
        interfaces.stage(second, key).unwrap();
        assert!(interfaces.status()["pending"].is_null());
        assert_eq!(interfaces.status()["revision"], "a".repeat(40));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn unsigned_network_packages_are_never_accepted() {
        let data = json!({"payload":STANDARD.encode(serde_json::to_vec(&package()).unwrap()),"signature":STANDARD.encode("invalid")});
        assert!(verify(&serde_json::to_vec(&data).unwrap(), "invalid").is_err());
    }
    #[test]
    fn embedded_package_survives_restart_and_invalid_version_state() {
        let root =
            std::env::temp_dir().join(format!("sonoriva-interface-{}", uuid::Uuid::new_v4()));
        let interfaces = Interfaces::new(root.clone()).unwrap();
        let bytes = serde_json::to_vec(&package()).unwrap();
        interfaces.initialize(&bytes, "").unwrap();
        assert!(interfaces.status()["ready"].as_bool().unwrap());
        assert!(interfaces.asset(None, "index.html").is_some());
        assert!(
            interfaces
                .asset(Some(&"b".repeat(40)), "index.html")
                .is_none()
        );
        drop(interfaces);
        let interfaces = Interfaces::new(root.clone()).unwrap();
        interfaces.initialize(&bytes, "").unwrap();
        assert_eq!(interfaces.activate(false).unwrap(), "a".repeat(40));
        fs::remove_dir_all(root).unwrap();
    }
}
