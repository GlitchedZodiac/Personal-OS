// The Bells rack — Round 1 §01 sheet, extracted verbatim: crown moves a
// cursor across 4–64 kg in 4 kg detents; tap toggles owned. The payoff is
// everywhere — the set logger and weight dials then detent only through
// owned bells, and progression can never name a bell that isn't on the
// floor.

#if os(watchOS)
import SwiftUI

struct BellRackSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var prefs = WatchPrefs.shared
    @State private var cursorIndex: Double = 5 // 24 kg

    private let denominations = WatchPrefs.allDenominations

    private var cursorKg: Int {
        denominations[max(0, min(denominations.count - 1, Int(cursorIndex.rounded())))]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("BELLS")
                .font(Theme.wText(6.5, weight: .semibold))
                .kerning(1.0)
                .foregroundStyle(Theme.textTertiary)

            Text("\(cursorKg)")
                .font(Theme.wNumeric(38))
                .foregroundStyle(Theme.accent)
                .contentTransition(.numericText())
                .padding(.top, Theme.px(10))

            Text("KG · CROWN")
                .font(Theme.wText(6, weight: .semibold))
                .kerning(0.9)
                .foregroundStyle(Theme.textMuted)
                .padding(.top, Theme.px(2))

            rack
                .frame(height: Theme.px(44))
                .padding(.top, Theme.px(22))

            ownedLine
                .padding(.top, Theme.px(10))

            Spacer(minLength: Theme.px(8))

            PitayaCTA(title: "Done") { dismiss() }
        }
        .padding(.horizontal, Theme.px(12))
        .focusable(true)
        .digitalCrownRotation(
            $cursorIndex, from: 0, through: Double(denominations.count - 1), by: 1,
            sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
    }

    /// Design: bar width 13px (cursor 15px), radius 4, heights ramp 20→44px;
    /// owned #A63D63 · unowned #2A292E · cursor #DC74A0.
    private var rack: some View {
        // Spacing lives inside each slot since 2026-08-29 (hit strips).
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(Array(denominations.enumerated()), id: \.element) { index, kg in
                let isCursor = kg == cursorKg
                let owned = prefs.ownedBells.contains(kg)
                let t = CGFloat(index) / CGFloat(denominations.count - 1)
                Button {
                    prefs.toggleBell(kg)
                    Haptics.minor(.click)
                } label: {
                    // The bar stays the design's sliver; the HIT strip is
                    // the full slot (bar + gap) at rack height — 5.7 pt
                    // bars were the smallest tap targets in the app.
                    RoundedRectangle(cornerRadius: Theme.px(4))
                        .fill(isCursor ? Theme.accent : (owned ? Theme.accentDeep : Theme.elementDim))
                        .frame(
                            width: Theme.px(isCursor ? 15 : 13) * 0.62,
                            height: Theme.px(20 + (44 - 20) * t)
                        )
                        .frame(
                            width: Theme.px(13) * 0.62 + Theme.px(4),
                            height: Theme.px(44),
                            alignment: .bottom
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var ownedLine: some View {
        HStack(spacing: 3) {
            Text(prefs.ownedBells.contains(cursorKg) ? "owned ✓" : "not owned")
                .font(Theme.wText(6.5, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            Text("· tap to toggle")
                .font(Theme.wText(6.5))
                .foregroundStyle(Theme.textMuted)
        }
    }
}
#endif
