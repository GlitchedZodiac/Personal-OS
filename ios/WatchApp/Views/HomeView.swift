// Home — pick a workout. Design screen 04, trimmed to what's real today:
// no Sequences row (no backend contract yet) and no Today's-Plan card (plan
// data isn't in the mobile surface); both slot back in when their data lands.

#if os(watchOS)
import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                Text("Workouts")
                    .font(Theme.display(17))
                    .foregroundStyle(Theme.textBright)
                    .padding(.horizontal, 4)

                ForEach(WorkoutKind.allCases) { kind in
                    workoutRow(kind)
                }

                footer
            }
            .padding(.horizontal, 2)
        }
    }

    private func workoutRow(_ kind: WorkoutKind) -> some View {
        Button {
            Task { await model.startWorkout(kind) }
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Theme.accentDim)
                    Image(systemName: kind.systemImage)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
                .frame(width: 26, height: 26)

                VStack(alignment: .leading, spacing: 0) {
                    Text(kind.title)
                        .font(Theme.text(12, weight: .semibold))
                        .foregroundStyle(Theme.textBright)
                    Text(subtitle(for: kind))
                        .font(Theme.text(8.5))
                        .foregroundStyle(Theme.textTertiary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 8)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack {
            if case .queued(let count) = model.syncState {
                Label("\(count) queued", systemImage: "arrow.triangle.2.circlepath")
                    .font(Theme.text(8))
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
            Button("Unpair") {
                Task { await model.unpair() }
            }
            .buttonStyle(.plain)
            .font(Theme.text(8))
            .foregroundStyle(Theme.textFaint)
        }
        .padding(.horizontal, 6)
        .padding(.top, 5)
    }

    private func subtitle(for kind: WorkoutKind) -> String {
        switch kind {
        case .kettlebell:
            if let last = model.lastKettlebell {
                let f = RelativeDateTimeFormatter()
                f.unitsStyle = .short
                return "last · " + f.localizedString(for: last, relativeTo: Date())
            }
            return "sets · crown weight · PRs"
        case .walk: return "open goal"
        case .run: return "pace & heart rate"
        case .hike: return "elevation & heart rate"
        case .other: return "time & calories"
        }
    }
}
#endif
