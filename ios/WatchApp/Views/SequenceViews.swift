// Sequences on the wrist — design screens 06 (list), 07 (detail), 09 (EMOM
// work minute) + controls. Sequences are built in Pitaya on iPhone and run
// read-only here (watch-contract.md); a run syncs as a normal workout with
// metricsData.sequenceId.

#if os(watchOS)
import SwiftUI
import WatchKit

// MARK: - 06 · Saved sequences

struct SequencesListView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    BackChevron { model.backToWorkoutList() }
                    Text("Sequences")
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                }
                .padding(.horizontal, 4)

                Text("built in Pitaya on iPhone")
                    .font(Theme.text(8.5))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 6)

                ForEach(model.sequences) { sequence in
                    Button {
                        model.openSequence(sequence)
                    } label: {
                        HStack(spacing: 7) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(sequence.name)
                                    .font(Theme.text(11.5, weight: .semibold))
                                    .foregroundStyle(Theme.textBright)
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                                Text(recipe(for: sequence))
                                    .font(Theme.text(8.5))
                                    .foregroundStyle(Theme.textTertiary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                            }
                            Spacer(minLength: 0)
                            Text(durationPill(for: sequence))
                                .font(Theme.numeric(9, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Theme.accentDim, in: Capsule())
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 9)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func recipe(for sequence: SequenceDef) -> String {
        let parts = sequence.steps.prefix(2).map { step in
            step.reps.map { "\($0) \(shortName(step))" } ?? shortName(step)
        }
        let cadence = sequence.kind == "emom" ? "every :60" : sequence.kind
        return (parts + [cadence]).joined(separator: " · ")
    }

    private func shortName(_ step: SequenceStep) -> String {
        step.exerciseName
            .lowercased()
            .replacingOccurrences(of: "kettlebell ", with: "")
    }

    private func durationPill(for sequence: SequenceDef) -> String {
        sequence.durationMinutes.map { "\($0):00" } ?? "open"
    }
}

// MARK: - 07 · Sequence detail

struct SequenceDetailView: View {
    @EnvironmentObject private var model: AppModel
    let sequence: SequenceDef

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    BackChevron { model.backToSequences() }
                    Text(sequence.name)
                        .font(Theme.display(12.5))
                        .foregroundStyle(Theme.textBright)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                .padding(.horizontal, 4)

                HStack(spacing: 5) {
                    if let minutes = sequence.durationMinutes {
                        pill("\(minutes) MIN")
                    }
                    if sequence.kind == "emom" {
                        pill("EVERY :60")
                    } else {
                        pill(sequence.kind.uppercased())
                    }
                }
                .padding(.horizontal, 4)

                PitayaCard {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(sequence.steps.enumerated()), id: \.offset) { index, step in
                            if index > 0 {
                                Rectangle().fill(Theme.divider).frame(height: 1)
                            }
                            VStack(alignment: .leading, spacing: 1) {
                                Text("MINUTE \(index + 1) · \(index + 1 + sequence.steps.count)…")
                                    .font(Theme.text(7.5, weight: .bold))
                                    .kerning(0.9)
                                    .foregroundStyle(Theme.accent)
                                Text(stepLine(step))
                                    .font(Theme.text(11, weight: .semibold))
                                    .foregroundStyle(Theme.textBright)
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                            }
                        }
                    }
                }

                Text("Finish early — the clock is your rest.")
                    .font(Theme.text(8.5))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 4)

                Button {
                    Task { await model.startSequence(sequence) }
                } label: {
                    HStack(spacing: 6) {
                        Circle().fill(Theme.prText).frame(width: 5, height: 5)
                        Text("Start")
                            .font(Theme.display(14, weight: .semibold))
                    }
                    .foregroundStyle(Theme.textBright)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Theme.accentDeep, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 2)
        }
    }

    private func pill(_ text: String) -> some View {
        Text(text)
            .font(Theme.text(8, weight: .semibold))
            .foregroundStyle(Theme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.card, in: Capsule())
    }

    private func stepLine(_ step: SequenceStep) -> String {
        var line = step.reps.map { "\($0) " } ?? ""
        line += step.exerciseName.lowercased()
        if let seconds = step.seconds { line += " · \(seconds)s" }
        if let weight = step.weightKg { line += " · \(Fmt.kg(weight)) kg" }
        return line
    }
}

// MARK: - 09 · EMOM live runner

struct SequenceLiveView: View {
    @EnvironmentObject private var model: AppModel
    let sequence: SequenceDef

    var body: some View {
        TabView {
            runner.tag(0)
            ControlsPage(recorder: model.recorder, kind: .kettlebell, isSequence: true).tag(1)
        }
        .tabViewStyle(.verticalPage)
        .overlay {
            if model.idleNudgeActive {
                IdleNudgeOverlay(onEnd: { Task { await model.endSequenceEarly() } })
            }
        }
    }

    private var runner: some View {
        let totalRounds = max(sequence.durationMinutes ?? sequence.steps.count, 1)
        let progress = Double(60 - model.emomSecondsLeft) / 60.0

        return ZStack {
            Circle()
                .stroke(Theme.accentDim, lineWidth: 7)
                .padding(10)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Theme.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(10)
                .animation(.linear(duration: 0.25), value: progress)

            VStack(spacing: 1) {
                Text("ROUND \(max(model.emomRound, 1)) OF \(totalRounds)")
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(Theme.textTertiary)
                Text(":\(String(format: "%02d", model.emomSecondsLeft))")
                    .font(Theme.numeric(40))
                    .foregroundStyle(Theme.textBright)
                if let step = model.currentStep(of: sequence) {
                    Text(stepLabel(step))
                        .font(Theme.display(12, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                }
                if let next = model.nextStep(of: sequence) {
                    Text("next · \(next.reps.map { "\($0) " } ?? "")\(next.exerciseName.lowercased())")
                        .font(Theme.text(8.5))
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                HStack(spacing: 4) {
                    BeatingHeart(size: 10)
                    Text(model.recorder.heartRate.map { String(Int($0)) } ?? "––")
                        .font(Theme.numeric(12, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                }
                .padding(.top, 3)
            }
            .padding(.horizontal, 20)
        }
    }

    private func stepLabel(_ step: SequenceStep) -> String {
        let name = step.exerciseName
            .replacingOccurrences(of: "Kettlebell ", with: "")
            .uppercased()
        return step.reps.map { "\($0) \(name)" } ?? name
    }
}

// MARK: - Idle nudge overlay (shared with freeform live)

struct IdleNudgeOverlay: View {
    @EnvironmentObject private var model: AppModel
    let onEnd: () -> Void

    var body: some View {
        ZStack {
            Theme.bg.opacity(0.9).ignoresSafeArea()
            VStack(spacing: 8) {
                PitayaGlyph(paths: Glyphs.heart, style: .fill, color: Theme.textMuted, size: 16)
                Text("Still training?")
                    .font(Theme.display(14))
                    .foregroundStyle(Theme.textBright)
                Text("No activity for a while")
                    .font(Theme.text(9))
                    .foregroundStyle(Theme.textTertiary)
                PitayaCTA(title: "Keep going") { model.keepTraining() }
                Button("End workout", action: onEnd)
                    .buttonStyle(.plain)
                    .font(Theme.text(10, weight: .semibold))
                    .foregroundStyle(Theme.danger)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 12)
        }
    }
}
#endif
