const formatVideoTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

for (const player of document.querySelectorAll("[data-video-player]")) {
  const video = player.querySelector("[data-video]");
  const screen = player.querySelector("[data-video-screen]");
  const overlay = player.querySelector("[data-video-overlay]");
  const controls = player.querySelector("[data-video-controls]");
  const toggle = player.querySelector("[data-video-toggle]");
  const icon = player.querySelector("[data-video-icon]");
  const label = player.querySelector("[data-video-label]");
  const current = player.querySelector("[data-video-current]");
  const duration = player.querySelector("[data-video-duration]");
  const speed = player.querySelector("[data-video-speed]");
  const progress = player.querySelector("[data-video-progress]");
  const muteBtn = player.querySelector("[data-video-mute]");
  const muteIcon = player.querySelector("[data-video-mute-icon]");
  const fsBtn = player.querySelector("[data-video-fullscreen]");

  if (
    !(video instanceof HTMLVideoElement) ||
    !(controls instanceof HTMLElement) ||
    !(toggle instanceof HTMLButtonElement) ||
    !(icon instanceof HTMLElement) ||
    !(label instanceof HTMLElement) ||
    !(current instanceof HTMLElement) ||
    !(duration instanceof HTMLElement) ||
    !(speed instanceof HTMLSelectElement) ||
    !(progress instanceof HTMLInputElement)
  ) continue;

  video.controls = false;
  controls.hidden = false;

  const updateDuration = () => {
    if (!Number.isFinite(video.duration)) return;
    progress.max = String(video.duration);
    duration.textContent = formatVideoTime(video.duration);
  };

  const updateProgress = () => {
    progress.value = String(video.currentTime);
    current.textContent = formatVideoTime(video.currentTime);
    progress.setAttribute(
      "aria-valuetext",
      `${formatVideoTime(video.currentTime)} of ${formatVideoTime(video.duration)}`,
    );
  };

  const updatePlaybackState = () => {
    const isPlaying = !video.paused && !video.ended;
    icon.textContent = isPlaying ? "Ⅱ" : "▶";
    label.textContent = isPlaying ? "Pause" : "Play";
    player.dataset.playing = String(isPlaying);
    toggle.setAttribute(
      "aria-label",
      isPlaying ? "Pause video" : "Play video",
    );
  };

  const updateVolumeState = () => {
    if (muteIcon) {
      muteIcon.textContent = video.muted || video.volume === 0 ? "🔇" : "🔊";
    }
    if (muteBtn) {
      muteBtn.setAttribute(
        "aria-label",
        video.muted ? "Unmute audio" : "Mute audio",
      );
    }
  };

  const togglePlay = async () => {
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      try {
        await video.play();
      } catch {
        video.controls = true;
        controls.hidden = true;
      }
    } else {
      video.pause();
    }
  };

  toggle.addEventListener("click", togglePlay);

  if (overlay instanceof HTMLElement) {
    overlay.addEventListener("click", togglePlay);
  } else if (screen instanceof HTMLElement) {
    screen.addEventListener("click", togglePlay);
  }

  progress.addEventListener("input", () => {
    if (Number.isFinite(video.duration)) {
      video.currentTime = Number(progress.value);
    }
  });

  speed.addEventListener("change", () => {
    video.playbackRate = Number(speed.value);
  });

  if (muteBtn instanceof HTMLButtonElement) {
    muteBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      updateVolumeState();
    });
  }

  if (fsBtn instanceof HTMLButtonElement) {
    fsBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        if (player.requestFullscreen) {
          player.requestFullscreen();
        } else if (video.requestFullscreen) {
          video.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });
  }

  video.addEventListener("loadedmetadata", updateDuration);
  video.addEventListener("durationchange", updateDuration);
  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("play", updatePlaybackState);
  video.addEventListener("pause", updatePlaybackState);
  video.addEventListener("ended", updatePlaybackState);
  video.addEventListener("volumechange", updateVolumeState);

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) updateDuration();
  updateProgress();
  updatePlaybackState();
  updateVolumeState();
}
