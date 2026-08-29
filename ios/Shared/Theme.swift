// Pitaya visual system — single theming seam for the native apps.
// Source of truth: the Claude-design project "Pitaya Watch.dc.html"
// (claude.ai/design project a44e3da0…, imported 2026-08-09). Every color and
// font in app code routes through here; a design revision is a one-file edit.

import SwiftUI

public enum Theme {
    // ── Brand ─────────────────────────────────────────────────────────
    /// Pitaya pink — icons, live numbers, highlights.
    public static let accent = Color(hex: 0xDC74A0)
    /// Deep pitaya — primary action buttons (Pair, Start).
    public static let accentDeep = Color(hex: 0xA63D63)
    /// Deepest raspberry (Round 1 palette).
    public static let raspberryDeep = Color(hex: 0x8C2F51)
    /// Dim pink wash — icon circles on cards.
    public static let accentDim = Color(hex: 0x2A1420)
    /// Stronger pink wash — featured cards (today's plan, PR banner).
    public static let accentWash = Color(hex: 0x3D1526)
    /// Label text sitting on accentWash.
    public static let accentWashText = Color(hex: 0xE9A8C4)
    /// Secondary line on accentWash.
    public static let accentWashSub = Color(hex: 0xD9A7BD)
    /// PR banner headline text.
    public static let prText = Color(hex: 0xFFD9E8)

    // ── Surfaces (OLED-first) ─────────────────────────────────────────
    public static let bg = Color.black
    public static let card = Color(hex: 0x17161A)
    public static let divider = Color(hex: 0x232227)
    public static let elementDim = Color(hex: 0x2A292E)
    public static let element = Color(hex: 0x3A393E)

    // ── Text ──────────────────────────────────────────────────────────
    public static let textBright = Color.white
    public static let textPrimary = Color(hex: 0xF2F1F2)
    public static let textSecondary = Color(hex: 0xA5A3AA)
    public static let textTertiary = Color(hex: 0x96949B)
    public static let textMuted = Color(hex: 0x66646C)
    public static let textFaint = Color(hex: 0x55535A)

    // ── States ────────────────────────────────────────────────────────
    /// Mint — success, rest, GPS lock, "iPhone detected".
    public static let mint = Color(hex: 0x8FBF9C)
    public static let mintDeep = Color(hex: 0x5E9B72)
    public static let mintRing = Color(hex: 0x24332A)
    /// End-workout red.
    public static let danger = Color(hex: 0xE08585)
    public static let dangerDim = Color(hex: 0x3A1518)
    /// Water-lock blue.
    public static let water = Color(hex: 0x7FA6C9)
    public static let waterDim = Color(hex: 0x14212B)
    /// Spirit lavender (provisional, Round 1 §04).
    public static let spirit = Color(hex: 0xB7A3E3)
    public static let spiritDim = Color(hex: 0x241E2E)
    /// Journal green tile circle (design home).
    public static let journalDim = Color(hex: 0x1E2A22)

    // ── Type ──────────────────────────────────────────────────────────
    // Familjen Grotesk (display/numerals) + Instrument Sans (text), bundled
    // in WatchApp/Fonts and registered via UIAppFonts. PostScript names
    // verified from the TTF name tables.
    //
    // typeScale: every font in the app runs through it. 1.125 = the exact
    // 41 mm design canvas (176 pt) → 45 mm wrist (198 pt) ratio, unifying
    // Michael's "bigger" passes with the Round 1 extraction contract: a
    // design value of Npx maps to N/2 pt through these functions and lands
    // at N × 0.5625 pt on screen.
    private static let typeScale: CGFloat = 1.125

    /// Michael's on-wrist sizing, re-applied to the Round 1+2 screens
    /// (2026-08-17). The verbatim design port maps the 352 px canvas to the
    /// 45 mm screen 1:1 — proportionally exact, but it silently reverted the
    /// two +12 % passes he'd asked for on the older screens (1.12 × 1.12 ≈
    /// 1.25), which is why Home and Settings read smaller than the rest of
    /// the app. Deviation from the design file is deliberate and his call.
    public static let wristScale: CGFloat = 1.25

    /// Geometry mapping for Round 1 screens: design px → on-screen pt at the
    /// same proportional scale the fonts use, carrying the wrist bump.
    public static func px(_ designPx: CGFloat) -> CGFloat {
        designPx * 0.5625 * wristScale
    }
    private static func familjen(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black: return "FamiljenGrotesk-Bold"
        case .semibold: return "FamiljenGrotesk-SemiBold"
        case .medium: return "FamiljenGrotesk-Medium"
        default: return "FamiljenGrotesk-Regular"
        }
    }

    private static func instrument(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black, .semibold: return "InstrumentSans-SemiBold"
        case .medium: return "InstrumentSans-Medium"
        default: return "InstrumentSans-Regular"
        }
    }

    public static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(familjen(weight), size: size * typeScale)
    }

    public static func text(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(instrument(weight), size: size * typeScale)
    }

    /// Tabular-numeral display face for timers and live metrics (Familjen
    /// carries tabular figures; monospacedDigit engages them).
    public static func numeric(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(familjen(weight), size: size * typeScale).monospacedDigit()
    }

    // ── Round 1+2 type (design px ÷ 2 in, wrist-scaled out) ───────────
    // Same argument convention as the three above — these just carry
    // `wristScale`. Screens ported from the Round 1 design file call these;
    // the hand-tuned older screens (logger, live pages, controls) keep the
    // plain helpers, since his +12 % passes are already baked into them.

    public static func wDisplay(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        display(size * wristScale, weight: weight)
    }

    public static func wText(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        text(size * wristScale, weight: weight)
    }

    public static func wNumeric(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        numeric(size * wristScale, weight: weight)
    }

    // ── Shape ─────────────────────────────────────────────────────────
    /// Card corner radius from the design's 26px at 396px canvas, scaled
    /// to the watch's ~198pt width.
    public static let cardRadius: CGFloat = 13
    public static let chipRadius: CGFloat = 50

    // ── Round 3 (pitaya-watch-round3.dc.html, §00–§09) ────────────────
    // The Round 3 canvas is 396×484 px @2x — the 45 mm screen's PHYSICAL
    // scale — so its extraction contract is exact: pt = px/2, no wrist or
    // type compensation (unlike the 352 px Round 1 canvas the scaled
    // helpers above serve). 41 mm adaptations are explicit per section.

    /// Round 3 geometry: design px → pt, exactly halved.
    public static func r3(_ designPx: CGFloat) -> CGFloat { designPx / 2 }

    public static func r3Display(_ px: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(familjen(weight), size: px / 2)
    }

    public static func r3Text(_ px: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(instrument(weight), size: px / 2)
    }

    public static func r3Numeric(_ px: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(familjen(weight), size: px / 2).monospacedDigit()
    }

    // Zone ramp, cool → hot (§00, served boundaries ride /api/mobile/zones).
    // Chip text on a zone fill is ALWAYS zoneChipText.
    public static let zone1 = Color(hex: 0x7FA6C9)
    public static let zone2 = Color(hex: 0x8FBF9C)
    public static let zone3 = Color(hex: 0xC97D9C)
    public static let zone4 = Color(hex: 0xDC74A0)
    public static let zone5 = Color(hex: 0xFFD9E8)
    public static let zoneDim1 = Color(hex: 0x14212B)
    public static let zoneDim2 = Color(hex: 0x1E2A22)
    public static let zoneDim3 = Color(hex: 0x26161C)
    public static let zoneDim4 = Color(hex: 0x2A1420)
    public static let zoneDim5 = Color(hex: 0x3D1526)
    public static let zoneChipText = Color(hex: 0x131216)

    public static func zoneFill(_ zone: Int) -> Color {
        [zone1, zone2, zone3, zone4, zone5][max(1, min(zone, 5)) - 1]
    }

    public static func zoneDim(_ zone: Int) -> Color {
        [zoneDim1, zoneDim2, zoneDim3, zoneDim4, zoneDim5][max(1, min(zone, 5)) - 1]
    }

    public static let zoneNames = ["RECOVERY", "EASY", "AEROBIC", "THRESHOLD", "MAX"]

    /// §00 motion ladder — every Round 3 animation uses one of these rungs.
    public enum Motion {
        /// attack 90 ms ease-out
        public static let attack = Animation.easeOut(duration: 0.09)
        /// wash-in 140 ms ease-out
        public static let washIn = Animation.easeOut(duration: 0.14)
        /// arrival spring 350 ms · cubic-bezier(.34,1.4,.5,1)
        public static let arrival = Animation.timingCurve(0.34, 1.4, 0.5, 1, duration: 0.35)
        /// settle/morph 450 ms ease-in-out
        public static let settle = Animation.easeInOut(duration: 0.45)
        /// exit 260 ms ease-in
        public static let exit = Animation.easeIn(duration: 0.26)
        /// hold ceiling — nothing full-screen lives past 2 s; blooms ≤ 900 ms.
        public static let holdMax: TimeInterval = 0.9
    }
}

public extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// The Pitaya brand mark — the rotated-square "dragonfruit seed" diamond.
public struct PitayaMark: View {
    var size: CGFloat
    var color: Color

    public init(size: CGFloat = 14, color: Color = Theme.accent) {
        self.size = size
        self.color = color
    }

    public var body: some View {
        Rectangle()
            .fill(color)
            .frame(width: size, height: size)
            .rotationEffect(.degrees(45))
    }
}
