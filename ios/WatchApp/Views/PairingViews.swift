// First-run flow: Welcome → PIN entry → Paired confirmation.
// Design screens 01–03 (Pitaya Watch.dc.html). The design's pairing-code
// handshake (watch shows a code, iPhone confirms) needs backend support that
// doesn't exist yet — until then the watch pairs standalone with the same
// PIN the web app uses, typed on a wrist pad.

#if os(watchOS)
import SwiftUI

// MARK: - 01 · Welcome

struct WelcomeView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            DragonfruitLogo(size: 44)
            Text("Pitaya")
                .font(Theme.display(23))
                .foregroundStyle(Theme.textBright)
                .padding(.top, 9)
            Text("Your training,\non your wrist.")
                .font(Theme.text(11))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.top, 3)
            Spacer()
            PitayaCTA(title: "Pair") { model.beginPairing() }
            Text("Enter your Pitaya PIN")
                .font(Theme.text(9))
                .foregroundStyle(Theme.textMuted)
                .padding(.top, 6)
        }
        .padding(.horizontal, 6)
    }
}

// MARK: - 02 · PIN pad

struct PinPadView: View {
    @EnvironmentObject private var model: AppModel
    @State private var digits = ""

    private let maxDigits = 8

    var body: some View {
        VStack(spacing: 4) {
            Text(digits.isEmpty ? "ENTER PIN" : digits)
                .font(digits.isEmpty ? Theme.text(9, weight: .semibold) : Theme.numeric(22))
                .kerning(digits.isEmpty ? 1.5 : 3)
                .foregroundStyle(digits.isEmpty ? Theme.textTertiary : Theme.accent)
                .frame(height: 26)

            if let error = model.pairError {
                Text(error)
                    .font(Theme.text(8, weight: .semibold))
                    .foregroundStyle(Theme.danger)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }

            grid
        }
        .padding(.horizontal, 2)
        .overlay {
            if model.isPairing {
                ZStack {
                    Theme.bg.opacity(0.82)
                    VStack(spacing: 6) {
                        ProgressView().tint(Theme.accent)
                        Text("Pairing…")
                            .font(Theme.text(10))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var grid: some View {
        let rows: [[String]] = [
            ["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", "✓"],
        ]
        return VStack(spacing: 3) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 3) {
                    ForEach(row, id: \.self) { key in
                        keyButton(key)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func keyButton(_ key: String) -> some View {
        let isSubmit = key == "✓"
        let isDelete = key == "⌫"
        let submitReady = digits.count >= 4

        Button {
            tap(key)
        } label: {
            Text(key)
                .font(Theme.display(15, weight: .semibold))
                .foregroundStyle(
                    isSubmit ? (submitReady ? Theme.textBright : Theme.textMuted) : Theme.textPrimary
                )
                .frame(maxWidth: .infinity)
                .frame(height: 31)
                .background(
                    isSubmit ? (submitReady ? Theme.accentDeep : Theme.card) : Theme.card,
                    in: RoundedRectangle(cornerRadius: 9)
                )
        }
        .buttonStyle(.plain)
        .disabled(isSubmit && !submitReady)
        .opacity(isDelete && digits.isEmpty ? 0.4 : 1)
    }

    private func tap(_ key: String) {
        model.pairError = nil
        switch key {
        case "⌫":
            if !digits.isEmpty { digits.removeLast() }
        case "✓":
            let pin = digits
            Task { await model.pair(pin: pin) }
        default:
            if digits.count < maxDigits { digits.append(key) }
        }
    }
}

// MARK: - 03 · Paired

struct PairedView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().stroke(Theme.mint, lineWidth: 2)
                PitayaGlyph(
                    paths: Glyphs.check, style: .stroke(width: 3),
                    color: Theme.mint, size: 16
                )
            }
            .frame(width: 36, height: 36)

            Text("Paired")
                .font(Theme.display(17))
                .foregroundStyle(Theme.textBright)
                .padding(.top, 7)

            PitayaCard {
                VStack(alignment: .leading, spacing: 6) {
                    checkRow("\(model.historyCount) workouts synced")
                    checkRow("PRs · \(model.prExerciseCount) exercises")
                    checkRow("\(ExerciseCatalog.kettlebell.count) kettlebell moves")
                }
            }
            .padding(.top, 9)

            Text("Syncs automatically from now on")
                .font(Theme.text(8))
                .foregroundStyle(Theme.textMuted)
                .padding(.top, 7)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 6)
        .contentShape(Rectangle())
        .onTapGesture { model.finishIntro() }
        .task {
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if model.phase == .pairedIntro { model.finishIntro() }
        }
    }

    private func checkRow(_ text: String) -> some View {
        HStack(spacing: 6) {
            PitayaGlyph(
                paths: Glyphs.check, style: .stroke(width: 3),
                color: Theme.mint, size: 9
            )
            Text(text)
                .font(Theme.text(10))
                .foregroundStyle(Theme.textPrimary)
        }
    }
}
#endif
