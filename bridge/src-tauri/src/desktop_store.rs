//! Durable local workspaces. Media is flushed before the atomic journal replacement.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use uuid::Uuid;

#[derive(Default, Deserialize, Serialize)]
struct Record {
    workspace: Value,
    #[serde(default)]
    media: HashMap<String, String>,
}

pub struct DesktopStore {
    pub root: PathBuf,
    lock: Mutex<()>,
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Dossier local invalide.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(".{}.part", Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

pub fn valid_id(value: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| "Identifiant local invalide.".into())
}

impl DesktopStore {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        Ok(Self {
            root,
            lock: Mutex::new(()),
        })
    }

    fn directory(&self, user: &str) -> Result<PathBuf, String> {
        valid_id(user)?;
        Ok(self.root.join("users").join(user))
    }

    fn path(&self, user: &str, project: &str) -> Result<PathBuf, String> {
        valid_id(project)?;
        Ok(self
            .directory(user)?
            .join("workspaces")
            .join(format!("{project}.json")))
    }

    fn read_record(&self, user: &str, project: &str) -> Result<Option<Record>, String> {
        match fs::read(self.path(user, project)?) {
            Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|_| {
                "Les données locales sont illisibles. Aucun remplacement n’a été effectué.".into()
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn workspace(&self, user: &str, project: &str) -> Result<Option<Value>, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Stockage local indisponible.")?;
        Ok(self
            .read_record(user, project)?
            .map(|record| record.workspace))
    }

    pub fn workspaces(&self, user: &str) -> Result<Vec<Value>, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Stockage local indisponible.")?;
        self.records(user)
            .map(|records| records.into_iter().map(|record| record.workspace).collect())
    }

    fn records(&self, user: &str) -> Result<Vec<Record>, String> {
        let directory = self.directory(user)?.join("workspaces");
        if !directory.exists() {
            return Ok(Vec::new());
        }
        let mut records = Vec::new();
        for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let record = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|_| "Un spectacle local est illisible.")?;
            records.push(record);
        }
        Ok(records)
    }

    // Conflict is a distinct result so clients re-read and reapply their edit, never overwrite it.
    pub fn change(
        &self,
        user: &str,
        project: &str,
        expected: u64,
        mut workspace: Value,
        media: Option<(&str, &Path)>,
    ) -> Result<Option<Value>, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Stockage local indisponible.")?;
        if workspace["userId"].as_str() != Some(user)
            || workspace["key"].as_str() != Some(&format!("{user}:{project}"))
            || workspace["detail"]["project"]["id"].as_str() != Some(project)
            || !workspace["pending"].is_object()
            || !workspace["mediaIds"].is_array()
        {
            return Err("Le spectacle ne correspond pas au compte associé.".into());
        }
        let previous = self.read_record(user, project)?;
        let revision = previous
            .as_ref()
            .and_then(|r| r.workspace["revision"].as_u64())
            .unwrap_or(0);
        if revision != expected {
            return Ok(None);
        }
        let mut record = Record {
            workspace: Value::Null,
            media: previous.map(|r| r.media).unwrap_or_default(),
        };
        if let Some((id, staged)) = media {
            valid_id(id)?;
            let track = workspace["detail"]["tracks"]
                .as_array()
                .and_then(|tracks| tracks.iter().find(|t| t["id"].as_str() == Some(id)))
                .ok_or("Média sans morceau correspondant.")?;
            let size = fs::metadata(staged).map_err(|e| e.to_string())?.len();
            if size == 0 || size > 250 * 1024 * 1024 || track["sizeBytes"].as_u64() != Some(size) {
                return Err("Le fichier importé est incomplet ou trop volumineux.".into());
            }
            let filename = format!("{}.media", Uuid::new_v4());
            let directory = self.directory(user)?.join("media");
            fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            // The staged file has already been fsynced by the upload handler.
            fs::rename(staged, directory.join(&filename)).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            fs::File::open(&directory)
                .and_then(|dir| dir.sync_all())
                .map_err(|e| e.to_string())?;
            record.media.insert(id.to_string(), filename);
        }
        for id in workspace["mediaIds"]
            .as_array()
            .ok_or("Liste des médias invalide.")?
        {
            if !id.as_str().is_some_and(|id| record.media.contains_key(id)) {
                return Err(
                    "Un fichier local est absent. Le spectacle n’a pas été remplacé.".into(),
                );
            }
        }
        workspace["revision"] = json!(revision + 1);
        record.workspace = workspace.clone();
        atomic_write(
            &self.path(user, project)?,
            &serde_json::to_vec(&record).map_err(|e| e.to_string())?,
        )?;
        Ok(Some(workspace))
    }

    pub fn media(&self, user: &str, id: &str) -> Result<Option<PathBuf>, String> {
        valid_id(id)?;
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "Stockage local indisponible.")?;
        for record in self.records(user)? {
            if let Some(name) = record.media.get(id) {
                // Only generated UUID file names are accepted, even after a damaged local record.
                valid_id(
                    name.strip_suffix(".media")
                        .ok_or("Nom de média invalide.")?,
                )?;
                let path = self.directory(user)?.join("media").join(name);
                if path.is_file() {
                    return Ok(Some(path));
                }
                return Err("Le fichier local est absent du disque.".into());
            }
        }
        Ok(None)
    }

    pub fn profile(&self, user: &str) -> Result<Value, String> {
        let path = self.directory(user)?.join("profile.json");
        match fs::read(path) {
            Ok(bytes) => {
                serde_json::from_slice(&bytes).map_err(|_| "Profil local illisible.".into())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn save_profile(&self, user: &str, profile: &Value) -> Result<(), String> {
        let object = profile.as_object().ok_or("Profil invalide.")?;
        if object.keys().any(|key| {
            !key.starts_with("sonoriva-")
                || key.contains("bridge-association")
                || key.contains("audio-mode")
        }) {
            return Err("Paramètre local non autorisé.".into());
        }
        let identity: Value = serde_json::from_str(
            object
                .get("sonoriva-user")
                .and_then(Value::as_str)
                .ok_or("Utilisateur absent du profil.")?,
        )
        .map_err(|_| "Utilisateur invalide.")?;
        if identity["id"].as_str() != Some(user) || identity["isDemo"].as_bool() != Some(false) {
            return Err("Ce profil ne correspond pas au compte associé.".into());
        }
        atomic_write(
            &self.directory(user)?.join("profile.json"),
            &serde_json::to_vec(profile).map_err(|e| e.to_string())?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_media_with_journal_and_rejects_stale_writes() {
        let root = std::env::temp_dir().join(format!("sonoriva-desktop-{}", Uuid::new_v4()));
        let user = Uuid::new_v4().to_string();
        let project = Uuid::new_v4().to_string();
        let id = Uuid::new_v4().to_string();
        let store = DesktopStore::new(root.clone()).unwrap();
        let workspace = json!({"userId":user,"key":format!("{user}:{project}"),"detail":{"project":{"id":project},"tracks":[{"id":id,"sizeBytes":4}]},"pending":{},"mediaIds":[id]});
        let staged = root.join("upload.part");
        fs::write(&staged, b"data").unwrap();
        assert!(
            store
                .change(&user, &project, 0, workspace.clone(), Some((&id, &staged)))
                .unwrap()
                .is_some()
        );
        assert!(
            store
                .change(&user, &project, 0, workspace.clone(), None)
                .unwrap()
                .is_none()
        );
        drop(store);
        let store = DesktopStore::new(root.clone()).unwrap();
        assert_eq!(
            store.workspace(&user, &project).unwrap().unwrap()["revision"],
            1
        );
        assert_eq!(
            fs::read(store.media(&user, &id).unwrap().unwrap()).unwrap(),
            b"data"
        );
        let stranger = Uuid::new_v4().to_string();
        assert!(
            store
                .change(&stranger, &project, 0, workspace, None)
                .is_err()
        );
        assert!(store.media(&stranger, &id).unwrap().is_none());
        assert!(store.media("../../escape", &id).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_media_does_not_commit_a_workspace() {
        let root = std::env::temp_dir().join(format!("sonoriva-desktop-{}", Uuid::new_v4()));
        let store = DesktopStore::new(root.clone()).unwrap();
        let user = Uuid::new_v4().to_string();
        let project = Uuid::new_v4().to_string();
        let id = Uuid::new_v4().to_string();
        let workspace = json!({"userId":user,"key":format!("{user}:{project}"),"detail":{"project":{"id":project}},"pending":{},"mediaIds":[id]});
        assert!(store.change(&user, &project, 0, workspace, None).is_err());
        assert!(store.workspace(&user, &project).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
