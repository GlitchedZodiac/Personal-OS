// Heart-rate zones — served by GET /api/mobile/zones so a recalibration
// lands on every surface at once. Deliberately NOT hardcoded on the wrist:
// the boundaries are cached from the server after each fetch, and when no
// cache exists yet the zone surfaces stay quiet rather than invent numbers.

import Foundation

public struct HeartRateZones: Codable, Hashable, Sendable {
    /// Upper bound of Z1…Z4. Anything above the last top is Z5.
    public let tops: [Int]
    public let names: [String]

    public init(tops: [Int], names: [String]) {
        self.tops = tops
        self.names = names
    }

    /// 1-based zone index for a heart rate, nil when the boundaries are
    /// unusable (an empty payload should never silently read as "Z1").
    public func zone(for bpm: Double) -> Int? {
        guard !tops.isEmpty else { return nil }
        for (index, top) in tops.enumerated() where Int(bpm.rounded()) <= top {
            return index + 1
        }
        return tops.count + 1
    }

    public func name(_ zone: Int) -> String {
        names.indices.contains(zone - 1) ? names[zone - 1] : "Z\(zone)"
    }

    public var zoneCount: Int { tops.count + 1 }
}

/// Server response — `source` is informational (e.g. "strava-profile-age-
/// derived") and ignored on the wrist.
public struct ZonesResponse: Codable, Sendable {
    public let tops: [Int]
    public let names: [String]
    public let source: String?

    public var zones: HeartRateZones { HeartRateZones(tops: tops, names: names) }
}

/// Last-good boundaries, so a freestyle session recorded out of signal still
/// gets its time-in-zone.
public enum ZonesCache {
    private static let key = "zones.lastGood"

    public static func load() -> HeartRateZones? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(HeartRateZones.self, from: data)
    }

    public static func save(_ zones: HeartRateZones) {
        guard let data = try? JSONEncoder().encode(zones) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

// MARK: - Stream shaping

public enum StreamMath {
    /// Uniform-stride downsample to at most `limit` points, keeping the
    /// first and last samples so the session's real start and end survive.
    public static func downsample<T>(_ values: [T], limit: Int = 200) -> [T] {
        guard values.count > limit, limit > 1 else { return values }
        let stride = Double(values.count - 1) / Double(limit - 1)
        return (0..<limit).map { values[Int((Double($0) * stride).rounded())] }
    }

    /// Seconds spent in each zone, walking the HR/time streams pairwise: a
    /// sample owns the span until the next one. The tail sample gets the
    /// median gap so the last stretch isn't silently dropped.
    public static func timeInZones(
        hr: [Int], time: [Int], zones: HeartRateZones
    ) -> WorkoutZoneBreakdown? {
        guard hr.count == time.count, hr.count > 1, !zones.tops.isEmpty else { return nil }

        var seconds = [Int](repeating: 0, count: zones.zoneCount)
        var gaps: [Int] = []
        for index in 0..<(hr.count - 1) {
            let gap = max(time[index + 1] - time[index], 0)
            gaps.append(gap)
            if let zone = zones.zone(for: Double(hr[index])) {
                seconds[zone - 1] += gap
            }
        }
        let medianGap = gaps.sorted()[gaps.count / 2]
        if let lastZone = zones.zone(for: Double(hr[hr.count - 1])) {
            seconds[lastZone - 1] += medianGap
        }

        let total = seconds.reduce(0, +)
        guard total > 0 else { return nil }
        // Percent to one decimal, without Int division eating the fraction.
        let pct = seconds.map { (Double($0) / Double(total) * 1000).rounded() / 10 }
        return WorkoutZoneBreakdown(seconds: seconds, pct: pct, totalSeconds: total)
    }
}
