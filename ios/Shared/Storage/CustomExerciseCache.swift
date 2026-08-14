// Disk cache for AI-created custom exercises (GET /api/mobile/exercises) so
// the picker/normalizer knows them on offline cold-starts. Synchronous by
// design — loaded once during AppModel init.

import Foundation

public final class CustomExerciseCache {
    private let fileURL: URL

    public init(filename: String = "custom-exercises.json") throws {
        let supportURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        fileURL = supportURL.appendingPathComponent(filename)
    }

    public func load() -> [ExerciseDef]? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode([ExerciseDef].self, from: data)
    }

    public func save(_ defs: [ExerciseDef]) {
        if let data = try? JSONEncoder().encode(defs) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}
