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
        /// Connected, but readTypes has grown since he last granted access —
        /// body composition was added 2026-08-26. Without this state the app
        /// could NEVER re-ask: bootstrap set .authorized from a stored flag and
        /// the Connect button only showed for .notAsked.
        case needsMoreTypes
    }

    public enum BackfillState: Equatable {
        case idle, running(sent: Int), done(total: Int), failed(String)
    }

    @Published public private(set) var status: Status = .notAsked
    @Published public private(set) var lastSyncAt: Date?
    @Published public private(set) var lastResult: String?
    /// Split out so a failure is not overwritten by the next partial success.
    @Published public private(set) var lastError: String?
    @Published public private(set) var backfill: BackfillState = .idle
    @Published public private(set) var backgroundDeliveryNote: String?

    /// Bump when readTypes grows, so an existing install re-prompts.
    private static let requestedTypesVersion = 2
    private static let versionKey = "health.requestedTypes.version"

    private let store = HKHealthStore()
    private let api: MobileAPIClient
    private var observersStarted = false

    /// The set as it stood before 2026-08-26. Load-bearing: it is what tells us
    /// "he has granted this app Health access at some point", independently of
    /// whether he has seen the newer types yet.
    ///
    /// REGRESSION THIS EXISTS TO PREVENT (caught on device the same day):
    /// bootstrap() derived `alreadyAsked` from statusForAuthorizationRequest
    /// over the FULL read set. Adding four types flipped that call from
    /// .unnecessary to .shouldRequest, so `alreadyAsked` became false, the
    /// guard fell through to the `health.granted` UserDefaults flag, and on an
    /// install where that flag was never written the whole sync silently
    /// stopped — no snapshot, no weigh-ins, no error he would ever see.
    private var coreReadTypes: Set<HKObjectType> {
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

    private var readTypes: Set<HKObjectType> {
        coreReadTypes.union([
            // Added 2026-08-26. His Etekcity scale has been writing these into
            // Apple Health all along and the app never asked for them, so every
            // body-fat and BMI reading was thrown away.
            HKQuantityType(.bodyFatPercentage),
            HKQuantityType(.bodyMassIndex),
            HKQuantityType(.leanBodyMass),
            HKQuantityType(.waistCircumference),
        ])
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
        // Has he EVER granted this app Health access? Asked against the core
        // set, so growing readTypes can never make this answer flip to "no".
        let everGranted = (try? await store.statusForAuthorizationRequest(
            toShare: [], read: coreReadTypes
        )) == .unnecessary

        // Has he seen the CURRENT set, including the composition types?
        let sawCurrentSet = (try? await store.statusForAuthorizationRequest(
            toShare: [], read: readTypes
        )) == .unnecessary

        let granted = UserDefaults.standard.bool(forKey: "health.granted")
        let versionSeen = UserDefaults.standard.integer(forKey: Self.versionKey)

        guard everGranted || granted else {
            status = .notAsked
            return
        }

        // Self-healing: growing readTypes automatically puts an existing
        // install into needsMoreTypes so it can be re-prompted — which it
        // otherwise never could, since the Connect button only shows for
        // .notAsked. Sync still runs in this state; the core types were
        // already granted and only the new ones come back empty.
        status = (sawCurrentSet && versionSeen >= Self.requestedTypesVersion)
            ? .authorized
            : .needsMoreTypes

        // Backfill the flag for installs that granted access before it existed,
        // so this never depends on statusForAuthorizationRequest again.
        if everGranted && !granted {
            UserDefaults.standard.set(true, forKey: "health.granted")
        }

        startObserversAndDeliver()
        await syncNow()
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
            UserDefaults.standard.set(Self.requestedTypesVersion, forKey: Self.versionKey)
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
            store.enableBackgroundDelivery(for: type, frequency: .hourly) {
                [weak self] ok, error in
                guard !ok, let error else { return }
                Task { @MainActor in
                    // This error was discarded with `{ _, _ in }` and the
                    // failure was invisible. It fails because
                    // com.apple.developer.healthkit.background-delivery is not
                    // in the entitlements — and a FREE personal team cannot
                    // sign it (same block as APNs and app groups). Do NOT add
                    // it to project.yml: an unsignable entitlement breaks
                    // provisioning outright.
                    self?.backgroundDeliveryNote =
                        "Background sync needs the paid Apple Developer Program. "
                        + "Pitaya syncs every time you open it. (\(error.localizedDescription))"
                }
            }
        }
    }

    // MARK: - Snapshot & post

    /// Posts today and (once per launch) yesterday, so late-arriving data —
    /// overnight sleep, a morning weigh-in synced late — lands on the right
    /// day.
    private var postedYesterdayThisLaunch = false

    /// Re-entrancy guard. @MainActor serialises the CODE but every `await` is a
    /// suspension point, so two syncNow() tasks interleave freely.
    ///
    /// THIS COST 857 DUPLICATE ROWS on 2026-08-26. startObserversAndDeliver()
    /// registers HKObserverQuery handlers that call syncNow(), and the
    /// scenePhase .active hook calls it too — so on launch several drains ran
    /// at once, each read the SAME unsaved anchor, each fetched the same page,
    /// and each POSTed it. The server's near-twin rule cannot save you here:
    /// its range query runs before the other in-flight request has committed,
    /// so every racer sees an empty window and inserts.
    private var syncTask: Task<Void, Never>?

    /// Coalescing entry point: a sync already in flight is awaited rather than
    /// duplicated. Every caller (bootstrap, observers, scenePhase, the Sync now
    /// button) goes through here.
    public func syncNow() async {
        if let running = syncTask {
            await running.value
            return
        }
        let task = Task { @MainActor [weak self] in
            await self?.performSync()
        }
        syncTask = task
        await task.value
        syncTask = nil
    }

    private func performSync() async {
        guard status == .authorized || status == .needsMoreTypes else { return }
        do {
            let today = try await postSnapshot(daysAgo: 0)
            if !postedYesterdayThisLaunch {
                // Set only on SUCCESS. It used to be set before the attempt,
                // so one failure meant yesterday was never retried this launch.
                if (try? await postSnapshot(daysAgo: 1)) != nil {
                    postedYesterdayThisLaunch = true
                }
            }

            // The real repair: drain everything HealthKit has received since
            // our anchor, at ANY sample date. A weigh-in VeSync back-dates to
            // last week arrives here even though no day-window would find it.
            let drained = await drainWeighIns()

            lastSyncAt = Date()
            lastError = nil
            lastResult = drained.isEmpty ? today : "\(today) · \(drained)"
        } catch {
            lastError = "Sync failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Anchored weigh-in drain + backfill

    private static let pageLimit = 200
    private static let maxPagesPerRun = 40

    /// Pages the anchored query until it runs dry, posting each page and
    /// advancing the anchor ONLY after the post succeeds.
    @discardableResult
    private func drainWeighIns() async -> String {
        var imported = 0, merged = 0, skipped = 0, orphans = 0, pages = 0
        let firstRun = UserDefaults.standard.object(forKey: BodyCompositionReader.backfillDoneKey) == nil
        if firstRun { backfill = .running(sent: 0) }

        while pages < Self.maxPagesPerRun {
            pages += 1
            do {
                let page = try await BodyCompositionReader.nextPage(
                    store: store,
                    anchor: HealthAnchorStore.load(BodyCompositionReader.weightType),
                    limit: Self.pageLimit
                )
                orphans += page.orphanedComposition

                if !page.samples.isEmpty {
                    let result = try await api.postBodySamples(page.samples)
                    imported += result.imported ?? 0
                    merged += result.merged ?? 0
                    skipped += result.skipped ?? 0
                    if firstRun { backfill = .running(sent: imported + merged + skipped) }
                }

                // ORDER MATTERS: saving the anchor before a successful post
                // would permanently orphan this page on a network blip.
                if let anchor = page.anchor {
                    HealthAnchorStore.save(anchor, for: BodyCompositionReader.weightType)
                }
                if page.isLastPage { break }
            } catch {
                if firstRun { backfill = .failed(error.localizedDescription) }
                lastError = "Weigh-in sync failed: \(error.localizedDescription)"
                return ""
            }
        }

        if firstRun {
            UserDefaults.standard.set(Date(), forKey: BodyCompositionReader.backfillDoneKey)
            backfill = .done(total: imported + merged)
        }

        var parts: [String] = []
        if imported > 0 { parts.append("\(imported) new weigh-in\(imported == 1 ? "" : "s")") }
        if merged > 0 { parts.append("\(merged) enriched") }
        if imported == 0 && merged == 0 && skipped > 0 { parts.append("\(skipped) already known") }
        // A non-zero orphan count is the only signal the 120s cluster window
        // is wrong. Say it rather than silently dropping the readings.
        if orphans > 0 { parts.append("\(orphans) composition sample\(orphans == 1 ? "" : "s") unmatched") }
        return parts.joined(separator: " · ")
    }

    /// Clears anchors + the backfill marker and re-reads everything. Safe: the
    /// server's near-twin rule absorbs it all as merges or duplicates.
    public func rerunBackfill() async {
        HealthAnchorStore.reset()
        backfill = .idle
        await syncNow()
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
        // "no weigh-ins" is stated, not implied by absence — the old line just
        // omitted weight when there were none, so a broken weight sync looked
        // exactly like a working one. Same instinct as "no sleep samples".
        if let weight = weights.last {
            parts.append("\(weight.weightKg) kg")
        } else {
            parts.append("no weigh-ins today")
        }
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
