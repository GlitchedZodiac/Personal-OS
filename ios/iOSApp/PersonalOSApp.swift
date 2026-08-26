// Pitaya iOS companion — a THIN native wrapper around the deployed web app
// (the web UI IS the UI) plus the three things a PWA can't do: durable
// mic/camera permission, HealthKit background sync, and APNs groundwork.
// Directive: docs/watch-contract.md + the 2026-08-11 companion kickoff.

import SwiftUI

@main
struct PersonalOSApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(CompanionAppDelegate.self) private var appDelegate
    @StateObject private var model = CompanionModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            CompanionRootView()
                .environmentObject(model)
                .task {
                    appDelegate.model = model
                    await model.bootstrap()
                }
                .onOpenURL { url in
                    if url.scheme == "pitaya" { model.showSettings = true }
                }
                // Sync on every foreground, debounced. WebShellView already
                // hooks didBecomeActive but only reloads the web view — Health
                // was never re-read on a warm resume. Matches the pattern in
                // WatchApp/PitayaWatchApp.swift.
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        let last = model.health.lastSyncAt
                        if last == nil || Date().timeIntervalSince(last!) > 120 {
                            await model.health.syncNow()
                        }
                    }
                }
        }
    }
    #else
    var body: some Scene {
        WindowGroup { Text("Pitaya") }
    }
    #endif
}

#if os(iOS)
struct CompanionRootView: View {
    @EnvironmentObject private var model: CompanionModel

    var body: some View {
        ZStack {
            // Pitaya web is light-first — the shell chrome matches its paper
            // background so safe-area slivers never flash black.
            (model.phase == .shell ? Color(hex: 0xF2F1F2) : Theme.bg)
                .ignoresSafeArea()
            switch model.phase {
            case .loading:
                ProgressView().tint(Theme.accent)
            case .pairing:
                CompanionPairingView()
            case .shell:
                WebShellView(onShake: { model.showSettings = true })
                    .ignoresSafeArea()
            }
        }
        .sheet(isPresented: $model.showSettings) {
            CompanionSettingsView()
        }
        .preferredColorScheme(.light) // Pitaya web is light-first
    }
}
#endif
