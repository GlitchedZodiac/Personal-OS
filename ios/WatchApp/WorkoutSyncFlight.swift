// One process-wide gate for every workout-queue drain. @MainActor serialises
// CODE but every `await` is a suspension point, so two drains interleave
// freely — the bug class that cost 857 duplicate weigh-in rows on the phone
// (see ios/iPhone/HealthStore.swift syncTask). On the wrist the drain had
// FOUR entry points sharing one queue file: AppModel.drainQueue from Save,
// bootstrap, and the background refresh, plus the model-less
// PitayaBackgroundRefresh.drainStandalone on cold wakes. Overlapping drains
// loaded the same pending items and POSTed them twice — the sporadic
// duplicate saves.
//
// Callers SERIALISE rather than coalesce: a Save that enqueues while a
// background drain is mid-flight still gets its own follow-up flight, which
// re-loads the queue and carries the new item (or no-ops on an empty queue).
// The server's unique (externalSource, externalId) upsert is the backstop
// either way; this gate keeps the device from ever needing it.

#if os(watchOS)
import Foundation

enum WorkoutSyncFlight {
    struct Outcome {
        /// Non-nil when THIS flight pushed items and holds the server response.
        var response: WorkoutSyncResponse?
        /// Items still on disk after the flight (network/server failure).
        var pendingCount: Int
    }

    @MainActor private static var current: Task<Outcome, Never>?

    @MainActor
    static func run(queue: OfflineWorkoutQueue, api: MobileAPIClient) async -> Outcome {
        // Wait out every in-flight drain. `while`, not `if`: when several
        // joiners wake, only the one that observes nil becomes the next
        // leader; the rest loop back to waiting.
        while let running = current {
            _ = await running.value
        }
        // No await between the check above and this assignment — that gap is
        // the entire bug.
        let flight = Task { () -> Outcome in
            let pending = await queue.load()
            guard !pending.isEmpty else { return Outcome(response: nil, pendingCount: 0) }
            do {
                let response = try await api.syncWorkouts(pending)
                try? await queue.removeSynced(pending)
                return Outcome(response: response, pendingCount: 0)
            } catch {
                return Outcome(response: nil, pendingCount: pending.count)
            }
        }
        current = flight
        let outcome = await flight.value
        current = nil
        return outcome
    }
}
#endif
