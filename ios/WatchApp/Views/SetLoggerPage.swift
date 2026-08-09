// On-wrist kettlebell set logging — the crown jewel. Crown dials the bell
// weight in 2 kg steps, +/- taps set reps, one big Log button per set, and a
// weight PR beats history with a haptic the moment it's logged.

#if os(watchOS)
import SwiftUI

struct SetLoggerPage: View {
    @EnvironmentObject private var model: AppModel
    @State private var showPicker = false
    @State private var crownWeight: Double = 16

    var body: some View {
        VStack(spacing: 0) {
            Button {
                showPicker = true
            } label: {
                HStack(spacing: 4) {
                    Text(model.currentExercise.name)
                        .font(Theme.text(10.5, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.card, in: Capsule())
            }
            .buttonStyle(.plain)

            Spacer(minLength: 2)

            HStack(alignment: .lastTextBaseline, spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(Fmt.kg(model.weightKg))
                        .font(Theme.numeric(30))
                        .foregroundStyle(Theme.accent)
                        .contentTransition(.numericText())
                    Text("KG · CROWN")
                        .font(Theme.text(6.5, weight: .semibold))
                        .kerning(0.8)
                        .foregroundStyle(Theme.textTertiary)
                }

                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 7) {
                        repButton("minus") { if model.reps > 1 { model.reps -= 1 } }
                        Text("\(model.reps)")
                            .font(Theme.numeric(23))
                            .foregroundStyle(Theme.textBright)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(minWidth: 26)
                            .contentTransition(.numericText())
                        repButton("plus") { if model.reps < 99 { model.reps += 1 } }
                    }
                    Text("REPS")
                        .font(Theme.text(6.5, weight: .semibold))
                        .kerning(0.8)
                        .foregroundStyle(Theme.textTertiary)
                        .padding(.top, 1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)

            Spacer(minLength: 2)

            PitayaCTA(title: "Log set") { model.logSet() }
                .padding(.horizontal, 8)

            Text(totalsLine)
                .font(Theme.text(8))
                .foregroundStyle(Theme.textMuted)
                .padding(.top, 4)
        }
        .padding(.vertical, 2)
        .focusable(true)
        .digitalCrownRotation(
            $crownWeight, from: 2, through: 60, by: 2,
            sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onChange(of: crownWeight) { _, newValue in
            model.weightKg = newValue
        }
        .onAppear { crownWeight = model.weightKg }
        .sheet(isPresented: $showPicker) {
            ExercisePickerView()
        }
    }

    private var totalsLine: String {
        let volume = model.loggedSets.reduce(0.0) { $0 + $1.weightKg * Double($1.reps) }
        guard !model.loggedSets.isEmpty else { return "no sets yet" }
        let count = model.loggedSets.count
        return "\(count) \(count == 1 ? "set" : "sets") · \(Fmt.grouped(volume)) kg"
    }

    private func repButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.textPrimary)
                .frame(width: 25, height: 25)
                .background(Theme.elementDim, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Exercise picker

struct ExercisePickerView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                ForEach(ExerciseCatalog.kettlebell) { exercise in
                    row(exercise)
                }
            } header: {
                Text("KETTLEBELL")
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(Theme.accent)
            }

            Section {
                ForEach(ExerciseCatalog.all.filter { $0.category != .kettlebell }) { exercise in
                    row(exercise)
                }
            } header: {
                Text("MORE")
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(Theme.textTertiary)
            }
        }
        .listStyle(.carousel)
    }

    private func row(_ exercise: ExerciseDef) -> some View {
        Button {
            model.currentExercise = exercise
            dismiss()
        } label: {
            HStack {
                Text(exercise.name)
                    .font(Theme.text(11, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                if exercise.id == model.currentExercise.id {
                    Image(systemName: "checkmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .listRowBackground(
            RoundedRectangle(cornerRadius: Theme.cardRadius).fill(Theme.card)
        )
    }
}
#endif
