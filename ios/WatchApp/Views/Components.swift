// Shared Pitaya UI atoms for the watch screens — cards, CTAs, stats, the PR
// banner, the beating heart, and the HR zone bar from the design.

#if os(watchOS)
import SwiftUI

// MARK: - Buttons & cards

struct PitayaCTA: View {
    let title: String
    var icon: String?
    var background: Color = Theme.accentDeep
    /// Round 3 §06: the Saving… state reads #D9A7BD on the dimmed pill.
    var titleColor: Color = Theme.textBright
    /// §05: this CTA wears the Double Tap gesture — pinch glyph inside the
    /// label (1m), dimming to 45% after three fires. Exactly one per screen.
    var primary: Bool = false
    /// In-flight state: spinner in the glyph slot, dimmed, and dead to both
    /// finger taps and the wrist gesture. Plain engineering state until the
    /// v3 design round hands it a slice.
    var isBusy: Bool = false
    let action: () -> Void
    @ObservedObject private var coach = DoubleTapCoach.shared

    var body: some View {
        let button = Button(action: fire) {
            HStack(spacing: primary ? Theme.px(9) : 5) {
                if isBusy {
                    // Round 3 §06: the spinner is the brand diamond, 900 ms
                    // per revolution, linear.
                    DiamondSpinner(size: Theme.px(17))
                } else if primary {
                    DoubleTapGlyph(color: Theme.prText, size: Theme.px(17))
                        .opacity(coach.glyphDimmed ? 0.45 : 1)
                } else if let icon {
                    Image(systemName: icon).font(.system(size: 10, weight: .bold))
                }
                Text(title).font(Theme.display(13, weight: .semibold))
            }
            .foregroundStyle(titleColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(background, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .opacity(isBusy ? 0.7 : 1)

        if primary {
            button.handGestureShortcut(.primaryAction)
        } else {
            button
        }
    }

    private func fire() {
        guard !isBusy else { return }
        if primary { coach.recordFire() }
        action()
    }
}

struct PitayaCard<Content: View>: View {
    var background: Color = Theme.card
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(background, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
    }
}

// MARK: - Stats

struct StatCell: View {
    let value: String
    let label: String
    var color: Color = Theme.textBright

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(Theme.numeric(15))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(Theme.text(7, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - PR banner (design screen 12)

struct PRBanner: View {
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            PitayaMark(size: 6, color: .white)
                .padding(.leading, 2)
            Text(text)
                .font(Theme.text(10, weight: .semibold))
                .foregroundStyle(Theme.prText)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .background(Theme.accentWash, in: RoundedRectangle(cornerRadius: 11))
    }
}

// MARK: - PR seeds (§10 — five diamonds arc out and fade, 0.9 s)

struct PRSeeds: View {
    @State private var flown = false
    /// Five directions fanning up-and-out from the banner.
    private static let angles: [Double] = [-150, -120, -90, -60, -30]

    var body: some View {
        ZStack {
            ForEach(Array(Self.angles.enumerated()), id: \.offset) { index, angle in
                PitayaMark(size: 5, color: Theme.accent)
                    .offset(
                        x: flown ? 30 * cos(angle * .pi / 180) : 0,
                        y: flown ? 30 * sin(angle * .pi / 180) : 0
                    )
                    .opacity(flown ? 0 : 1)
                    .animation(
                        .easeOut(duration: 0.9).delay(Double(index) * 0.03),
                        value: flown
                    )
            }
        }
        .allowsHitTesting(false)
        .onAppear { flown = true }
    }
}

// MARK: - Streak seeds (Round 3 §07 — three diamonds arc off the mint check)

struct StreakSeeds: View {
    @State private var flown = false
    /// mint · pink · mint, on the PR-burst curve, 700 ms.
    private static let seeds: [(color: Color, angle: Double)] = [
        (Theme.mint, -145), (Theme.accent, -90), (Theme.mint, -35),
    ]

    var body: some View {
        ZStack {
            ForEach(Array(Self.seeds.enumerated()), id: \.offset) { index, seed in
                PitayaMark(size: 5, color: seed.color)
                    .offset(
                        x: flown ? 26 * cos(seed.angle * .pi / 180) : 0,
                        y: flown ? 26 * sin(seed.angle * .pi / 180) : 0
                    )
                    .opacity(flown ? 0 : 1)
                    .animation(
                        .easeOut(duration: 0.7).delay(Double(index) * 0.04),
                        value: flown
                    )
            }
        }
        .allowsHitTesting(false)
        .onAppear { flown = true }
    }
}

// MARK: - Shake (Round 3 §06 — a failed save shakes the pill ±6 px ×3)

struct ShakeEffect: GeometryEffect {
    var travel: CGFloat

    var animatableData: CGFloat {
        get { travel }
        set { travel = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(
            CGAffineTransform(translationX: sin(travel * .pi * 2) * Theme.r3(6), y: 0)
        )
    }
}

// MARK: - Diamond spinner (Round 3 §06 — the brand mark, 900 ms/rev linear)

struct DiamondSpinner: View {
    var size: CGFloat
    @State private var spinning = false

    var body: some View {
        PitayaMark(size: size * 0.62, color: Theme.prText)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: spinning)
            .frame(width: size, height: size)
            .onAppear { spinning = true }
    }
}

// MARK: - Beating heart (Round 3 §04 — lub-dub synced to the live BPM)

struct BeatingHeart: View {
    var size: CGFloat = 15
    var color: Color = Theme.accent
    /// Live BPM — nil falls back to a gentle fixed 60-BPM idle beat.
    var bpm: Double?
    /// Served zone (1–5) — drives the glow from Z3 and the Z5 blush.
    var zone: Int?
    @Environment(\.isLuminanceReduced) private var dimmed
    @State private var beatTick = 0
    @State private var beatTimer: Timer?

    private struct Beat {
        var scale: CGFloat = 1
        var glow: CGFloat = 0.18
    }

    /// §04 half-beat mode: above 180 BPM animate every second beat at 1.2×
    /// amplitude — a 3 Hz flutter is noise at glance distance.
    private var halfBeat: Bool { (bpm ?? 0) > 180 }
    private var amplitude: CGFloat { halfBeat ? 1.2 : 1 }
    private var period: TimeInterval {
        let base = 60 / max(bpm ?? 60, 30)
        return halfBeat ? base * 2 : base
    }
    private var glowColor: Color? {
        guard let zone, zone >= 3 else { return nil }
        return Theme.zoneFill(zone)
    }
    private var fillColor: Color { zone == 5 ? Theme.prText : color }

    var body: some View {
        if dimmed {
            // AOD: frozen outline — stroke 1.8, no fill, no glow.
            PitayaGlyph(
                paths: Glyphs.heart, style: .stroke(width: 1.8),
                color: Theme.textSecondary, size: size
            )
        } else {
            heartBody
                .onAppear { armTimer() }
                .onDisappear { beatTimer?.invalidate(); beatTimer = nil }
                .onChange(of: bpm.map { Int($0) }) { _, _ in armTimer() }
        }
    }

    private var heartBody: some View {
        let cycle = period
        let amp = amplitude
        return PitayaGlyph(paths: Glyphs.heart, style: .fill, color: fillColor, size: size)
            .animation(.easeInOut(duration: 0.26), value: zone == 5) // Z5 blush crossfade
            .background {
                if let glowColor {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [glowColor, glowColor.opacity(0)],
                                center: .center, startRadius: 0, endRadius: size * 0.8
                            )
                        )
                        .frame(width: size * 1.6, height: size * 1.6)
                        .modifier(GlowKeyframes(tick: beatTick, cycle: cycle))
                }
            }
            .keyframeAnimator(initialValue: Beat(), trigger: beatTick) { view, value in
                view.scaleEffect(value.scale)
            } keyframes: { _ in
                // §04: 1 → 1.12 @8% → 1.03 @16% → 1.18 @26% → 1 @48%, rest.
                KeyframeTrack(\.scale) {
                    LinearKeyframe(1 + 0.12 * amp, duration: cycle * 0.08)
                    LinearKeyframe(1 + 0.03 * amp, duration: cycle * 0.08)
                    LinearKeyframe(1 + 0.18 * amp, duration: cycle * 0.10)
                    LinearKeyframe(1.0, duration: cycle * 0.22)
                    LinearKeyframe(1.0, duration: cycle * 0.52)
                }
            }
    }

    private func armTimer() {
        beatTimer?.invalidate()
        let interval = period
        beatTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            Task { @MainActor in
                beatTick += 1
                // §00 haptic map: "everything" adds per-beat ticks at Z5 only.
                if zone == 5 { Haptics.beatTick() }
            }
        }
        beatTick += 1 // first beat lands immediately, not one period late
    }
}

/// Glow envelope per beat: 0.18 → 0.85 @10%, linear decay across the cycle.
private struct GlowKeyframes: ViewModifier {
    let tick: Int
    let cycle: TimeInterval

    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: 0.18, trigger: tick) { view, value in
            view.opacity(value)
        } keyframes: { _ in
            KeyframeTrack(\.self) {
                LinearKeyframe(0.85, duration: cycle * 0.10)
                LinearKeyframe(0.18, duration: cycle * 0.90)
            }
        }
    }
}

// MARK: - Zone chip (Round 3 §01/§03 — "Z4" on the zone fill + name line)

struct ZoneChipStack: View {
    let zone: Int?
    /// §03: during a bloom the name line reads "THRESHOLD ↑" in zone color.
    var arrow: String?
    /// Compact form for legacy page headers (§00: every in-workout header
    /// carries the chip) — pill only, no name line.
    var showName: Bool = true
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        if let zone {
            VStack(alignment: .trailing, spacing: Theme.r3(5)) {
                Text("Z\(zone)")
                    .font(Theme.r3Display(19, weight: .bold))
                    .foregroundStyle(dimmed ? Theme.zoneFill(zone) : Theme.zoneChipText)
                    .padding(.horizontal, Theme.r3(11))
                    .padding(.vertical, Theme.r3(4))
                    .background(
                        dimmed ? AnyShapeStyle(Color.clear) : AnyShapeStyle(Theme.zoneFill(zone)),
                        in: RoundedRectangle(cornerRadius: Theme.r3(9))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.r3(9))
                            .strokeBorder(
                                Theme.zoneFill(zone).opacity(0.55),
                                lineWidth: dimmed ? 1.5 : 0
                            )
                    )
                if showName {
                    Text(nameLine(zone))
                        .font(Theme.r3Text(9.5, weight: .semibold))
                        .kerning(1.1)
                        .foregroundStyle(Theme.zoneFill(zone))
                }
            }
        }
    }

    private func nameLine(_ zone: Int) -> String {
        let name = Theme.zoneNames[zone - 1]
        if let arrow { return "\(name) \(arrow)" }
        return name
    }
}

// MARK: - HR zone bar (design screen 07; Round 3 §00 recolors the active
// segment to its zone fill)

struct ZoneBar: View {
    let heartRate: Double?
    /// Served boundaries when available; the heuristic covers the gap.
    var zones: HeartRateZones?

    private var zone: Int? {
        guard let hr = heartRate, hr > 0 else { return nil }
        if let zones { return zones.zone(for: hr) }
        let pct = hr / 190.0
        switch pct {
        case ..<0.57: return 1
        case ..<0.64: return 2
        case ..<0.76: return 3
        case ..<0.88: return 4
        default: return 5
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2.5) {
                ForEach(1...5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2.5)
                        .fill(i == zone ? Theme.zoneFill(i) : Theme.elementDim)
                        .frame(height: 4.5)
                }
            }
            if let zone {
                Text("ZONE \(zone) · \(Theme.zoneNames[zone - 1])")
                    .font(Theme.text(7, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }
}

// MARK: - Countdown overlay (3 · 2 · 1 before every start)

struct CountdownOverlay: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let n = model.countdown {
            ZStack {
                Theme.bg.ignoresSafeArea()
                VStack(spacing: 4) {
                    Text("GET READY")
                        .font(Theme.text(9, weight: .bold))
                        .kerning(1.6)
                        .foregroundStyle(Theme.textTertiary)
                    Text("\(n)")
                        .font(Theme.numeric(64))
                        .foregroundStyle(Theme.accent)
                        .contentTransition(.numericText(countsDown: true))
                        .id(n)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.3), value: n)
        }
    }
}

// MARK: - Formatting

enum Fmt {
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }

    static func kg(_ value: Double) -> String {
        value == value.rounded()
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    static func grouped(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? "\(Int(value))"
    }
}
#endif
