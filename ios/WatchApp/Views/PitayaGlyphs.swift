// Design glyphs — every path EXTRACTED VERBATIM from
// docs/design/pitaya-watch.dc.html (and the kettlebell doubles as the app
// design's Train icon in components/pitaya-icons.tsx). THE PORT GATE:
// designed surfaces never use SF Symbols; add glyphs here by extraction
// only. All paths live in a 24×24 viewBox like the source SVGs.

#if os(watchOS)
import SwiftUI

// MARK: - Path parsing (tiny SVG path-data subset: M/L/H/V/C/A/l/v/Z)

private func svgPath(_ d: String) -> Path {
    var path = Path()
    var current = CGPoint.zero
    let scanner = Scanner(string: d)
    scanner.charactersToBeSkipped = CharacterSet(charactersIn: " ,\n")

    func num() -> CGFloat? {
        scanner.scanDouble().map { CGFloat($0) }
    }

    var lastCommand: Character = " "
    while !scanner.isAtEnd {
        let command: Character
        if let c = scanner.scanCharacter(), "MLHVCAZmlhvcaz".contains(c) {
            command = c
        } else {
            scanner.currentIndex = d.index(before: scanner.currentIndex)
            command = lastCommand
        }
        lastCommand = command

        switch command {
        case "M":
            guard let x = num(), let y = num() else { return path }
            current = CGPoint(x: x, y: y)
            path.move(to: current)
            lastCommand = "L"
        case "m":
            guard let x = num(), let y = num() else { return path }
            current = CGPoint(x: current.x + x, y: current.y + y)
            path.move(to: current)
            lastCommand = "l"
        case "L":
            guard let x = num(), let y = num() else { return path }
            current = CGPoint(x: x, y: y)
            path.addLine(to: current)
        case "l":
            guard let x = num(), let y = num() else { return path }
            current = CGPoint(x: current.x + x, y: current.y + y)
            path.addLine(to: current)
        case "H":
            guard let x = num() else { return path }
            current = CGPoint(x: x, y: current.y)
            path.addLine(to: current)
        case "h":
            guard let x = num() else { return path }
            current = CGPoint(x: current.x + x, y: current.y)
            path.addLine(to: current)
        case "V":
            guard let y = num() else { return path }
            current = CGPoint(x: current.x, y: y)
            path.addLine(to: current)
        case "v":
            guard let y = num() else { return path }
            current = CGPoint(x: current.x, y: current.y + y)
            path.addLine(to: current)
        case "C":
            guard let x1 = num(), let y1 = num(), let x2 = num(), let y2 = num(),
                  let x = num(), let y = num() else { return path }
            current = CGPoint(x: x, y: y)
            path.addCurve(
                to: current,
                control1: CGPoint(x: x1, y: y1),
                control2: CGPoint(x: x2, y: y2)
            )
        case "c":
            guard let x1 = num(), let y1 = num(), let x2 = num(), let y2 = num(),
                  let x = num(), let y = num() else { return path }
            let c1 = CGPoint(x: current.x + x1, y: current.y + y1)
            let c2 = CGPoint(x: current.x + x2, y: current.y + y2)
            current = CGPoint(x: current.x + x, y: current.y + y)
            path.addCurve(to: current, control1: c1, control2: c2)
        case "A", "a":
            // Elliptical arc → cubic approximation good enough at glyph scale.
            guard let rx = num(), let ry = num(), let _ = num(), let largeArc = num(),
                  let sweep = num(), var x = num(), var y = num() else { return path }
            if command == "a" { x += current.x; y += current.y }
            let end = CGPoint(x: x, y: y)
            path.addArcApprox(
                from: current, to: end, rx: rx, ry: ry,
                largeArc: largeArc != 0, sweep: sweep != 0
            )
            current = end
        case "Z", "z":
            path.closeSubpath()
        default:
            return path
        }
    }
    return path
}

private extension Path {
    /// Endpoint-parameterized arc → center parameterization → cubic segments.
    mutating func addArcApprox(
        from p0: CGPoint, to p1: CGPoint, rx rxIn: CGFloat, ry ryIn: CGFloat,
        largeArc: Bool, sweep: Bool
    ) {
        var rx = abs(rxIn), ry = abs(ryIn)
        guard rx > 0, ry > 0, p0 != p1 else {
            addLine(to: p1)
            return
        }
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1p = dx, y1p = dy
        var lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            lambda = sqrt(lambda)
            rx *= lambda
            ry *= lambda
        }
        let sign: CGFloat = largeArc != sweep ? 1 : -1
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let coef = sign * sqrt(max(0, num / den))
        let cxp = coef * (rx * y1p) / ry
        let cyp = -coef * (ry * x1p) / rx
        let cx = cxp + (p0.x + p1.x) / 2
        let cy = cyp + (p0.y + p1.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
            var ang = acos(max(-1, min(1, dot / len)))
            if ux * vy - uy * vx < 0 { ang = -ang }
            return ang
        }

        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle(
            (x1p - cxp) / rx, (y1p - cyp) / ry,
            (-x1p - cxp) / rx, (-y1p - cyp) / ry
        )
        if !sweep, delta > 0 { delta -= 2 * .pi }
        if sweep, delta < 0 { delta += 2 * .pi }

        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step = delta / CGFloat(segments)
        var t = theta1
        for _ in 0..<segments {
            let t2 = t + step
            let alpha = 4.0 / 3.0 * tan(step / 4)
            let cos1 = cos(t), sin1 = sin(t), cos2 = cos(t2), sin2 = sin(t2)
            let s = CGPoint(x: cx + rx * cos1, y: cy + ry * sin1)
            let e = CGPoint(x: cx + rx * cos2, y: cy + ry * sin2)
            let c1 = CGPoint(x: s.x - alpha * rx * sin1, y: s.y + alpha * ry * cos1)
            let c2 = CGPoint(x: e.x + alpha * rx * sin2, y: e.y - alpha * ry * cos2)
            addCurve(to: e, control1: c1, control2: c2)
            t = t2
        }
    }
}

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
