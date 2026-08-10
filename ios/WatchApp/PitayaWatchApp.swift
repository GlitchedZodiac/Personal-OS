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
            case .workoutList:
                WorkoutListView()
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
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.phase)
    }
}
#endif
