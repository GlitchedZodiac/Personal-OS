import Foundation

public actor DeviceSessionStore {
    public struct StoredSession: Codable, Hashable {
        public let accessToken: String
        public let refreshToken: String
        public let expiresAt: Date
        public let refreshExpiresAt: Date
    }

    private let defaults: UserDefaults
    private let storageKey = "personal_os_mobile_session"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func load() -> StoredSession? {
        guard let data = defaults.data(forKey: storageKey) else {
            return nil
        }

        return try? decoder.decode(StoredSession.self, from: data)
    }

    public func save(response: DeviceSessionResponse) throws {
        let stored = StoredSession(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            expiresAt: response.session.expiresAt,
            refreshExpiresAt: response.session.refreshExpiresAt
        )

        let data = try encoder.encode(stored)
        defaults.set(data, forKey: storageKey)
    }

    public func save(refresh: TokenRefreshResponse) throws {
        let stored = StoredSession(
            accessToken: refresh.accessToken,
            refreshToken: refresh.refreshToken,
            expiresAt: refresh.session.expiresAt,
            refreshExpiresAt: refresh.session.refreshExpiresAt
        )

        let data = try encoder.encode(stored)
        defaults.set(data, forKey: storageKey)
    }

    public func clear() {
        defaults.removeObject(forKey: storageKey)
    }
}
