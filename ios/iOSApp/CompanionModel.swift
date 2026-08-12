// iOS companion state: native PIN pairing (same device-session bearer the
// watch uses, reusing Shared/), the HealthKit sync manager, and APNs
// registration state. The web app IS the UI — this model only backs the
// pairing screen and the minimal settings sheet.

#if os(iOS)
import Combine
import Foundation
import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class CompanionModel: NSObject, ObservableObject {
    enum Phase: Equatable {
        case loading, pairing, shell
    }

    enum PushStatus: Equatable {
        case unknown
        case registered
        case serverPending          // token obtained; register endpoint not live yet
        case needsPaidTeam(String)  // APNs entitlement unavailable on personal team
        case declined
    }

    @Published private(set) var phase: Phase = .loading
    @Published var pairError: String?
    @Published private(set) var isPairing = false
    @Published private(set) var pushStatus: PushStatus = .unknown
    @Published var showSettings = false

    let health: HealthSyncManager

    private let sessionStore: any SessionStore
    private let api: MobileAPIClient
    private var healthForwarder: AnyCancellable?

    override init() {
        let store = KeychainSessionStore(service: "net.blacksheepglobal.pitaya.ios.session")
        sessionStore = store
        api = MobileAPIClient(sessionStore: store)
        health = HealthSyncManager(api: api)
        super.init()
        // Nested ObservableObject: forward the manager's changes so views
        // reading model.health.* actually re-render.
        healthForwarder = health.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    func bootstrap() async {
        if await sessionStore.load() != nil {
            phase = .shell
            await health.bootstrap()
        } else {
            phase = .pairing
        }
        #if DEBUG
        if let pin = ProcessInfo.processInfo.environment["PITAYA_SMOKE_PIN"],
           phase == .pairing {
            await pair(pin: pin)
        }
        #endif
    }

    func pair(pin: String) async {
        guard !isPairing else { return }
        isPairing = true
        pairError = nil
        do {
            try await api.pair(
                pin: pin,
                deviceLabel: "\(UIDevice.current.name) (iPhone)",
                platform: "ios",
                deviceType: "iphone"
            )
            phase = .shell
            await health.bootstrap()
        } catch {
            if let clientError = error as? MobileAPIClient.ClientError,
               case .server(401, _) = clientError {
                pairError = "Wrong PIN"
            } else {
                pairError = "No connection — try again"
            }
        }
        isPairing = false
    }

    func unpair() async {
        await sessionStore.clear()
        phase = .pairing
    }

    // MARK: - Push (APNs groundwork; personal teams can't sign the aps
    // entitlement, so failure is surfaced honestly, not swallowed)

    func requestPush() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            guard granted else {
                pushStatus = .declined
                return
            }
            UIApplication.shared.registerForRemoteNotifications()
        } catch {
            pushStatus = .declined
        }
    }

    func handlePushToken(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        Task {
            do {
                try await postPushToken(hex)
                pushStatus = .registered
            } catch {
                pushStatus = .serverPending
            }
        }
    }

    func handlePushFailure(_ error: Error) {
        pushStatus = .needsPaidTeam(error.localizedDescription)
    }

    private func postPushToken(_ token: String) async throws {
        guard let stored = await sessionStore.load() else { return }
        var request = URLRequest(
            url: MobileAPIClient.productionBaseURL.appendingPathComponent("/api/mobile/push/register")
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(stored.accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(
            ["deviceToken": token, "platform": "ios"]
        )
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw MobileAPIClient.ClientError.invalidResponse
        }
    }
}

// MARK: - App delegate bridge (APNs callbacks)

final class CompanionAppDelegate: NSObject, UIApplicationDelegate {
    weak var model: CompanionModel?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in model?.handlePushToken(deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in model?.handlePushFailure(error) }
    }
}

#endif
