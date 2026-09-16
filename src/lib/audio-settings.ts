export const MIC_DEVICE_KEY = "labutuca.micDeviceId";
export const OUTPUT_DEVICE_KEY = "labutuca.outputDeviceId";
export const OUTPUT_VOLUME_KEY = "labutuca.outputVolume";
export const MIC_GAIN_KEY = "labutuca.micGain";

export const DEFAULT_DEVICE = "default";

export function getMicDeviceId(): string | null {
  const id = localStorage.getItem(MIC_DEVICE_KEY);
  return id && id !== DEFAULT_DEVICE ? id : null;
}

export function setMicDeviceId(deviceId: string) {
  if (deviceId === DEFAULT_DEVICE) localStorage.removeItem(MIC_DEVICE_KEY);
  else localStorage.setItem(MIC_DEVICE_KEY, deviceId);
}

export function getOutputDeviceId(): string | null {
  const id = localStorage.getItem(OUTPUT_DEVICE_KEY);
  return id && id !== DEFAULT_DEVICE ? id : null;
}

export function setOutputDeviceId(deviceId: string) {
  if (deviceId === DEFAULT_DEVICE) localStorage.removeItem(OUTPUT_DEVICE_KEY);
  else localStorage.setItem(OUTPUT_DEVICE_KEY, deviceId);
}

/** Remote audio playback volume, 0..1 (default 1). */
export function getOutputVolume(): number {
  const stored = localStorage.getItem(OUTPUT_VOLUME_KEY);
  if (stored === null) return 1;
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

export function setOutputVolume(volume: number) {
  localStorage.setItem(OUTPUT_VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
}

/** Microphone sensitivity multiplier, 0.1..2 (default 1). */
export function getMicGain(): number {
  const stored = localStorage.getItem(MIC_GAIN_KEY);
  if (stored === null) return 1;
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(2, Math.max(0.1, raw));
}

export function setMicGain(gain: number) {
  localStorage.setItem(MIC_GAIN_KEY, String(Math.min(2, Math.max(0.1, gain))));
}

type SinkAudioElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsOutputSelection() {
  if (typeof HTMLMediaElement === "undefined") return false;
  return typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
}

/** Routes a media element to the chosen output device ("" = system default). */
export async function applyOutputDevice(
  el: HTMLMediaElement,
  deviceId: string | null,
): Promise<boolean> {
  const fn = (el as SinkAudioElement).setSinkId;
  if (!fn) return false;
  try {
    await fn.call(el, deviceId ?? "");
    return true;
  } catch {
    return false;
  }
}
