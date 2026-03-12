#if canImport(HealthKit)
import Foundation
import HealthKit

public final class HealthStore {
    public let store = HKHealthStore()

    public init() {}

    public func requestAuthorization() async throws {
        let readTypes: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.workoutType()
        ]

        try await withCheckedThrowingContinuation { continuation in
            store.requestAuthorization(toShare: [], read: readTypes) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: NSError(domain: "HealthStore", code: 1))
                }
            }
        }
    }

    public func dailySnapshot(for startDate: Date, endDate: Date, timeZone: TimeZone) async throws -> DailyHealthSnapshotPayload {
        let steps = try await sumQuantity(.stepCount, unit: .count(), startDate: startDate, endDate: endDate)
        let activeEnergy = try await sumQuantity(.activeEnergyBurned, unit: .kilocalorie(), startDate: startDate, endDate: endDate)
        let walkingDistance = try await sumQuantity(.distanceWalkingRunning, unit: .meter(), startDate: startDate, endDate: endDate)
        let restingHeartRate = try await latestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), startDate: startDate, endDate: endDate)

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"

        return DailyHealthSnapshotPayload(
            localDate: formatter.string(from: startDate),
            timeZone: timeZone.identifier,
            steps: Int(steps),
            restingHeartRateBpm: restingHeartRate.map { Int($0.rounded()) },
            activeEnergyKcal: activeEnergy,
            walkingRunningDistanceMeters: walkingDistance
        )
    }

    private func sumQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        startDate: Date,
        endDate: Date
    ) async throws -> Double {
        let type = HKQuantityType.quantityType(forIdentifier: identifier)!
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let value = result?.sumQuantity()?.doubleValue(for: unit) ?? 0
                continuation.resume(returning: value)
            }

            store.execute(query)
        }
    }

    private func latestQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        startDate: Date,
        endDate: Date
    ) async throws -> Double? {
        let type = HKQuantityType.quantityType(forIdentifier: identifier)!
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let sample = samples?.first as? HKQuantitySample
                continuation.resume(returning: sample?.quantity.doubleValue(for: unit))
            }

            store.execute(query)
        }
    }
}
#endif
