let micStream: MediaStream | null = null;

/**
 * Reuse a single microphone stream per browser session to avoid repeated
 * permission prompts across different voice features.
 */
export async function getOrCreateMicrophoneStream() {
  if (micStream && micStream.active) {
    micStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    return micStream;
  }

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream;
}

/**
 * Keep permission alive but disable capture while idle.
 */
export function deactivateMicrophoneStream() {
  if (!micStream) return;
  micStream.getAudioTracks().forEach((track) => {
    track.enabled = false;
  });
}

/**
 * Full release helper if we ever need to explicitly stop mic usage.
 */
export function releaseMicrophoneStream() {
  if (!micStream) return;
  micStream.getTracks().forEach((track) => track.stop());
  micStream = null;
}

