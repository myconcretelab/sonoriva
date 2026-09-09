import { useEffect, useRef } from 'react';
import { trackStreamUrl } from '../lib/offline-audio';

const thumbnails = new Map<string, string>();
export function VideoThumbnail({ trackId }: { trackId: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (!image) return;
    const cached = thumbnails.get(trackId);
    if (cached) { image.src = cached; return; }
    const video = document.createElement('video');
    video.muted = true; video.preload = 'metadata';
    const dispose = () => { video.onloadeddata = null; video.onseeked = null; video.removeAttribute('src'); video.load(); };
    const capture = () => {
      if (!video.videoWidth) return;
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const context = canvas.getContext('2d');
      if (!context) return;
      const scale = Math.min(160 / video.videoWidth, 90 / video.videoHeight);
      const w = video.videoWidth * scale; const h = video.videoHeight * scale;
      context.fillStyle = '#000'; context.fillRect(0, 0, 160, 90);
      context.drawImage(video, (160 - w) / 2, (90 - h) / 2, w, h);
      const url = canvas.toDataURL('image/jpeg', .65);
      if (thumbnails.size >= 200) thumbnails.delete(thumbnails.keys().next().value!);
      thumbnails.set(trackId, url); image.src = url; dispose();
    };
    video.onloadeddata = capture;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); video.src = trackStreamUrl(trackId); video.load(); }
    });
    observer.observe(image);
    return () => { observer.disconnect(); dispose(); };
  }, [trackId]);
  return <img ref={ref} className="video-thumbnail" alt="" aria-hidden="true" />;
}
