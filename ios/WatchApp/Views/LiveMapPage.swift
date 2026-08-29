// Live map — Round 3 §02 (variant 3c full-bleed, with 3d's stat row folded
// in), extracted 1:1 from docs/design/pitaya-watch-round3.dc.html. Apple's
// standard map underneath; everything on top is ours: the accent route with
// its under-glow, the start ring, the pulsing head dot, scrims, GPS pill,
// distance hero and the 4-cell row. The offline/no-tiles face doubles as the
// AOD form — five contour curves (extracted verbatim) with the route in deep
// pink.
//
// PLATFORM NOTE (surfaced, not silent): the spec names MKMapView, which does
// not exist on watchOS — SwiftUI `Map` (MapKit, watchOS 10+) renders the
// same standard style. Two consequences: a tiles-failed callback isn't
// exposed (the contour face serves AOD; a mid-session tile loss shows
// Apple's own placeholder grid), and new route fixes snap rather than tween
// (MapPolyline doesn't animate shape). Both filed in the port notes.

#if os(watchOS)
import CoreLocation
import MapKit
import SwiftUI
import WatchKit

struct LiveMapPage: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    @ObservedObject var route: RouteTracker
    let kind: WorkoutKind
    @Environment(\.isLuminanceReduced) private var dimmed

    @State private var camera: MapCameraPosition = .automatic
    @State private var centeredOn: CLLocationCoordinate2D?
    /// §07 crest: the gain cell ticks blush for 220 ms at each +100 m.
    @State private var crestFlash = false

    private var is41mm: Bool { WKInterfaceDevice.current().screenBounds.width < 190 }
    private var paused: Bool { recorder.phase == .paused }

    var body: some View {
        ZStack {
            if dimmed {
                ContourGround(coordinates: route.coordinates)
                    .ignoresSafeArea()
            } else {
                mapLayer
                    .ignoresSafeArea()
            }
            scrims
            overlayChrome
        }
        .onChange(of: route.coordinates.count) { _, _ in autoPan() }
        .onChange(of: recorder.crestEvent) { _, crest in
            guard crest != nil else { return }
            crestFlash = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 220_000_000)
                crestFlash = false
            }
        }
        .onAppear { autoPan() }
    }

    // MARK: - The map itself

    private var mapLayer: some View {
        Map(position: $camera, interactionModes: []) {
            // Saved-trail target (§5): ghost dashed line under the live route.
            if model.activeTrailGhost.count > 1 {
                MapPolyline(coordinates: model.activeTrailGhost)
                    .stroke(
                        Theme.textMuted,
                        style: StrokeStyle(
                            lineWidth: Theme.r3(2.5), lineCap: .round,
                            dash: [Theme.r3(4), Theme.r3(6)]
                        )
                    )
            }
            if route.coordinates.count > 1 {
                // Under-glow: a second stroke, never a blur filter.
                MapPolyline(coordinates: route.coordinates)
                    .stroke(
                        Color(hex: 0xDC74A0).opacity(0.22),
                        style: StrokeStyle(lineWidth: Theme.r3(11), lineCap: .round, lineJoin: .round)
                    )
                MapPolyline(coordinates: route.coordinates)
                    .stroke(
                        Theme.accent,
                        style: StrokeStyle(lineWidth: Theme.r3(4.5), lineCap: .round, lineJoin: .round)
                    )
            }
            if let start = route.coordinates.first {
                Annotation("", coordinate: start) {
                    Circle()
                        .strokeBorder(Theme.accent, lineWidth: Theme.r3(2.5))
                        .frame(width: Theme.r3(12), height: Theme.r3(12))
                }
            }
            if let head = route.coordinates.last {
                Annotation("", coordinate: head) {
                    HeadDot(pulsing: recorder.phase == .running && route.hasFix)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
    }

    /// §02 auto-pan: 600 ms ease whenever the head wanders more than a third
    /// of the span from the last look-at (the page owns the camera — the map
    /// is non-interactive, so this state is the truth).
    private func autoPan() {
        guard !dimmed, let head = route.coordinates.last else { return }
        let span = regionSpan()
        if let centeredOn {
            let dLat = abs(head.latitude - centeredOn.latitude)
            let dLng = abs(head.longitude - centeredOn.longitude)
            guard dLat > span.latitudeDelta / 3 || dLng > span.longitudeDelta / 3 else { return }
        }
        centeredOn = head
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .region(MKCoordinateRegion(center: head, span: span))
        }
    }

    private func regionSpan() -> MKCoordinateSpan {
        let lats = route.coordinates.map(\.latitude)
        let lngs = route.coordinates.map(\.longitude)
        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLng = lngs.min(), let maxLng = lngs.max()
        else { return MKCoordinateSpan(latitudeDelta: 0.005, longitudeDelta: 0.005) }
        let lat = max((maxLat - minLat) * 1.5, 0.004)
        let lng = max((maxLng - minLng) * 1.5, 0.004)
        return MKCoordinateSpan(latitudeDelta: min(lat, 0.25), longitudeDelta: min(lng, 0.25))
    }

    // MARK: - Scrims + chrome (shared by map and contour faces)

    private var scrims: some View {
        VStack(spacing: 0) {
            LinearGradient(
                colors: [.black.opacity(0.82), .black.opacity(0)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: Theme.r3(118))
            Spacer(minLength: 0)
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0), location: 0),
                    .init(color: .black.opacity(0.9), location: 0.62),
                    .init(color: .black.opacity(0.9), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: Theme.r3(is41mm ? 172 : 196))
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private var overlayChrome: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(paused ? "PAUSED" : kind.title.uppercased())
                    .font(Theme.r3Text(12, weight: .bold))
                    .kerning(0.96)
                    .foregroundStyle(paused ? Theme.textTertiary : Theme.accent)
                Spacer()
                if !dimmed {
                    GPSPill(hasFix: route.hasFix, authorized: route.isAuthorized)
                }
            }
            .padding(.top, Theme.r3(40))

            Spacer(minLength: 0)

            distanceHero
            if !dimmed {
                statRow
                    .padding(.top, Theme.r3(12))
            }
        }
        .padding(.horizontal, Theme.r3(30))
        .padding(.bottom, Theme.r3(26))
    }

    private var distanceHero: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.r3(6)) {
            Text(String(format: "%.2f", distanceKm))
                .font(Theme.r3Display(is41mm ? 38 : 44, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(dimmed ? Theme.textSecondary : Theme.textBright)
            Text(paused ? "KM · HELD" : "KM")
                .font(Theme.r3Text(10, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.textTertiary)
            if dimmed {
                Spacer(minLength: 0)
                Text(paceText)
                    .font(Theme.r3Display(20, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.textSecondary)
                Text("/ KM")
                    .font(Theme.r3Text(9, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }

    private var statRow: some View {
        HStack(spacing: 0) {
            mapCell(paceText, "/ KM · NOW")
            mapCell(
                recorder.elevationGainLive > 0 ? "+\(Int(recorder.elevationGainLive))" : "––",
                "ELEV M",
                tint: crestFlash ? Theme.accentWashSub : Theme.textBright
            )
            mapCell(
                recorder.stepCountLive.map { Fmt.grouped(Double($0)) } ?? "––",
                "STEPS"
            )
            VStack(spacing: Theme.r3(3)) {
                HStack(spacing: Theme.r3(4)) {
                    BeatingHeart(
                        size: Theme.r3(13),
                        bpm: recorder.heartRate,
                        zone: recorder.currentZone
                    )
                    Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                        .font(Theme.r3Display(is41mm ? 18 : 20, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textBright)
                }
                Text("BPM")
                    .font(Theme.r3Text(9, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func mapCell(
        _ value: String, _ label: String, tint: Color = Theme.textBright
    ) -> some View {
        VStack(spacing: Theme.r3(3)) {
            Text(value)
                .font(Theme.r3Display(is41mm ? 18 : 20, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .animation(.easeInOut(duration: 0.22), value: tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(Theme.r3Text(9, weight: .semibold))
                .foregroundStyle(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    private var distanceKm: Double {
        let meters = recorder.distanceMeters ?? 0
        return (meters > 0 ? meters : route.distanceMeters) / 1000
    }

    private var paceText: String {
        if paused { return "—:——" }
        guard let pace = recorder.paceNowSecPerKm else { return "—:——" }
        return String(format: "%d:%02d", pace / 60, pace % 60)
    }
}

// MARK: - Head dot (§02 — 16 px accent core, white ring, 1.8 s pulse)

private struct HeadDot: View {
    let pulsing: Bool
    @State private var pulse = false

    var body: some View {
        ZStack {
            if pulsing {
                Circle()
                    .strokeBorder(Theme.accent, lineWidth: Theme.r3(2))
                    .frame(width: Theme.r3(16), height: Theme.r3(16))
                    .scaleEffect(pulse ? 2.1 : 0.55)
                    .opacity(pulse ? 0 : 0.9)
                    .animation(
                        .easeOut(duration: 1.8).repeatForever(autoreverses: false),
                        value: pulse
                    )
            }
            Circle()
                .fill(Theme.accent)
                .frame(width: Theme.r3(16), height: Theme.r3(16))
                .overlay(Circle().strokeBorder(.white, lineWidth: Theme.r3(3)))
        }
        .onAppear { pulse = true }
    }
}

// MARK: - Contour ground (§02 offline face = the AOD face)
// Five curves extracted VERBATIM from the Round 3 board (396×484 canvas,
// #1C1B20, 2 px), with the live route riding them in deep pink.

struct ContourGround: View {
    let coordinates: [CLLocationCoordinate2D]

    static let contours = [
        "M-10 96 C70 72 130 104 200 84 C270 66 330 88 406 68",
        "M-10 180 C60 158 140 190 220 168 C290 150 340 170 406 152",
        "M-10 268 C80 246 150 280 240 256 C300 240 350 258 406 242",
        "M-10 356 C70 336 150 366 230 346 C300 328 350 346 406 332",
        "M-10 440 C80 420 160 448 250 428 C310 414 360 428 406 418",
    ]

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.black))
            let sx = size.width / 396, sy = size.height / 484
            let scale = CGAffineTransform(scaleX: sx, y: sy)
            for contour in Self.contours {
                let path = svgPath(contour).applying(scale)
                context.stroke(
                    Path(path.cgPath),
                    with: .color(Color(hex: 0x1C1B20)),
                    style: StrokeStyle(lineWidth: Theme.r3(2) * 2)
                )
            }

            guard coordinates.count > 1 else { return }
            let track = fitted(in: size)
            var path = Path()
            path.addLines(track)
            context.stroke(
                path,
                with: .color(Theme.accentDeep),
                style: StrokeStyle(lineWidth: Theme.r3(4), lineCap: .round, lineJoin: .round)
            )
            if let start = track.first {
                let r = Theme.r3(6)
                context.stroke(
                    Path(ellipseIn: CGRect(x: start.x - r, y: start.y - r, width: r * 2, height: r * 2)),
                    with: .color(Theme.accentDeep),
                    lineWidth: Theme.r3(2.5)
                )
            }
            if let head = track.last {
                let r = Theme.r3(7)
                context.stroke(
                    Path(ellipseIn: CGRect(x: head.x - r, y: head.y - r, width: r * 2, height: r * 2)),
                    with: .color(Theme.accent),
                    lineWidth: Theme.r3(2.5)
                )
            }
        }
    }

    private func fitted(in size: CGSize) -> [CGPoint] {
        let lats = coordinates.map(\.latitude)
        let lngs = coordinates.map(\.longitude)
        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLng = lngs.min(), let maxLng = lngs.max()
        else { return [] }
        let midLat = (minLat + maxLat) / 2
        let lngScale = cos(midLat * .pi / 180)
        let spanY = max(maxLat - minLat, 1e-6)
        let spanX = max((maxLng - minLng) * lngScale, 1e-6)
        let inset = Theme.r3(60)
        let boxW = size.width - inset * 2
        let boxH = size.height - inset * 2
        let fit = min(boxW / spanX, boxH / spanY)
        let originX = inset + (boxW - spanX * fit) / 2
        let originY = inset + (boxH - spanY * fit) / 2
        return coordinates.map { c in
            CGPoint(
                x: originX + (c.longitude - minLng) * lngScale * fit,
                y: originY + (maxLat - c.latitude) * fit
            )
        }
    }
}
#endif
