// Save screen — design 12: Saved + sync status, the 2×2 stats grid, and PR
// celebration banners when the session beat history.

#if os(watchOS)
import SwiftUI

struct SummaryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header

                if let summary = model.summary {
                    PitayaCard {
                        VStack(spacing: 9) {
                            HStack {
                                StatCell(value: Fmt.clock(summary.durationSeconds), label: "TIME")
                                StatCell(
                                    value: summary.calories.map { String(Int($0)) } ?? "––",
                                    label: "KCAL"
                                )
                            }
                            HStack {
                                StatCell(
                                    value: summary.avgHeartRate.map { String(Int($0)) } ?? "––",
                                    label: "AVG BPM"
                                )
                                if summary.kind == .kettlebell {
                                    StatCell(
                                        value: Fmt.grouped(summary.totalVolumeKg),
                                        label: "KG VOLUME"
                                    )
                                } else {
                                    StatCell(
                                        value: summary.distanceMeters.map {
                                            String(format: "%.2f", $0 / 1000)
                                        } ?? "––",
                                        label: "KM"
                                    )
                                }
                            }
                        }
                    }

                    ForEach(summary.prs, id: \.self) { pr in
                        PRBanner(text: prText(pr))
                    }
                }

                Text("Full breakdown in Pitaya")
                    .font(Theme.text(8))
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity)

                PitayaCTA(title: "Done") { model.dismissSummary() }
            }
            .padding(.horizontal, 6)
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().stroke(Theme.mint, lineWidth: 2)
                PitayaGlyph(
                    paths: Glyphs.check, style: .stroke(width: 3),
                    color: Theme.mint, size: 11
                )
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text("Saved")
                    .font(Theme.display(15))
                    .foregroundStyle(Theme.textBright)
                syncLine
            }
        }
    }

    @ViewBuilder
    private var syncLine: some View {
        switch model.syncState {
        case .syncing:
            HStack(spacing: 4) {
                ProgressView().tint(Theme.accent).scaleEffect(0.55).frame(width: 10, height: 10)
                Text("syncing to Pitaya")
                    .font(Theme.text(8)).foregroundStyle(Theme.textTertiary)
            }
        case .synced:
            Text("synced to Pitaya")
                .font(Theme.text(8)).foregroundStyle(Theme.mint)
        case .queued:
            Text("offline · queued to sync")
                .font(Theme.text(8)).foregroundStyle(Theme.textTertiary)
        case .failed(let message):
            Text(message)
                .font(Theme.text(8)).foregroundStyle(Theme.danger)
        case .idle:
            EmptyView()
        }
    }

    private func prText(_ pr: PRBaselines.SessionPR) -> String {
        switch pr.kind {
        case "weight":
            return "PR · \(pr.exerciseName) \(Fmt.kg(pr.value)) kg"
        default:
            return "PR · \(pr.exerciseName) volume \(Fmt.grouped(pr.value)) kg"
        }
    }
}
#endif
