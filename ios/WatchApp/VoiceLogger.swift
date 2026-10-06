// The wrist's microphone for voice logging (2026-10-05). watchOS ships no
// speech framework, so this only CAPTURES: a few seconds of AAC, stopped by
// a second tap or by silence, handed to AppModel to post. The words are
// recognised on the server.
//
// It stops itself: once speech has been heard and then ~0.9 s of quiet, or
// after 12 s whatever happens — and it throws the clip away if nobody spoke,
// so a mis-tap between sets never becomes an upload.

#if os(watchOS)
import AVFoundation
import Foundation

@MainActor
final class VoiceLogger: NSObject, ObservableObject {
    enum State: Equatable { case idle, recording }

    @Published private(set) var state: State = .idle
    /// 0…1, for the listening ring.
    @Published private(set) var level: Double = 0

    /// A clip with speech in it — the file is the caller's to delete.
    var onClip: ((URL) -> Void)?
    /// Nothing usable was said (silence, or cut off instantly).
    var onNothingHeard: (() -> Void)?
    /// The audio session or recorder would not start.
    var onStartFailed: (() -> Void)?

    private var recorder: AVAudioRecorder?
    private var meterTask: Task<Void, Never>?
    private var fileURL: URL?
    private var startedAt = Date()
    private var heardSpeech = false
    private var lastLoudAt = Date()
    private var floorDb: Float = -50

    private static let maxSeconds: TimeInterval = 12
    private static let silenceToStop: TimeInterval = 0.9
    private static let giveUpAfter: TimeInterval = 4

    static var permission: AVAudioApplication.recordPermission {
        AVAudioApplication.shared.recordPermission
    }

    /// Asks once. Called before a workout's countdown — never mid-set.
    static func requestPermissionIfUndetermined() async {
        guard permission == .undetermined else { return }
        _ = await AVAudioApplication.requestRecordPermission()
    }

    func toggle() {
        if state == .recording { stop() } else { start() }
    }

    func start() {
        guard state == .idle else { return }
        guard Self.permission == .granted else {
            onNothingHeard?()
            return
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 24_000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            let session = AVAudioSession.sharedInstance()
            // Duck, don't stop: music he is training to dips for the few
            // seconds of the clip and comes straight back.
            try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers])
            try session.setActive(true)
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record(forDuration: Self.maxSeconds) else {
                throw CocoaError(.fileWriteUnknown)
            }
            self.recorder = recorder
            fileURL = url
        } catch {
            cleanupSession()
            onStartFailed?()
            return
        }
        startedAt = Date()
        lastLoudAt = Date()
        heardSpeech = false
        floorDb = -50
        state = .recording
        Haptics.key(.start)
        meterTask = Task { [weak self] in await self?.watchLevels() }
    }

    /// Second tap, silence, or the 12 s ceiling.
    func stop() {
        guard state == .recording, let recorder, let url = fileURL else { return }
        meterTask?.cancel()
        meterTask = nil
        let length = recorder.currentTime
        recorder.stop()
        self.recorder = nil
        fileURL = nil
        state = .idle
        level = 0
        cleanupSession()
        Haptics.key(.stop)
        // Under half a second, or no voice above the room: not an entry.
        if length < 0.5 || !heardSpeech {
            try? FileManager.default.removeItem(at: url)
            onNothingHeard?()
        } else {
            onClip?(url)
        }
    }

    private func cleanupSession() {
        try? AVAudioSession.sharedInstance()
            .setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func watchLevels() async {
        while !Task.isCancelled, state == .recording, let recorder {
            recorder.updateMeters()
            let db = recorder.averagePower(forChannel: 0)
            let now = Date()
            let age = now.timeIntervalSince(startedAt)
            // The first 300 ms set the room's noise floor.
            if age < 0.3 { floorDb = max(-60, min(floorDb, db)) }
            let loud = db > max(floorDb + 12, -42)
            if loud {
                heardSpeech = true
                lastLoudAt = now
            }
            level = Double(max(0, min(1, (db + 55) / 45)))

            if !recorder.isRecording { break } // hit the 12 s ceiling
            if heardSpeech, now.timeIntervalSince(lastLoudAt) >= Self.silenceToStop { break }
            if !heardSpeech, age >= Self.giveUpAfter { break }
            try? await Task.sleep(nanoseconds: 80_000_000)
        }
        if !Task.isCancelled, state == .recording { stop() }
    }
}
#endif
