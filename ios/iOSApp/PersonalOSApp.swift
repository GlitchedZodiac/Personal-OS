// Pitaya iOS companion — deliberate placeholder. The phone experience is
// being designed in the Claude-design session ("Pitaya App.dc.html"); until
// it lands, this target exists so the workspace, shared layer, and future
// WatchConnectivity handoff have a home. The watch app is standalone and
// does not depend on this target.

import SwiftUI

@main
struct PersonalOSApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                PitayaMark(size: 34)
                Text("Pitaya")
                    .font(Theme.display(34))
                    .foregroundStyle(Theme.textBright)
                Text("The iPhone app arrives with the\nPitaya App design. Your watch\nworks standalone today.")
                    .font(Theme.text(15))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}
