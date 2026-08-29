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

/// Shared keychain constants. Free personal teams allow keychain sharing
/// (unlike app groups / APNs), so the watch app and its widget extension
/// read the same bearer session through one access group.
public enum PitayaKeychain {
    /// Runtime group string = team-id prefix + group name. The team id is
    /// pinned in project.yml (DEVELOPMENT_TEAM: HDR67SL3JG); entitlements
    /// carry the same group as $(AppIdentifierPrefix)…shared.
    public static let sharedGroup = "HDR67SL3JG.net.blacksheepglobal.pitaya.shared"
}

public actor KeychainSessionStore: SessionStore {
    public enum KeychainError: Error {
        case unexpectedStatus(OSStatus)
    }

    private let service: String
    private let account = "mobile-session"
    /// When set, items live in this keychain access group (app ↔ widget).
    /// nil keeps the app's default group (iOS companion path).
    private let accessGroup: String?

    public init(
        service: String = "net.blacksheepglobal.pitaya.session",
        accessGroup: String? = nil
    ) {
        self.service = service
        self.accessGroup = accessGroup
    }

    private func query(group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    /// In-memory copy (2026-08-29): the Keychain was hit — SecItemCopy +
    /// JSON decode — on EVERY authorized request (×7 during launch alone).
    /// One process-lifetime read is enough; save/clear keep it honest.
    private var cached: StoredSession?
    private var cacheLoaded = false

    public func load() -> StoredSession? {
        if cacheLoaded { return cached }
        cacheLoaded = true
        if let session = copyItem(group: accessGroup) {
            cached = session
            return session
        }
        // Migration: sessions saved before keychain sharing live in the
        // app's default group — invisible to the widget. Move them over so
        // Michael's existing pairing survives without a re-pair.
        guard accessGroup != nil, let legacy = copyItem(group: nil) else { return nil }
        SecItemDelete(query(group: nil) as CFDictionary)
        try? save(legacy)
        cached = legacy
        return legacy
    }

    private func copyItem(group: String?) -> StoredSession? {
        var q = query(group: group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? PitayaJSON.decoder().decode(StoredSession.self, from: data)
    }

    public func save(_ session: StoredSession) throws {
        let data = try PitayaJSON.encoder().encode(session)
        cached = session
        cacheLoaded = true

        var update = query(group: accessGroup)
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
        cached = nil
        cacheLoaded = true
        // No group restriction: wipes shared and legacy copies alike.
        SecItemDelete(query(group: nil) as CFDictionary)
        if accessGroup != nil {
            SecItemDelete(query(group: accessGroup) as CFDictionary)
        }
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
