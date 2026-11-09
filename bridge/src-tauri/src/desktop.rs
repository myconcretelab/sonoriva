use crate::runtime::Runtime;
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{HeaderMap, Request, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::Manager;
use tokio::io::AsyncWriteExt;

const MAX_BODY: usize = 256 * 1024 * 1024;
fn base_url() -> String {
    format!("http://127.0.0.1:{}", crate::local_api::port())
}
type Result<T> = std::result::Result<T, Error>;
pub struct Error(StatusCode, String);
impl From<String> for Error {
    fn from(value: String) -> Self {
        Self(StatusCode::BAD_REQUEST, value)
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}

pub fn router() -> Router<Arc<Runtime>> {
    Router::new()
        .route("/v1/desktop/bootstrap", get(bootstrap))
        .route("/v1/desktop/profile", put(profile))
        .route("/v1/desktop/activity", put(activity))
        .route("/v1/desktop/workspaces", get(workspaces))
        .route(
            "/v1/desktop/workspaces/{id}",
            get(workspace).put(change_workspace),
        )
        .route("/v1/desktop/media/{id}", get(media))
        .route("/v1/desktop/interface", get(interface_status))
        .route("/v1/desktop/interface/check", post(interface_check))
        .route("/v1/desktop/interface/activate", post(interface_activate))
        .route("/api/{*path}", any(proxy))
        .route("/socket.io/", any(proxy))
        .route("/app/{revision}/{*path}", get(asset))
        .route("/app/{revision}/", get(index))
        .fallback(get(root_asset))
        .layer(DefaultBodyLimit::max(MAX_BODY))
}

pub async fn authorize(headers: &HeaderMap, state: &Runtime) -> Result<()> {
    if headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|host| host != format!("127.0.0.1:{}", crate::local_api::port()))
    {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Hôte local non autorisé.".into(),
        ));
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let local = state.local_token.read().await;
    if token == Some(state.desktop_token.as_str())
        || local
            .as_deref()
            .is_some_and(|expected| token == Some(expected))
    {
        Ok(())
    } else {
        Err(Error(
            StatusCode::UNAUTHORIZED,
            "Accès local non autorisé.".into(),
        ))
    }
}
async fn owner(state: &Runtime) -> Result<String> {
    state.config.read().await.user_id.clone().ok_or_else(|| {
        Error(
            StatusCode::CONFLICT,
            "Associez ce Bridge à nouveau pour activer sa régie locale.".into(),
        )
    })
}

async fn bootstrap(headers: HeaderMap, State(state): State<Arc<Runtime>>) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    let user = owner(&state).await?;
    Ok(Json(
        json!({"profile":state.desktop.profile(&user)?,"userId":user,"interface":state.interfaces.status()}),
    ))
}
#[derive(Deserialize)]
struct Activity {
    active: bool,
}
async fn activity(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<Activity>,
) -> Result<StatusCode> {
    authorize(&headers, &state).await?;
    let mut activity = state
        .console_activity
        .lock()
        .map_err(|_| "Activité de la régie indisponible.".to_string())?;
    *activity = if input.active {
        Some(std::time::Instant::now())
    } else {
        None
    };
    Ok(StatusCode::NO_CONTENT)
}
async fn profile(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<Value>,
) -> Result<StatusCode> {
    authorize(&headers, &state).await?;
    let user = owner(&state).await?;
    let result = tokio::task::spawn_blocking(move || state.desktop.save_profile(&user, &input))
        .await
        .map_err(|e| e.to_string())?;
    result?;
    Ok(StatusCode::NO_CONTENT)
}
async fn workspaces(headers: HeaderMap, State(state): State<Arc<Runtime>>) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    state.resolve_owner().await?;
    let user = owner(&state).await?;
    Ok(Json(json!(state.desktop.workspaces(&user)?)))
}
async fn workspace(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    let user = owner(&state).await?;
    Ok(Json(
        state.desktop.workspace(&user, &id)?.unwrap_or(Value::Null),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Change {
    expected_revision: u64,
    workspace: Value,
    media_id: Option<String>,
}
struct Upload(std::path::PathBuf);
impl Drop for Upload {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
async fn change_workspace(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    let user = owner(&state).await?;
    crate::desktop_store::valid_id(&id)?;
    let temporary = Upload(
        state
            .desktop
            .root
            .join(format!(".upload-{}.part", uuid::Uuid::new_v4())),
    );
    let mut input: Option<Change> = None;
    let mut has_file = false;
    while let Some(mut field) = multipart.next_field().await.map_err(|e| e.to_string())? {
        match field.name() {
            Some("change") if input.is_none() => {
                let mut bytes = Vec::new();
                while let Some(chunk) = field.chunk().await.map_err(|e| e.to_string())? {
                    if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                        return Err("Spectacle trop volumineux.".to_string().into());
                    }
                    bytes.extend_from_slice(&chunk);
                }
                input = Some(
                    serde_json::from_slice(&bytes)
                        .map_err(|_| "Modification locale invalide.".to_string())?,
                );
            }
            Some("file") if !has_file => {
                let mut options = tokio::fs::OpenOptions::new();
                options.write(true).create_new(true);
                #[cfg(unix)]
                options.mode(0o600);
                let mut file = options
                    .open(&temporary.0)
                    .await
                    .map_err(|e| e.to_string())?;
                let mut size = 0;
                while let Some(chunk) = field.chunk().await.map_err(|e| e.to_string())? {
                    size += chunk.len();
                    if size > 250 * 1024 * 1024 {
                        return Err("Fichier limité à 250 Mo.".to_string().into());
                    }
                    file.write_all(&chunk).await.map_err(|e| e.to_string())?;
                }
                file.sync_all().await.map_err(|e| e.to_string())?;
                has_file = true;
            }
            _ => return Err("Champ local inattendu.".to_string().into()),
        }
    }
    let input = input.ok_or("Modification locale absente.".to_string())?;
    if has_file != input.media_id.is_some() {
        return Err("Fichier local incomplet.".to_string().into());
    }
    let result = tokio::task::spawn_blocking(move || {
        state.desktop.change(
            &user,
            &id,
            input.expected_revision,
            input.workspace,
            input
                .media_id
                .as_deref()
                .map(|id| (id, temporary.0.as_path())),
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    result.map(Json).ok_or_else(|| {
        Error(
            StatusCode::CONFLICT,
            "Le spectacle a changé dans une autre fenêtre.".into(),
        )
    })
}
async fn media(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
) -> Result<Response> {
    authorize(&headers, &state).await?;
    let user = owner(&state).await?;
    let Some(path) = state.desktop.media(&user, &id)? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        bytes,
    )
        .into_response())
}
fn public_key() -> String {
    serde_json::from_str::<Value>(include_str!("../tauri.conf.json")).expect("configuration")["plugins"]["updater"]["pubkey"].as_str().expect("updater key").to_string()
}
pub async fn check_interface(state: &Runtime, key: &str) -> std::result::Result<(), String> {
    let _operation = state
        .interfaces
        .operation
        .try_lock()
        .map_err(|_| "Une vérification est déjà en cours.".to_string())?;
    let mut response = state
        .client
        .get(crate::interface::UPDATE_URL)
        .send()
        .await
        .map_err(|_| {
            "Vérification de l’interface impossible sans connexion au serveur de mises à jour."
                .to_string()
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Serveur de mises à jour de l’interface : {}.",
            response.status()
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Téléchargement de l’interface interrompu.".to_string())?
    {
        if bytes.len() + chunk.len() > 24 * 1024 * 1024 {
            return Err("Interface trop volumineuse.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    state.interfaces.stage(&bytes, key)
}
async fn interface_status(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    Ok(Json(state.interfaces.status()))
}
async fn interface_check(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    if let Err(error) = check_interface(&state, &public_key()).await {
        state.interfaces.set_error(error);
    }
    Ok(Json(state.interfaces.status()))
}
async fn interface_activate(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> Result<Json<Value>> {
    authorize(&headers, &state).await?;
    let mut engine = state
        .audio
        .lock()
        .map_err(|_| "Moteur indisponible.".to_string())?;
    if !engine.snapshots().is_empty() || state.console_active() {
        return Err(Error(
            StatusCode::CONFLICT,
            "Arrêtez les lectures avant de changer d’interface.".into(),
        ));
    }
    Ok(Json(json!({"revision":state.interfaces.activate(false)?})))
}
async fn asset(
    State(state): State<Arc<Runtime>>,
    Path((revision, path)): Path<(String, String)>,
) -> Response {
    asset_response(&state, Some(&revision), &path)
}
async fn index(State(state): State<Arc<Runtime>>, Path(revision): Path<String>) -> Response {
    asset_response(&state, Some(&revision), "index.html")
}
async fn root_asset(State(state): State<Arc<Runtime>>, request: Request<Body>) -> Response {
    asset_response(&state, None, request.uri().path().trim_start_matches('/'))
}
fn asset_response(state: &Runtime, revision: Option<&str>, path: &str) -> Response {
    let Some((mime, bytes)) = state.interfaces.asset(revision, path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    ([(header::CONTENT_TYPE,mime),(header::CACHE_CONTROL,"no-store".into()),(header::X_CONTENT_TYPE_OPTIONS,"nosniff".into()),(header::CONTENT_SECURITY_POLICY,"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; frame-ancestors 'none'".into())],bytes).into_response()
}

fn cloud_path_allowed(path: &str, method: &str) -> bool {
    if path.contains('%') || path.contains("..") || path.contains('\\') {
        return false;
    }
    matches!(
        (method, path),
        (
            "GET",
            "/api/auth/me" | "/api/account" | "/api/health" | "/api/version" | "/api/releases"
        )
    ) || [
        "/api/projects",
        "/api/tracks",
        "/api/releases/",
        "/api/support/",
        "/api/openverse/",
        "/api/freesound/",
        "/api/imports/",
    ]
    .iter()
    .any(|prefix| {
        path == *prefix
            || path
                .strip_prefix(prefix)
                .is_some_and(|rest| prefix.ends_with('/') || rest.starts_with('/'))
    }) || (path == "/socket.io/" && matches!(method, "GET" | "POST"))
}
async fn proxy(State(state): State<Arc<Runtime>>, request: Request<Body>) -> Result<Response> {
    authorize(request.headers(), &state).await?;
    let path = request.uri().path();
    if !cloud_path_allowed(path, request.method().as_str()) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Cette opération s’effectue depuis le site SonoRiva.".into(),
        ));
    }
    let server = state
        .config
        .read()
        .await
        .server_url
        .clone()
        .ok_or("Bridge non associé.".to_string())?;
    let token = state
        .device_token
        .read()
        .await
        .clone()
        .ok_or("Bridge non associé.".to_string())?;
    let mut upstream = state
        .client
        .request(
            request.method().clone(),
            format!("{}{}", server.trim_end_matches('/'), request.uri()),
        )
        .bearer_auth(token);
    for name in [header::CONTENT_TYPE, header::RANGE] {
        if let Some(value) = request.headers().get(&name) {
            upstream = upstream.header(name, value);
        }
    }
    let body = to_bytes(request.into_body(), MAX_BODY)
        .await
        .map_err(|_| "Requête trop volumineuse.".to_string())?;
    if !body.is_empty() {
        upstream = upstream.body(body);
    }
    let response = upstream.send().await.map_err(|_| {
        Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Connexion au serveur indisponible. Les données locales restent accessibles.".into(),
        )
    })?;
    let status = response.status();
    let mut headers = HeaderMap::new();
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
    ] {
        if let Some(value) = response.headers().get(&name) {
            headers.insert(name, value.clone());
        }
    }
    headers.insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    // Stream cloud responses, including large media, without buffering the whole download.
    Ok((status, headers, Body::from_stream(response.bytes_stream())).into_response())
}

#[tauri::command]
pub async fn open_local_console(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Runtime>>,
) -> std::result::Result<(), String> {
    state.resolve_owner().await?;
    let config = state.config.read().await.clone();
    if config.user_id.is_none() {
        return Err(
            "Dans SonoRiva, associez à nouveau le Bridge puis préparez un spectacle hors ligne."
                .into(),
        );
    }
    if let Some(window) = app.get_webview_window("console") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let revision = {
        let mut audio = state.audio.lock().map_err(|_| "Moteur indisponible.")?;
        if audio.snapshots().is_empty() {
            state.interfaces.activate(false)?
        } else {
            state.interfaces.status()["revision"]
                .as_str()
                .ok_or("Interface absente.")?
                .to_string()
        }
    };
    let descriptor = json!({"baseUrl":base_url(),"token":state.desktop_token,"userId":config.user_id,"deviceId":config.device_id});
    let projection_app = app.clone();
    let window=tauri::WebviewWindowBuilder::new(&app,"console",tauri::WebviewUrl::External(format!("{}/app/{revision}/",base_url()).parse().map_err(|_|"Adresse locale invalide.")?))
        .title("SonoRiva · Régie locale").inner_size(1280.,820.).min_inner_size(360.,600.)
        .on_new_window(move|url,features|{
            if url.origin().ascii_serialization()!=base_url() || url.path()!="/projection.html" {return tauri::webview::NewWindowResponse::Deny;}
            match tauri::WebviewWindowBuilder::new(&projection_app,format!("projection-{}",uuid::Uuid::new_v4()),tauri::WebviewUrl::External("about:blank".parse().expect("blank URL")))
                .title("SonoRiva · Projection").window_features(features)
                .on_navigation(|url|url.as_str()=="about:blank" || (url.origin().ascii_serialization()==base_url() && url.path()=="/projection.html"))
                .build(){Ok(window)=>tauri::webview::NewWindowResponse::Create{window},Err(_)=>tauri::webview::NewWindowResponse::Deny}
        })
        .on_navigation(|url|url.scheme()=="http" && url.host_str()==Some("127.0.0.1") && url.port()==Some(crate::local_api::port()) && url.path().starts_with("/app/"))
        .initialization_script(format!("if(location.origin==='{base}' && location.pathname.startsWith('/app/')) Object.defineProperty(window,'__SONORIVA_DESKTOP__',{{value:{descriptor},writable:false,configurable:false}});",base=base_url()))
        .build().map_err(|e|e.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(manager) = handle.get_webview_window("main") {
                let _ = manager.show();
            }
        }
    });
    Ok(())
}
#[tauri::command]
pub async fn rollback_local_interface(
    state: tauri::State<'_, Arc<Runtime>>,
) -> std::result::Result<String, String> {
    let mut audio = state.audio.lock().map_err(|_| "Moteur indisponible.")?;
    if !audio.snapshots().is_empty() || state.console_active() {
        return Err("Une lecture est en cours.".into());
    }
    state.interfaces.activate(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cloud_proxy_has_no_account_administration_or_arbitrary_destination() {
        assert!(cloud_path_allowed("/api/tracks/upload", "POST"));
        assert!(cloud_path_allowed("/api/projects/abc/playlists", "PATCH"));
        assert!(cloud_path_allowed("/api/auth/me", "GET"));
        for path in [
            "/api/admin/users",
            "/api/billing/checkout",
            "/api/account/members",
            "/api/auth/login",
            "https://evil.test/api/projects",
            "/api/projects/../admin",
            "/api/projects/%2e%2e/admin",
        ] {
            assert!(!cloud_path_allowed(path, "POST"));
        }
    }
}

#[tauri::command]
pub fn desktop_connection(state: tauri::State<'_, Arc<Runtime>>) -> Value {
    json!({"baseUrl":base_url(),"token":state.desktop_token})
}
