// Workout review — design 13's saved state, now with an explicit choice
// first (Michael's ask): review the numbers, then Save (syncs to Pitaya) or
// Discard (for tests and forgotten-running sessions). PR banners show the
// local estimate immediately and flip to the server's verdict after Save.

#if os(watchOS)
import SwiftUI

struct SummaryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var confirmDiscard = false

    private var isSaved: Bool {
        switch model.syncState {
        case .synced, .queued, .syncing: return true
        default: return false
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header

                if let summary = model.summary {
                    if let sequenceName = summary.sequenceName {
                        Text(sequenceName)
                            .font(Theme.text(9.5, weight: .semibold))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .padding(.horizontal, 4)
                    }

                    PitayaCard {
                        VStack(spacing: 10) {
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
                                fourthCell(summary)
                            }
                        }
                    }

                    ForEach(summary.prs, id: \.self) { pr in
                        PRBanner(text: prText(pr))
                    }
                }

                if isSaved {
                    Text("Full breakdown in Pitaya")
                        .font(Theme.text(8.5))
                        .foregroundStyle(Theme.textMuted)
                        .frame(maxWidth: .infinity)
                    PitayaCTA(title: "Done") { model.dismissSummary() }
                } else {
                    PitayaCTA(title: "Save workout") {
                        Task { await model.saveWorkout() }
                    }
                    Button {
                        confirmDiscard = true
                    } label: {
                        Text("Discard")
                            .font(Theme.text(11, weight: .semibold))
                            .foregroundStyle(Theme.danger)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 6)
        }
        .confirmationDialog(
            "Discard this workout?",
            isPresented: $confirmDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { model.discardWorkout() }
            Button("Keep", role: .cancel) {}
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().stroke(isSaved ? Theme.mint : Theme.element, lineWidth: 2)
                PitayaGlyph(
                    paths: Glyphs.check, style: .stroke(width: 3),
                    color: isSaved ? Theme.mint : Theme.textTertiary, size: 11
                )
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text(isSaved ? "Saved" : "Finished")
                    .font(Theme.display(16))
                    .foregroundStyle(Theme.textBright)
                syncLine
            }
        }
    }

    @ViewBuilder
    private var syncLine: some View {
        switch model.syncState {
        case .unsaved:
            Text("review · save or discard")
                .font(Theme.text(8.5)).foregroundStyle(Theme.textTertiary)
        case .syncing:
            HStack(spacing: 4) {
                ProgressView().tint(Theme.accent).scaleEffect(0.55).frame(width: 10, height: 10)
                Text("syncing to Pitaya")
                    .font(Theme.text(8.5)).foregroundStyle(Theme.textTertiary)
            }
        case .synced:
            Text("synced to Pitaya")
                .font(Theme.text(8.5)).foregroundStyle(Theme.mint)
        case .queued:
            Text("offline · queued to sync")
                .font(Theme.text(8.5)).foregroundStyle(Theme.textTertiary)
        case .failed(let message):
            Text(message)
                .font(Theme.text(8.5)).foregroundStyle(Theme.danger)
        case .idle:
            EmptyView()
        }
    }

    @ViewBuilder
    private func fourthCell(_ summary: WorkoutSummary) -> some View {
        if let rounds = summary.roundsCompleted {
            StatCell(value: "\(rounds)", label: "ROUNDS", color: Theme.accent)
        } else if summary.kind == .kettlebell {
            StatCell(value: Fmt.grouped(summary.totalVolumeKg), label: "KG VOLUME")
        } else {
            StatCell(
                value: summary.distanceMeters.map { String(format: "%.2f", $0 / 1000) } ?? "––",
                label: "KM"
            )
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
