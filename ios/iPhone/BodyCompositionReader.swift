// Anchored weigh-in reader for the iOS companion.
//
// THE BUG THIS FIXES (found 2026-08-26). HealthStore only ever asked for
// samples between the start of today (or yesterday) and now. His scale writes
// to Apple Health when the VeSync app opens, and those samples carry their
// ORIGINAL date — so a batch that lands in HealthKit today but is dated last
// week fell outside every window the app ever queried and was unreachable
// forever. No amount of re-syncing could recover it.
//
// An HKAnchoredObjectQuery is ordered by INSERTION, not by sample date, and
// carries no upper date bound. Whatever HealthKit has received since our last
// anchor comes back regardless of how the samples are dated. That property is
// the entire repair.

#if os(iOS)
import Foundation
import HealthKit

/// Persists one HKQueryAnchor per type. Anchors are per-query-configuration,
/// so sharing one across types would be wrong.
enum HealthAnchorStore {
    private static func key(for id: HKQuantityTypeIdentifier) -> String {
        "health.anchor.\(id.rawValue)"
    }

    static func load(_ id: HKQuantityTypeIdentifier) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: key(for: id)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    static func save(_ anchor: HKQueryAnchor, for id: HKQuantityTypeIdentifier) {
        guard
            let data = try? NSKeyedArchiver.archivedData(
                withRootObject: anchor, requiringSecureCoding: true
            )
        else { return }
        UserDefaults.standard.set(data, forKey: key(for: id))
    }

    /// Clears every anchor and the backfill marker — the "re-run backfill"
    /// escape hatch. Safe: the server's near-twin rule absorbs everything that
    /// comes back as merges or duplicates, never new rows.
    static func reset() {
        let defaults = UserDefaults.standard
        for id in BodyCompositionReader.allTypes {
            defaults.removeObject(forKey: key(for: id))
        }
        defaults.removeObject(forKey: BodyCompositionReader.backfillDoneKey)
    }
}

/// One page of newly-seen samples plus the anchor that follows it.
struct AnchoredPage {
    let samples: [WeightSamplePayload]
    let orphanedComposition: Int
    let anchor: HKQueryAnchor?
    let isLastPage: Bool
}

enum BodyCompositionReader {
    static let backfillDoneKey = "health.backfill.v1.completedAt"

    /// Composition samples must be within this of the weigh-in AND from the
    /// same source to be treated as part of it.
    static let clusterWindow: TimeInterval = 120

    static let weightType = HKQuantityTypeIdentifier.bodyMass

    /// Reachable composition types, with the unit each one demands.
    ///
    /// bodyFatPercentage is the trap: HKUnit.percent() returns a FRACTION
    /// (0.23, not 23.0). Getting it backwards writes 0.2 into a column the
    /// Body screen charts as a percentage.
    static let compositionTypes: [HKQuantityTypeIdentifier] = [
        .bodyFatPercentage, .bodyMassIndex, .leanBodyMass, .waistCircumference,
    ]

    static var allTypes: [HKQuantityTypeIdentifier] {
        [weightType] + compositionTypes
    }

    static func unit(for id: HKQuantityTypeIdentifier) -> HKUnit {
        switch id {
        case .bodyFatPercentage: return .percent()
        case .bodyMassIndex: return .count()
        case .leanBodyMass, .bodyMass: return .gramUnit(with: .kilo)
        case .waistCircumference: return .meterUnit(with: .centi)
        default: return .count()
        }
    }

    // MARK: - Clustering

    /// Attach composition readings to the weigh-in they belong to.
    ///
    /// There is no HKCorrelation type for body composition (only food and
    /// blood pressure), so the clustering is manual: the scale writes one
    /// batch per weigh-in, and those samples share a source and a near-
    /// identical start date.
    ///
    /// Anchored on bodyMass — a composition reading with no weight cannot be
    /// stored, because weightKg is what drives the server's dedup rule.
    static func assemble(
        weights: [HKQuantitySample],
        composition: [HKQuantityTypeIdentifier: [HKQuantitySample]]
    ) -> (samples: [WeightSamplePayload], orphans: Int) {
        var claimed = Set<UUID>()
        var out: [WeightSamplePayload] = []

        for weight in weights.sorted(by: { $0.startDate < $1.startDate }) {
            let kg = (weight.quantity.doubleValue(for: .gramUnit(with: .kilo)) * 100)
                .rounded() / 100
            let source = weight.sourceRevision.source.bundleIdentifier

            func nearest(_ id: HKQuantityTypeIdentifier) -> Double? {
                let candidates = (composition[id] ?? [])
                    .filter {
                        !claimed.contains($0.uuid)
                            && $0.sourceRevision.source.bundleIdentifier == source
                            && abs($0.startDate.timeIntervalSince(weight.startDate))
                                <= clusterWindow
                    }
                    .sorted {
                        abs($0.startDate.timeIntervalSince(weight.startDate))
                            < abs($1.startDate.timeIntervalSince(weight.startDate))
                    }
                guard let best = candidates.first else { return nil }
                // Each composition sample is consumed once, so two weigh-ins
                // minutes apart cannot both claim the same body-fat reading.
                claimed.insert(best.uuid)
                return best.quantity.doubleValue(for: unit(for: id))
            }

            let fatFraction = nearest(.bodyFatPercentage)
            out.append(
                WeightSamplePayload(
                    measuredAt: weight.startDate,
                    weightKg: kg,
                    // ×100: HKUnit.percent() is a fraction.
                    bodyFatPct: fatFraction.map { ($0 * 1000).rounded() / 10 },
                    bmi: nearest(.bodyMassIndex).map { ($0 * 100).rounded() / 100 },
                    fatFreeWeightKg: nearest(.leanBodyMass).map { ($0 * 100).rounded() / 100 },
                    waistCm: nearest(.waistCircumference).map { ($0 * 10).rounded() / 10 },
                    heartRateBpm: nil
                )
            )
        }

        let total = composition.values.reduce(0) { $0 + $1.count }
        // A non-zero orphan count is the ONLY signal that clusterWindow is
        // wrong. Surfaced in the status line rather than silently discarded.
        return (out, total - claimed.count)
    }

    // MARK: - Anchored paging

    /// One page of whatever HealthKit has received since `anchor`, at ANY
    /// sample date. Composition for the page is fetched by date range around
    /// the weigh-ins it returned.
    @MainActor
    static func nextPage(
        store: HKHealthStore,
        anchor: HKQueryAnchor?,
        limit: Int = 200
    ) async throws -> AnchoredPage {
        let (weights, newAnchor, count) = try await anchoredWeights(
            store: store, anchor: anchor, limit: limit
        )

        guard !weights.isEmpty else {
            return AnchoredPage(
                samples: [], orphanedComposition: 0,
                anchor: newAnchor, isLastPage: true
            )
        }

        let earliest = weights.map(\.startDate).min()!.addingTimeInterval(-clusterWindow)
        let latest = weights.map(\.startDate).max()!.addingTimeInterval(clusterWindow)

        var composition: [HKQuantityTypeIdentifier: [HKQuantitySample]] = [:]
        for id in compositionTypes {
            composition[id] = try await samples(
                store: store, id: id, from: earliest, to: latest
            )
        }

        let assembled = assemble(weights: weights, composition: composition)
        return AnchoredPage(
            samples: assembled.samples,
            orphanedComposition: assembled.orphans,
            anchor: newAnchor,
            isLastPage: count < limit
        )
    }

    private static func anchoredWeights(
        store: HKHealthStore, anchor: HKQueryAnchor?, limit: Int
    ) async throws -> ([HKQuantitySample], HKQueryAnchor?, Int) {
        try await withCheckedThrowingContinuation { continuation in
            // No updateHandler: setting one converts this into a long-lived
            // query, which is not what a paging loop wants.
            let query = HKAnchoredObjectQuery(
                type: HKQuantityType(weightType),
                predicate: nil,
                anchor: anchor,
                limit: limit
            ) { query, added, _, newAnchor, error in
                store.stop(query)
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let samples = (added as? [HKQuantitySample]) ?? []
                continuation.resume(returning: (samples, newAnchor, added?.count ?? 0))
            }
            store.execute(query)
        }
    }

    private static func samples(
        store: HKHealthStore, id: HKQuantityTypeIdentifier, from: Date, to: Date
    ) async throws -> [HKQuantitySample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKQuantityType(id),
                predicate: HKQuery.predicateForSamples(withStart: from, end: to),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                // A read denial surfaces as an empty array, never an error.
                continuation.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            store.execute(query)
        }
    }
}
#endif
