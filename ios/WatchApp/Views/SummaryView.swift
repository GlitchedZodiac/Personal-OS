// Workout review — Round 1 §03 (1g "Receipts, versus last run"), keeping the
// explicit Save/Discard choice (Michael's ask; the design's mock is the
// post-save state). Every number answers "better than last time?": deltas
// against the last run of the SAME routine (local rows instantly, server
// coda after sync). Insight cards are ranked — PR › progression › recovery
// › zones — and at most two render; the rest stay on the phone.

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
            VStack(alignment: .leading, spacing: 0) {
                header

                if let summary = model.summary {
                    contextLine(summary)
                    statsCard(summary)
                    insightCards(summary)
                    tapeCard(summary)
                }

                if isSaved {
                    Text("Full breakdown in Pitaya")
                        .font(Theme.wText(5.75))
                        .foregroundStyle(Theme.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Theme.px(12))
                    PitayaCTA(title: "Done", primary: true) { model.dismissSummary() }
                        .padding(.top, Theme.px(10))
                } else {
                    // §05: on the summary, Double Tap saves.
                    PitayaCTA(title: "Save workout", primary: true) {
                        Task { await model.saveWorkout() }
                    }
                    .padding(.top, Theme.px(12))
                    Button {
                        confirmDiscard = true
                    } label: {
                        Text("Discard")
                            .font(Theme.wText(11, weight: .semibold))
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

    // MARK: - Header (1g: mint check · Saved · synced to Pitaya)

    private var header: some View {
        HStack(spacing: Theme.px(10)) {
            ZStack {
                Circle().stroke(isSaved ? Theme.mint : Theme.element, lineWidth: 2)
                PitayaGlyph(
                    paths: Glyphs.check, style: .stroke(width: 3),
                    color: isSaved ? Theme.mint : Theme.textTertiary, size: Theme.px(15)
                )
            }
            .frame(width: Theme.px(34), height: Theme.px(34))

            VStack(alignment: .leading, spacing: 1) {
                Text(isSaved ? "Saved" : "Finished")
                    .font(Theme.wDisplay(12))
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
                .font(Theme.wText(5.75)).foregroundStyle(Theme.textTertiary)
        case .syncing:
            HStack(spacing: 4) {
                ProgressView().tint(Theme.accent).scaleEffect(0.55).frame(width: 10, height: 10)
                Text("syncing to Pitaya")
                    .font(Theme.wText(5.75)).foregroundStyle(Theme.textTertiary)
            }
        case .synced:
            Text("synced to Pitaya")
                .font(Theme.wText(5.75)).foregroundStyle(Theme.mint)
        case .queued:
            Text("offline · queued to sync")
                .font(Theme.wText(5.75)).foregroundStyle(Theme.textTertiary)
        case .failed(let message):
            Text(message)
                .font(Theme.wText(5.75)).foregroundStyle(Theme.danger)
        case .idle:
            EmptyView()
        }
    }

    // MARK: - Context line ("EMOM 20 — Swings + Press · vs Sat Aug 9")

    @ViewBuilder
    private func contextLine(_ summary: WorkoutSummary) -> some View {
        if summary.sequenceName != nil || model.lastRunBaseline != nil {
            (Text(summary.sequenceName ?? summary.kind.title)
                .foregroundStyle(Theme.textSecondary)
                .fontWeight(.semibold)
                + Text(vsSuffix)
                .foregroundStyle(Theme.textMuted))
                .font(Theme.wText(6))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, Theme.px(4))
                .padding(.top, Theme.px(10))
        }
    }

    private var vsSuffix: String {
        guard let lastRun = model.lastRunBaseline else { return "" }
        let f = DateFormatter()
        f.dateFormat = "EEE MMM d"
        return " · vs \(f.string(from: lastRun.startedAt))"
    }

    // MARK: - Stats card (values + deltas: mint change, ghost "=")

    private func statsCard(_ summary: WorkoutSummary) -> some View {
        let lastRun = model.lastRunBaseline
        return VStack(spacing: Theme.px(12)) {
            HStack(spacing: Theme.px(12)) {
                deltaCell(
                    value: Fmt.clock(summary.durationSeconds), label: "TIME",
                    delta: lastRun?.durationMinutes.map {
                        Int((summary.durationSeconds / 60).rounded()) - $0
                    }
                )
                deltaCell(
                    value: summary.calories.map { String(Int($0)) } ?? "––",
                    label: "KCAL",
                    delta: zip2(summary.calories, lastRun?.caloriesBurned)
                        .map { Int($0.rounded()) - Int($1.rounded()) }
                )
            }
            HStack(spacing: Theme.px(12)) {
                deltaCell(
                    value: summary.avgHeartRate.map { String(Int($0)) } ?? "––",
                    label: "AVG BPM",
                    delta: zip2(summary.avgHeartRate, lastRun?.avgHeartRateBpm.map(Double.init))
                        .map { Int($0.rounded()) - Int($1.rounded()) }
                )
                fourthCell(summary, lastRun: lastRun)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.px(16))
        .padding(.vertical, Theme.px(14))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
        .padding(.top, Theme.px(8))
    }

    @ViewBuilder
    private func fourthCell(_ summary: WorkoutSummary, lastRun: LastRunStats?) -> some View {
        if summary.totalVolumeKg > 0 {
            // 1g: volume is the hero stat — accent value.
            deltaCell(
                value: Fmt.grouped(summary.totalVolumeKg), label: "KG VOLUME",
                delta: lastRun.map { Int(summary.totalVolumeKg.rounded()) - Int($0.volumeKg.rounded()) },
                color: Theme.accent
            )
        } else if summary.kind == .freestyle {
            // No volume, no distance — the honest fourth number for a
            // follow-along is where the effort actually sat.
            deltaCell(
                value: dominantZoneLabel ?? "––", label: "TOP ZONE",
                delta: nil, color: Theme.accent
            )
        } else {
            deltaCell(
                value: summary.distanceMeters.map { String(format: "%.2f", $0 / 1000) } ?? "––",
                label: "KM", delta: nil
            )
        }
    }

    /// "20:00 =" · "4,320 +320" — value Familjen 22px, delta 11px (mint for
    /// any change, ghost for equal), label 9.5px caps.
    private func deltaCell(
        value: String, label: String, delta: Int?, color: Color = Theme.textBright
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(Theme.wDisplay(11))
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let delta {
                    Text(deltaText(delta))
                        .font(Theme.wText(5.5, weight: .semibold))
                        .foregroundStyle(delta == 0 ? Theme.textMuted : Theme.mint)
                }
            }
            Text(label)
                .font(Theme.wText(4.75, weight: .semibold))
                .kerning(0.7)
                .foregroundStyle(Theme.textTertiary)
                .padding(.top, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The zone that held the most time in this session, from the on-wrist
    /// breakdown (freestyle) or the server's enrichment (everything else).
    private var dominantZoneLabel: String? {
        guard let seconds = model.freestyleZoneSeconds ?? model.summaryZones,
              let top = seconds.enumerated().filter({ $0.element > 0 })
                  .max(by: { $0.element < $1.element })
        else { return nil }
        return model.zones?.name(top.offset + 1) ?? "Z\(top.offset + 1)"
    }

    private func deltaText(_ delta: Int) -> String {
        if delta == 0 { return "=" }
        return delta > 0 ? "+\(Fmt.grouped(Double(delta)))" : "−\(Fmt.grouped(Double(-delta)))"
    }

    private func zip2<A, B>(_ a: A?, _ b: B?) -> (A, B)? {
        guard let a, let b else { return nil }
        return (a, b)
    }

    // MARK: - Insights (ranked PR › progression › recovery › zones, max 2)

    private enum Insight { case pr, progression, recovery, zones }

    private func rankedInsights(_ summary: WorkoutSummary) -> [Insight] {
        var available: [Insight] = []
        if !summary.prs.isEmpty { available.append(.pr) }
        if let coda = model.routineCoda, coda.verdict != "hold",
           model.summary?.sequenceName != nil {
            available.append(.progression)
        }
        if model.recoveryCapture != nil { available.append(.recovery) }
        if model.summaryZones?.contains(where: { $0 > 0 }) == true {
            available.append(.zones)
        }
        return Array(available.prefix(2))
    }

    @ViewBuilder
    private func insightCards(_ summary: WorkoutSummary) -> some View {
        ForEach(Array(rankedInsights(summary).enumerated()), id: \.offset) { _, insight in
            switch insight {
            case .pr:
                VStack(spacing: Theme.px(8)) {
                    ForEach(summary.prs, id: \.self) { pr in
                        PRBanner(text: prText(pr))
                    }
                }
                .padding(.top, Theme.px(8))
            case .progression:
                progressionCard
            case .recovery:
                recoveryCard
            case .zones:
                zonesCard
            }
        }
    }

    /// 1g progression card — blush wash, diamond, the verdict's reason.
    @ViewBuilder
    private var progressionCard: some View {
        if let coda = model.routineCoda {
            HStack(alignment: .top, spacing: Theme.px(9)) {
                PitayaMark(size: Theme.px(10), color: Theme.prText)
                    .padding(.top, Theme.px(3))
                VStack(alignment: .leading, spacing: Theme.px(3)) {
                    Text(coda.reason ?? defaultReason(coda.verdict))
                        .font(Theme.wText(7, weight: .semibold))
                        .foregroundStyle(Theme.prText)
                        .lineSpacing(2)
                    if coda.verdict == "raise" {
                        Text("the next bell waits in Pitaya → Train")
                            .font(Theme.wText(5.5))
                            .foregroundStyle(Theme.accentWashSub)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.px(15))
            .padding(.vertical, Theme.px(13))
            .background(Theme.accentWash, in: RoundedRectangle(cornerRadius: Theme.px(16)))
            .padding(.top, Theme.px(8))
        }
    }

    private func defaultReason(_ verdict: String) -> String {
        verdict == "raise"
            ? "Clean runs at the current bells — the next one is earned."
            : "Recent runs stopped short — drop a bell, finish clean."
    }

    /// 1g recovery card — "Recovery −31 in 1:00 · 158 → 127 · quick".
    @ViewBuilder
    private var recoveryCard: some View {
        if let capture = model.recoveryCapture {
            HStack(spacing: Theme.px(12)) {
                RecoveryGlyph(color: Theme.accent, arrowColor: Theme.mint, size: Theme.px(20))
                VStack(alignment: .leading, spacing: 1) {
                    (Text("Recovery −\(capture.drop)")
                        .font(Theme.wText(7.5, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        + Text("  in 1:00")
                        .font(Theme.wText(5.5))
                        .foregroundStyle(Theme.textTertiary))
                        .lineLimit(1)
                    Text("\(capture.fromBpm) → \(capture.toBpm) after the last set · \(capture.band)")
                        .font(Theme.wText(5.5))
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                recoverySparkline(capture.samples)
                    .frame(width: Theme.px(52), height: Theme.px(24))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.px(15))
            .padding(.vertical, Theme.px(13))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(16)))
            .padding(.top, Theme.px(8))
        }
    }

    private func recoverySparkline(_ samples: [Int]) -> some View {
        GeometryReader { geo in
            Path { path in
                guard samples.count > 1,
                      let low = samples.min(), let high = samples.max(), high > low
                else { return }
                let stepX = geo.size.width / CGFloat(samples.count - 1)
                for (i, bpm) in samples.enumerated() {
                    let x = CGFloat(i) * stepX
                    let y = geo.size.height
                        * (1 - CGFloat(bpm - low) / CGFloat(high - low))
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(Theme.mint, style: StrokeStyle(lineWidth: Theme.px(2), lineCap: .round))
        }
    }

    /// 1g zones card — stacked bar in the design's four-step ramp.
    @ViewBuilder
    private var zonesCard: some View {
        if let seconds = model.summaryZones {
            let total = seconds.reduce(0, +)
            VStack(alignment: .leading, spacing: 0) {
                Text("TIME IN ZONES")
                    .font(Theme.wText(4.75, weight: .semibold))
                    .kerning(0.7)
                    .foregroundStyle(Theme.textTertiary)
                HStack(spacing: Theme.px(3)) {
                    ForEach(Array(seconds.enumerated()), id: \.offset) { index, zoneSeconds in
                        if zoneSeconds > 0, total > 0 {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Self.zoneColors[min(index, Self.zoneColors.count - 1)])
                                .frame(width: max(
                                    Theme.px(6),
                                    zoneWidth(zoneSeconds, total: total)
                                ))
                        }
                    }
                }
                .frame(height: Theme.px(14))
                .clipShape(RoundedRectangle(cornerRadius: Theme.px(5)))
                .padding(.top, Theme.px(9))
                Text(zonesCaption(seconds))
                    .font(Theme.wText(5.5))
                    .foregroundStyle(Theme.textTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, Theme.px(7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.px(15))
            .padding(.vertical, Theme.px(13))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(16)))
            .padding(.top, Theme.px(8))
        }
    }

    /// Z1→Z4 from the mock; Z5 reuses the top accent (no fifth color exists
    /// in the design — flagged in the handoff report).
    private static let zoneColors: [Color] = [
        Theme.elementDim, Theme.element, Theme.accentDeep, Theme.accent, Theme.accent,
    ]

    private func zoneWidth(_ seconds: Int, total: Int) -> CGFloat {
        // Proportional share of the card's inner width (≈ canvas 352 − pads).
        Theme.px(290) * CGFloat(seconds) / CGFloat(total)
    }

    /// "Z3 9:12 — most of the work · Z4 4:01" — top two zones by time.
    private func zonesCaption(_ seconds: [Int]) -> String {
        let ranked = seconds.enumerated()
            .filter { $0.element > 0 }
            .sorted { $0.element > $1.element }
        guard let top = ranked.first else { return "" }
        var caption = "Z\(top.offset + 1) \(Fmt.clock(TimeInterval(top.element))) — most of the work"
        if let second = ranked.dropFirst().first {
            caption += " · Z\(second.offset + 1) \(Fmt.clock(TimeInterval(second.element)))"
        }
        return caption
    }

    // MARK: - Session tape ("THE 20 MINUTES" — EMOM work-per-minute bars)

    @ViewBuilder
    private func tapeCard(_ summary: WorkoutSummary) -> some View {
        let rounds = model.emomRoundSeconds
        if rounds.contains(where: { $0 > 0 }) {
            let peak = max(rounds.max() ?? 60, 1)
            let prRound = prRoundIndex
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("THE \(Int((summary.durationSeconds / 60).rounded())) MINUTES")
                        .font(Theme.wText(4.75, weight: .semibold))
                        .kerning(0.7)
                        .foregroundStyle(Theme.textTertiary)
                    Spacer(minLength: 0)
                    PitayaMark(size: Theme.px(10), color: Theme.accent)
                }
                HStack(alignment: .bottom, spacing: Theme.px(2.5)) {
                    ForEach(Array(rounds.enumerated()), id: \.offset) { index, work in
                        RoundedRectangle(cornerRadius: Theme.px(2.5))
                            .fill(index == prRound ? Theme.accent : Theme.accentDeep)
                            .frame(height: Theme.px(30) * CGFloat(max(work, 4)) / CGFloat(peak))
                    }
                }
                .frame(height: Theme.px(30), alignment: .bottom)
                .padding(.top, Theme.px(9))
                Text(tapeCaption(rounds, prRound: prRound))
                    .font(Theme.wText(5.5))
                    .foregroundStyle(Theme.textTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, Theme.px(7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.px(15))
            .padding(.vertical, Theme.px(13))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(16)))
            .padding(.top, Theme.px(8))
        }
    }

    /// PR-to-round attribution rides on the same early-done taps that fill
    /// emomRoundSeconds (Wave D); until then no bar claims the diamond.
    private var prRoundIndex: Int? { model.emomPRRound }

    private func tapeCaption(_ rounds: [Int], prRound: Int?) -> String {
        let spare = rounds.map { max(60 - $0, 0) }
        let avgSpare = spare.isEmpty ? 0 : spare.reduce(0, +) / spare.count
        var caption = "work per minute · avg :\(String(format: "%02d", avgSpare)) spare"
        if let prRound { caption += " · ◆ PR in round \(prRound + 1)" }
        return caption
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
