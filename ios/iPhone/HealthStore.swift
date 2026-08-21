// HealthKit → Pitaya daily sync (iOS companion). Reads what the watch and
// his scale write into Apple Health and posts the daily snapshot to
// POST /api/mobile/health/daily — foreground on launch, background via
// HKObserverQuery + background delivery. v1 mapping per the companion
// contract: steps/RHR/activeEnergy/distance in dedicated fields; sleep
// minutes, HRV ms, and weight kg inside rawData until the main lane's
// columns ship (announced 2026-08-11).

#if os(iOS)
import Foundation
import HealthKit

@MainActor
public final class HealthSyncManager: ObservableObject {
    public enum Status: Equatable {
        case notAsked, authorized, denied, unavailable
    }

    @Published public private(set) var status: Status = .notAsked
    @Published public private(set) var lastSyncAt: Date?
    @Published public private(set) var lastResult: String?

    private let store = HKHealthStore()
    private let api: MobileAPIClient
    private var observersStarted = false

    private var readTypes: Set<HKObjectType> {
        [
            HKQuantityType(.stepCount),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.bodyMass),
            HKCategoryType(.sleepAnalysis),
        ]
    }

    public init(api: MobileAPIClient) {
        self.api = api
    }

    public func bootstrap() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            status = .unavailable
            return
        }
        // BUG (fixed 2026-08-17): this used to test
        // `authorizationStatus(for:) != .notDetermined`, which can NEVER be
        // true here — that call reports SHARE (write) permission, and we
        // request read-only, so it returns .notDetermined forever. The app
        // therefore never resumed silently: background delivery was never
        // started and no sync ran until the Allow button was tapped again,
        // every launch. statusForAuthorizationRequest is the supported way
        // to ask "have I already prompted?".
        let alreadyAsked = (try? await store.statusForAuthorizationRequest(
            toShare: [], read: readTypes
        )) == .unnecessary

        if alreadyAsked || UserDefaults.standard.bool(forKey: "health.granted") {
            status = .authorized
            startObserversAndDeliver()
            await syncNow()
        }
    }

    public func requestAccess() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            status = .unavailable
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            status = .authorized
            UserDefaults.standard.set(true, forKey: "health.granted")
            startObserversAndDeliver()
            await syncNow()
        } catch {
            status = .denied
            lastResult = "Health access failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Background delivery

    private func startObserversAndDeliver() {
        guard !observersStarted else { return }
        observersStarted = true

        let sampleTypes: [HKSampleType] = [
            HKQuantityType(.stepCount),
            HKQuantityType(.bodyMass),
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.heartRateVariabilitySDNN),
        ]

        for type in sampleTypes {
            let query = HKObserverQuery(sampleType: type, predicate: nil) {
                [weak self] _, completion, _ in
                Task { @MainActor in
                    await self?.syncNow()
                    completion()
                }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    // MARK: - Snapshot & post

    /// Posts today and (once per launch) yesterday, so late-arriving data —
    /// overnight sleep, a morning weigh-in synced late — lands on the right
    /// day.
    private var postedYesterdayThisLaunch = false

    public func syncNow() async {
        guard status == .authorized else { return }
        do {
            let today = try await postSnapshot(daysAgo: 0)
            if !postedYesterdayThisLaunch {
                postedYesterdayThisLaunch = true
                _ = try? await postSnapshot(daysAgo: 1)
            }
            lastSyncAt = Date()
            lastResult = today
        } catch {
            lastResult = "Sync failed: \(error.localizedDescription)"
        }
    }

    private func postSnapshot(daysAgo: Int) async throws -> String {
        let calendar = Calendar.current
        let timeZone = TimeZone.current
        let day = calendar.startOfDay(
            for: calendar.date(byAdding: .day, value: -daysAgo, to: Date()) ?? Date()
        )
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: day) ?? Date()
        let now = min(dayEnd, Date())

        let steps = try await sum(.stepCount, unit: .count(), from: day, to: now)
        let energy = try await sum(.activeEnergyBurned, unit: .kilocalorie(), from: day, to: now)
        let distance = try await sum(.distanceWalkingRunning, unit: .meter(), from: day, to: now)
        let restingHR = try await latest(
            .restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()),
            from: day, to: now
        )
        let hrv = try await latest(
            .heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli),
            from: day, to: now
        )
        // Every body-mass reading of the day, with its real timestamp — not
        // just the latest. The server dedups by near-twin rule, so sending
        // all of them can only add missing weigh-ins.
        let weights = try await weightSamples(from: day, to: now)
        let sleep = await sleepBreakdown(endingOn: day)

        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"

        let payload = DailyHealthSnapshotPayload(
            localDate: formatter.string(from: day),
            timeZone: timeZone.identifier,
            steps: Int(steps),
            restingHeartRateBpm: restingHR.map { Int($0.rounded()) },
            activeEnergyKcal: energy > 0 ? energy : nil,
            walkingRunningDistanceMeters: distance > 0 ? distance : nil,
            sleepMinutes: sleep.map { Int($0.total.rounded()) },
            sleepDeepMinutes: sleep.flatMap { $0.deep > 0 ? Int($0.deep.rounded()) : nil },
            sleepRemMinutes: sleep.flatMap { $0.rem > 0 ? Int($0.rem.rounded()) : nil },
            hrvMs: hrv.map { ($0 * 10).rounded() / 10 },
            weightSamples: weights.isEmpty ? nil : weights
        )
        try await api.syncDailyHealth(payload)

        // Diagnostics visible in the companion's Settings row: this is how we
        // tell "no sleep data exists" (watch not worn overnight) apart from
        // "sleep is broken" — the 2026-08-14 open question.
        var parts = ["\(payload.steps) steps"]
        if let weight = weights.last { parts.append("\(weight.weightKg) kg") }
        if let minutes = payload.sleepMinutes {
            parts.append("\(minutes) min sleep")
        } else {
            parts.append("no sleep samples")
        }
        if let hrvValue = payload.hrvMs { parts.append("HRV \(hrvValue)") }
        return "Synced \(payload.localDate): " + parts.joined(separator: " · ")
    }

    private struct SleepBreakdown {
        let total: Double
        let deep: Double
        let rem: Double
    }

    /// Asleep minutes for the night ENDING on `day` — samples between the
    /// previous day's 6 pm and this day's 6 pm, asleep stages only, split by
    /// stage. nil means HealthKit holds no asleep samples in that window at
    /// all (the watch wasn't worn, or it was on the charger).
    private func sleepBreakdown(endingOn day: Date) async -> SleepBreakdown? {
        let calendar = Calendar.current
        guard
            let windowStart = calendar.date(byAdding: .hour, value: -6, to: day),
            let windowEnd = calendar.date(byAdding: .hour, value: 18, to: day)
        else { return nil }

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKCategoryType(.sleepAnalysis),
                predicate: HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                var total = 0.0, deep = 0.0, rem = 0.0
                for sample in (samples as? [HKCategorySample]) ?? [] {
                    let seconds = sample.endDate.timeIntervalSince(sample.startDate)
                    switch HKCategoryValueSleepAnalysis(rawValue: sample.value) {
                    case .asleepDeep: deep += seconds; total += seconds
                    case .asleepREM: rem += seconds; total += seconds
                    case .asleepCore, .asleepUnspecified: total += seconds
                    default: break // inBed / awake don't count
                    }
                }
                continuation.resume(
                    returning: total > 0
                        ? SleepBreakdown(total: total / 60, deep: deep / 60, rem: rem / 60)
                        : nil
                )
            }
            store.execute(query)
        }
    }

    private func weightSamples(from: Date, to: Date) async throws -> [WeightSamplePayload] {
        try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
            let query = HKSampleQuery(
                sampleType: HKQuantityType(.bodyMass),
                predicate: HKQuery.predicateForSamples(withStart: from, end: to),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let readings = (samples as? [HKQuantitySample])?.map {
                    WeightSamplePayload(
                        measuredAt: $0.startDate,
                        weightKg: ($0.quantity.doubleValue(for: .gramUnit(with: .kilo)) * 100)
                            .rounded() / 100
                    )
                } ?? []
                continuation.resume(returning: readings)
            }
            store.execute(query)
        }
    }

    private func sum(
        _ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date
    ) async throws -> Double {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: HKQuantityType(id),
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from, end: to),
                options: .cumulativeSum
            ) { _, result, error in
                if let error, (error as? HKError)?.code != .errorNoData {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(
                    returning: result?.sumQuantity()?.doubleValue(for: unit) ?? 0
                )
            }
            store.execute(query)
        }
    }

    private func latest(
        _ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date
    ) async throws -> Double? {
        try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: HKQuantityType(id),
                predicate: HKQuery.predicateForSamples(withStart: from, end: to),
                limit: 1,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let sample = samples?.first as? HKQuantitySample
                continuation.resume(returning: sample?.quantity.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }
}
#endif
