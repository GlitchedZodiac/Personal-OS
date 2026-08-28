// GPS route recording for outdoor sessions — the Strava-replacement piece
// (Phase 3.5). CoreLocation feeds two consumers: HKWorkoutRouteBuilder (so
// the route lands in Apple Health alongside the workout) and our own point
// buffer (encoded to a polyline for Pitaya's existing map surface).
//
// Accuracy discipline: samples with bad horizontal accuracy or stale
// timestamps are dropped, and distance only accumulates between accepted
// fixes — a wandering fix at the trailhead shouldn't invent kilometres.

#if os(watchOS)
import CoreLocation
import Foundation
import HealthKit

@MainActor
public final class RouteTracker: NSObject, ObservableObject {
    @Published public private(set) var hasFix = false
    @Published public private(set) var isAuthorized = false
    @Published public private(set) var distanceMeters: Double = 0
    /// Recent track in map order — the live preview draws this.
    @Published public private(set) var coordinates: [CLLocationCoordinate2D] = []

    private let manager = CLLocationManager()
    private var routeBuilder: HKWorkoutRouteBuilder?
    private var startedAt: Date?
    private var lastAccepted: CLLocation?
    private var points: [RoutePoint] = []

    /// Fixes worse than this (metres) are ignored for distance and route.
    private let accuracyCeiling: CLLocationAccuracy = 50

    public override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .fitness
    }

    public func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    public func start(store: HKHealthStore, at startedAt: Date) {
        self.startedAt = startedAt
        points = []
        coordinates = []
        distanceMeters = 0
        lastAccepted = nil
        hasFix = false

        routeBuilder = HKWorkoutRouteBuilder(healthStore: store, device: nil)
        requestAuthorization()
        // Only claim background updates when the bundle actually declares the
        // capability — CoreLocation throws (not returns) otherwise, and a
        // crash mid-walk would lose the session.
        if Self.declaresLocationBackgroundMode {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.startUpdatingLocation()
    }

    private static let declaresLocationBackgroundMode: Bool = {
        for key in ["UIBackgroundModes", "WKBackgroundModes"] {
            if let modes = Bundle.main.object(forInfoDictionaryKey: key) as? [String],
               modes.contains("location") {
                return true
            }
        }
        return false
    }()

    public func stop() {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        hasFix = false
    }

    /// Attach the recorded route to the saved workout (Apple Health) and
    /// hand back the payload for Pitaya's sync.
    public func finish(for workout: HKWorkout?) async -> WorkoutRouteData? {
        stop()
        guard !points.isEmpty else { return nil }

        // Attaching the route to Apple Health is a nice-to-have; Pitaya's own
        // payload is the product. HealthKit's finishRoute can stall (seen
        // hanging a whole save in the simulator), so it gets a deadline and
        // the workout saves regardless.
        if let workout, let routeBuilder {
            let attach = Task { try await routeBuilder.finishRoute(with: workout, metadata: nil) }
            let deadline = Task {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                attach.cancel()
            }
            _ = try? await attach.value
            deadline.cancel()
        }
        self.routeBuilder = nil

        let polyline = Polyline.encode(points.map { (lat: $0.lat, lng: $0.lng) })
        // Raw points at ~1 per 5 s keep the payload sane on long hikes; the
        // polyline keeps full fidelity for the map. (lastT is optional on
        // purpose — seeding it with Int.min overflowed the subtraction and
        // crashed the save, caught in sim 2026-08-11.)
        var sampled: [RoutePoint] = []
        var lastT: Int?
        for point in points {
            let dueBySpacing = lastT.map { point.t - $0 >= 5 } ?? true
            if dueBySpacing {
                sampled.append(point)
                lastT = point.t
            }
        }
        if let final = points.last, sampled.last?.t != final.t {
            sampled.append(final)
        }
        let result = WorkoutRouteData(summaryPolyline: polyline, points: sampled)

        // The tracker outlives the session. Clearing here (not just on the
        // next outdoor start) means a finished trail can never be handed out
        // twice — the leak that stamped a walk's route onto the freestyle
        // sessions that followed it.
        points = []
        coordinates = []
        distanceMeters = 0
        lastAccepted = nil
        self.startedAt = nil

        return result
    }

    // MARK: - Ingest

    fileprivate func ingest(_ locations: [CLLocation]) {
        guard let startedAt else { return }
        for location in locations {
            guard
                location.horizontalAccuracy > 0,
                location.horizontalAccuracy <= accuracyCeiling,
                location.timestamp >= startedAt.addingTimeInterval(-2)
            else { continue }

            if let previous = lastAccepted {
                let step = location.distance(from: previous)
                // Ignore sub-metre jitter while standing still.
                if step >= 1 { distanceMeters += step }
            }
            lastAccepted = location
            hasFix = true

            points.append(RoutePoint(
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                alt: location.verticalAccuracy > 0 ? location.altitude : nil,
                t: max(0, Int(location.timestamp.timeIntervalSince(startedAt)))
            ))
            coordinates.append(location.coordinate)
        }

        let accepted = locations.filter {
            $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= accuracyCeiling
        }
        if !accepted.isEmpty, let routeBuilder {
            routeBuilder.insertRouteData(accepted) { _, _ in }
        }
    }

    fileprivate func updateAuthorization(_ status: CLAuthorizationStatus) {
        isAuthorized = status == .authorizedWhenInUse || status == .authorizedAlways
    }
}

extension RouteTracker: CLLocationManagerDelegate {
    public nonisolated func locationManager(
        _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
    ) {
        Task { @MainActor in self.ingest(locations) }
    }

    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in self.updateAuthorization(status) }
    }

    public nonisolated func locationManager(
        _ manager: CLLocationManager, didFailWithError error: Error
    ) {
        Task { @MainActor in self.hasFix = false }
    }
}
#endif
