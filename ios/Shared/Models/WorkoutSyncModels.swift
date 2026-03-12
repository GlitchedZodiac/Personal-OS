import Foundation

public struct RoutePoint: Codable, Hashable {
    public let latitude: Double
    public let longitude: Double
    public let altitudeMeters: Double?
    public let timestamp: Date
}

public struct MobileWorkoutPayload: Codable, Hashable, Identifiable {
    public let id: UUID
    public let externalId: String
    public let externalSource: String
    public let startedAt: Date
    public let endedAt: Date?
    public let durationMinutes: Int
    public let workoutType: String
    public let description: String?
    public let caloriesBurned: Double?
    public let distanceMeters: Double?
    public let stepCount: Int?
    public let avgHeartRateBpm: Int?
    public let maxHeartRateBpm: Int?
    public let elevationGainM: Double?
    public let routeData: [RoutePoint]?
    public let metricsData: [String: Double]?
    public let source: String
    public let syncStatus: String
    public let deviceType: String?

    public init(
        id: UUID = UUID(),
        externalId: String,
        externalSource: String = "app_watch",
        startedAt: Date,
        endedAt: Date?,
        durationMinutes: Int,
        workoutType: String,
        description: String? = nil,
        caloriesBurned: Double? = nil,
        distanceMeters: Double? = nil,
        stepCount: Int? = nil,
        avgHeartRateBpm: Int? = nil,
        maxHeartRateBpm: Int? = nil,
        elevationGainM: Double? = nil,
        routeData: [RoutePoint]? = nil,
        metricsData: [String: Double]? = nil,
        source: String = "mobile",
        syncStatus: String = "synced",
        deviceType: String? = nil
    ) {
        self.id = id
        self.externalId = externalId
        self.externalSource = externalSource
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationMinutes = durationMinutes
        self.workoutType = workoutType
        self.description = description
        self.caloriesBurned = caloriesBurned
        self.distanceMeters = distanceMeters
        self.stepCount = stepCount
        self.avgHeartRateBpm = avgHeartRateBpm
        self.maxHeartRateBpm = maxHeartRateBpm
        self.elevationGainM = elevationGainM
        self.routeData = routeData
        self.metricsData = metricsData
        self.source = source
        self.syncStatus = syncStatus
        self.deviceType = deviceType
    }
}

public struct WorkoutSyncRequest: Codable, Hashable {
    public let items: [MobileWorkoutPayload]
}

public struct WorkoutSyncResponse: Codable, Hashable {
    public let created: Int
    public let updated: Int
    public let total: Int
}

public struct MobileWorkoutListResponse: Codable, Hashable {
    public let deviceSessionId: String
    public let entries: [MobileWorkoutPayload]
}

public struct DailyHealthSnapshotPayload: Codable, Hashable {
    public let localDate: String
    public let timeZone: String
    public let steps: Int
    public let restingHeartRateBpm: Int?
    public let activeEnergyKcal: Double?
    public let walkingRunningDistanceMeters: Double?
    public let source: String

    public init(
        localDate: String,
        timeZone: String,
        steps: Int,
        restingHeartRateBpm: Int? = nil,
        activeEnergyKcal: Double? = nil,
        walkingRunningDistanceMeters: Double? = nil,
        source: String = "apple_health"
    ) {
        self.localDate = localDate
        self.timeZone = timeZone
        self.steps = steps
        self.restingHeartRateBpm = restingHeartRateBpm
        self.activeEnergyKcal = activeEnergyKcal
        self.walkingRunningDistanceMeters = walkingRunningDistanceMeters
        self.source = source
    }
}
