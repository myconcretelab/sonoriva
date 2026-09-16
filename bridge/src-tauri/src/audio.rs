use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::Path,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use uuid::Uuid;

use crate::models::{AudioOutput, BridgeTrack, PlaybackSnapshot};

struct Playback {
    id: String,
    track_id: String,
    sequence: u64,
    duration_ms: u64,
    loop_playback: bool,
    volume: f32,
    fading_out: bool,
    player: Arc<Player>,
    track: BridgeTrack,
    path: PathBuf,
    position_offset_ms: u64,
    channel: String,
    output_id: String,
}

pub struct AudioEngine {
    outputs: HashMap<String, AudioOutputStream>,
    active: HashMap<String, Playback>,
    sequence: u64,
    master_volume: f32,
}

struct AudioOutputStream {
    sink: MixerDeviceSink,
    failed: Arc<AtomicBool>,
}

impl AudioEngine {
    pub fn new() -> Self {
        Self {
            outputs: HashMap::new(),
            active: HashMap::new(),
            sequence: 0,
            master_volume: 1.0,
        }
    }

    pub fn list_outputs() -> Result<Vec<AudioOutput>, String> {
        let host = cpal::default_host();
        let default_id = host
            .default_output_device()
            .and_then(|device| device.id().ok())
            .map(|id| id.to_string());
        let devices = host.output_devices().map_err(|error| error.to_string())?;
        let mut outputs = vec![AudioOutput {
            id: "default".to_string(),
            name: "Sortie système par défaut".to_string(),
            is_default: true,
        }];
        for (index, device) in devices.enumerate() {
            let id = device
                .id()
                .map(|id| id.to_string())
                .unwrap_or_else(|_| format!("device-{index}"));
            let name = device
                .description()
                .map(|description| description.name().to_string())
                .unwrap_or_else(|_| format!("Sortie audio {}", index + 1));
            outputs.push(AudioOutput {
                is_default: default_id.as_deref() == Some(id.as_str()),
                id,
                name,
            });
        }
        Ok(outputs)
    }

    fn output(&mut self, output_id: &str) -> Result<&AudioOutputStream, String> {
        if self
            .outputs
            .get(output_id)
            .is_some_and(|output| output.failed.load(Ordering::Acquire))
        {
            self.remove_output(output_id);
        }
        if !self.outputs.contains_key(output_id) {
            let host = cpal::default_host();
            let device = if output_id == "default" {
                host.default_output_device()
                    .ok_or_else(|| "Aucune sortie audio par défaut n’est disponible.".to_string())?
            } else {
                let mut devices = host.output_devices().map_err(|error| error.to_string())?;
                devices
                    .find_map(|device| {
                        (device.id().ok()?.to_string() == output_id).then_some(device)
                    })
                    .ok_or_else(|| "Cette sortie audio n’est plus disponible.".to_string())?
            };
            let failed = Arc::new(AtomicBool::new(false));
            let failed_for_callback = failed.clone();
            let output_id_for_callback = output_id.to_string();
            let sink = DeviceSinkBuilder::from_device(device)
                .map(|builder| {
                    builder.with_error_callback(move |error| {
                        failed_for_callback.store(true, Ordering::Release);
                        eprintln!("Flux audio interrompu sur {output_id_for_callback}: {error}");
                    })
                })
                .and_then(|builder| builder.open_stream())
                .map_err(|error| error.to_string())?;
            self.outputs
                .insert(output_id.to_string(), AudioOutputStream { sink, failed });
        }
        self.outputs
            .get(output_id)
            .ok_or_else(|| "Sortie audio inaccessible.".to_string())
    }

    fn remove_output(&mut self, output_id: &str) {
        if let Some(mut output) = self.outputs.remove(output_id) {
            output.sink.log_on_drop(false);
        }
        self.active.retain(|_, playback| {
            if playback.output_id != output_id {
                return true;
            }
            playback.player.stop();
            false
        });
    }

    fn refresh_output_if_idle(&mut self, output_id: &str, ignored_playback_id: Option<&str>) {
        let is_in_use = self.active.values().any(|playback| {
            playback.output_id == output_id
                && ignored_playback_id != Some(playback.id.as_str())
                && !playback.player.empty()
        });
        if !is_in_use {
            self.remove_output(output_id);
        }
    }

    fn release_unused_outputs(&mut self) {
        let used_outputs = self
            .active
            .values()
            .map(|playback| playback.output_id.as_str())
            .collect::<HashSet<_>>();
        self.outputs.retain(|output_id, output| {
            let keep = used_outputs.contains(output_id.as_str());
            if !keep {
                output.sink.log_on_drop(false);
            }
            keep
        });
    }

    pub fn play(
        &mut self,
        track: &BridgeTrack,
        path: &Path,
        output_id: &str,
        channel: &str,
        fade_in_ms: u64,
        volume_multiplier: f32,
    ) -> Result<String, String> {
        self.refresh_output_if_idle(output_id, None);
        let mixer = self.output(output_id)?.sink.mixer().clone();
        let duration_ms = track
            .end_time_ms
            .or(track.duration_ms)
            .unwrap_or(track.start_time_ms + 1)
            .saturating_sub(track.start_time_ms)
            .max(10);
        let player = Arc::new(Player::connect_new(&mixer));
        let target_volume = (track.volume * volume_multiplier).clamp(0.0, 1.0);
        player.set_volume(if fade_in_ms > 0 {
            0.0
        } else {
            target_volume * self.master_volume
        });
        append_source(&player, track, path, 0, track.loop_playback)?;
        self.sequence += 1;
        let id = format!("{}:{}", track.id, Uuid::new_v4());
        self.active.insert(
            id.clone(),
            Playback {
                id: id.clone(),
                track_id: track.id.clone(),
                sequence: self.sequence,
                duration_ms,
                loop_playback: track.loop_playback,
                volume: target_volume,
                fading_out: false,
                player: player.clone(),
                track: track.clone(),
                path: path.to_path_buf(),
                position_offset_ms: 0,
                channel: channel.to_string(),
                output_id: output_id.to_string(),
            },
        );
        if fade_in_ms > 0 {
            tokio::spawn(fade_player(
                player,
                0.0,
                target_volume * self.master_volume,
                fade_in_ms,
                false,
            ));
        }
        Ok(id)
    }

    pub fn snapshots(&mut self) -> Vec<PlaybackSnapshot> {
        let failed_outputs = self
            .outputs
            .iter()
            .filter(|(_, output)| output.failed.load(Ordering::Acquire))
            .map(|(output_id, _)| output_id.clone())
            .collect::<Vec<_>>();
        for output_id in failed_outputs {
            self.remove_output(&output_id);
        }
        self.active.retain(|_, playback| !playback.player.empty());
        self.release_unused_outputs();
        let mut snapshots = self
            .active
            .values_mut()
            .map(|playback| {
                if playback.loop_playback
                    && playback.position_offset_ms > 0
                    && playback.player.len() == 1
                {
                    playback.position_offset_ms = 0;
                }
                let raw_position =
                    playback.position_offset_ms + playback.player.get_pos().as_millis() as u64;
                PlaybackSnapshot {
                    id: playback.id.clone(),
                    track_id: playback.track_id.clone(),
                    sequence: playback.sequence,
                    position_ms: if playback.loop_playback {
                        raw_position % playback.duration_ms
                    } else {
                        raw_position.min(playback.duration_ms)
                    },
                    duration_ms: playback.duration_ms,
                    loop_playback: playback.loop_playback,
                    paused: playback.player.is_paused(),
                    volume: playback.volume,
                    fading_out: playback.fading_out,
                    channel: playback.channel.clone(),
                    output_id: playback.output_id.clone(),
                }
            })
            .collect::<Vec<_>>();
        snapshots.sort_by_key(|playback| playback.sequence);
        snapshots
    }

    pub fn toggle_pause(&mut self, id: &str) {
        if let Some(playback) = self.active.get(id) {
            if playback.player.is_paused() {
                playback.player.play();
            } else {
                playback.player.pause();
            }
        }
    }

    pub fn set_volume(&mut self, id: &str, volume: f32) {
        if let Some(playback) = self.active.get_mut(id) {
            playback.volume = volume.clamp(0.0, 1.0);
            playback
                .player
                .set_volume(playback.volume * self.master_volume);
        }
    }

    pub fn set_master_volume(&mut self, volume: f32) {
        self.master_volume = volume.clamp(0.0, 1.0);
        for playback in self.active.values() {
            playback
                .player
                .set_volume(playback.volume * self.master_volume);
        }
    }

    pub fn set_loop(&mut self, id: &str, loop_playback: bool) -> Result<(), String> {
        let playback = self
            .active
            .get_mut(id)
            .ok_or_else(|| "Lecture introuvable.".to_string())?;
        if playback.loop_playback == loop_playback {
            return Ok(());
        }
        let position_ms = current_position(playback);
        let paused = playback.player.is_paused();
        playback.player.stop();
        append_source(
            &playback.player,
            &playback.track,
            &playback.path,
            position_ms,
            loop_playback,
        )?;
        if paused {
            playback.player.pause();
        }
        playback.position_offset_ms = position_ms;
        playback.loop_playback = loop_playback;
        Ok(())
    }

    pub fn seek(&mut self, id: &str, progress: f32) -> Result<(), String> {
        let playback = self
            .active
            .get_mut(id)
            .ok_or_else(|| "Lecture introuvable.".to_string())?;
        let position_ms = (playback.duration_ms as f32 * progress.clamp(0.0, 1.0)) as u64;
        let paused = playback.player.is_paused();
        playback.player.stop();
        append_source(
            &playback.player,
            &playback.track,
            &playback.path,
            position_ms,
            playback.loop_playback,
        )?;
        if paused {
            playback.player.pause();
        }
        playback.position_offset_ms = position_ms;
        Ok(())
    }

    pub fn set_output(&mut self, id: &str, output_id: &str) -> Result<(), String> {
        if self
            .active
            .get(id)
            .is_some_and(|playback| playback.output_id == output_id)
        {
            return Ok(());
        }
        let (position_ms, paused, loop_playback, volume, track, path, previous_player) = {
            let playback = self
                .active
                .get(id)
                .ok_or_else(|| "Lecture introuvable.".to_string())?;
            if playback.fading_out {
                return Err(
                    "Une lecture en fondu sortant ne peut pas changer de sortie.".to_string(),
                );
            }
            (
                current_position(playback),
                playback.player.is_paused(),
                playback.loop_playback,
                playback.volume,
                playback.track.clone(),
                playback.path.clone(),
                playback.player.clone(),
            )
        };
        self.refresh_output_if_idle(output_id, Some(id));
        let mixer = self.output(output_id)?.sink.mixer().clone();
        let player = Arc::new(Player::connect_new(&mixer));
        player.set_volume(volume * self.master_volume);
        append_source(&player, &track, &path, position_ms, loop_playback)?;
        if paused {
            player.pause();
        }
        let playback = self
            .active
            .get_mut(id)
            .ok_or_else(|| "Lecture introuvable.".to_string())?;
        previous_player.stop();
        playback.player = player;
        playback.position_offset_ms = position_ms;
        playback.output_id = output_id.to_string();
        Ok(())
    }

    pub fn stop(&mut self, id: &str, fade_out_ms: u64) {
        if fade_out_ms == 0
            || self
                .active
                .get(id)
                .is_some_and(|playback| playback.player.is_paused())
        {
            if let Some(playback) = self.active.remove(id) {
                playback.player.stop();
            }
            return;
        }
        if let Some(playback) = self.active.get_mut(id) {
            if playback.fading_out {
                return;
            }
            playback.fading_out = true;
            let player = playback.player.clone();
            tokio::spawn(fade_player(
                player.clone(),
                player.volume(),
                0.0,
                fade_out_ms,
                true,
            ));
        }
    }

    pub fn stop_track(&mut self, track_id: &str, fade_out_ms: u64) {
        let ids = self
            .active
            .values()
            .filter(|playback| playback.track_id == track_id)
            .map(|playback| playback.id.clone())
            .collect::<Vec<_>>();
        for id in ids {
            self.stop(&id, fade_out_ms);
        }
    }

    pub fn stop_all(&mut self, fade_out_ms: u64) {
        let ids = self.active.keys().cloned().collect::<Vec<_>>();
        for id in ids {
            self.stop(&id, fade_out_ms);
        }
    }
}

fn append_source(
    player: &Player,
    track: &BridgeTrack,
    path: &Path,
    position_ms: u64,
    loop_playback: bool,
) -> Result<(), String> {
    let duration_ms = track
        .end_time_ms
        .or(track.duration_ms)
        .unwrap_or(track.start_time_ms + 1)
        .saturating_sub(track.start_time_ms)
        .max(10);
    let position_ms = position_ms.min(duration_ms.saturating_sub(1));
    let decoder = Decoder::try_from(File::open(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    let first = decoder
        .skip_duration(Duration::from_millis(track.start_time_ms + position_ms))
        .take_duration(Duration::from_millis(duration_ms - position_ms));
    if !loop_playback {
        player.append(first);
        return Ok(());
    }
    if position_ms > 0 {
        player.append(first);
    }
    let repeating = Decoder::try_from(File::open(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?
        .skip_duration(Duration::from_millis(track.start_time_ms))
        .take_duration(Duration::from_millis(duration_ms))
        .repeat_infinite();
    player.append(repeating);
    Ok(())
}

fn current_position(playback: &Playback) -> u64 {
    let raw = playback.position_offset_ms + playback.player.get_pos().as_millis() as u64;
    if playback.loop_playback {
        raw % playback.duration_ms
    } else {
        raw.min(playback.duration_ms)
    }
}

async fn fade_player(player: Arc<Player>, from: f32, to: f32, duration_ms: u64, stop_after: bool) {
    let steps = (duration_ms / 20).clamp(1, 200);
    for step in 1..=steps {
        tokio::time::sleep(Duration::from_millis(duration_ms / steps)).await;
        let progress = step as f32 / steps as f32;
        player.set_volume(from + (to - from) * progress);
    }
    if stop_after {
        player.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn looping_playback() -> (AudioEngine, rodio::queue::SourcesQueueOutput) {
        let (player, output) = Player::new();
        player.append(rodio::source::SineWave::new(440.0));
        let track: BridgeTrack = serde_json::from_value(serde_json::json!({
            "id": "loop", "title": "Loop", "originalFilename": "loop.wav",
            "mimeType": "audio/wav", "volume": 1.0, "loop": true,
            "startTimeMs": 0, "durationMs": 1000, "sizeBytes": 1,
            "fadeInMs": 0, "fadeOutMs": 20
        }))
        .unwrap();
        let mut engine = AudioEngine::new();
        engine.active.insert(
            "loop".into(),
            Playback {
                id: "loop".into(),
                track_id: "loop".into(),
                sequence: 1,
                duration_ms: 1000,
                loop_playback: true,
                volume: 1.0,
                fading_out: false,
                player: Arc::new(player),
                track,
                path: PathBuf::new(),
                position_offset_ms: 0,
                channel: "main".into(),
                output_id: "default".into(),
            },
        );
        (engine, output)
    }

    #[tokio::test]
    async fn loop_disappears_after_stop_all_fade() {
        let (mut engine, mut output) = looping_playback();
        assert_eq!(engine.snapshots().len(), 1);
        engine.stop_all(20);
        assert!(engine.snapshots()[0].fading_out);
        tokio::time::sleep(Duration::from_millis(60)).await;
        // Consume the stopped source as the audio device would do.
        for _ in 0..10000 {
            output.next();
        }
        assert!(engine.snapshots().is_empty());
        assert!(engine.snapshots().is_empty());
    }

    #[tokio::test]
    async fn paused_loop_stops_without_waiting_for_a_fade() {
        let (mut engine, _output) = looping_playback();
        engine.toggle_pause("loop");
        engine.stop_all(1200);
        assert!(engine.snapshots().is_empty());
    }
}
