const formatAudioTime = (seconds) => {
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

for (const player of document.querySelectorAll("[data-audio-player]")) {
  const audio = player.querySelector("[data-audio]");
  const controls = player.querySelector("[data-audio-controls]");
  const toggle = player.querySelector("[data-audio-toggle]");
  const icon = player.querySelector("[data-audio-icon]");
  const label = player.querySelector("[data-audio-label]");
  const current = player.querySelector("[data-audio-current]");
  const duration = player.querySelector("[data-audio-duration]");
  const speed = player.querySelector("[data-audio-speed]");
  const progress = player.querySelector("[data-audio-progress]");

  if (!(audio instanceof HTMLAudioElement) ||
      !(controls instanceof HTMLElement) ||
      !(toggle instanceof HTMLButtonElement) ||
      !(icon instanceof HTMLElement) ||
      !(label instanceof HTMLElement) ||
      !(current instanceof HTMLElement) ||
      !(duration instanceof HTMLElement) ||
      !(speed instanceof HTMLSelectElement) ||
      !(progress instanceof HTMLInputElement)) continue;

  audio.controls = false;
  controls.hidden = false;

  const updateDuration = () => {
    if (!Number.isFinite(audio.duration)) return;
    progress.max = String(audio.duration);
    duration.textContent = formatAudioTime(audio.duration);
  };

  const updateProgress = () => {
    progress.value = String(audio.currentTime);
    current.textContent = formatAudioTime(audio.currentTime);
    progress.setAttribute(
      "aria-valuetext",
      `${formatAudioTime(audio.currentTime)} of ${formatAudioTime(audio.duration)}`,
    );
  };

  const updatePlaybackState = () => {
    const isPlaying = !audio.paused && !audio.ended;
    icon.textContent = isPlaying ? "Ⅱ" : "▶";
    label.textContent = isPlaying ? "Pause" : "Listen";
    toggle.setAttribute(
      "aria-label",
      isPlaying ? "Pause audio version of this article" : "Play audio version of this article",
    );
  };

  toggle.addEventListener("click", async () => {
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;

      try {
        await audio.play();
      } catch {
        audio.controls = true;
        controls.hidden = true;
      }
    } else {
      audio.pause();
    }
  });

  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(progress.value);
  });

  speed.addEventListener("change", () => {
    audio.playbackRate = Number(speed.value);
  });

  audio.addEventListener("loadedmetadata", updateDuration);
  audio.addEventListener("durationchange", updateDuration);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("play", updatePlaybackState);
  audio.addEventListener("pause", updatePlaybackState);
  audio.addEventListener("ended", updatePlaybackState);

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) updateDuration();
  updateProgress();
  updatePlaybackState();
}
