// Home — design screen 04's workout list, ported per THE PORT GATE: the
// design's rows (Kettlebell / Trail Run / Walk) with its own glyphs. The
// design's Sequences row and Today's-Plan card return when their backend
// contracts ship (watch-contract.md); until then this list is exactly what
// works. Row subtitles carry real history facts like the design's do.

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

                row(kind: .kettlebell, title: "Kettlebell", subtitle: kettlebellSubtitle) {
                    PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: 13)
                }
                row(kind: .run, title: "Trail Run", subtitle: runSubtitle) {
                    PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 13)
                }
                row(kind: .walk, title: "Walk", subtitle: "open goal") {
                    WalkGlyph(color: Theme.accent, size: 13)
                }

                footer
            }
            .padding(.horizontal, 2)
        }
    }

    private func row(
        kind: WorkoutKind, title: String, subtitle: String,
        @ViewBuilder glyph: () -> some View
    ) -> some View {
        Button {
            Task { await model.startWorkout(kind) }
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Theme.accentDim)
                    glyph()
                }
                .frame(width: 26, height: 26)

                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(Theme.text(12, weight: .semibold))
                        .foregroundStyle(Theme.textBright)
                    Text(subtitle)
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

    private var kettlebellSubtitle: String {
        if let last = model.lastKettlebell {
            let f = RelativeDateTimeFormatter()
            f.unitsStyle = .short
            return "last · " + f.localizedString(for: last, relativeTo: Date())
        }
        return "sets · crown weight · PRs"
    }

    private var runSubtitle: String {
        if let run = model.lastRun {
            let f = DateFormatter()
            f.dateFormat = "EEE"
            return String(format: "%.1f km · %@", run.km, f.string(from: run.at))
        }
        return "GPS coming · HR live"
    }
}
#endif
