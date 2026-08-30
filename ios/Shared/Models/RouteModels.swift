// GPS route types + the encoded-polyline writer.
//
// The app's activity detail reads `routeData.summaryPolyline` (the shape
// Strava imports use, decoded by lib/polyline.ts) — so watch-recorded routes
// render on the EXISTING map with no main-lane work. Raw `points` ride
// alongside for anything the server wants to compute later (splits, exact
// coordinates); analytics stay server-side per the streams contract.

import Foundation

public struct RoutePoint: Codable, Hashable, Sendable {
    public let lat: Double
    public let lng: Double
    public let alt: Double?
    /// Elapsed seconds from workout start (parallel to timeStream's clock).
    public let t: Int

    public init(lat: Double, lng: Double, alt: Double?, t: Int) {
        self.lat = lat
        self.lng = lng
        self.alt = alt
        self.t = t
    }
}

public struct WorkoutRouteData: Codable, Hashable, Sendable {
    /// Google/Strava encoded polyline (precision 5).
    public let summaryPolyline: String
    public let points: [RoutePoint]
    public let source: String

    public init(summaryPolyline: String, points: [RoutePoint], source: String = "apple_watch_gps") {
        self.summaryPolyline = summaryPolyline
        self.points = points
        self.source = source
    }
}

public enum Polyline {
    /// Encode coordinates with the standard precision-5 polyline algorithm —
    /// the exact format `decodePolyline` in lib/polyline.ts expects.
    public static func encode(_ coordinates: [(lat: Double, lng: Double)]) -> String {
        var output = ""
        var previousLat = 0
        var previousLng = 0

        for coordinate in coordinates {
            let lat = Int((coordinate.lat * 1e5).rounded())
            let lng = Int((coordinate.lng * 1e5).rounded())
            output += encodeValue(lat - previousLat)
            output += encodeValue(lng - previousLng)
            previousLat = lat
            previousLng = lng
        }
        return output
    }

    private static func encodeValue(_ value: Int) -> String {
        var v = value < 0 ? ~(value << 1) : (value << 1)
        var chunk = ""
        while v >= 0x20 {
            let next = (0x20 | (v & 0x1f)) + 63
            chunk.append(Character(UnicodeScalar(UInt8(next))))
            v >>= 5
        }
        chunk.append(Character(UnicodeScalar(UInt8(v + 63))))
        return chunk
    }

    /// Decode a precision-5 polyline — the saved-trail ghost line on the
    /// Round 3 live map draws a server `summaryPolyline` this way.
    public static func decode(_ encoded: String) -> [(lat: Double, lng: Double)] {
        var coordinates: [(lat: Double, lng: Double)] = []
        var index = encoded.startIndex
        var lat = 0
        var lng = 0

        func nextValue() -> Int? {
            var result = 0
            var shift = 0
            while index < encoded.endIndex {
                let byte = Int(encoded[index].asciiValue ?? 63) - 63
                index = encoded.index(after: index)
                result |= (byte & 0x1f) << shift
                shift += 5
                if byte < 0x20 {
                    return (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
                }
            }
            return nil
        }

        while index < encoded.endIndex {
            guard let dLat = nextValue(), let dLng = nextValue() else { break }
            lat += dLat
            lng += dLng
            coordinates.append((lat: Double(lat) / 1e5, lng: Double(lng) / 1e5))
        }
        return coordinates
    }
}
