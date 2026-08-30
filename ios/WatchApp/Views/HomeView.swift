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
                // Round 3 §08/§09: the pulse glyph + copy land verbatim.
                row(kind: .freestyle, title: "Freestyle", subtitle: "just record · shape it in Pitaya after") {
                    PitayaGlyph(paths: Glyphs.freestyle, color: Theme.accent, size: 15)
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
                row(title: "Hike", subtitle: hikeSubtitle, pushes: true) {
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

    /// Round 3 §08: "3 saved trails · open goal" once trails exist.
    private var hikeSubtitle: String {
        let count = model.trails.count
        guard count > 0 else { return "new ground or a trail you know" }
        return "\(count) saved trail\(count == 1 ? "" : "s") · open goal"
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

                // Round 3 §05: "Open hike" — no target, GPS + elevation.
                Button {
                    Task { await model.startWorkout(.hike) }
                } label: {
                    hikeRow(
                        title: "Open hike",
                        subtitle: "no target · GPS + elevation",
                        live: true
                    ) {
                        PitayaGlyph(paths: Glyphs.trail, color: Theme.accent, size: 15)
                    }
                }
                .buttonStyle(.plain)

                if !model.trails.isEmpty {
                    Text("SAVED TRAILS")
                        .font(Theme.text(7.5, weight: .bold))
                        .kerning(1.2)
                        .foregroundStyle(Theme.textTertiary)
                        .padding(.horizontal, 6)
                        .padding(.top, 4)

                    // §05: starting from a trail draws it as the ghost target
                    // and skips the end-of-run prompt — the run count just
                    // increments.
                    ForEach(model.trails) { trail in
                        Button {
                            Task { await model.startWorkout(.hike, trail: trail) }
                        } label: {
                            hikeRow(
                                title: trail.name,
                                subtitle: trailSub(trail),
                                live: true
                            ) {
                                PitayaGlyph(
                                    paths: Glyphs.trailBookmark,
                                    color: Theme.accent, size: 15
                                )
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    hikeRow(
                        title: "Saved trails",
                        subtitle: "name one at the end of a hike, or in chat",
                        live: false
                    ) {
                        PitayaGlyph(paths: Glyphs.trailBookmark, color: Theme.textMuted, size: 15)
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    /// "6.4 km · +312 m · Sun" for a saved-trail row.
    private func trailSub(_ trail: TrailSummary) -> String {
        var parts: [String] = []
        if let meters = trail.distanceMeters {
            parts.append(String(format: "%.1f km", meters / 1000))
        }
        if let gain = trail.elevationGainM, gain > 0 {
            parts.append("+\(Int(gain)) m")
        }
        if let last = trail.lastRun {
            let f = DateFormatter()
            f.dateFormat = "EEE"
            parts.append(f.string(from: last.startedAt))
        }
        return parts.isEmpty ? "\(trail.runCount) runs" : parts.joined(separator: " · ")
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
            // Visual stays the design's 22 pt circle; the HIT area meets the
            // 38 pt floor (2026-08-29 — this chevron is on five screens).
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 22, height: 22)
                .background(Theme.card, in: Circle())
                .pitayaTappable(minWidth: Theme.minTap)
        }
        .buttonStyle(.plain)
    }
}
#endif
