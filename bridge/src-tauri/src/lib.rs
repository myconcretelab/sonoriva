mod audio;
mod config;
mod desktop;
mod desktop_store;
mod interface;
mod local_api;
mod models;
mod runtime;
mod updates;

use std::sync::Arc;

use runtime::Runtime;
use tauri::{Manager, Runtime as TauriRuntime};
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

pub fn run() {
    let runtime = Runtime::load().expect("initialisation de SonoRiva Bridge impossible");
    let isolated_test =
        cfg!(debug_assertions) && std::env::var_os("SONORIVA_BRIDGE_TEST_DATA").is_some();
    let mut builder = tauri::Builder::default();
    if !isolated_test {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _working_directory| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            },
        ));
    }
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .plugin(tauri_plugin_deep_link::init())
        .manage(runtime.clone())
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![
            updates::bridge_update_status,
            updates::check_bridge_update,
            desktop::open_local_console,
            desktop::desktop_connection,
            desktop::rollback_local_interface
        ])
        .setup(move |app| {
            let embedded = app.asset_resolver().get("console/package.json".into()).ok_or("Interface locale absente : exécutez npm run build:bridge-ui avant de compiler le Bridge.")?;
            let key = app.config().plugins.0.get("updater").and_then(|value|value.get("pubkey")).and_then(|value|value.as_str()).ok_or("Clé de mise à jour absente.")?;
            runtime.interfaces.initialize(&embedded.bytes,key)?;
            let interface_runtime = runtime.clone();
            let interface_key = key.to_string();
            tauri::async_runtime::spawn(async move { if let Err(error)=desktop::check_interface(&interface_runtime,&interface_key).await { interface_runtime.interfaces.set_error(error); } });

            let local_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = local_api::serve(local_runtime).await {
                    eprintln!("Serveur local SonoRiva Bridge arrêté: {error}");
                }
            });

            let migration_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if let Err(error) = migration_runtime.migrate_legacy_tokens().await {
                    eprintln!("Migration de l’association SonoRiva impossible: {error}");
                }
            });

            let update_handle = app.handle().clone();
            let update_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                if isolated_test { return; }
                if let Err(error) = updates::run_update(update_handle, update_runtime, true).await {
                    eprintln!("Mise à jour automatique de SonoRiva Bridge impossible: {error}");
                }
            });

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            let handle = app.handle().clone();
            let deep_link_runtime = runtime.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_pairing_url(&handle, deep_link_runtime.clone(), url.clone());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_pairing_url(app.handle(), runtime.clone(), url);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("exécution de SonoRiva Bridge impossible");
}

fn handle_pairing_url<R: TauriRuntime>(app: &tauri::AppHandle<R>, runtime: Arc<Runtime>, url: Url) {
    if url.scheme() != "sonoriva-bridge" || url.host_str() != Some("pair") {
        return;
    }
    let Some(ticket) = url
        .query_pairs()
        .find_map(|(key, value)| (key == "ticket").then(|| value.into_owned()))
    else {
        return;
    };
    let server_url = url
        .query_pairs()
        .find_map(|(key, value)| (key == "server").then(|| value.into_owned()))
        .unwrap_or_else(|| "https://app.sonoriva.fr".to_string());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    tauri::async_runtime::spawn(async move {
        if let Err(error) = runtime.claim_pairing(&ticket, &server_url).await {
            eprintln!("Association SonoRiva Bridge refusée: {error}");
        }
    });
}
