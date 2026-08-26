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
    /// Kettlebell or Weight Training — the list is this discipline's routines
    /// and nothing else (his 08-20 IA: no Routines/Free-sets middle screen).
    let discipline: WorkoutDiscipline

    private var routines: [SequenceDef] { model.sequences(for: discipline) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    BackChevron { model.backToWorkoutList() }
                    Text(discipline.title)
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.horizontal, 4)

                Text(routines.isEmpty ? discipline.emptyHint : "built in Pitaya on iPhone")
                    .font(Theme.text(8.5))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 6)

                ForEach(routines) { sequence in
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
            step.dosePrefix + shortName(step)
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

struct DialTarget: Identifiable {
    let id: String
    let name: String
}

struct SequenceDetailView: View {
    @EnvironmentObject private var model: AppModel
    let sequence: SequenceDef
    @State private var dialTarget: DialTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    BackChevron { model.backToSequences(model.discipline(of: sequence)) }
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
                                Text(sequence.kind == "emom"
                                     ? "MINUTE \(index + 1) · \(index + 1 + sequence.steps.count)…"
                                     : "STEP \(index + 1)")
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

                let weightable = model.weightableExercises(in: sequence)
                if !weightable.isEmpty {
                    Text("TODAY'S WEIGHTS")
                        .font(Theme.text(7.5, weight: .bold))
                        .kerning(0.9)
                        .foregroundStyle(Theme.textTertiary)
                        .padding(.horizontal, 4)
                        .padding(.top, 2)
                    PitayaCard {
                        VStack(spacing: 7) {
                            ForEach(weightable, id: \.id) { exercise in
                                Button {
                                    dialTarget = DialTarget(id: exercise.id, name: exercise.name)
                                } label: {
                                    HStack {
                                        Text(exercise.name)
                                            .font(Theme.text(10.5, weight: .medium))
                                            .foregroundStyle(Theme.textPrimary)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                        Spacer(minLength: 4)
                                        Text(weightLabel(exercise.id))
                                            .font(Theme.numeric(11, weight: .semibold))
                                            .foregroundStyle(Theme.accent)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Theme.accentDim, in: Capsule())
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Text(sequence.kind == "emom"
                     ? "Finish early — the clock is your rest."
                     : "Tap Done after each move — rest between rounds.")
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
        .sheet(item: $dialTarget) { target in
            WeightDialSheet(exerciseId: target.id, exerciseName: target.name)
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

    private func weightLabel(_ exerciseId: String) -> String {
        model.weightOverrides[exerciseId].map { "\(Fmt.kg($0)) kg" } ?? "set kg"
    }

    private func stepLine(_ step: SequenceStep) -> String {
        var line = step.dosePrefix
        line += step.exerciseName.lowercased()
        if let seconds = step.seconds { line += " · \(seconds)s" }
        if let weight = model.effectiveWeight(for: step) { line += " · \(Fmt.kg(weight)) kg" }
        return line
    }
}

/// Crown-dial sheet for one exercise's weight (2 kg detents, like the free
/// set logger).
struct WeightDialSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let exerciseId: String
    let exerciseName: String
    @State private var crownIndex: Double = 0

    private var detents: [Int] { WatchPrefs.shared.dialDetents }
    private var crownWeight: Double {
        let index = max(0, min(detents.count - 1, Int(crownIndex.rounded())))
        return Double(detents[index])
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(exerciseName)
                .font(Theme.text(10.5, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            Text(Fmt.kg(crownWeight))
                .font(Theme.numeric(40))
                .foregroundStyle(Theme.accent)
                .contentTransition(.numericText())
            Text("KG · CROWN")
                .font(Theme.text(7.5, weight: .semibold))
                .kerning(0.9)
                .foregroundStyle(Theme.textTertiary)
            Spacer(minLength: 0)
            PitayaCTA(title: "Done") {
                model.weightOverrides[exerciseId] = crownWeight
                dismiss()
            }
        }
        .padding(.horizontal, 10)
        .focusable(true)
        .digitalCrownRotation(
            // Detents run ONLY through owned bells (§01 payoff); the full
            // 4–64 range applies until the rack is configured.
            $crownIndex, from: 0, through: Double(max(detents.count - 1, 0)), by: 1,
            sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onAppear {
            let start = model.weightOverrides[exerciseId] ?? 16
            let nearest = detents.enumerated().min {
                abs(Double($0.element) - start) < abs(Double($1.element) - start)
            }?.offset ?? 0
            crownIndex = Double(nearest)
        }
    }
}

// MARK: - 09 · EMOM live runner

struct SequenceLiveView: View {
    @EnvironmentObject private var model: AppModel
    let sequence: SequenceDef

    var body: some View {
        TabView {
            Group {
                if sequence.kind == "emom" {
                    runner
                } else {
                    CircuitRunnerPage(sequence: sequence)
                }
            }
            .tag(0)
            ControlsPage(recorder: model.recorder, kind: .kettlebell, isSequence: true).tag(1)
        }
        .tabViewStyle(.verticalPage)
        .overlay {
            if model.idleNudgeActive {
                IdleNudgeOverlay(onEnd: { Task { await model.endSequenceEarly() } })
            }
        }
        .overlay {
            CountdownOverlay()
        }
    }

    /// §10 AOD twin ("Always-On dimmed state"): ring 13→4 px in the dimmed
    /// palette, countdown → session clock, weight + HR leave, move stays.
    @Environment(\.isLuminanceReduced) private var dimmed

    private var runner: some View {
        let totalRounds = max(sequence.durationMinutes ?? sequence.steps.count, 1)
        let progress = Double(60 - model.emomSecondsLeft) / 60.0

        return ZStack {
            Circle()
                .stroke(dimmed ? Color(hex: 0x1A191D) : Theme.accentDim,
                        lineWidth: dimmed ? 2.25 : 7)
                .padding(10)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(dimmed ? Color(hex: 0x5B3B4A) : Theme.accent,
                        style: StrokeStyle(lineWidth: dimmed ? 2.25 : 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(10)
                .animation(dimmed ? nil : .linear(duration: 0.25), value: progress)

            VStack(spacing: 1) {
                Text("ROUND \(max(model.emomRound, 1)) OF \(totalRounds)")
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(dimmed ? Theme.textFaint : Theme.textTertiary)
                if dimmed {
                    // 1 Hz budget: the session clock replaces the countdown.
                    Text(Fmt.clock(model.recorder.elapsed))
                        .font(.custom("FamiljenGrotesk-Medium", size: 40 * 1.125))
                        .foregroundStyle(Theme.textTertiary)
                } else {
                    Text(":\(String(format: "%02d", model.emomSecondsLeft))")
                        .font(Theme.numeric(40))
                        .foregroundStyle(Theme.textBright)
                }
                if let step = model.currentStep(of: sequence) {
                    // Move name stays in AOD (weight leaves); springs in at
                    // each boundary (translateY 10→0, 0.35 s).
                    Text(dimmed ? bareMoveName(step) : stepLabel(step))
                        .font(Theme.display(12, weight: .semibold))
                        .foregroundStyle(dimmed ? Color(hex: 0x8A5B6E) : Theme.accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                        .id(model.emomRound)
                        .transition(.offset(y: Theme.px(10)).combined(with: .opacity))
                        .animation(dimmed ? nil : .spring(duration: 0.35), value: model.emomRound)
                }
                if !dimmed {
                    if let next = model.nextStep(of: sequence) {
                        Text("next · \(next.dosePrefix)\(next.exerciseName.lowercased())")
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
            }
            .padding(.horizontal, 20)
        }
        .overlay {
            // §10 minute boundary: full-screen wash, 120 ms in / 400 ms out.
            if model.emomBoundaryWash, !dimmed {
                Theme.accentWash.ignoresSafeArea()
                    .transition(.opacity)
            }
        }
        .animation(
            model.emomBoundaryWash ? .easeIn(duration: 0.12) : .easeOut(duration: 0.4),
            value: model.emomBoundaryWash
        )
        .overlay(alignment: .topLeading) {
            // §05: the EMOM runner has no visible CTA (design 09), but the
            // Double Tap map says "move done early" — the gesture rides an
            // invisible control; work seconds land in stepSeconds[] + tape.
            Button { model.markEmomDone() } label: {
                Color.clear.frame(width: 1, height: 1)
            }
            .buttonStyle(.plain)
            .handGestureShortcut(.primaryAction)
            .accessibilityLabel("Move done early")
        }
    }

    private func stepLabel(_ step: SequenceStep) -> String {
        let name = step.exerciseName
            .replacingOccurrences(of: "Kettlebell ", with: "")
            .uppercased()
        var label = step.dosePrefix.isEmpty ? name : step.dosePrefix + name
        if let weight = model.effectiveWeight(for: step) {
            label += " · \(Fmt.kg(weight))KG"
        }
        return label
    }

    /// AOD keeps the move, drops reps + weight ("SWINGS").
    private func bareMoveName(_ step: SequenceStep) -> String {
        step.exerciseName
            .replacingOccurrences(of: "Kettlebell ", with: "")
            .uppercased()
    }
}

// MARK: - Circuit runner (tap-driven; rest between rounds per design 10/14)

struct CircuitRunnerPage: View {
    @EnvironmentObject private var model: AppModel
    let sequence: SequenceDef

    var body: some View {
        if let restLeft = model.circuitRestLeft {
            restView(restLeft)
        } else {
            workView
        }
    }

    private var workView: some View {
        let step = sequence.steps.indices.contains(model.circuitStepIndex)
            ? sequence.steps[model.circuitStepIndex] : sequence.steps.last

        return VStack(spacing: 3) {
            Text("ROUND \(model.circuitRound) OF \(model.circuitTotalRounds(sequence))")
                .font(Theme.text(8.5, weight: .bold))
                .kerning(1)
                .foregroundStyle(Theme.textTertiary)
            Text("STEP \(model.circuitStepIndex + 1) OF \(sequence.steps.count)")
                .font(Theme.text(7.5, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.textMuted)

            Spacer(minLength: 2)

            if let step {
                if step.isToFailure {
                    // The big numeral slot still has to say something, or a
                    // to-failure step reads as a movement with no prescription.
                    Text("MAX")
                        .font(Theme.display(30, weight: .bold))
                        .foregroundStyle(Theme.textBright)
                } else if let reps = step.reps {
                    Text("\(reps)")
                        .font(Theme.numeric(38))
                        .foregroundStyle(Theme.textBright)
                }
                Text(step.exerciseName.replacingOccurrences(of: "Kettlebell ", with: ""))
                    .font(Theme.display(13, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
                if let weight = model.effectiveWeight(for: step) {
                    Text("\(Fmt.kg(weight)) kg")
                        .font(Theme.numeric(11, weight: .semibold))
                        .foregroundStyle(Theme.textSecondary)
                }
            }

            HStack(spacing: 4) {
                BeatingHeart(size: 10)
                Text(model.recorder.heartRate.map { String(Int($0)) } ?? "––")
                    .font(Theme.numeric(11, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
            }
            .padding(.top, 1)

            Spacer(minLength: 2)

            // §05: the circuit step's Done wears the Double Tap.
            PitayaCTA(title: "Done", primary: true) {
                Task { await model.advanceCircuitStep(sequence) }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
    }

    /// §10 rest: calm mint until :03, each of the last 3 s pulses the digits
    /// (1→1.12, 0.5 s); :00 flips to the accent GO + round/move line with a
    /// 0.5 s pop before work resumes.
    private func restView(_ seconds: Int) -> some View {
        ZStack {
            Circle()
                .stroke(Theme.mintRing, lineWidth: 2)
                .padding(18)
                .scaleEffect(1.02)
            if seconds == 0 {
                VStack(spacing: 2) {
                    Text("GO")
                        .font(Theme.numeric(46))
                        .foregroundStyle(Theme.accent)
                        .scaleEffect(goPop ? 1.0 : 0.8)
                        .animation(
                            .interpolatingSpring(stiffness: 320, damping: 14), value: goPop
                        )
                        .onAppear { goPop = true }
                        .onDisappear { goPop = false }
                    Text("round \(model.circuitRound + 1) · \(nextRoundFirstMove)")
                        .font(Theme.text(9))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            } else {
                VStack(spacing: 2) {
                    Text("REST")
                        .font(Theme.text(9, weight: .bold))
                        .kerning(1.4)
                        .foregroundStyle(Theme.mint)
                    Text(":\(String(format: "%02d", seconds))")
                        .font(Theme.numeric(46))
                        .foregroundStyle(Theme.mint)
                        .scaleEffect(digitPulse ? 1.12 : 1.0)
                        .onChange(of: seconds) { _, s in
                            guard (1...3).contains(s) else { return }
                            withAnimation(.easeOut(duration: 0.25)) { digitPulse = true }
                            Task {
                                try? await Task.sleep(nanoseconds: 250_000_000)
                                withAnimation(.easeIn(duration: 0.25)) { digitPulse = false }
                            }
                        }
                    Text("round \(model.circuitRound + 1) next")
                        .font(Theme.text(9))
                        .foregroundStyle(Theme.textSecondary)
                    Button("Skip") {
                        model.skipCircuitRest()
                    }
                    .buttonStyle(.plain)
                    .font(Theme.text(10, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.top, 4)
                    // §05: on the rest ring, Double Tap skips the rest.
                    .handGestureShortcut(.primaryAction)
                }
            }
        }
    }

    @State private var goPop = false
    @State private var digitPulse = false

    private var nextRoundFirstMove: String {
        sequence.steps.first?.exerciseName.lowercased() ?? "next move"
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
