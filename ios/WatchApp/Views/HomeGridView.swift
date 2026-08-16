// Home — Round 1 §04, option 1j "Due-aware grid · fourth tile = Spirit".
// Extracted verbatim from Pitaya Watch Round 1.dc.html: brand row + 7 week
// ticks (filled #A63D63 done · outlined #DC74A0 today · #2A292E ahead),
// derived subline, stateful Workouts tile (pink wash when due, mint ✓ once
// trained), Spirit tile (provisional — never a dashed promise), Settings
// footer. Unpair moved to Settings.

#if os(watchOS)
import SwiftUI

struct HomeGridView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                subline
                grid
                footer
            }
            .padding(.horizontal, Theme.px(8))
        }
    }

    // MARK: - Header (diamond brand + week ticks)

    private var header: some View {
        HStack(spacing: Theme.px(8)) {
            PitayaMark(size: Theme.px(14) * 0.72, color: Theme.accent)
                .frame(width: Theme.px(14), height: Theme.px(14))
            Text("Pitaya")
                .font(Theme.display(12))
                .foregroundStyle(Theme.textBright)
            Spacer(minLength: 0)
            weekTicks
        }
        .padding(.horizontal, Theme.px(6))
    }

    /// Mon-start week: filled = trained, outlined = today, dim = ahead.
    private var weekTicks: some View {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let weekdayRaw = calendar.component(.weekday, from: Date())
        let today = weekdayRaw == 1 ? 7 : weekdayRaw - 1

        return HStack(spacing: Theme.px(4)) {
            ForEach(1...7, id: \.self) { day in
                tick(day: day, today: today)
            }
        }
    }

    @ViewBuilder
    private func tick(day: Int, today: Int) -> some View {
        let side = Theme.px(8) * 0.72
        let box = Theme.px(8)
        if day == today {
            Rectangle()
                .strokeBorder(Theme.accent, lineWidth: 1.4 * 0.5625)
                .frame(width: side, height: side)
                .rotationEffect(.degrees(45))
                .frame(width: box, height: box)
        } else {
            Rectangle()
                .fill(model.trainedWeekdays.contains(day) && day < today
                      ? Theme.accentDeep : Theme.elementDim)
                .frame(width: side, height: side)
                .rotationEffect(.degrees(45))
                .frame(width: box, height: box)
        }
    }

    /// "Friday · 4 of 5 this week · ◆ ready" — trained days of elapsed days
    /// (the mock's math), plus the §07 verdict diamond when HealthKit has a
    /// morning read. Tap opens the Ready screen; the verdict never edits
    /// weights, rest, or the due routine.
    private var subline: some View {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let weekdayRaw = calendar.component(.weekday, from: Date())
        let today = weekdayRaw == 1 ? 7 : weekdayRaw - 1
        let trained = model.trainedWeekdays.filter { $0 <= today }.count

        let f = DateFormatter()
        f.dateFormat = "EEEE"

        return HStack(spacing: Theme.px(4)) {
            Text("\(f.string(from: Date())) · \(trained) of \(today) this week")
                .foregroundStyle(Theme.textMuted)
            VerdictChip(readiness: model.readiness) { model.openReady() }
        }
        .font(Theme.text(6))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.horizontal, Theme.px(6))
        .padding(.top, Theme.px(2))
    }

    // MARK: - Tiles (118 px, radius 20, icon circle 34)

    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: Theme.px(8)), GridItem(.flexible())],
            spacing: Theme.px(8)
        ) {
            workoutsTile
            spiritTile
            tile(
                title: "Sleep", subtitle: "soon", subtitleColor: Theme.textMuted,
                circle: Theme.waterDim, titleColor: Theme.textSecondary
            ) {
                PitayaGlyph(paths: Glyphs.moon, style: .fill, color: Theme.water, size: Theme.px(15))
            }
            tile(
                title: "Journal", subtitle: "soon", subtitleColor: Theme.textMuted,
                circle: Theme.journalDim, titleColor: Theme.textSecondary
            ) {
                PitayaGlyph(paths: Glyphs.pencil, color: Theme.mint, size: Theme.px(15))
            }
        }
        .padding(.top, Theme.px(11))
    }

    private var workoutsTile: some View {
        let due = model.trainedTodayAt == nil ? model.dueRoutine : nil
        let trained = model.trainedTodayAt

        return Button {
            model.openWorkoutList()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Circle().fill(due != nil ? Theme.accentWash : Theme.accentDim)
                    PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: Theme.px(17))
                }
                .frame(width: Theme.px(34), height: Theme.px(34))
                Spacer(minLength: 0)
                Text("Workouts")
                    .font(Theme.text(8, weight: .semibold))
                    .foregroundStyle(Theme.textBright)
                Group {
                    if let trained {
                        Text("✓ \(shortTime(trained))")
                            .font(Theme.text(5.5, weight: .semibold))
                            .foregroundStyle(Theme.mint)
                    } else if let due {
                        Text("due · \(due.name)")
                            .font(Theme.text(5.5, weight: .semibold))
                            .foregroundStyle(Theme.accentWashText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    } else {
                        // Neither state exists in the design (it always has a
                        // due routine or a trained day) — quiet fallback.
                        Text("\(model.sequences.count) routines · free sets")
                            .font(Theme.text(5.5))
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                }
                .padding(.top, Theme.px(1))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.px(13))
            .padding(.vertical, Theme.px(12))
            .frame(height: Theme.px(118))
            .background(
                due != nil ? Theme.accentDim : Theme.card,
                in: RoundedRectangle(cornerRadius: Theme.px(20))
            )
        }
        .buttonStyle(.plain)
    }

    private var spiritTile: some View {
        tile(
            title: "Spirit", subtitle: "spirit vs journal · soon",
            subtitleColor: Theme.textMuted,
            circle: Theme.spiritDim, titleColor: Theme.textSecondary
        ) {
            SpiritGlyph(color: Theme.spirit, size: Theme.px(16))
        }
    }

    private func tile(
        title: String, subtitle: String, subtitleColor: Color,
        circle: Color, titleColor: Color,
        @ViewBuilder glyph: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Circle().fill(circle)
                glyph()
            }
            .frame(width: Theme.px(34), height: Theme.px(34))
            Spacer(minLength: 0)
            Text(title)
                .font(Theme.text(8, weight: .semibold))
                .foregroundStyle(titleColor)
            Text(subtitle)
                .font(Theme.text(5.5))
                .foregroundStyle(subtitleColor)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.top, Theme.px(1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.px(13))
        .padding(.vertical, Theme.px(12))
        .frame(height: Theme.px(118))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(20)))
    }

    // MARK: - Footer (Settings in, Unpair out)

    private var footer: some View {
        Button {
            model.openSettings()
        } label: {
            HStack(spacing: Theme.px(7)) {
                TuneGlyph(color: Theme.textMuted, size: Theme.px(13))
                Text("Settings")
                    .font(Theme.text(6))
                    .foregroundStyle(Theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.px(10))
        }
        .buttonStyle(.plain)
        .padding(.top, Theme.px(11))
    }

    private func shortTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        return f.string(from: date).lowercased()
    }
}

/// "· ◆ ready" — observed directly (a nested ObservableObject through the
/// model wouldn't re-render; the 2026-08-10 lesson).
private struct VerdictChip: View {
    @ObservedObject var readiness: Readiness
    let open: () -> Void

    var body: some View {
        if let verdict = readiness.verdict {
            Button(action: open) {
                HStack(spacing: Theme.px(3)) {
                    Text("·").foregroundStyle(Theme.textMuted)
                    PitayaMark(size: Theme.px(6), color: verdict.color)
                    Text(verdict.headerWord)
                        .foregroundStyle(verdict.color)
                }
            }
            .buttonStyle(.plain)
        }
    }
}
#endif
