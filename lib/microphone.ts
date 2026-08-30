/**
 * Microphone streams, of which there are two kinds — and keeping them apart matters twice.
 *
 * VOICE ("voice note", dictation, chat capture): a phone-call source. WebRTC's default
 * processing — echo cancellation, noise suppression, auto gain — is exactly right for a mouth
 * six inches from the mic, and the browser's defaults give it for free.
 *
 * ROOM (a sermon recording): a preacher fifteen metres away in a reverberant hall. The same
 * processing is actively harmful there — noise suppression hears the reverb tail and the room
 * as noise and gates it, and auto gain pumps between a loud passage and a quiet one. Ask for
 * raw audio instead. This, not the bitrate and not the model, is the main reason sermon
 * transcripts come back thin.
 *
 * They must also be SEPARATE MediaStreams, not one shared one. They used to share, and
 * `deactivateMicrophoneStream` disables the tracks — so tapping the voice-note button once
 * during a sermon left the rest of the recording as digital silence, with the level meter
 * reading zero and no error anywhere. (Found 2026-08-30, in the audit after a lost sermon.)
 */

let voiceStream: MediaStream | null = null;
let roomStream: MediaStream | null = null;

/** near-field speech: keep every browser default, they are tuned for exactly this */
const VOICE_CONSTRAINTS: MediaStreamConstraints = { audio: true };

/**
 * far-field speech in a room. `ideal` rather than exact so a device that cannot honour a
 * constraint gives us its best effort instead of rejecting `getUserMedia` outright.
 */
const ROOM_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
  },
};

/**
 * Reuse a single microphone stream per browser session to avoid repeated
 * permission prompts across different voice features.
 */
export async function getOrCreateMicrophoneStream() {
  if (voiceStream && voiceStream.active) {
    voiceStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    return voiceStream;
  }

  voiceStream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
  return voiceStream;
}

/**
 * The room mic, for recording something happening across a hall. Its own stream, so that
 * pausing dictation can never silence a sermon.
 */
export async function getOrCreateRoomStream() {
  if (roomStream && roomStream.active) {
    roomStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    return roomStream;
  }

  try {
    roomStream = await navigator.mediaDevices.getUserMedia(ROOM_CONSTRAINTS);
  } catch {
    // A device that refuses the constraint set is still worth recording from — a processed
    // sermon beats no sermon.
    roomStream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
  }
  return roomStream;
}

/**
 * Keep permission alive but disable capture while idle. Touches the VOICE stream only —
 * a live room recording is never a side effect of a voice note ending.
 */
export function deactivateMicrophoneStream() {
  if (!voiceStream) return;
  voiceStream.getAudioTracks().forEach((track) => {
    track.enabled = false;
  });
}

/**
 * Full release helper if we ever need to explicitly stop mic usage.
 */
export function releaseMicrophoneStream() {
  if (!voiceStream) return;
  voiceStream.getTracks().forEach((track) => track.stop());
  voiceStream = null;
}

/** Stop the room mic outright — called when a recording truly ends. */
export function releaseRoomStream() {
  if (!roomStream) return;
  roomStream.getTracks().forEach((track) => track.stop());
  roomStream = null;
}
