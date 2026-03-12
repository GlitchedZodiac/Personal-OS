import Foundation

public actor MobileAPIClient {
    public enum ClientError: Error {
        case invalidResponse
        case missingSession
        case unauthorized
    }

    private let baseURL: URL
    private let session: URLSession
    private let sessionStore: DeviceSessionStore
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        sessionStore: DeviceSessionStore = DeviceSessionStore()
    ) {
        self.baseURL = baseURL
        self.session = session
        self.sessionStore = sessionStore
        decoder.dateDecodingStrategy = .iso8601
        encoder.dateEncodingStrategy = .iso8601
    }

    public func signIn(pin: String, deviceLabel: String, platform: String, deviceType: String) async throws -> DeviceSessionResponse {
        let request = DeviceSessionRequest(
            pin: pin,
            deviceLabel: deviceLabel,
            platform: platform,
            deviceType: deviceType
        )

        let response: DeviceSessionResponse = try await send(
            path: "/api/mobile/auth/session",
            method: "POST",
            body: request,
            authorized: false
        )

        try await sessionStore.save(response: response)
        return response
    }

    public func refreshSession() async throws -> TokenRefreshResponse {
        guard let stored = await sessionStore.load() else {
            throw ClientError.missingSession
        }

        let response: TokenRefreshResponse = try await send(
            path: "/api/mobile/auth/refresh",
            method: "POST",
            body: TokenRefreshRequest(refreshToken: stored.refreshToken),
            authorized: false
        )

        try await sessionStore.save(refresh: response)
        return response
    }

    public func fetchWorkouts(limit: Int = 50) async throws -> MobileWorkoutListResponse {
        try await send(path: "/api/mobile/workouts?limit=\(limit)", method: "GET", body: Optional<Int>.none, authorized: true)
    }

    public func syncWorkouts(_ payloads: [MobileWorkoutPayload]) async throws -> WorkoutSyncResponse {
        let request = WorkoutSyncRequest(items: payloads)
        return try await send(path: "/api/mobile/workouts/sync", method: "POST", body: request, authorized: true)
    }

    public func syncDailyHealth(_ payload: DailyHealthSnapshotPayload) async throws {
        struct EmptyResponse: Codable {}
        _ = try await send(path: "/api/mobile/health/daily", method: "POST", body: payload, authorized: true) as EmptyResponse
    }

    private func send<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        authorized: Bool
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if authorized {
            guard let stored = await sessionStore.load() else {
                throw ClientError.missingSession
            }
            request.setValue("Bearer \(stored.accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        if httpResponse.statusCode == 401, authorized {
            _ = try await refreshSession()
            return try await send(path: path, method: method, body: body, authorized: true)
        }

        if httpResponse.statusCode == 401 {
            throw ClientError.unauthorized
        }

        return try decoder.decode(T.self, from: data)
    }
}
