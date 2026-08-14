// Home — design screen 04 ("Home — Workouts · Sleep · Journal · soon"):
// dragonfruit + Pitaya header, then the 2×2 tile grid. Workouts is live;
// Sleep and Journal are honest "soon" placeholders until their data lands
// (watch-contract.md); the fourth tile is the design's dashed "coming soon".

#if os(watchOS)
import SwiftUI
import WatchKit

struct HomeGridView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    DragonfruitLogo(size: 19)
                    Text("Pitaya")
                        .font(Theme.display(18))
                        .foregroundStyle(Theme.textBright)
                    Spacer()
                }
                .padding(.horizontal, 5)

                Text(subtitleLine)
                    .font(Theme.text(9.5))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 5)
                    .padding(.top, 1)

                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())],
                    spacing: 6
                ) {
                    tile(
                        title: "Workouts",
                        subtitle: workoutsSubtitle,
                        circle: Theme.accentDim,
                        live: true
                    ) {
                        PitayaGlyph(paths: Glyphs.kettlebell, color: Theme.accent, size: 14)
                    } action: {
                        model.openWorkoutList()
                    }
                    tile(
                        title: "Sleep", subtitle: "soon", circle: Theme.waterDim, live: false
                    ) {
                        PitayaGlyph(paths: Glyphs.moon, style: .fill, color: Theme.water, size: 13)
                    } action: {}
                    tile(
                        title: "Journal", subtitle: "soon", circle: Color(hex: 0x1E2A22), live: false
                    ) {
                        PitayaGlyph(paths: Glyphs.pencil, color: Theme.mint, size: 13)
                    } action: {}
                    comingSoonTile
                }
                .padding(.top, 8)

                footer
            }
            .padding(.horizontal, 2)
        }
    }

    private func tile(
        title: String, subtitle: String, circle: Color, live: Bool,
        @ViewBuilder glyph: () -> some View,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Circle().fill(circle)
                    glyph()
                }
                .frame(width: 30, height: 30)
                Spacer(minLength: 4)
                Text(title)
                    .font(Theme.text(13, weight: .semibold))
                    .foregroundStyle(live ? Theme.textBright : Theme.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(subtitle)
                    .font(Theme.text(9))
                    .foregroundStyle(Theme.textTertiary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(9)
            .frame(height: 88)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        }
        .buttonStyle(.plain)
    }

    private var comingSoonTile: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Circle().fill(Theme.card)
                PitayaMark(size: 8, color: Theme.textFaint)
            }
            .frame(width: 30, height: 30)
            Spacer(minLength: 4)
            Text("Coming soon")
                .font(Theme.text(12, weight: .semibold))
                .foregroundStyle(Theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("a fourth space")
                .font(Theme.text(9))
                .foregroundStyle(Theme.textFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .frame(height: 78)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .strokeBorder(
                    Theme.elementDim,
                    style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])
                )
        )
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
        .padding(.top, 7)
    }

    private var subtitleLine: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        let day = f.string(from: Date())
        // Design shows "· 23-day streak" — streak isn't in the mobile API
        // yet (deferred ask); show the honest fact we have.
        return model.historyCount > 0 ? "\(day) · \(model.historyCount) workouts" : day
    }

    private var workoutsSubtitle: String {
        if let last = model.lastKettlebell {
            let f = RelativeDateTimeFormatter()
            f.unitsStyle = .short
            return "KB " + f.localizedString(for: last, relativeTo: Date())
        }
        return "kettlebell · runs · walks"
    }
}
#endif
