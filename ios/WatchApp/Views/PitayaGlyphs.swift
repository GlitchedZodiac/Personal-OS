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
#endif
