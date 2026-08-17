// Scheduled background wake — the last gap from the 2026-08-14 watch audit
// ("drainQueue() has a single call site, so a queued offline session waits
// for the next manual launch").
//
// Two jobs, both cheap: push whatever the offline queue holds, and reload the
// complication timeline so the face stays current without opening the app.
// watchOS grants roughly one refresh per hour, and more generously when the
// app has a complication on the active face — which is exactly our case.

#if os(watchOS)
import Foundation
import WatchKit
import WidgetKit

enum PitayaBackgroundRefresh {
    /// Preferred spacing. The system decides the real cadence from budget;
    /// asking for less than it grants just wastes scheduling calls.
    static let interval: TimeInterval = 30 * 60

    static func schedule() {
        WKApplication.shared().scheduleBackgroundRefresh(
            withPreferredDate: Date().addingTimeInterval(interval),
            userInfo: nil
        ) { _ in }
    }

    /// Drain without touching AppModel. A background wake can start the
    /// process before SwiftUI has built its @StateObject, so this path owns
    /// its own queue + client rather than racing the model's lifecycle.
    static func drainStandalone() async {
        guard let queue = try? OfflineWorkoutQueue() else { return }
        let pending = await queue.load()
        guard !pending.isEmpty else { return }

        let store = KeychainSessionStore(accessGroup: PitayaKeychain.sharedGroup)
        guard await store.load() != nil else { return } // not paired
        let api = MobileAPIClient(sessionStore: store)

        if (try? await api.syncWorkouts(pending)) != nil {
            try? await queue.removeSynced(pending)
        }
    }
}

final class PitayaAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        PitayaBackgroundRefresh.schedule()
    }

    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            switch task {
            case let refresh as WKApplicationRefreshBackgroundTask:
                Task {
                    // Warm app → go through the model so its published state
                    // (queue count, sync status) stays truthful; cold wake →
                    // the standalone path.
                    if let model = await AppModel.shared {
                        await model.backgroundRefresh()
                    } else {
                        await PitayaBackgroundRefresh.drainStandalone()
                        WidgetCenter.shared.reloadAllTimelines()
                    }
                    PitayaBackgroundRefresh.schedule() // always re-arm
                    refresh.setTaskCompletedWithSnapshot(false)
                }

            case let snapshot as WKSnapshotRefreshBackgroundTask:
                snapshot.setTaskCompleted(
                    restoredDefaultState: true,
                    estimatedSnapshotExpiration: .distantFuture,
                    userInfo: nil
                )

            default:
                // Completing every task matters: unfinished ones burn the
                // app's refresh budget.
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}
#endif
