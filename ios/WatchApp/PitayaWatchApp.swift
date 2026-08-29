// Pitaya on Apple Watch — standalone watchOS app for Personal OS.

#if os(watchOS)
import SwiftUI

@main
struct PitayaWatchApp: App {
    @StateObject private var model = AppModel()
    /// Owns the scheduled background wake (queue drain + complication).
    @WKApplicationDelegateAdaptor(PitayaAppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task { await model.bootstrap() }
        }
        .onChange(of: scenePhase) { _, phase in
            // Re-arm on the way out — a wrist-drop is the moment a queued
            // session most needs someone to come back for it.
            if phase == .background { PitayaBackgroundRefresh.schedule() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch model.phase {
            case .loading:
                ProgressView().tint(Theme.accent)
            case .welcome:
                WelcomeView()
            case .pinEntry:
                PinPadView()
            case .pairedIntro:
                PairedView()
            case .home:
                HomeGridView()
            case .settings:
                SettingsView()
            case .workoutList:
                WorkoutListView()
            case .hikeMenu:
                HikeMenuView()
            case .sequences(let discipline):
                SequencesListView(discipline: discipline)
            case .sequenceDetail(let sequence):
                SequenceDetailView(sequence: sequence)
            case .live(let kind):
                // Freestyle's recorder screen is deliberately its own thing:
                // no pages, no logging — elapsed, HR, zone, End.
                if kind == .freestyle {
                    FreestyleRunView()
                } else {
                    LiveWorkoutView(kind: kind)
                }
            case .liveSequence(let sequence):
                SequenceLiveView(sequence: sequence)
            case .summary:
                SummaryView()
            case .hrr:
                RecoveryView()
            case .trailPrompt:
                SaveTrackView()
            case .doubleTapCoach:
                DoubleTapCoachView()
            case .voiceWeight:
                VoiceWeightConfirmView()
            case .voiceFood:
                VoiceFoodConfirmView()
            case .ready:
                ReadyView(readiness: model.readiness)
            }
        }
        .overlay {
            // §05 1m: "Double Tap logged it" — blush pill over any screen.
            DoubleTapToast()
        }
        .animation(.easeInOut(duration: 0.25), value: model.phase)
    }
}
#endif
