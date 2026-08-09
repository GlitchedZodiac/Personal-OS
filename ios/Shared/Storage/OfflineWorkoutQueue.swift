// Offline-first sync queue: finished workouts persist to Application Support
// immediately and drain to POST /api/mobile/workouts/sync whenever the watch
// has connectivity. Upsert key is (externalSource, externalId) — the server
// dedupes on the same pair, so re-syncing after a half-failed drain is safe.

import Foundation

public actor OfflineWorkoutQueue {
    private let fileURL: URL
    private let encoder = PitayaJSON.encoder()
    private let decoder = PitayaJSON.decoder()

    public init(filename: String = "offline-workout-queue.json") throws {
        let supportURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        fileURL = supportURL.appendingPathComponent(filename)
    }

    public func load() -> [WorkoutSyncItem] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? decoder.decode([WorkoutSyncItem].self, from: data)) ?? []
    }

    public func enqueue(_ item: WorkoutSyncItem) throws {
        var items = load()
        if let index = items.firstIndex(where: {
            $0.externalId == item.externalId && $0.externalSource == item.externalSource
        }) {
            items[index] = item
        } else {
            items.append(item)
        }
        try persist(items)
    }

    public func removeSynced(_ items: [WorkoutSyncItem]) throws {
        let keys = Set(items.map { "\($0.externalSource)|\($0.externalId)" })
        let remaining = load().filter { !keys.contains("\($0.externalSource)|\($0.externalId)") }
        try persist(remaining)
    }

    public func count() -> Int { load().count }

    private func persist(_ items: [WorkoutSyncItem]) throws {
        let data = try encoder.encode(items)
        try data.write(to: fileURL, options: .atomic)
    }
}
