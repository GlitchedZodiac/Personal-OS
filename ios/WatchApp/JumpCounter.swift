// Jump rope turn counter — ON TRIAL (2026-10-05).
//
// HealthKit has a jump rope activity type and no jump count, so if Pitaya is
// ever to show one it has to come from wrist motion. This is the first
// attempt, and it is deliberately NOT trusted: its number is stored beside
// his own count (metricsData.intervals.jumpsEstimated), shown on the phone
// only in a card labelled as a trial, and never used for a record or a
// total. It earns its way out of the trial by tracking the counts he types.
//
// What it measures: turning a rope is a small circle of the wrist, and a
// circle seen by one gyroscope axis is a sine wave at the rope's own
// frequency. So — pick the axis with the most rotation, keep the 1–6 Hz
// band, and count one turn per positive-going zero crossing whose swing was
// big enough to be a rope and not a twitch.
//
// What it will get wrong, known in advance: trips and restarts, double
// unders (two turns per jump — this counts TURNS), footwork that changes the
// wrist rhythm, and the first and last second of every round.
//
// For the first few sessions it also keeps a short raw trace so the
// thresholds can be tuned against real wrist data instead of a guess; the
// simulator has no motion sensors at all.

#if os(watchOS)
import CoreMotion
import Foundation

final class JumpCounter: @unchecked Sendable {
    static let algo = "gyro-zc-1"

    struct Result: Sendable {
        let total: Int
        let perRound: [Int]
        let trace: MotionTracePayload?
    }

    private static let hz = 50.0
    private static let traceEvery = 2 // 25 Hz
    private static let traceSecondsLimit = 300
    private static let traceSessionsKey = "trial.jumpTraceSessionsLeft"

    /// Sessions that still carry a raw trace — three, then it stops by itself.
    static var traceSessionsLeft: Int {
        get { UserDefaults.standard.object(forKey: traceSessionsKey) as? Int ?? 3 }
        set { UserDefaults.standard.set(max(0, newValue), forKey: traceSessionsKey) }
    }

    private let motion = CMMotionManager()
    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 1
        q.name = "pitaya.jump-counter"
        return q
    }()
    private let lock = NSLock()

    // Filter state — touched only on `queue`.
    private var baseline = [0.0, 0.0, 0.0]
    private var band = [0.0, 0.0, 0.0]
    private var energy = [0.0, 0.0, 0.0]
    private var axis = 0
    private var lastSign = 0
    private var cyclePeak = 0.0
    private var amplitude = 0.0
    private var lastCountAt: TimeInterval = -10

    // Results — guarded by `lock`.
    private var gateOpen = false
    private var total = 0
    private var roundCount = 0
    private var perRound: [Int] = []
    private var trace: [Int8] = []
    private var traceSamples = 0
    private var sampleIndex = 0
    private var captureTrace = false
    private(set) var isRunning = false

    var isAvailable: Bool { motion.isDeviceMotionAvailable }

    func start() {
        guard motion.isDeviceMotionAvailable, !isRunning else { return }
        isRunning = true
        captureTrace = Self.traceSessionsLeft > 0
        motion.deviceMotionUpdateInterval = 1.0 / Self.hz
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let self, let data else { return }
            self.ingest(data)
        }
    }

    /// The rope is turning — counts are attributed to the round that opens.
    func beginRound() {
        lock.lock()
        gateOpen = true
        roundCount = 0
        lock.unlock()
    }

    /// The round closed: bank its count.
    func endRound() {
        lock.lock()
        if gateOpen {
            gateOpen = false
            perRound.append(roundCount)
            roundCount = 0
        }
        lock.unlock()
    }

    /// Stops the sensors and hands back what was counted. Nil when the
    /// device has no motion sensors (simulator) — no estimate, not a zero.
    func stop() -> Result? {
        guard isRunning else { return nil }
        motion.stopDeviceMotionUpdates()
        queue.waitUntilAllOperationsAreFinished()
        isRunning = false
        endRound()
        lock.lock()
        defer { lock.unlock() }
        var payload: MotionTracePayload?
        if captureTrace, traceSamples > 0 {
            let bytes = trace.map { UInt8(bitPattern: $0) }
            payload = MotionTracePayload(
                hz: Int(Self.hz) / Self.traceEvery,
                channels: ["gx", "gy", "gz", "av"],
                scale: [0.1, 0.1, 0.1, 0.02],
                samples: traceSamples,
                b64: Data(bytes).base64EncodedString()
            )
            Self.traceSessionsLeft -= 1
        }
        return Result(total: total, perRound: perRound, trace: payload)
    }

    private func ingest(_ data: CMDeviceMotion) {
        let rate = [data.rotationRate.x, data.rotationRate.y, data.rotationRate.z]
        for i in 0..<3 {
            // High-pass: subtract a ~1 s moving baseline (slow arm drift).
            baseline[i] += 0.02 * (rate[i] - baseline[i])
            // Low-pass at roughly 6 Hz: a rope does not turn faster.
            band[i] += 0.45 * ((rate[i] - baseline[i]) - band[i])
            energy[i] += 0.01 * (band[i] * band[i] - energy[i])
        }
        // Follow the axis the wrist is actually circling on, with hysteresis
        // so two similar axes do not trade places mid-round.
        var best = axis
        for i in 0..<3 where energy[i] > energy[best] { best = i }
        if best != axis, energy[best] > energy[axis] * 1.5 {
            axis = best
            lastSign = 0
            cyclePeak = 0
        }

        let x = band[axis]
        cyclePeak = max(cyclePeak, abs(x))
        let sign = x > 0 ? 1 : (x < 0 ? -1 : lastSign)
        if sign != lastSign, lastSign != 0, sign > 0 {
            // One full cycle closed. A turn needs a real swing (≥ 0.6 rad/s,
            // and at least a third of what this session's turns look like)
            // and cannot follow the last one faster than a rope can spin.
            let threshold = max(0.6, amplitude * 0.35)
            let now = data.timestamp
            if cyclePeak >= threshold, now - lastCountAt >= 0.17 {
                lock.lock()
                if gateOpen {
                    total += 1
                    roundCount += 1
                }
                lock.unlock()
                lastCountAt = now
                amplitude += 0.1 * (cyclePeak - amplitude)
            }
            cyclePeak = 0
        }
        if sign != 0 { lastSign = sign }

        sampleIndex += 1
        guard captureTrace, sampleIndex % Self.traceEvery == 0 else { return }
        let limit = Self.traceSecondsLimit * Int(Self.hz) / Self.traceEvery
        lock.lock()
        if traceSamples < limit {
            // Vertical acceleration: the body's bounce, along gravity.
            let g = data.gravity
            let a = data.userAcceleration
            let vertical = a.x * g.x + a.y * g.y + a.z * g.z
            trace.append(Self.pack(rate[0], scale: 0.1))
            trace.append(Self.pack(rate[1], scale: 0.1))
            trace.append(Self.pack(rate[2], scale: 0.1))
            trace.append(Self.pack(vertical, scale: 0.02))
            traceSamples += 1
        }
        lock.unlock()
    }

    private static func pack(_ value: Double, scale: Double) -> Int8 {
        Int8(max(-127, min(127, (value / scale).rounded())))
    }
}
#endif
