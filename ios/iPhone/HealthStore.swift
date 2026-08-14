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
        // If any type is already determined we were granted before —
        // resume silently; otherwise wait for the explicit user action.
        let stepStatus = store.authorizationStatus(for: HKQuantityType(.stepCount))
        if stepStatus != .notDetermined {
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
        let weight = try await latest(.bodyMass, unit: .gramUnit(with: .kilo), from: day, to: now)
        let sleepMin = await sleepMinutes(endingOn: day)

        var raw: [String: Double] = [:]
        if let sleep = sleepMin, sleep > 0 { raw["sleepMinutes"] = (sleep).rounded() }
        if let hrvValue = hrv { raw["hrvMs"] = (hrvValue * 10).rounded() / 10 }
        if let weightKg = weight { raw["weightKg"] = (weightKg * 100).rounded() / 100 }

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
            rawData: raw.isEmpty ? nil : raw
        )
        try await api.syncDailyHealth(payload)

        var parts = ["\(payload.steps) steps"]
        if let weightValue = raw["weightKg"] { parts.append("\(weightValue) kg") }
        if let sleep = raw["sleepMinutes"] { parts.append("\(Int(sleep)) min sleep") }
        return "Synced \(payload.localDate): " + parts.joined(separator: " · ")
    }

    /// Asleep minutes for the night ENDING on `day` — samples between the
    /// previous day's 6 pm and this day's 6 pm, asleep stages only.
    private func sleepMinutes(endingOn day: Date) async -> Double? {
        let calendar = Calendar.current
        guard
            let windowStart = calendar.date(byAdding: .hour, value: -6, to: day),
            let windowEnd = calendar.date(byAdding: .hour, value: 18, to: day)
        else { return nil }

        return await withCheckedContinuation { continuation in
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue,
            ]
            let query = HKSampleQuery(
                sampleType: HKCategoryType(.sleepAnalysis),
                predicate: HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                let total = (samples as? [HKCategorySample])?
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } ?? 0
                continuation.resume(returning: total > 0 ? total / 60 : nil)
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
