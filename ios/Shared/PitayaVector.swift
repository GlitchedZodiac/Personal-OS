// Shared Pitaya vector helpers — the tiny SVG path-data parser and the
// dragonfruit brand mark, used by both the watch glyphs and the iOS
// companion. Paths come verbatim from the design sources (PORT GATE).

import SwiftUI

// MARK: - Path parsing (tiny SVG path-data subset: M/L/H/V/C/A/l/v/Z)

func svgPath(_ d: String) -> Path {
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
        if let c = scanner.scanCharacter(), "MLHVCAQZmlhvcaqz".contains(c) {
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
        case "Q":
            guard let x1 = num(), let y1 = num(), let x = num(), let y = num() else { return path }
            let control = CGPoint(x: x1, y: y1)
            current = CGPoint(x: x, y: y)
            path.addQuadCurve(to: current, control: control)
        case "q":
            guard let x1 = num(), let y1 = num(), let x = num(), let y = num() else { return path }
            let control = CGPoint(x: current.x + x1, y: current.y + y1)
            current = CGPoint(x: current.x + x, y: current.y + y)
            path.addQuadCurve(to: current, control: control)
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

extension Path {
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


// MARK: - The dragonfruit logo (components/pitaya-icons.tsx, verbatim)

/// The Pitaya brand mark — raspberry tile, white flesh, 4 seeds, 2 leaves.
/// Replaces the old diamond at brand-mark positions per Michael 2026-08-09.
struct DragonfruitLogo: View {
    var size: CGFloat = 38
    var tile: Bool = true

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 48
            if tile {
                let tileRect = CGRect(x: 0, y: 0, width: 48 * u, height: 48 * u)
                context.fill(
                    Path(roundedRect: tileRect, cornerRadius: 13 * u),
                    with: .color(Theme.accentDeep)
                )
            }
            func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, _ color: Color) {
                let rect = CGRect(x: (cx - r) * u, y: (cy - r) * u, width: 2 * r * u, height: 2 * r * u)
                context.fill(Path(ellipseIn: rect), with: .color(color))
            }
            circle(24, 26, 12.5, .white)
            circle(20, 23, 1.4, Theme.accentDeep)
            circle(27, 27, 1.4, Theme.accentDeep)
            circle(22, 30, 1.4, Theme.accentDeep)
            circle(28, 21.5, 1.4, Theme.accentDeep)

            let scale = CGAffineTransform(scaleX: u, y: u)
            let leaf1 = svgPath("M28 12 Q31 8 36 9 Q34 14 30 14.5 Z").applying(scale)
            let leaf2 = svgPath("M18 13 Q14 10 10.5 12 Q13 16 17 15.5 Z").applying(scale)
            context.opacity = 0.9
            context.fill(Path(leaf1.cgPath), with: .color(.white))
            context.opacity = 0.7
            context.fill(Path(leaf2.cgPath), with: .color(.white))
        }
        .frame(width: size, height: size)
    }
}

