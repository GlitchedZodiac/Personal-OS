// §08 wrist voice (2e) — confirm cards for "Log eighty-four point two
// kilos" and "log two eggs and toast". Weight parses locally; food defers
// calorie math to the phone ("Pitaya will price it"). Both land in the
// offline voice queue (no ingest endpoint yet — filed). Double Tap = Log it;
// crown nudges the weight ±0.1 before confirming.

#if os(watchOS)
import SwiftUI

struct VoiceWeightConfirmView: View {
    @EnvironmentObject private var model: AppModel
    @State private var crownWeight: Double = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header(label: "HEARD · WEIGHT")

            HStack(alignment: .firstTextBaseline, spacing: Theme.px(8)) {
                Text(String(format: "%.1f", model.voiceWeightKg))
                    .font(Theme.wDisplay(28))
                    .foregroundStyle(Theme.textBright)
                    .contentTransition(.numericText())
                Text("kg")
                    .font(Theme.wText(7, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
                Spacer(minLength: 0)
                if let chip = trendChip {
                    Text(chip)
                        .font(Theme.wText(6))
                        .foregroundStyle(Theme.mint)
                }
            }
            .padding(.top, Theme.px(12))

            HStack(spacing: Theme.px(8)) {
                PitayaCTA(title: "Log it", primary: true) { model.confirmVoiceLog() }
                Button {
                    model.dismissVoiceLog()
                } label: {
                    Text("Edit")
                        .font(Theme.wDisplay(8.5, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                        .frame(width: Theme.px(86))
                        .padding(.vertical, Theme.px(13))
                        .background(Theme.card, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, Theme.px(16))

            Text("offline — queued until sync")
                .font(Theme.wText(5.75))
                .foregroundStyle(Theme.textFaint)
                .padding(.top, Theme.px(12))
        }
        .padding(.horizontal, Theme.px(28))
        .padding(.vertical, Theme.px(14))
        .focusable(true)
        .digitalCrownRotation(
            $crownWeight, from: 20, through: 200, by: 0.1,
            sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onChange(of: crownWeight) { _, newValue in
            model.voiceWeightKg = (newValue * 10).rounded() / 10
        }
        .onAppear { crownWeight = model.voiceWeightKg }
    }

    /// "↘ 0.4 this week" from the hero-metrics 7-day delta, when known.
    private var trendChip: String? {
        guard let delta = model.heroMetrics?.weight7dDeltaKg, delta != 0 else { return nil }
        let arrow = delta < 0 ? "↘" : "↗"
        return "\(arrow) \(String(format: "%.1f", abs(delta))) this week"
    }
}

struct VoiceFoodConfirmView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header(label: "HEARD · FOOD")

            Text(model.voiceFoodText)
                .font(Theme.wDisplay(11))
                .foregroundStyle(Theme.textBright)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
                .padding(.top, Theme.px(12))

            Text("Pitaya will price it")
                .font(Theme.wText(6))
                .foregroundStyle(Theme.textTertiary)
                .padding(.top, Theme.px(6))

            HStack(spacing: Theme.px(8)) {
                PitayaCTA(title: "Log it", primary: true) { model.confirmVoiceLog() }
                Button {
                    model.dismissVoiceLog()
                } label: {
                    Text("Edit")
                        .font(Theme.wDisplay(8.5, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                        .frame(width: Theme.px(86))
                        .padding(.vertical, Theme.px(13))
                        .background(Theme.card, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, Theme.px(16))

            Text("offline — queued until sync")
                .font(Theme.wText(5.75))
                .foregroundStyle(Theme.textFaint)
                .padding(.top, Theme.px(12))
        }
        .padding(.horizontal, Theme.px(28))
        .padding(.vertical, Theme.px(14))
    }
}

/// Shared 2e header — diamond + caps label.
@ViewBuilder
private func header(label: String) -> some View {
    HStack(spacing: Theme.px(8)) {
        PitayaMark(size: Theme.px(11), color: Theme.accent)
        Text(label)
            .font(Theme.wText(5.5, weight: .bold))
            .kerning(Theme.px(11) * 0.16)
            .foregroundStyle(Theme.textTertiary)
    }
}
#endif
