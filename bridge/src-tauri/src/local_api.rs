use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    body::Body,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{AUTHORIZATION, CONTENT_TYPE, ORIGIN},
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use serde::Deserialize;
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::{audio::AudioEngine, models::BridgeTrack, runtime::Runtime};

const PORT: u16 = 43_821;

type ApiResult<T> = Result<T, ApiError>;

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<String> for ApiError {
    fn from(value: String) -> Self {
        Self(StatusCode::BAD_REQUEST, value)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutputInput {
    device_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayInput {
    track: BridgeTrack,
    expires_at_ms: Option<u128>,
    request_id: Option<String>,
    remote_preview: Option<RemotePreviewInput>,
    fade_in_ms: Option<u64>,
    volume_multiplier: Option<f32>,
    channel: Option<String>,
    output_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePreviewInput {
    id: RemotePreviewId,
    url: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RemotePreviewId {
    Number(u64),
    Text(String),
}

impl RemotePreviewId {
    fn normalized(&self) -> String {
        match self {
            Self::Number(value) => value.to_string(),
            Self::Text(value) => value.clone(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopInput {
    fade_out_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopTrackInput {
    track_id: String,
    fade_out_ms: Option<u64>,
}

#[derive(Deserialize)]
struct VolumeInput {
    volume: f32,
}

#[derive(Deserialize)]
struct LoopInput {
    #[serde(rename = "loop")]
    loop_playback: bool,
}

#[derive(Deserialize)]
struct SeekInput {
    progress: f32,
}

pub async fn serve(state: Arc<Runtime>) -> Result<(), String> {
    let cors = CorsLayer::new()
        .allow_origin([
            "https://app.sonoriva.fr".parse::<HeaderValue>().unwrap(),
            "http://localhost:5173".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:5173".parse::<HeaderValue>().unwrap(),
            "tauri://localhost".parse::<HeaderValue>().unwrap(),
            "http://tauri.localhost".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);
    let router = Router::new()
        .route("/v1/status", get(status))
        .route("/v1/outputs", get(outputs))
        .route("/v1/outputs/{channel}", put(set_output))
        .route(
            "/v1/cache",
            get(cache_inventory).post(cache_track).delete(clear_cache),
        )
        .route("/v1/cache/audio", post(cached_audio))
        .route("/v1/projects/{id}/sync", post(sync_project))
        .route("/v1/play", post(play))
        .route("/v1/cancel-launch/{id}", post(cancel_launch))
        .route("/v1/playbacks", get(playbacks))
        .route("/v1/events", get(events))
        .route("/v1/playbacks/{id}/pause", post(toggle_pause))
        .route("/v1/playbacks/{id}/volume", put(set_volume))
        .route("/v1/master-volume", put(set_master_volume))
        .route("/v1/playbacks/{id}/loop", put(set_loop))
        .route("/v1/playbacks/{id}/seek", put(seek))
        .route("/v1/playbacks/{id}/output", put(set_playback_output))
        .route("/v1/playbacks/{id}/stop", post(stop))
        .route("/v1/stop-track", post(stop_track))
        .route("/v1/stop-all", post(stop_all))
        .layer(cors)
        .layer(middleware::from_fn(private_network_headers))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT))
        .await
        .map_err(|error| error.to_string())?;
    axum::serve(listener, router)
        .await
        .map_err(|error| error.to_string())
}

async fn private_network_headers(request: axum::http::Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "Access-Control-Allow-Private-Network",
        HeaderValue::from_static("true"),
    );
    response
}

async fn status(State(state): State<Arc<Runtime>>) -> Json<serde_json::Value> {
    let config = state.config.read().await;
    let (cached_tracks, cached_bytes) = state.cache_stats().await;
    Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "paired": state.paired().await,
        "serverUrl": config.server_url,
        "deviceId": config.device_id,
        "cachedTracks": cached_tracks,
        "cachedBytes": cached_bytes,
        "capabilities": ["perPlaybackOutput", "remotePreview", "cacheInventory", "safePlayback", "cachedAudio"],
    }))
}

async fn outputs(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, true).await?;
    let config = state.config.read().await;
    Ok(Json(json!({
        "outputs": AudioEngine::list_outputs()?,
        "mainOutputId": config.main_output_id.as_deref().unwrap_or("default"),
        "previewOutputId": config.preview_output_id.as_deref().unwrap_or("default"),
    })))
}

async fn set_output(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(channel): Path<String>,
    Json(input): Json<OutputInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, true).await?;
    if !AudioEngine::list_outputs()?
        .iter()
        .any(|output| output.id == input.device_id)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Cette sortie audio n’est pas disponible.".to_string(),
        ));
    }
    state.save_output(&channel, input.device_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn cache_inventory(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, false).await?;
    Ok(Json(state.cache_inventory().await?))
}

async fn cached_audio(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(track): Json<BridgeTrack>,
) -> ApiResult<Response> {
    authorize(&headers, &state, false).await?;
    let bytes = state.read_cached_track(&track).await?.ok_or_else(|| {
        ApiError(
            StatusCode::NOT_FOUND,
            "Son absent du cache local.".to_string(),
        )
    })?;
    Ok((
        [
            (CONTENT_TYPE, "application/octet-stream"),
            (axum::http::header::CACHE_CONTROL, "no-store"),
        ],
        bytes,
    )
        .into_response())
}

async fn cache_track(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(track): Json<BridgeTrack>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, false).await?;
    state.ensure_track(&track).await?;
    Ok(Json(json!({ "trackId": track.id, "cached": true })))
}

async fn clear_cache(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, true).await?;
    let removed = state.clear_cache().await?;
    Ok(Json(json!({ "removed": removed })))
}

async fn sync_project(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, false).await?;
    let cached = state.sync_project(&id).await?;
    Ok(Json(json!({ "cached": cached })))
}

async fn play(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<PlayInput>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, false).await?;
    let request_id = input
        .request_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let expires_at = input
        .expires_at_ms
        .unwrap_or(now_ms() + 10_000)
        .min(now_ms() + 10_000);
    let generation = {
        let mut generations = state.launch_generations.lock().map_err(lock_error)?;
        let global = *generations.entry(String::new()).or_default();
        let track = *generations.entry(input.track.id.clone()).or_default();
        (global, track)
    };
    let can_start = || {
        let generations = state
            .launch_generations
            .lock()
            .map_err(|_| "Moteur audio indisponible.".to_string())?;
        let cancelled = state
            .cancelled_launches
            .lock()
            .map_err(|_| "Moteur audio indisponible.".to_string())?
            .contains_key(&request_id);
        check_launch(
            now_ms(),
            expires_at,
            generation,
            (
                *generations.get("").unwrap_or(&0),
                *generations.get(&input.track.id).unwrap_or(&0),
            ),
            cancelled,
        )
    };
    can_start()?;
    let path = if let Some(preview) = &input.remote_preview {
        let preview_id = preview.id.normalized();
        state
            .ensure_remote_preview(&preview_id, &preview.url)
            .await?
    } else {
        state.ensure_track(&input.track).await?
    };
    let channel = input.channel.as_deref().unwrap_or("main");
    let config = state.config.read().await;
    let output_id = input.output_id.clone().unwrap_or_else(|| {
        if channel == "preview" {
            config.preview_output_id.as_deref()
        } else {
            config.main_output_id.as_deref()
        }
        .unwrap_or("default")
        .to_string()
    });
    drop(config);
    let mut engine = state.audio.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Moteur audio indisponible.".to_string(),
        )
    })?;
    let id = engine.play(
        &input.track,
        &path,
        &output_id,
        channel,
        input.fade_in_ms.unwrap_or(input.track.fade_in_ms),
        input.volume_multiplier.unwrap_or(1.0),
        &request_id,
        can_start,
    )?;
    Ok(Json(json!({ "playbackId": id, "startedAt": now_ms() })))
}

async fn cancel_launch(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    {
        let mut cancelled = state.cancelled_launches.lock().map_err(lock_error)?;
        cancelled.retain(|_, expires_at| *expires_at > now_ms());
        cancelled.insert(id.clone(), now_ms() + 60_000);
    }
    state.audio.lock().map_err(lock_error)?.stop(&id, 0);
    Ok(StatusCode::NO_CONTENT)
}

async fn playbacks(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
) -> ApiResult<Json<serde_json::Value>> {
    authorize(&headers, &state, false).await?;
    let playbacks = state
        .audio
        .lock()
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Moteur audio indisponible.".to_string(),
            )
        })?
        .snapshots();
    Ok(Json(json!({ "playbacks": playbacks })))
}

async fn events(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    let origin = headers.get(ORIGIN).and_then(|value| value.to_str().ok());
    if !matches!(
        origin,
        Some(
            "https://app.sonoriva.fr"
                | "http://localhost:5173"
                | "http://127.0.0.1:5173"
                | "tauri://localhost"
                | "http://tauri.localhost"
        )
    ) {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Origine locale non autorisée.".to_string(),
        ));
    }
    Ok(upgrade
        .on_upgrade(move |socket| event_stream(socket, state))
        .into_response())
}

async fn event_stream(mut socket: WebSocket, state: Arc<Runtime>) {
    let authentication =
        tokio::time::timeout(std::time::Duration::from_secs(3), socket.recv()).await;
    let supplied = match authentication {
        Ok(Some(Ok(Message::Text(message)))) => serde_json::from_str::<serde_json::Value>(&message)
            .ok()
            .filter(|body| {
                body.get("type").and_then(|value| value.as_str()) == Some("authenticate")
            })
            .and_then(|body| body.get("token")?.as_str().map(str::to_string)),
        _ => None,
    };
    let expected = state.local_token.read().await.clone();
    if supplied.is_none() || supplied != expected {
        let _ = socket.send(Message::Close(None)).await;
        return;
    }
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(100));
    loop {
        interval.tick().await;
        let playbacks = match state.audio.lock() {
            Ok(mut engine) => engine.snapshots(),
            Err(_) => break,
        };
        let Ok(payload) = serde_json::to_string(
            &serde_json::json!({ "type": "playbacks", "playbacks": playbacks }),
        ) else {
            break;
        };
        if socket.send(Message::Text(payload.into())).await.is_err() {
            break;
        }
    }
}

async fn toggle_pause(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state.audio.lock().map_err(lock_error)?.toggle_pause(&id);
    Ok(StatusCode::NO_CONTENT)
}

async fn set_volume(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    Json(input): Json<VolumeInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .set_volume(&id, input.volume);
    Ok(StatusCode::NO_CONTENT)
}

async fn set_master_volume(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<VolumeInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .set_master_volume(input.volume);
    Ok(StatusCode::NO_CONTENT)
}

async fn set_loop(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    Json(input): Json<LoopInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .set_loop(&id, input.loop_playback)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn seek(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    Json(input): Json<SeekInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .seek(&id, input.progress)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn set_playback_output(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    Json(input): Json<OutputInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    if !AudioEngine::list_outputs()?
        .iter()
        .any(|output| output.id == input.device_id)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Cette sortie audio n’est pas disponible.".to_string(),
        ));
    }
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .set_output(&id, &input.device_id)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn stop(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Path(id): Path<String>,
    Json(input): Json<StopInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .stop(&id, input.fade_out_ms.unwrap_or(250));
    Ok(StatusCode::NO_CONTENT)
}

async fn stop_track(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<StopTrackInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    *state
        .launch_generations
        .lock()
        .map_err(lock_error)?
        .entry(input.track_id.clone())
        .or_default() += 1;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .stop_track(&input.track_id, input.fade_out_ms.unwrap_or(250));
    Ok(StatusCode::NO_CONTENT)
}

async fn stop_all(
    headers: HeaderMap,
    State(state): State<Arc<Runtime>>,
    Json(input): Json<StopInput>,
) -> ApiResult<StatusCode> {
    authorize(&headers, &state, false).await?;
    *state
        .launch_generations
        .lock()
        .map_err(lock_error)?
        .entry(String::new())
        .or_default() += 1;
    state
        .audio
        .lock()
        .map_err(lock_error)?
        .stop_all(input.fade_out_ms.unwrap_or(250));
    Ok(StatusCode::NO_CONTENT)
}

async fn authorize(headers: &HeaderMap, state: &Runtime, allow_native_ui: bool) -> ApiResult<()> {
    if allow_native_ui
        && headers
            .get(ORIGIN)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|origin| {
                origin == "tauri://localhost" || origin == "http://tauri.localhost"
            })
    {
        return Ok(());
    }
    let expected = state.local_token.read().await.clone().ok_or_else(|| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "Le bridge n’est pas encore associé.".to_string(),
        )
    })?;
    let supplied = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if supplied == Some(expected.as_str()) {
        Ok(())
    } else {
        Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "Clé locale du bridge invalide.".to_string(),
        ))
    }
}

fn lock_error<T>(_error: std::sync::PoisonError<T>) -> ApiError {
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Moteur audio indisponible.".to_string(),
    )
}

fn check_launch(
    now: u128,
    expires_at: u128,
    initial: (u64, u64),
    current: (u64, u64),
    cancelled: bool,
) -> Result<(), String> {
    if cancelled || now >= expires_at || initial != current {
        Err("Démarrage annulé : délai dépassé ou arrêt demandé.".to_string())
    } else {
        Ok(())
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::{RemotePreviewId, check_launch};

    #[test]
    fn rejects_expired_stopped_and_previously_cancelled_launches() {
        assert!(check_launch(100, 200, (0, 0), (0, 0), false).is_ok());
        assert!(check_launch(200, 200, (0, 0), (0, 0), false).is_err());
        assert!(check_launch(100, 200, (0, 0), (1, 0), false).is_err());
        assert!(check_launch(100, 200, (0, 0), (0, 1), false).is_err());
        assert!(check_launch(100, 200, (0, 0), (0, 0), true).is_err());
    }

    #[test]
    fn accepts_legacy_numeric_and_openverse_text_preview_ids() {
        let numeric: RemotePreviewId = serde_json::from_str("123456").expect("numeric id");
        let text: RemotePreviewId =
            serde_json::from_str("\"baf7990c-657a-47ab-83c0-4ec2437095c3\"").expect("text id");
        assert_eq!(numeric.normalized(), "123456");
        assert_eq!(text.normalized(), "baf7990c-657a-47ab-83c0-4ec2437095c3");
    }
}
