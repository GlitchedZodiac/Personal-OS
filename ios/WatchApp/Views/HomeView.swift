// Workout list — design screen 05: Sequences row (live now that
// /api/mobile/sequences shipped) + Kettlebell / Trail Run / Walk with the
// design's own glyphs and real-history subtitles.

#if os(watchOS)
import SwiftUI

struct WorkoutListView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    BackChevron { model.backToHome() }
                    Text("Workouts")
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                }
                .padding(.horizontal, 4)

                row(title: "Kettlebell", subtitle: kettlebellSubtitle) {
                    PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: 15)
                } action: {
                    model.openKettlebellSpace()
                }
                row(kind: .run, title: "Trail Run", subtitle: runSubtitle) {
                    PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 15)
                }
                row(kind: .walk, title: "Walk", subtitle: "open goal") {
                    WalkGlyph(color: Theme.accent, size: 15)
                }
                row(kind: .treadmill, title: "Treadmill", subtitle: "indoor · distance & HR") {
                    WalkGlyph(color: Theme.accent, size: 15)
                }
                row(kind: .hike, title: "Hike", subtitle: "elevation & heart rate") {
                    PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 15)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func row(
        kind: WorkoutKind, title: String, subtitle: String,
        @ViewBuilder glyph: () -> some View
    ) -> some View {
        row(title: title, subtitle: subtitle, glyph: glyph) {
            Task { await model.startWorkout(kind) }
        }
    }

    private func row(
        title: String, subtitle: String,
        @ViewBuilder glyph: () -> some View,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Theme.accentDim)
                    glyph()
                }
                .frame(width: 31, height: 31)

                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(Theme.text(13, weight: .semibold))
                        .foregroundStyle(Theme.textBright)
                    Text(subtitle)
                        .font(Theme.text(9))
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 9)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        }
        .buttonStyle(.plain)
    }

    private var kettlebellSubtitle: String {
        let routines = model.sequences.count
        if routines > 0 {
            return "\(routines) \(routines == 1 ? "routine" : "routines") · free sets"
        }
        if let last = model.lastKettlebell {
            let f = RelativeDateTimeFormatter()
            f.unitsStyle = .short
            return "last · " + f.localizedString(for: last, relativeTo: Date())
        }
        return "routines · free sets · PRs"
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

// MARK: - Kettlebell space (Michael's 2026-08-10 IA: routines are the main
// object; free sets are the freestyle corner)

struct KettlebellSpaceView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    BackChevron { model.backToWorkoutList() }
                    Text("Kettlebell")
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                }
                .padding(.horizontal, 4)

                spaceRow(
                    title: "Routines",
                    subtitle: model.sequences.isEmpty
                        ? "build one in Pitaya chat"
                        : "\(model.sequences.count) saved · EMOM · circuits"
                ) {
                    SequenceGridGlyph(color: Theme.accent, size: 14)
                } action: {
                    if !model.sequences.isEmpty { model.openSequences() }
                }

                spaceRow(title: "Free sets", subtitle: "crown weight · tap reps · PRs") {
                    PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: 15)
                } action: {
                    Task { await model.startWorkout(.kettlebell) }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func spaceRow(
        title: String, subtitle: String,
        @ViewBuilder glyph: () -> some View,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Theme.accentDim)
                    glyph()
                }
                .frame(width: 31, height: 31)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(Theme.text(13, weight: .semibold))
                        .foregroundStyle(Theme.textBright)
                    Text(subtitle)
                        .font(Theme.text(9))
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 10)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        }
        .buttonStyle(.plain)
    }
}

/// The design's sequences glyph — three offset rounded tiles.
struct SequenceGridGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            for (x, y) in Glyphs.sequenceRects {
                let rect = CGRect(x: x * u, y: y * u, width: 7 * u, height: 6 * u)
                context.stroke(
                    Path(roundedRect: rect, cornerRadius: 1.5 * u),
                    with: .color(color),
                    style: StrokeStyle(lineWidth: 2 * u, lineCap: .round)
                )
            }
        }
        .frame(width: size, height: size)
    }
}

/// Back affordance used across pushed screens (design's ‹ mark).
struct BackChevron: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 22, height: 22)
                .background(Theme.card, in: Circle())
        }
        .buttonStyle(.plain)
    }
}
#endif
