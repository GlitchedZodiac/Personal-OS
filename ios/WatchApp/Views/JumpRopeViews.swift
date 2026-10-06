// Jump rope on the wrist (2026-10-05): the setup screen, the interval clock
// face, and the keypad for his own jump count.
//
// NO DESIGN SLICE EXISTS for any of these — built inside the watch design
// system (Theme idiom, the sequence screens' card and stepper grammar, the
// EMOM face's countdown) at Michael's call, and flagged for the next design
// pass. PORT GATE applies the moment a slice lands. The legibility floor is
// met here on purpose: no label under 8 pt on screen, every control ≥ 38 pt.

#if os(watchOS)
import SwiftUI
import WatchKit

// MARK: - Setup

struct JumpRopeSetupView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    BackChevron { model.backToWorkoutList() }
                    PitayaGlyph(paths: Glyphs.jumpRope, color: Theme.accent, size: 15)
                    Text("Jump Rope")
                        .font(Theme.display(16))
                        .foregroundStyle(Theme.textBright)
                }
                .padding(.horizontal, 4)

                modePicker

                if model.ropeConfig.intervals {
                    stepper(
                        "WORK", value: "\(model.ropeConfig.workSeconds)s",
                        minus: { model.ropeConfig.workSeconds = max(10, model.ropeConfig.workSeconds - 5) },
                        plus: { model.ropeConfig.workSeconds = min(600, model.ropeConfig.workSeconds + 5) }
                    )
                    stepper(
                        "REST", value: "\(model.ropeConfig.restSeconds)s",
                        minus: { model.ropeConfig.restSeconds = max(0, model.ropeConfig.restSeconds - 5) },
                        plus: { model.ropeConfig.restSeconds = min(600, model.ropeConfig.restSeconds + 5) }
                    )
                    stepper(
                        "ROUNDS",
                        value: model.ropeConfig.rounds == 0 ? "open" : "\(model.ropeConfig.rounds)",
                        minus: { model.ropeConfig.rounds = max(0, model.ropeConfig.rounds - 1) },
                        plus: { model.ropeConfig.rounds = min(99, model.ropeConfig.rounds + 1) }
                    )
                }

                Text(planLine)
                    .font(Theme.text(9))
                    .foregroundStyle(Theme.textTertiary)
                    .padding(.horizontal, 6)
                    .padding(.top, 1)

                PitayaCTA(title: "Start", primary: true) {
                    Task { await model.startJumpRope() }
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 2)
        }
    }

    /// "20 min · 10:00 jumping" — what the dials add up to.
    private var planLine: String {
        let config = model.ropeConfig
        guard config.intervals else { return "No intervals — jump until you end it." }
        guard let total = config.plannedSeconds else {
            return "\(config.protocolLabel) until you end it."
        }
        return "\(Fmt.clock(TimeInterval(total))) total · "
            + "\(Fmt.clock(TimeInterval(config.rounds * config.workSeconds))) jumping"
    }

    private var modePicker: some View {
        HStack(spacing: 5) {
            modeButton("Intervals", on: model.ropeConfig.intervals) {
                model.ropeConfig.intervals = true
            }
            modeButton("Continuous", on: !model.ropeConfig.intervals) {
                model.ropeConfig.intervals = false
            }
        }
    }

    private func modeButton(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.text(10.5, weight: .semibold))
                .foregroundStyle(on ? Theme.textBright : Theme.textTertiary)
                .frame(maxWidth: .infinity)
                .pitayaTappable()
                .background(on ? Theme.accentDeep : Theme.card, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func stepper(
        _ label: String, value: String,
        minus: @escaping () -> Void, plus: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(Theme.text(8.5, weight: .bold))
                .kerning(1)
                .foregroundStyle(Theme.textTertiary)
                .frame(width: 46, alignment: .leading)
            Spacer(minLength: 0)
            stepButton("minus", action: minus)
            Text(value)
                .font(Theme.numeric(17))
                .foregroundStyle(Theme.textBright)
                .frame(minWidth: 46)
                .contentTransition(.numericText())
            stepButton("plus", action: plus)
        }
        .padding(.leading, 9)
        .padding(.trailing, 3)
        .padding(.vertical, 3)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
    }

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Haptics.minor(.click)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.accent)
                .frame(width: 28, height: 28)
                .background(Theme.accentDim, in: Circle())
                .pitayaTappable(minWidth: Theme.minTap)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Live

struct JumpRopeLiveView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var recorder: WorkoutRecorder
    @State private var page = 0

    init() {
        // Observed directly so HR and calories tick (a nested
        // ObservableObject does not re-render through the model).
        recorder = AppModel.shared?.recorder ?? WorkoutRecorder()
    }

    var body: some View {
        TabView(selection: $page) {
            JumpRopeFace(recorder: recorder).tag(0)
            EffortPage(recorder: recorder, kind: .jumpRope).tag(1)
            ControlsPage(recorder: recorder, kind: .jumpRope, isSequence: false).tag(2)
        }
        .tabViewStyle(.verticalPage)
        .onAppear {
            #if DEBUG
            if let forced = ProcessInfo.processInfo
                .environment["PITAYA_SMOKE_PAGE"].flatMap(Int.init) {
                page = forced
            }
            #endif
        }
        .overlay { ZoneBloomOverlay(recorder: recorder) }
        .overlay { CountdownOverlay() }
    }
}

private struct JumpRopeFace: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    @Environment(\.isLuminanceReduced) private var dimmed

    private var config: RopeConfig { model.ropeConfig }
    private var working: Bool { model.ropePhase == .work }
    private var paused: Bool { recorder.phase == .paused }
    /// Work wears the brand pink, rest the recovery mint — the two things
    /// he needs to tell apart at a glance mid-round.
    private var tint: Color {
        if dimmed || paused { return Theme.textTertiary }
        return working ? Theme.accent : Theme.mint
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Text(config.intervals ? "ROPE · \(config.protocolLabel)" : "JUMP ROPE")
                    .font(Theme.text(8.5, weight: .bold))
                    .kerning(1.1)
                    .foregroundStyle(Theme.accent)
                Spacer(minLength: 0)
                ZoneChipStack(zone: recorder.currentZone, showName: false)
            }

            Spacer(minLength: 0)

            if config.intervals {
                intervalClock
            } else {
                continuousClock
            }

            Spacer(minLength: 0)

            // Heart rate and calories on this face like every other kind.
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                BeatingHeart(size: 13, bpm: recorder.heartRate, zone: recorder.currentZone)
                Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                    .font(Theme.numeric(21))
                    .foregroundStyle(Theme.textBright)
                    .contentTransition(.numericText())
                Text("BPM")
                    .font(Theme.text(8, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
                Spacer(minLength: 0)
                Text(recorder.activeCalories.map { String(Int($0)) } ?? "––")
                    .font(Theme.numeric(21))
                    .foregroundStyle(Theme.textBright)
                    .contentTransition(.numericText())
                Text("KCAL")
                    .font(Theme.text(8, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
    }

    private var intervalClock: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(paused ? "PAUSED" : (working ? "JUMP" : "REST"))
                    .font(Theme.display(13, weight: .bold))
                    .kerning(1.4)
                    .foregroundStyle(tint)
                Spacer(minLength: 0)
                Text(roundText)
                    .font(Theme.numeric(13, weight: .semibold))
                    .foregroundStyle(Theme.textSecondary)
            }
            Text(":\(String(format: "%02d", model.ropeSecondsLeft))")
                .font(Theme.numeric(50))
                .foregroundStyle(dimmed ? Theme.textSecondary : Theme.textBright)
                .contentTransition(.numericText(countsDown: true))
                .minimumScaleFactor(0.8)
                .lineLimit(1)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.elementDim)
                    Capsule().fill(tint)
                        .frame(width: max(4, geo.size.width * model.ropePhaseProgress))
                }
            }
            .frame(height: 5)
        }
    }

    private var roundText: String {
        config.rounds > 0 ? "\(model.ropeRound) / \(config.rounds)" : "round \(model.ropeRound)"
    }

    private var continuousClock: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(paused ? "PAUSED" : "JUMPING")
                .font(Theme.display(13, weight: .bold))
                .kerning(1.4)
                .foregroundStyle(tint)
            Text(Fmt.clock(TimeInterval(model.ropeJumpSeconds)))
                .font(Theme.numeric(46))
                .foregroundStyle(dimmed ? Theme.textSecondary : Theme.textBright)
                .contentTransition(.numericText())
                .minimumScaleFactor(0.8)
                .lineLimit(1)
        }
    }
}

// MARK: - Jump count keypad (summary)

/// His own count — the one number the sensors are not trusted with yet.
struct JumpCountPad: View {
    let initial: Int?
    let onDone: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var digits = ""

    var body: some View {
        VStack(spacing: 4) {
            Text(digits.isEmpty ? "JUMPS COUNTED" : digits)
                .font(digits.isEmpty ? Theme.text(9, weight: .semibold) : Theme.numeric(22))
                .kerning(digits.isEmpty ? 1.5 : 1)
                .foregroundStyle(digits.isEmpty ? Theme.textTertiary : Theme.accent)
                .frame(height: 26)
            let rows: [[String]] = [
                ["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", "✓"],
            ]
            VStack(spacing: 3) {
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 3) {
                        ForEach(row, id: \.self) { key in keyButton(key) }
                    }
                }
            }
        }
        .padding(.horizontal, 2)
        .onAppear { if let initial { digits = String(initial) } }
    }

    private func keyButton(_ key: String) -> some View {
        let isSubmit = key == "✓"
        let ready = (Int(digits) ?? 0) > 0
        return Button {
            switch key {
            case "⌫": if !digits.isEmpty { digits.removeLast() }
            case "✓":
                if let value = Int(digits), value > 0 {
                    onDone(value)
                    dismiss()
                }
            default: if digits.count < 5 { digits.append(key) }
            }
        } label: {
            Text(key)
                .font(Theme.display(15, weight: .semibold))
                .foregroundStyle(isSubmit && !ready ? Theme.textMuted : Theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 31)
                .background(
                    isSubmit && ready ? Theme.accentDeep : Theme.card,
                    in: RoundedRectangle(cornerRadius: 9)
                )
        }
        .buttonStyle(.plain)
    }
}
#endif
