// Pitaya on Apple Watch — standalone watchOS app for Personal OS.

#if os(watchOS)
import SwiftUI

@main
struct PitayaWatchApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task { await model.bootstrap() }
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
            case .kettlebellSpace:
                KettlebellSpaceView()
            case .sequences:
                SequencesListView()
            case .sequenceDetail(let sequence):
                SequenceDetailView(sequence: sequence)
            case .live(let kind):
                LiveWorkoutView(kind: kind)
            case .liveSequence(let sequence):
                SequenceLiveView(sequence: sequence)
            case .summary:
                SummaryView()
            case .doubleTapCoach:
                DoubleTapCoachView()
            case .voiceWeight:
                VoiceWeightConfirmView()
            case .voiceFood:
                VoiceFoodConfirmView()
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
