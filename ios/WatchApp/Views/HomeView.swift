// Workout list — design screen 05, restructured to Michael's 2026-08-20 IA:
// EVERY way to start a session lives here (Freestyle came up off the home
// grid), strength splits into Kettlebell and Weight Training, each landing
// straight on its own routine list, and Hike gets a submenu because a hike
// is either new ground or ground he's covered before.
//
// UNDESIGNED (2026-08-20): the Freestyle row, the Weight Training row + its
// barbell glyph, and the whole hike submenu have no slice in
// docs/design/pitaya-watch.dc.html — they are built inside the watch design
// system (existing row grammar, Theme idiom) and flagged for the next design
// pass. THE PORT GATE applies the moment a slice lands.

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

                // Freestyle first: it's the catch-all, and it replaced free
                // sets as the way to record something unstructured.
                row(kind: .freestyle, title: "Freestyle", subtitle: "record · describe it later") {
                    PitayaGlyph(paths: Glyphs.heart, style: .fill, color: Theme.accent, size: 15)
                }
                row(title: "Kettlebell", subtitle: routineSubtitle(.kettlebell), pushes: true) {
                    PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: 15)
                } action: {
                    model.openSequences(.kettlebell)
                }
                row(title: "Weight Training", subtitle: routineSubtitle(.weights), pushes: true) {
                    BarbellGlyph(color: Theme.accent, size: 15)
                } action: {
                    model.openSequences(.weights)
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
                row(title: "Hike", subtitle: "new ground or a trail you know", pushes: true) {
                    PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 15)
                } action: {
                    model.openHikeMenu()
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func row(
        kind: WorkoutKind, title: String, subtitle: String,
        @ViewBuilder glyph: () -> some View
    ) -> some View {
        row(title: title, subtitle: subtitle, pushes: false, glyph: glyph) {
            Task { await model.startWorkout(kind) }
        }
    }

    /// `pushes` earns the ›. A row that starts a 3·2·1 countdown the instant
    /// it's tapped doesn't get one — the chevron promises another screen.
    private func row(
        title: String, subtitle: String, pushes: Bool,
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
                if pushes {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 9)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        }
        .buttonStyle(.plain)
    }

    /// "3 routines" / "1 routine" / the honest empty hint. The row stays
    /// tappable when empty — a dead row that swallows the tap reads as a bug.
    private func routineSubtitle(_ discipline: WorkoutDiscipline) -> String {
        let count = model.sequences(for: discipline).count
        guard count > 0 else { return discipline.emptyHint }
        return "\(count) \(count == 1 ? "routine" : "routines")"
    }

    private var runSubtitle: String {
        if let run = model.lastRun {
            let f = DateFormatter()
            f.dateFormat = "EEE"
            return String(format: "%.1f km · %@", run.km, f.string(from: run.at))
        }
        return "GPS · HR live"
    }
}

// MARK: - Hike submenu (his 08-20 ask: new ground, or ground he's covered)

struct HikeMenuView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    BackChevron { model.backToWorkoutList() }
                    Text("Hike")
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                }
                .padding(.horizontal, 4)

                Button {
                    Task { await model.startWorkout(.hike) }
                } label: {
                    hikeRow(
                        title: "New Hike",
                        subtitle: "GPS · elevation · heart rate",
                        live: true
                    ) {
                        PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 15)
                    }
                }
                .buttonStyle(.plain)

                // Honest placeholder, in the grammar the home grid already
                // uses for Sleep and Journal — never a dashed promise, never
                // a tappable row that does nothing. Naming a trail from chat
                // and comparing runs against it is filed in
                // docs/deferred-items.md (2026-08-20, needs a Trail model).
                hikeRow(
                    title: "Saved trails",
                    subtitle: "soon · name one in Pitaya chat",
                    live: false
                ) {
                    SegmentsGlyph(color: Theme.textMuted, size: 15)
                }

                Text("Trails you've named will start here, so a second run can be compared to the first.")
                    .font(Theme.text(8.5))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 6)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 2)
        }
    }

    private func hikeRow(
        title: String, subtitle: String, live: Bool,
        @ViewBuilder glyph: () -> some View
    ) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(live ? Theme.accentDim : Theme.elementDim)
                glyph()
            }
            .frame(width: 31, height: 31)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(Theme.text(13, weight: .semibold))
                    .foregroundStyle(live ? Theme.textBright : Theme.textSecondary)
                Text(subtitle)
                    .font(Theme.text(9))
                    .foregroundStyle(Theme.textTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 10)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
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
