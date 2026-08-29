// Trail — design screen 12 ("Trail — GPS route live"), ported: header with
// the mint blinking GPS pill, the map box with contour lines and the live
// route path, the distance hero, and the ELEV M · /KM · BPM row. Contours
// are the design's own three curves, verbatim, in its 330×184 viewBox.

#if os(watchOS)
import CoreLocation
import SwiftUI

struct TrailPage: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    @ObservedObject var route: RouteTracker
    let kind: WorkoutKind

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Text(kind.title.uppercased())
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1.2)
                    .foregroundStyle(Theme.accent)
                Spacer()
                // Round 3 §00: every in-workout header carries the zone chip.
                ZoneChipStack(zone: recorder.currentZone, showName: false)
                GPSPill(hasFix: route.hasFix, authorized: route.isAuthorized)
            }
            .padding(.horizontal, 2)

            RoutePreview(coordinates: route.coordinates, crestAt: crestAt)
                .frame(height: 62)
                .padding(.top, 5)

            // §09: distance + elevation gain share the top slots.
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(String(format: "%.2f", distanceKm))
                    .font(Theme.numeric(30))
                    .foregroundStyle(Theme.textBright)
                Text("KM")
                    .font(Theme.text(8, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
                Spacer(minLength: 0)
                Text(elevationText)
                    .font(Theme.numeric(30))
                    // §07 crest: the gain counter ticks in blush for 220 ms.
                    .foregroundStyle(crestFlash ? Theme.accentWashSub : Theme.textBright)
                    .animation(.easeInOut(duration: 0.22), value: crestFlash)
                Text("M")
                    .font(Theme.text(8, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
            }
            .padding(.top, 6)
            .padding(.horizontal, 2)

            HStack(spacing: 0) {
                StatCell(value: paceText, label: "/KM")
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 3) {
                        BeatingHeart(size: 10)
                        Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                            .font(Theme.numeric(15))
                            .foregroundStyle(Theme.textPrimary)
                    }
                    Text("BPM")
                        .font(Theme.text(7, weight: .semibold))
                        .kerning(0.8)
                        .foregroundStyle(Theme.textTertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, 5)
            .padding(.horizontal, 2)

            z2Card
                .padding(.top, 5)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        // Round 3 §07 elevation crest: every +100 m the contours ripple up
        // once and the counter ticks blush (haptic .click fires in the
        // recorder). Trail-stats + map pages only.
        .onChange(of: recorder.crestEvent) { _, crest in
            guard crest != nil else { return }
            crestAt = Date()
            crestFlash = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 220_000_000)
                crestFlash = false
            }
        }
    }

    @State private var crestAt: Date?
    @State private var crestFlash = false

    /// §09 Z2 accumulator — "1:24 in zone 2 · 63% of the hike · 128 bpm".
    /// AOD: the chip loses its fill and keeps the outline.
    @Environment(\.isLuminanceReduced) private var dimmed

    @ViewBuilder
    private var z2Card: some View {
        if recorder.z2Seconds >= 5 {
            let share = recorder.elapsed > 0
                ? Int((Double(recorder.z2Seconds) / recorder.elapsed * 100).rounded())
                : 0
            HStack(spacing: 4) {
                Text("Z2")
                    .font(Theme.text(6.5, weight: .bold))
                    .foregroundStyle(dimmed ? Theme.mint : Theme.bg)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(
                        dimmed ? AnyShapeStyle(Color.clear) : AnyShapeStyle(Theme.mint),
                        in: RoundedRectangle(cornerRadius: 4)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(Theme.mint, lineWidth: dimmed ? 1 : 0)
                    )
                Text(z2Line(share: share))
                    .font(Theme.text(6.5))
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(
                dimmed ? Theme.bg : Theme.card,
                in: RoundedRectangle(cornerRadius: Theme.px(12))
            )
        }
    }

    private func z2Line(share: Int) -> String {
        var line = "\(Fmt.clock(TimeInterval(recorder.z2Seconds))) in zone 2 · \(share)% of the \(kind == .hike ? "hike" : kind.title.lowercased())"
        if let avg = recorder.z2AvgBpm { line += " · \(avg) bpm" }
        return line
    }

    private var distanceKm: Double {
        let meters = recorder.distanceMeters ?? 0
        return (meters > 0 ? meters : route.distanceMeters) / 1000
    }

    private var elevationText: String {
        recorder.elevationGainLive > 0
            ? "+\(Int(recorder.elevationGainLive))"
            : "––"
    }

    /// Minutes per kilometre over the session so far.
    private var paceText: String {
        guard distanceKm > 0.05, recorder.elapsed > 0 else { return "––" }
        let secondsPerKm = recorder.elapsed / distanceKm
        guard secondsPerKm.isFinite, secondsPerKm < 3600 else { return "––" }
        return String(format: "%d:%02d", Int(secondsPerKm) / 60, Int(secondsPerKm) % 60)
    }
}

// MARK: - GPS pill (design: mint dot, blinking, + "GPS")

struct GPSPill: View {
    let hasFix: Bool
    let authorized: Bool
    @State private var blink = false

    var body: some View {
        HStack(spacing: 3.5) {
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
                .opacity(hasFix && blink ? 0.3 : 1)
                // Round 3 §02 retime: the lock blink slows 0.8 → 1.6 s.
                .animation(
                    hasFix
                        ? .easeInOut(duration: 1.6).repeatForever(autoreverses: true)
                        : .default,
                    value: blink
                )
            Text(label)
                .font(Theme.text(7.5, weight: .bold))
                .kerning(0.6)
                .foregroundStyle(color)
        }
        .onAppear { blink = true }
    }

    private var color: Color {
        if !authorized { return Theme.textMuted }
        return hasFix ? Theme.mint : Theme.textTertiary
    }

    private var label: String {
        if !authorized { return "NO GPS" }
        return hasFix ? "GPS" : "SEARCHING"
    }
}

// MARK: - Route preview (design's contour box + the live track)

struct RoutePreview: View {
    let coordinates: [CLLocationCoordinate2D]
    /// §07 crest: set to the crest moment — the contours ripple up once,
    /// staggered 120 ms; the animation clock only runs for that second.
    var crestAt: Date? = nil

    /// The design's three contour curves, verbatim (viewBox 330×184).
    private static let contours = [
        "M-10 60 C60 40 120 70 180 52 C240 36 290 58 340 44",
        "M-10 110 C70 92 130 122 200 104 C260 90 300 108 340 96",
        "M-10 156 C60 140 140 166 210 150 C270 138 310 152 340 144",
    ]

    var body: some View {
        if let crestAt, Date().timeIntervalSince(crestAt) < 1.2 {
            TimelineView(.animation) { timeline in
                canvas(rippleClock: timeline.date.timeIntervalSince(crestAt))
            }
        } else {
            canvas(rippleClock: nil)
        }
    }

    /// Rise −7 px and settle, per contour, 120 ms apart — 600 ms total.
    private func rippleOffset(index: Int, clock: TimeInterval?) -> CGFloat {
        guard let clock else { return 0 }
        let local = clock - Double(index) * 0.12
        guard local > 0, local < 0.24 else { return 0 }
        return -Theme.r3(7) * sin(.pi * local / 0.24)
    }

    private func canvas(rippleClock: TimeInterval?) -> some View {
        Canvas { context, size in
            let sx = size.width / 330, sy = size.height / 184
            let scale = CGAffineTransform(scaleX: sx, y: sy)

            for (index, contour) in Self.contours.enumerated() {
                let lift = rippleOffset(index: index, clock: rippleClock)
                let path = svgPath(contour)
                    .applying(scale.translatedBy(x: 0, y: lift / max(sy, 0.001)))
                context.stroke(
                    Path(path.cgPath),
                    with: .color(Color(hex: 0x1C1B20)),
                    style: StrokeStyle(lineWidth: 1.5)
                )
            }

            guard coordinates.count > 1 else { return }
            let track = normalized(in: size)
            var path = Path()
            path.addLines(track)
            context.stroke(
                Path(path.cgPath),
                with: .color(Theme.accent),
                style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round)
            )

            if let start = track.first {
                let r: CGFloat = 3
                context.stroke(
                    Path(ellipseIn: CGRect(
                        x: start.x - r, y: start.y - r, width: r * 2, height: r * 2
                    )),
                    with: .color(Theme.accent),
                    lineWidth: 1.6
                )
            }
            if let head = track.last {
                let r: CGFloat = 3.5
                context.fill(
                    Path(ellipseIn: CGRect(
                        x: head.x - r, y: head.y - r, width: r * 2, height: r * 2
                    )),
                    with: .color(Theme.accent)
                )
            }
        }
        .background(Color(hex: 0x101014), in: RoundedRectangle(cornerRadius: 11))
        .overlay(
            RoundedRectangle(cornerRadius: 11)
                .strokeBorder(Color(hex: 0x1F1E23), lineWidth: 1)
        )
        .overlay(alignment: .bottomTrailing) {
            if coordinates.count < 2 {
                Text("ACQUIRING")
                    .font(Theme.text(6.5, weight: .semibold))
                    .kerning(0.7)
                    .foregroundStyle(Theme.textFaint)
                    .padding(5)
            }
        }
    }

    /// Fit the track to the box, preserving aspect (latitude degrees are
    /// longer than longitude degrees away from the equator).
    private func normalized(in size: CGSize) -> [CGPoint] {
        let lats = coordinates.map(\.latitude)
        let lngs = coordinates.map(\.longitude)
        guard
            let minLat = lats.min(), let maxLat = lats.max(),
            let minLng = lngs.min(), let maxLng = lngs.max()
        else { return [] }

        let midLat = (minLat + maxLat) / 2
        let lngScale = cos(midLat * .pi / 180)
        let spanY = max(maxLat - minLat, 1e-6)
        let spanX = max((maxLng - minLng) * lngScale, 1e-6)

        let inset: CGFloat = 8
        let boxW = size.width - inset * 2, boxH = size.height - inset * 2
        let fit = min(boxW / spanX, boxH / spanY)
        let drawnW = spanX * fit, drawnH = spanY * fit
        let originX = inset + (boxW - drawnW) / 2
        let originY = inset + (boxH - drawnH) / 2

        return coordinates.map { c in
            CGPoint(
                x: originX + (c.longitude - minLng) * lngScale * fit,
                // Screen y grows downward; north should be up.
                y: originY + (maxLat - c.latitude) * fit
            )
        }
    }
}
#endif
