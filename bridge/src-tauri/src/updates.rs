use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{Manager, Runtime as TauriRuntime};
use tauri_plugin_updater::UpdaterExt;

use crate::runtime::Runtime;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    phase: String,
    version: Option<String>,
    message: String,
}

impl Default for UpdateStatus {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            version: None,
            message: "Vérification automatique au démarrage.".into(),
        }
    }
}

#[derive(Default)]
pub struct Updates {
    operation: tokio::sync::Mutex<()>,
    status: Mutex<UpdateStatus>,
}

impl Updates {
    fn set(&self, phase: &str, version: Option<String>, message: String) {
        *self
            .status
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = UpdateStatus {
            phase: phase.into(),
            version,
            message,
        };
    }

    fn status(&self) -> UpdateStatus {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }
}

#[tauri::command]
pub fn bridge_update_status(updates: tauri::State<'_, Updates>) -> UpdateStatus {
    updates.status()
}

#[tauri::command]
pub async fn check_bridge_update(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, Arc<Runtime>>,
    install: bool,
) -> Result<UpdateStatus, String> {
    run_update(app, runtime.inner().clone(), install).await
}

pub async fn run_update<R: TauriRuntime>(
    app: tauri::AppHandle<R>,
    runtime: Arc<Runtime>,
    install: bool,
) -> Result<UpdateStatus, String> {
    let updates = app.state::<Updates>();
    let _operation = updates
        .operation
        .try_lock()
        .map_err(|_| "Une vérification ou une installation est déjà en cours.".to_string())?;
    updates.set("checking", None, "Recherche d’une nouvelle version…".into());
    if let Err(error) = perform_update(&app, runtime, install, &updates).await {
        updates.set("error", None, format!("Mise à jour impossible : {error}"));
        return Err(error);
    }
    Ok(updates.status())
}

async fn perform_update<R: TauriRuntime>(
    app: &tauri::AppHandle<R>,
    runtime: Arc<Runtime>,
    install: bool,
    updates: &Updates,
) -> Result<(), String> {
    let Some(update) = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
    else {
        updates.set(
            "current",
            None,
            "Vous utilisez la dernière version disponible.".into(),
        );
        return Ok(());
    };
    let version = update.version.clone();
    updates.set(
        "available",
        Some(version.clone()),
        format!("Version {version} disponible."),
    );
    if !install {
        return Ok(());
    }
    updates.set(
        "downloading",
        Some(version.clone()),
        format!("Téléchargement et vérification de la version {version}…"),
    );
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    // Hold the audio lock through installation so no playback can start between
    // the activity check and replacing the application.
    let mut audio = runtime
        .audio
        .lock()
        .map_err(|_| "Moteur audio inaccessible pendant la mise à jour.".to_string())?;
    if !installation_allowed(!audio.snapshots().is_empty()) {
        updates.set("deferred", Some(version), "Installation différée : une lecture audio est active. Réessayez après l’arrêt des lectures.".into());
        return Ok(());
    }
    updates.set(
        "installing",
        Some(version),
        "Installation en cours, puis redémarrage du Bridge…".into(),
    );
    update.install(bytes).map_err(|error| error.to_string())?;
    drop(audio);
    app.restart();
}

fn installation_allowed(has_playbacks: bool) -> bool {
    !has_playbacks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_installs_during_playback() {
        assert!(!installation_allowed(true));
        assert!(installation_allowed(false));
    }

    #[test]
    fn exposes_version_and_error_without_stale_available_update() {
        let updates = Updates::default();
        updates.set("available", Some("1.0.9".into()), "Disponible".into());
        assert_eq!(updates.status().version.as_deref(), Some("1.0.9"));
        updates.set("error", None, "Connexion impossible".into());
        let status = updates.status();
        assert_eq!(status.phase, "error");
        assert!(status.version.is_none());
        assert_eq!(status.message, "Connexion impossible");
    }

    #[tokio::test]
    async fn refuses_concurrent_operations() {
        let updates = Updates::default();
        let operation = updates.operation.try_lock().unwrap();
        assert!(updates.operation.try_lock().is_err());
        drop(operation);
        assert!(updates.operation.try_lock().is_ok());
    }
}
