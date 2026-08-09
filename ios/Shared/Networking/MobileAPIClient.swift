// Bearer-token client for the /api/mobile/* surface on
// https://personal-os-plum.vercel.app. Fixes over the blind scaffold:
//  - query strings no longer go through appendingPathComponent (which
//    percent-encoded the "?" and broke every parameterized GET)
//  - ISO8601 fractional-second dates via PitayaJSON
//  - 401 triggers exactly one refresh+retry (the scaffold could loop)
//  - server {error} bodies surface as readable messages

import Foundation

public actor MobileAPIClient {
    public enum ClientError: LocalizedError {
        case invalidResponse
        case missingSession
        case unauthorized
        case server(status: Int, message: String)

        public var errorDescription: String? {
            switch self {
            case .invalidResponse: return "Unexpected response from the server."
            case .missingSession: return "Not paired yet."
            case .unauthorized: return "Session expired — pair again."
            case .server(let status, let message): return "\(message) (HTTP \(status))"
            }
        }
    }

    public static let productionBaseURL = URL(string: "https://personal-os-plum.vercel.app")!

    private let baseURL: URL
    private let session: URLSession
    private let sessionStore: any SessionStore
    private let decoder = PitayaJSON.decoder()
    private let encoder = PitayaJSON.encoder()

    public init(
        baseURL: URL = MobileAPIClient.productionBaseURL,
        session: URLSession = .shared,
        sessionStore: any SessionStore
    ) {
        self.baseURL = baseURL
        self.session = session
        self.sessionStore = sessionStore
    }

    // MARK: - Auth

    @discardableResult
    public func pair(
        pin: String, deviceLabel: String, platform: String, deviceType: String
    ) async throws -> DeviceSessionResponse {
        let request = DeviceSessionRequest(
            pin: pin, deviceLabel: deviceLabel, platform: platform, deviceType: deviceType
        )
        let response: DeviceSessionResponse = try await send(
            path: "/api/mobile/auth/session", method: "POST", body: request, authorized: false
        )
        try await sessionStore.save(StoredSession(response: response))
        return response
    }

    @discardableResult
    public func refreshSession() async throws -> DeviceSessionResponse {
        guard let stored = await sessionStore.load() else {
            throw ClientError.missingSession
        }
        do {
            let response: DeviceSessionResponse = try await send(
                path: "/api/mobile/auth/refresh",
                method: "POST",
                body: TokenRefreshRequest(refreshToken: stored.refreshToken),
                authorized: false
            )
            try await sessionStore.save(StoredSession(response: response))
            return response
        } catch ClientError.server(401, _) {
            // Refresh token itself is dead — force re-pairing.
            await sessionStore.clear()
            throw ClientError.unauthorized
        }
    }

    // MARK: - Workouts

    public func fetchWorkouts(limit: Int = 100) async throws -> MobileWorkoutListResponse {
        try await send(
            path: "/api/mobile/workouts",
            query: [URLQueryItem(name: "limit", value: String(limit))],
            method: "GET",
            body: Optional<Int>.none,
            authorized: true
        )
    }

    public func syncWorkouts(_ items: [WorkoutSyncItem]) async throws -> WorkoutSyncResponse {
        try await send(
            path: "/api/mobile/workouts/sync",
            method: "POST",
            body: WorkoutSyncRequest(items: items),
            authorized: true
        )
    }

    /// Server-truth PR baselines (bearer mirror of /api/health/prs).
    public func fetchPRs() async throws -> PRListResponse {
        try await send(
            path: "/api/mobile/prs", method: "GET",
            body: Optional<Int>.none, authorized: true
        )
    }

    public func syncDailyHealth(_ payload: DailyHealthSnapshotPayload) async throws {
        struct AnyResponse: Decodable {}
        let _: AnyResponse = try await send(
            path: "/api/mobile/health/daily", method: "POST", body: payload, authorized: true
        )
    }

    // MARK: - Transport

    private func send<T: Decodable, Body: Encodable>(
        path: String,
        query: [URLQueryItem] = [],
        method: String,
        body: Body?,
        authorized: Bool,
        isRetry: Bool = false
    ) async throws -> T {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw ClientError.invalidResponse
        }
        components.path = path
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw ClientError.invalidResponse }

        var request = URLRequest(url: url)
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
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        switch http.statusCode {
        case 200...299:
            return try decoder.decode(T.self, from: data)
        case 401 where authorized && !isRetry:
            try await refreshSession()
            return try await send(
                path: path, query: query, method: method, body: body,
                authorized: authorized, isRetry: true
            )
        case 401:
            throw ClientError.unauthorized
        default:
            throw ClientError.server(
                status: http.statusCode, message: Self.errorMessage(from: data)
            )
        }
    }

    private static func errorMessage(from data: Data) -> String {
        struct ServerError: Decodable { let error: String }
        if let parsed = try? JSONDecoder().decode(ServerError.self, from: data) {
            return parsed.error
        }
        return "Request failed"
    }
}
