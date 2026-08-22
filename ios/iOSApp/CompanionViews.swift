// Native surfaces of the companion: the one-time PIN pairing screen and the
// minimal settings sheet (HealthKit + push status + session). Everything
// else is the web app.

#if os(iOS)
import SwiftUI

// MARK: - Pairing (one-time, mints the device-session bearer for HK sync)

struct CompanionPairingView: View {
    @EnvironmentObject private var model: CompanionModel
    @State private var digits = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            DragonfruitLogo(size: 76)
            Text("Pitaya")
                .font(Theme.display(34))
                .foregroundStyle(Theme.textBright)
                .padding(.top, 14)
            Text("Enter your PIN once — this pairs the\ncompanion for Health sync.")
                .font(Theme.text(15))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.top, 6)

            Text(digits.isEmpty ? " " : digits)
                .font(Theme.numeric(34))
                .kerning(6)
                .foregroundStyle(Theme.accent)
                .frame(height: 44)
                .padding(.top, 10)

            if let error = model.pairError {
                Text(error)
                    .font(Theme.text(14, weight: .semibold))
                    .foregroundStyle(Theme.danger)
            }

            pad
                .padding(.top, 8)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .overlay {
            if model.isPairing {
                ZStack {
                    Theme.bg.opacity(0.8).ignoresSafeArea()
                    ProgressView().tint(Theme.accent).scaleEffect(1.4)
                }
            }
        }
    }

    private var pad: some View {
        let rows: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", "✓"]]
        return VStack(spacing: 12) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 12) {
                    ForEach(row, id: \.self) { key in
                        keyButton(key)
                    }
                }
            }
        }
        .padding(.horizontal, 44)
        // the keypad is a phone-width instrument; on the iPad it stays one, centered
        .frame(maxWidth: 440)
    }

    private func keyButton(_ key: String) -> some View {
        let isSubmit = key == "✓"
        let ready = digits.count >= 4
        return Button {
            model.pairError = nil
            switch key {
            case "⌫": if !digits.isEmpty { digits.removeLast() }
            case "✓":
                let pin = digits
                Task { await model.pair(pin: pin) }
            default: if digits.count < 8 { digits.append(key) }
            }
        } label: {
            Text(key)
                .font(Theme.display(26, weight: .semibold))
                .foregroundStyle(isSubmit ? (ready ? Theme.textBright : Theme.textMuted) : Theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 64)
                .background(
                    isSubmit && ready ? Theme.accentDeep : Theme.card,
                    in: RoundedRectangle(cornerRadius: 18)
                )
        }
        .buttonStyle(.plain)
        .disabled(isSubmit && !ready)
    }
}

// MARK: - Settings sheet (shake or pitaya:// to open)

struct CompanionSettingsView: View {
    @EnvironmentObject private var model: CompanionModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Apple Health") {
                    switch model.health.status {
                    case .notAsked:
                        Button("Connect Apple Health") {
                            Task { await model.health.requestAccess() }
                        }
                    case .authorized:
                        Label("Connected", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        if let last = model.health.lastSyncAt {
                            LabeledContent("Last sync", value: last.formatted(
                                date: .omitted, time: .shortened
                            ))
                        }
                        if let result = model.health.lastResult {
                            Text(result).font(.footnote).foregroundStyle(.secondary)
                        }
                        Button("Sync now") {
                            Task { await model.health.syncNow() }
                        }
                    case .denied:
                        Text("Health access denied — enable in Settings → Health → Data Access → Pitaya.")
                            .font(.footnote)
                    case .unavailable:
                        Text("Health data unavailable on this device.")
                    }
                }

                Section("Notifications") {
                    switch model.pushStatus {
                    case .unknown:
                        Button("Enable reminders") {
                            Task { await model.requestPush() }
                        }
                    case .registered:
                        Label("Reminders on", systemImage: "bell.fill")
                    case .serverPending:
                        Text("Token ready — server registration ships next (main lane).")
                            .font(.footnote)
                    case .needsPaidTeam:
                        Text("Push needs the Apple Developer Program ($99/yr) — free personal teams can't sign APNs. Everything else works without it.")
                            .font(.footnote)
                    case .declined:
                        Text("Notifications declined — enable in iOS Settings if wanted.")
                            .font(.footnote)
                    }
                }

                Section("Session") {
                    Button("Unpair companion", role: .destructive) {
                        Task {
                            await model.unpair()
                            dismiss()
                        }
                    }
                }

                Section {
                    Text("Shake the phone (or open pitaya://settings) to see this screen.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Companion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
#endif
