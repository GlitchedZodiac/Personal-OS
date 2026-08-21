// Design glyphs — every path EXTRACTED VERBATIM from
// docs/design/pitaya-watch.dc.html (and the kettlebell doubles as the app
// design's Train icon in components/pitaya-icons.tsx). THE PORT GATE:
// designed surfaces never use SF Symbols; add glyphs here by extraction
// only. All paths live in a 24×24 viewBox like the source SVGs.

#if os(watchOS)
import SwiftUI

// MARK: - Glyph view

/// Renders one or more 24×24 design paths, stroked (default) or filled.
struct PitayaGlyph: View {
    enum Style { case stroke(width: CGFloat), fill }

    let paths: [String]
    var style: Style = .stroke(width: 2.1)
    var color: Color = Theme.accent
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let scale = canvasSize.width / 24
            let transform = CGAffineTransform(scaleX: scale, y: scale)
            for d in paths {
                let path = svgPath(d).applying(transform)
                switch style {
                case .stroke(let width):
                    context.stroke(
                        Path(path.cgPath),
                        with: .color(color),
                        style: StrokeStyle(
                            lineWidth: width * scale, lineCap: .round, lineJoin: .round
                        )
                    )
                case .fill:
                    context.fill(Path(path.cgPath), with: .color(color))
                }
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - The extracted glyphs (paths verbatim from pitaya-watch.dc.html)

enum Glyphs {
    /// Kettlebell — home row + the app design's Train tab (pitaya-icons.tsx).
    static let kettlebell = [
        "M9 8V6.5a3 3 0 0 1 6 0V8",
        "M7.5 8h9c2 2.2 3 4.6 3 7a7.5 7.5 0 0 1-15 0c0-2.4 1-4.8 3-7Z",
    ]
    /// Trail/mountain — the design's Trail Run row.
    static let trail = ["M3 18 L9 8 L13 13.5 L16 9.5 L21 18 Z"]
    /// Walking figure body (head is a circle drawn by the view).
    static let walkBody = ["M13 8 l-3 5 4 3 v5 M10 13 l-3 2 M14 16 l4 2"]
    /// Filled heart — live metrics.
    static let heart = [
        "M12 21 C5.5 15 2.5 10.8 2.5 7.2 A4.6 4.6 0 0 1 12 5.2 A4.6 4.6 0 0 1 21.5 7.2 C21.5 10.8 18.5 15 12 21 Z"
    ]
    /// Check — paired + saved headers.
    static let check = ["M4.5 12.5 L10 18 L19.5 6.5"]
    /// End ✕ — controls.
    static let endX = ["M6 6 L18 18 M18 6 L6 18"]
    /// Water-lock drop (filled) — controls.
    static let drop = [
        "M12 3 C12 3 6.5 9.8 6.5 13.8 A5.5 5.5 0 0 0 17.5 13.8 C17.5 9.8 12 3 12 3 Z"
    ]
    /// Lap flag — controls (cardio).
    static let lapFlag = ["M5 21 V4", "M5 4 H17 L14 8 L17 12 H5"]
    /// Sequences grid — three offset tiles (rects drawn by the view).
    static let sequenceRects: [(CGFloat, CGFloat)] = [(4, 5), (13, 9), (8, 14)]
    /// Moon — home Sleep tile + sleep screens.
    static let moon = ["M20 14 A8.5 8.5 0 1 1 10.5 3.5 A7 7 0 0 0 20 14 Z"]
    /// Pencil — home Journal tile.
    static let pencil = ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]
}

/// Barbell — the Weight Training row (Michael's 2026-08-20 category).
///
/// NOT EXTRACTED: the design file has no barbell, because the category
/// didn't exist when it was drawn. Built to match the kettlebell's own
/// grammar — 24×24 box, 2.1 stroke, rounded caps — and flagged for the next
/// design pass. THE PORT GATE: replace this verbatim the moment a slice
/// lands; do not reach for an SF Symbol in the meantime.
struct BarbellGlyph: View {
    var color: Color = Theme.accent
    var size: CGFloat = 13

    var body: some View {
        PitayaGlyph(
            paths: [
                "M7.5 12 H16.5",          // the bar
                "M5.5 8.5 V15.5",         // inner plates
                "M18.5 8.5 V15.5",
                "M2.75 10.25 V13.75",     // outer plates
                "M21.25 10.25 V13.75",
            ],
            color: color,
            size: size
        )
    }
}

/// Walk figure = design circle head (cx13 cy4.5 r2) + body strokes.
struct WalkGlyph: View {
    var color: Color = Theme.accent
    var size: CGFloat = 13

    var body: some View {
        ZStack {
            PitayaGlyph(paths: Glyphs.walkBody, color: color, size: size)
            Circle()
                .stroke(color, lineWidth: 2.1 * size / 24)
                .frame(width: 4 * size / 24, height: 4 * size / 24)
                .position(x: 13 * size / 24, y: 4.5 * size / 24)
        }
        .frame(width: size, height: size)
    }
}

/// Pause bars from the design (two rounded rects, filled).
struct PauseGlyph: View {
    var color: Color = Theme.textPrimary
    var size: CGFloat = 13

    var body: some View {
        let unit = size / 24
        HStack(spacing: 3 * unit) {
            RoundedRectangle(cornerRadius: 1.5 * unit)
                .fill(color)
                .frame(width: 4.5 * unit, height: 16 * unit)
            RoundedRectangle(cornerRadius: 1.5 * unit)
                .fill(color)
                .frame(width: 4.5 * unit, height: 16 * unit)
        }
        .frame(width: size, height: size)
    }
}

/// Play triangle from the design (polygon 8,5 20,12 8,19).
struct PlayGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            var path = Path()
            path.move(to: CGPoint(x: 8 * u, y: 5 * u))
            path.addLine(to: CGPoint(x: 20 * u, y: 12 * u))
            path.addLine(to: CGPoint(x: 8 * u, y: 19 * u))
            path.closeSubpath()
            context.fill(path, with: .color(color))
        }
        .frame(width: size, height: size)
    }
}
// MARK: - Round 1 glyphs (§08 — paths verbatim; 24×24, stroke 2.1, round)

/// tune — Settings affordance: three rails, three filled stops.
struct TuneGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            let rails = svgPath("M4 7h16 M4 12h16 M4 17h16").applying(scale)
            context.stroke(
                Path(rails.cgPath), with: .color(color),
                style: StrokeStyle(lineWidth: 2.1 * u, lineCap: .round)
            )
            for (cx, cy) in [(9.0, 7.0), (15.5, 12.0), (7.0, 17.0)] {
                let r = 2.4 * u
                context.fill(
                    Path(ellipseIn: CGRect(x: cx * u - r, y: cy * u - r, width: 2 * r, height: 2 * r)),
                    with: .color(color)
                )
            }
        }
        .frame(width: size, height: size)
    }
}

/// bells — three bells ascending (rack).
struct BellsGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            let stroke = StrokeStyle(lineWidth: 2.1 * u, lineCap: .round, lineJoin: .round)
            let bells: [(Double, Double, Double, String)] = [
                (4.9, 16.2, 2.7, "M3.5 12.9 a1.4 1.4 0 0 1 2.8 0"),
                (12, 15.4, 3.4, "M10.3 11.2 a1.7 1.7 0 0 1 3.4 0"),
                (19.3, 14.6, 4.0, "M17.3 9.8 a2 2 0 0 1 4 0"),
            ]
            for (cx, cy, r, handle) in bells {
                context.stroke(
                    Path(ellipseIn: CGRect(
                        x: (cx - r) * u, y: (cy - r) * u, width: 2 * r * u, height: 2 * r * u
                    )),
                    with: .color(color), style: stroke
                )
                context.stroke(
                    Path(svgPath(handle).applying(scale).cgPath),
                    with: .color(color), style: stroke
                )
            }
        }
        .frame(width: size, height: size)
    }
}

/// repeat-set — retires arrow.counterclockwise (port gate).
struct RepeatSetGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        PitayaGlyph(
            paths: ["M20 12 a8 8 0 1 1 -2.34-5.66", "M20.2 3.8 v4.2 h-4.2"],
            style: .stroke(width: 2.1), color: color, size: size
        )
    }
}

/// double-tap — fingertip dot + two signal arcs.
struct DoubleTapGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            let r = 2.5 * u
            context.fill(
                Path(ellipseIn: CGRect(x: 8.6 * u - r, y: 14.6 * u - r, width: 2 * r, height: 2 * r)),
                with: .color(color)
            )
            let arcs = svgPath("M12.8 8.2 a7 7 0 0 1 5.6 6.7 M13.6 4.2 a11 11 0 0 1 8 9.6")
                .applying(scale)
            context.stroke(
                Path(arcs.cgPath), with: .color(color),
                style: StrokeStyle(lineWidth: 2.1 * u, lineCap: .round)
            )
        }
        .frame(width: size, height: size)
    }
}

/// spirit — lotus (provisional).
struct SpiritGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        PitayaGlyph(
            paths: [
                "M12 4.5 C10.3 6.7 10.3 9.6 12 11.8 C13.7 9.6 13.7 6.7 12 4.5 Z",
                "M5.2 8.8 C5.2 12.6 7.8 15.5 12 15.7 C16.2 15.5 18.8 12.6 18.8 8.8",
                "M6 18.6 C9.5 19.9 14.5 19.9 18 18.6",
            ],
            style: .stroke(width: 2.1), color: color, size: size
        )
    }
}

/// trend — rising line ending in a diamond.
struct TrendGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            let line = svgPath("M3 17.5 L8.2 12.2 L11.6 15.2 L17.2 8").applying(scale)
            context.stroke(
                Path(line.cgPath), with: .color(color),
                style: StrokeStyle(lineWidth: 2.1 * u, lineCap: .round, lineJoin: .round)
            )
            var diamond = Path(CGRect(x: 17 * u, y: 4.7 * u, width: 4.4 * u, height: 4.4 * u))
            diamond = diamond.applying(
                CGAffineTransform(translationX: 19.2 * u, y: 6.9 * u)
                    .rotated(by: .pi / 4)
                    .translatedBy(x: -19.2 * u, y: -6.9 * u)
            )
            context.fill(diamond, with: .color(color))
        }
        .frame(width: size, height: size)
    }
}

/// recovery — heart + settling arrow.
struct RecoveryGlyph: View {
    var color: Color
    /// 1g recovery card is two-tone: heart #DC74A0, arrow #8FBF9C.
    var arrowColor: Color?
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            let heart = svgPath(
                "M9 18.5 C4.5 14.6 2.6 11.6 2.6 9.1 A3.4 3.4 0 0 1 9 7.7 A3.4 3.4 0 0 1 15.4 9.1 C15.4 11.6 13.5 14.6 9 18.5 Z"
            ).applying(scale)
            context.fill(Path(heart.cgPath), with: .color(color))
            let arrow = svgPath("M19.5 5 v10 M17 12.5 l2.5 2.5 2.5-2.5").applying(scale)
            context.stroke(
                Path(arrow.cgPath), with: .color(arrowColor ?? color),
                style: StrokeStyle(lineWidth: 2.1 * u, lineCap: .round, lineJoin: .round)
            )
        }
        .frame(width: size, height: size)
    }
}

/// segments — three tape blocks, middle at 45%.
struct SegmentsGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let blocks: [(Double, Double, Double)] = [(2.6, 6.2, 1.0), (10.4, 3.6, 0.45), (15.6, 5.8, 1.0)]
            for (x, w, opacity) in blocks {
                context.opacity = opacity
                context.fill(
                    Path(roundedRect: CGRect(x: x * u, y: 9.6 * u, width: w * u, height: 4.8 * u),
                         cornerRadius: 1.6 * u),
                    with: .color(color)
                )
            }
        }
        .frame(width: size, height: size)
    }
}

/// intent — diamond speaking (Siri phrase).
struct IntentGlyph: View {
    var color: Color
    var size: CGFloat = 13

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 24
            let scale = CGAffineTransform(scaleX: u, y: u)
            var diamond = Path(CGRect(x: 4.4 * u, y: 9.7 * u, width: 4.6 * u, height: 4.6 * u))
            diamond = diamond.applying(
                CGAffineTransform(translationX: 6.7 * u, y: 12 * u)
                    .rotated(by: .pi / 4)
                    .translatedBy(x: -6.7 * u, y: -12 * u)
            )
            context.fill(diamond, with: .color(color))
            let arcs = svgPath("M13 8.2 a5.6 5.6 0 0 1 0 7.6 M16.2 5.4 a10 10 0 0 1 0 13.2")
                .applying(scale)
            context.stroke(
                Path(arcs.cgPath), with: .color(color),
                style: StrokeStyle(lineWidth: 2.1 * u, lineCap: .round)
            )
        }
        .frame(width: size, height: size)
    }
}

#endif
