import Foundation

public struct DeviceSessionInfo: Codable, Hashable {
    public let id: String
    public let deviceLabel: String
    public let platform: String?
    public let deviceType: String?
    public let expiresAt: Date
    public let refreshExpiresAt: Date
}

public struct DeviceSessionResponse: Codable, Hashable {
    public let session: DeviceSessionInfo
    public let accessToken: String
    public let refreshToken: String
}

public struct TokenRefreshResponse: Codable, Hashable {
    public let session: DeviceSessionInfo
    public let accessToken: String
    public let refreshToken: String
}

public struct DeviceSessionRequest: Codable, Hashable {
    public let pin: String
    public let deviceLabel: String
    public let platform: String
    public let deviceType: String
}

public struct TokenRefreshRequest: Codable, Hashable {
    public let refreshToken: String
}
