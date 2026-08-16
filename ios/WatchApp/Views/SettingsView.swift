// Settings — Round 1 §01, option 1a "One quiet list". Values, copy, and
// styling extracted verbatim from Pitaya Watch Round 1.dc.html (px → pt via
// Theme.px). Four groups, eight rows; Unpair lives here now, out of Home.

#if os(watchOS)
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var prefs = WatchPrefs.shared

    enum Sheet: String, Identifiable {
        case bells, restFallback, startReps, haptics, stillTraining
        var id: String { rawValue }
    }

    @State private var sheet: Sheet?
    @State private var confirmUnpair = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: Theme.px(8)) {
                    BackChevron { model.backToHome() }
                    Text("Settings")
                        .font(Theme.display(13))
                        .foregroundStyle(Theme.textBright)
                }

                group("TRAINING") {
                    row(title: "Bells", accentValue: prefs.bellsRowValue) { sheet = .bells }
                    row(title: "Rest fallback", value: ":\(prefs.restFallbackSeconds)") {
                        sheet = .restFallback
                    }
                    row(title: "Start reps at", value: prefs.startRepsAt.label) {
                        sheet = .startReps
                    }
                    toggleRow(
                        title: "Auto-pause", subtitle: "outdoor only",
                        isOn: $prefs.autoPause
                    )
                }

                group("FEEL") {
                    row(title: "Haptics", value: prefs.hapticsMode.label) { sheet = .haptics }
                    row(
                        title: "Still training?", subtitle: "the mid-set nudge",
                        value: prefs.idleNudgeMinutes == 0
                            ? "off" : "after \(prefs.idleNudgeMinutes) min"
                    ) {
                        sheet = .stillTraining
                    }
                }

                group("UNITS") {
                    unitsRow
                }

                group("DEVICE") {
                    syncRow
                    unpairRow
                }

                Text("Everything else is already right — routines carry their own rest and weights.")
                    .font(Theme.text(6))
                    .foregroundStyle(Theme.textFaint)
                    .padding(.horizontal, Theme.px(6))
                    .padding(.top, Theme.px(16))
            }
            .padding(.horizontal, Theme.px(4))
        }
        .sheet(item: $sheet) { which in
            switch which {
            case .bells: BellRackSheet()
            case .restFallback: RestFallbackSheet()
            case .startReps:
                OptionSheet(
                    title: "Start reps at",
                    options: WatchPrefs.StartRepsAt.allCases.map(\.label),
                    selected: prefs.startRepsAt.label
                ) { picked in
                    prefs.startRepsAt = WatchPrefs.StartRepsAt.allCases
                        .first { $0.label == picked } ?? .lastLogged
                }
            case .haptics:
                OptionSheet(
                    title: "Haptics",
                    options: WatchPrefs.HapticsMode.allCases.map(\.label),
                    selected: prefs.hapticsMode.label
                ) { picked in
                    prefs.hapticsMode = WatchPrefs.HapticsMode.allCases
                        .first { $0.label == picked } ?? .keyMoments
                }
            case .stillTraining:
                OptionSheet(
                    title: "Still training?",
                    options: ["after 5 min", "after 8 min", "after 12 min", "off"],
                    selected: prefs.idleNudgeMinutes == 0
                        ? "off" : "after \(prefs.idleNudgeMinutes) min"
                ) { picked in
                    prefs.idleNudgeMinutes = ["after 5 min": 5, "after 8 min": 8, "after 12 min": 12]
                        .first { $0.key == picked }?.value ?? 0
                }
            }
        }
        .confirmationDialog(
            "Unpair this watch?", isPresented: $confirmUnpair, titleVisibility: .visible
        ) {
            Button("Unpair", role: .destructive) {
                Task { await model.unpair() }
            }
            Button("Keep", role: .cancel) {}
        }
    }

    // MARK: - Pieces (design 1a values)

    @ViewBuilder
    private func group(_ label: String, @ViewBuilder rows: () -> some View) -> some View {
        Text(label)
            .font(Theme.text(5.5, weight: .semibold))
            .kerning(1.0)
            .foregroundStyle(Theme.textMuted)
            .padding(.horizontal, Theme.px(6))
            .padding(.top, Theme.px(17))
            .padding(.bottom, Theme.px(8))
        VStack(spacing: Theme.px(7)) {
            rows()
        }
    }

    private func row(
        title: String, subtitle: String? = nil,
        value: String? = nil, accentValue: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(Theme.text(8.5, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    if let subtitle {
                        Text(subtitle)
                            .font(Theme.text(5.75))
                            .foregroundStyle(Theme.textMuted)
                            .padding(.top, 0.5)
                    }
                }
                Spacer(minLength: 4)
                HStack(spacing: 3) {
                    if let accentValue {
                        Text(accentValue)
                            .font(Theme.text(7, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                    } else if let value {
                        Text(value)
                            .font(Theme.text(7))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Text("›")
                        .font(Theme.text(7))
                        .foregroundStyle(Theme.textMuted)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            }
            .padding(.horizontal, Theme.px(16))
            .padding(.vertical, Theme.px(13))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
        }
        .buttonStyle(.plain)
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(Theme.text(8.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(subtitle)
                    .font(Theme.text(5.75))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.top, 0.5)
            }
            Spacer(minLength: 4)
            Button {
                isOn.wrappedValue.toggle()
            } label: {
                ZStack(alignment: isOn.wrappedValue ? .trailing : .leading) {
                    Capsule()
                        .fill(isOn.wrappedValue ? Theme.accentDeep : Theme.elementDim)
                        .frame(width: Theme.px(42), height: Theme.px(26))
                    Circle()
                        .fill(.white)
                        .frame(width: Theme.px(20), height: Theme.px(20))
                        .padding(Theme.px(3))
                }
                .animation(.easeInOut(duration: 0.15), value: isOn.wrappedValue)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Theme.px(16))
        .padding(.vertical, Theme.px(13))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
    }

    private var unitsRow: some View {
        HStack {
            Text("Weight")
                .font(Theme.text(8.5, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            Spacer(minLength: 4)
            HStack(spacing: 0) {
                segment("kg", selected: prefs.weightUnitIsKg) { prefs.weightUnitIsKg = true }
                segment("lb", selected: !prefs.weightUnitIsKg) { prefs.weightUnitIsKg = false }
            }
            .padding(Theme.px(3))
            .background(Theme.elementDim, in: Capsule())
        }
        .padding(.horizontal, Theme.px(16))
        .padding(.vertical, Theme.px(13))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
    }

    private func segment(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(Theme.text(6.25, weight: .semibold))
                .foregroundStyle(selected ? Color(hex: 0x131216) : Theme.textTertiary)
                .padding(.horizontal, Theme.px(selected ? 14 : 12))
                .padding(.vertical, Theme.px(4))
                .background(selected ? Theme.accent : .clear, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var syncRow: some View {
        HStack {
            Text("Sync")
                .font(Theme.text(8.5, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            Spacer(minLength: 4)
            HStack(spacing: Theme.px(6)) {
                Circle()
                    .fill(model.queuedCount == 0 ? Theme.mint : Color(hex: 0xE8B675))
                    .frame(width: Theme.px(7), height: Theme.px(7))
                Text(syncValue)
                    .font(Theme.text(7))
                    .foregroundStyle(model.queuedCount == 0 ? Theme.mint : Color(hex: 0xE8B675))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
        .padding(.horizontal, Theme.px(16))
        .padding(.vertical, Theme.px(13))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
    }

    private var syncValue: String {
        if model.queuedCount > 0 {
            return "\(model.queuedCount) queued"
        }
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        let time = f.string(from: model.lastSyncCheckAt ?? Date()).lowercased()
        return "queue empty · \(time)"
    }

    private var unpairRow: some View {
        Button {
            confirmUnpair = true
        } label: {
            HStack {
                Text("Unpair this watch")
                    .font(Theme.text(8.5, weight: .semibold))
                    .foregroundStyle(Theme.danger)
                Spacer(minLength: 4)
                Text("›")
                    .font(Theme.text(7))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, Theme.px(16))
            .padding(.vertical, Theme.px(13))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Option sheet (shared by the three chooser rows)

struct OptionSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let options: [String]
    let selected: String
    let onPick: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.px(7)) {
                Text(title)
                    .font(Theme.display(10))
                    .foregroundStyle(Theme.textBright)
                    .padding(.bottom, Theme.px(4))
                ForEach(options, id: \.self) { option in
                    Button {
                        onPick(option)
                        dismiss()
                    } label: {
                        HStack {
                            Text(option)
                                .font(Theme.text(8, weight: .medium))
                                .foregroundStyle(Theme.textPrimary)
                            Spacer()
                            if option == selected {
                                PitayaGlyph(
                                    paths: Glyphs.check, style: .stroke(width: 3),
                                    color: Theme.accent, size: 9
                                )
                            }
                        }
                        .padding(.horizontal, Theme.px(16))
                        .padding(.vertical, Theme.px(13))
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(18)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Theme.px(4))
        }
    }
}

// MARK: - Rest fallback dial (crown, 15 s steps, 0–180)

struct RestFallbackSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var prefs = WatchPrefs.shared
    @State private var crownValue: Double = 60

    var body: some View {
        VStack(spacing: Theme.px(2)) {
            Text("REST FALLBACK")
                .font(Theme.text(6.5, weight: .semibold))
                .kerning(1.2)
                .foregroundStyle(Theme.textTertiary)
            Spacer(minLength: 0)
            Text(":\(Int(crownValue))")
                .font(Theme.numeric(38))
                .foregroundStyle(Theme.accent)
                .contentTransition(.numericText())
            Text("SECONDS · CROWN")
                .font(Theme.text(6, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.textMuted)
            Text("used when a routine has no rest of its own")
                .font(Theme.text(6))
                .foregroundStyle(Theme.textFaint)
                .multilineTextAlignment(.center)
                .padding(.top, Theme.px(6))
            Spacer(minLength: 0)
            PitayaCTA(title: "Done") {
                prefs.restFallbackSeconds = Int(crownValue)
                dismiss()
            }
        }
        .padding(.horizontal, Theme.px(10))
        .focusable(true)
        .digitalCrownRotation(
            $crownValue, from: 0, through: 180, by: 15,
            sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onAppear { crownValue = Double(prefs.restFallbackSeconds) }
    }
}
#endif
