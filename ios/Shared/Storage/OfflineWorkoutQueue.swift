import Foundation

public actor OfflineWorkoutQueue {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(filename: String = "offline-workout-queue.json") throws {
        let supportURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        fileURL = supportURL.appendingPathComponent(filename)
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func load() -> [MobileWorkoutPayload] {
        guard let data = try? Data(contentsOf: fileURL) else {
            return []
        }

        return (try? decoder.decode([MobileWorkoutPayload].self, from: data)) ?? []
    }

    public func enqueue(_ payload: MobileWorkoutPayload) throws {
        var items = load()

        if let index = items.firstIndex(where: { $0.externalId == payload.externalId && $0.externalSource == payload.externalSource }) {
            items[index] = payload
        } else {
            items.append(payload)
        }

        try persist(items)
    }

    public func removeSynced(_ payloads: [MobileWorkoutPayload]) throws {
        let keys = Set(payloads.map { "\($0.externalSource)|\($0.externalId)" })
        let remaining = load().filter { !keys.contains("\($0.externalSource)|\($0.externalId)") }
        try persist(remaining)
    }

    private func persist(_ items: [MobileWorkoutPayload]) throws {
        let data = try encoder.encode(items)
        try data.write(to: fileURL, options: .atomic)
    }
}
