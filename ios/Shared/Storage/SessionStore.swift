// Device-session token persistence. Keychain-backed on device (the scaffold's
// UserDefaults storage was a known TODO — tokens never touch UserDefaults
// now); an in-memory variant supports previews and tests.

import Foundation
import Security

public struct StoredSession: Codable, Hashable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let refreshExpiresAt: Date
    public let deviceSessionId: String

    public init(
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
        refreshExpiresAt: Date,
        deviceSessionId: String
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.refreshExpiresAt = refreshExpiresAt
        self.deviceSessionId = deviceSessionId
    }

    public init(response: DeviceSessionResponse) {
        self.init(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            expiresAt: response.session.expiresAt,
            refreshExpiresAt: response.session.refreshExpiresAt,
            deviceSessionId: response.session.id
        )
    }
}

public protocol SessionStore: Sendable {
    func load() async -> StoredSession?
    func save(_ session: StoredSession) async throws
    func clear() async
}

// MARK: - Keychain

public actor KeychainSessionStore: SessionStore {
    public enum KeychainError: Error {
        case unexpectedStatus(OSStatus)
    }

    private let service: String
    private let account = "mobile-session"

    public init(service: String = "net.blacksheepglobal.pitaya.session") {
        self.service = service
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func load() -> StoredSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? PitayaJSON.decoder().decode(StoredSession.self, from: data)
    }

    public func save(_ session: StoredSession) throws {
        let data = try PitayaJSON.encoder().encode(session)

        var update = baseQuery
        let attributes: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(update as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }

        guard updateStatus == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(updateStatus)
        }

        update[kSecValueData as String] = data
        update[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(update as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw KeychainError.unexpectedStatus(addStatus)
        }
    }

    public func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

// MARK: - In-memory (previews/tests)

public actor MemorySessionStore: SessionStore {
    private var session: StoredSession?

    public init(session: StoredSession? = nil) {
        self.session = session
    }

    public func load() -> StoredSession? { session }
    public func save(_ session: StoredSession) { self.session = session }
    public func clear() { session = nil }
}
