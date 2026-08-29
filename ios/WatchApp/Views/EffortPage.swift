// Effort — Round 3 §01 (variant 3a, strip chart), extracted 1:1 from
// docs/design/pitaya-watch-round3.dc.html. The "how hard am I working" page,
// on every kind's carousel: last-10-min HR trace over the served zone bands,
// the big BPM + zone chip, and a kind-aware 2×2 stat grid.

#if os(watchOS)
import SwiftUI
import WatchKit

struct EffortPage: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    let kind: WorkoutKind
    @Environment(\.isLuminanceReduced) private var dimmed
    /// §03: the page chip wears "NAME ↑/↓" while a bloom is in flight.
    @State private var chipArrow: String?
    @State private var chipPop = false

    private var is41mm: Bool { WKInterfaceDevice.current().screenBounds.width < 190 }
    private var paused: Bool { recorder.phase == .paused }
    private var zone: Int? { recorder.currentZone }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            bpmRow
                .padding(.top, Theme.r3(8))
                .opacity(paused ? 0.62 : 1)

            EffortGraph(
                recorder: recorder,
                zones: model.zones,
                paused: paused,
                dimmed: dimmed
            )
            .frame(height: Theme.r3(is41mm ? 122 : 158))
            .frame(maxHeight: .infinity)
            .padding(.top, Theme.r3(6))
            .opacity(paused ? 0.62 : 1)

            if !dimmed {
                statGrid
                    .padding(.top, Theme.r3(16))
                    .opacity(paused ? 0.62 : 1)
            }
        }
        .padding(.top, Theme.r3(46))
        .padding(.horizontal, Theme.r3(30))
        .padding(.bottom, Theme.r3(34))
        .animation(paused ? Theme.Motion.exit : Theme.Motion.arrival, value: paused)
        .onChange(of: recorder.zoneEvent) { _, event in
            guard let event, !dimmed else { return }
            chipArrow = event.up ? "↑" : "↓"
            withAnimation(Theme.Motion.arrival) { chipPop = true }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 900_000_000)
                withAnimation(Theme.Motion.exit) { chipPop = false }
                chipArrow = nil
            }
        }
    }

    // MARK: - Rows

    private var header: some View {
        HStack {
            Text(paused ? "PAUSED" : "EFFORT")
                .font(Theme.r3Text(12, weight: .bold))
                .kerning(0.96) // .16em of 12px
                .foregroundStyle(paused ? Theme.textTertiary : Theme.accent)
            Spacer()
            Text(dimmed ? aodElapsed : Fmt.clock(recorder.elapsed))
                .font(Theme.r3Display(14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.textMuted)
        }
    }

    /// AOD trades the ticking clock for "42 MIN".
    private var aodElapsed: String {
        "\(max(0, Int(recorder.elapsed / 60))) MIN"
    }

    private var bpmRow: some View {
        HStack(alignment: .center, spacing: Theme.r3(10)) {
            BeatingHeart(
                size: Theme.r3(26),
                bpm: recorder.heartRate,
                zone: zone
            )
            Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                .font(Theme.r3Display(is41mm ? 58 : 66, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(bpmColor)
            Spacer(minLength: 0)
            ZoneChipStack(zone: zone, arrow: chipArrow)
                .scaleEffect(chipPop ? 1.26 : 1)
        }
    }

    /// §04: at Z5 the digits read blush with the heart; AOD holds 55%.
    private var bpmColor: Color {
        if dimmed { return Theme.textSecondary }
        return zone == 5 ? Theme.prText : Theme.textBright
    }

    // MARK: - Stat grid (2×2, cells centered, kind-aware back row)

    private var statGrid: some View {
        let stepKind = kind == .walk || kind == .run || kind == .hike || kind == .treadmill
        return Grid(horizontalSpacing: Theme.r3(9), verticalSpacing: Theme.r3(14)) {
            GridRow {
                effortCell(
                    recorder.activeCalories.map { String(Int($0)) } ?? "––",
                    "KCAL"
                )
                effortCell(
                    recorder.kcalPerHour.map(String.init) ?? "––",
                    "KCAL / H"
                )
            }
            GridRow {
                if stepKind {
                    effortCell(
                        recorder.stepCountLive.map { Fmt.grouped(Double($0)) } ?? "––",
                        "STEPS"
                    )
                    effortCell(
                        recorder.cadenceSpm.map(String.init) ?? "––",
                        "STEPS / MIN"
                    )
                } else {
                    effortCell(
                        recorder.avgHeartRate.map { String(Int($0)) } ?? "––",
                        "AVG BPM"
                    )
                    effortCell(
                        recorder.maxHeartRate.map { String(Int($0)) } ?? "––",
                        "PEAK BPM"
                    )
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func effortCell(_ value: String, _ label: String) -> some View {
        VStack(spacing: Theme.r3(3)) {
            Text(value)
                .font(Theme.r3Display(24, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Theme.textBright)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(Theme.r3Text(9.5, weight: .semibold))
                .kerning(0.57) // .12em of 9.5px
                .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - The strip chart (§01 graph block)

private struct EffortGraph: View {
    @ObservedObject var recorder: WorkoutRecorder
    let zones: HeartRateZones?
    let paused: Bool
    let dimmed: Bool
    @State private var dotDim = false

    private static let window: TimeInterval = 600
    private static let bpmMin: Double = 55
    private static let bpmMax: Double = 195
    /// Band fills Z1→Z5 (§01: 10/11/10/8/6% listed Z5→Z1).
    private static let bandAlpha: [Double] = [0.06, 0.08, 0.10, 0.11, 0.10]

    var body: some View {
        ZStack(alignment: .bottom) {
            Canvas { context, size in
                drawBands(context: context, size: size)
                drawTrace(context: context, size: size)
            }
            // Corner labels ride outside the canvas so Text stays crisp.
            HStack {
                Text("−10 MIN")
                Spacer()
                Text("NOW")
            }
            .font(Theme.r3Text(9, weight: .semibold))
            .foregroundStyle(Theme.textFaint)
            .padding(.horizontal, 1)
            .offset(y: Theme.r3(14))
        }
        .overlay(alignment: .topLeading) { nowDot }
        .id(recorder.streamRevision) // redraw snaps per sample — no tween
    }

    /// §01 now-dot: r 4.5 in zone fill, opacity 1→0.35→1 over 1 s. The one
    /// ambient loop on the page; AOD drops it entirely.
    @ViewBuilder
    private var nowDot: some View {
        if !dimmed, let last = recorder.hrStream.last {
            GeometryReader { geo in
                let point = position(
                    bpm: Double(last),
                    t: TimeInterval(recorder.timeStream.last ?? 0),
                    size: geo.size
                )
                Circle()
                    .fill(Theme.zoneFill(recorder.currentZone ?? 3))
                    .frame(width: Theme.r3(9), height: Theme.r3(9))
                    .position(point)
                    .opacity(dotDim ? 0.35 : 1)
                    .animation(
                        .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                        value: dotDim
                    )
                    .onAppear { dotDim = true }
            }
        }
    }

    private func drawBands(context: GraphicsContext, size: CGSize) {
        guard let zones, zones.tops.count == 4 else {
            // No served boundaries: hairline grid only, never invented bands.
            drawHairlines(at: [0.25, 0.5, 0.75].map { $0 * size.height }, context: context, size: size)
            return
        }
        let edges = ([Int(Self.bpmMin)] + zones.tops + [Int(Self.bpmMax)]).map(Double.init)
        for zone in 1...5 {
            let lower = max(edges[zone - 1], Self.bpmMin)
            let upper = min(edges[zone], Self.bpmMax)
            guard upper > lower else { continue }
            let yTop = y(for: upper, in: size)
            let yBottom = y(for: lower, in: size)
            let rect = CGRect(x: 0, y: yTop, width: size.width, height: yBottom - yTop)
            if dimmed {
                // AOD: bands become #1D1C21 hairlines only.
                context.stroke(
                    Path { $0.move(to: CGPoint(x: 0, y: yTop)); $0.addLine(to: CGPoint(x: size.width, y: yTop)) },
                    with: .color(Color(hex: 0x1D1C21)), lineWidth: 1
                )
            } else {
                context.fill(
                    Path(rect),
                    with: .color(Theme.zoneFill(zone).opacity(Self.bandAlpha[zone - 1]))
                )
                context.stroke(
                    Path { $0.move(to: CGPoint(x: 0, y: yTop)); $0.addLine(to: CGPoint(x: size.width, y: yTop)) },
                    with: .color(.white.opacity(0.05)), lineWidth: 1
                )
                // Right-edge Z2–Z5 labels at ~50–55% zone color.
                if zone >= 2 {
                    let label = Text("Z\(zone)")
                        .font(Theme.r3Text(9, weight: .semibold))
                        .foregroundStyle(Theme.zoneFill(zone).opacity(0.52))
                    context.draw(
                        label,
                        at: CGPoint(x: size.width - Theme.r3(8), y: (yTop + yBottom) / 2),
                        anchor: .trailing
                    )
                }
            }
        }
    }

    private func drawHairlines(at ys: [CGFloat], context: GraphicsContext, size: CGSize) {
        for lineY in ys {
            context.stroke(
                Path { $0.move(to: CGPoint(x: 0, y: lineY)); $0.addLine(to: CGPoint(x: size.width, y: lineY)) },
                with: .color(.white.opacity(0.05)), lineWidth: 1
            )
        }
    }

    private func drawTrace(context: GraphicsContext, size: CGSize) {
        let hr = recorder.hrStream
        let time = recorder.timeStream
        guard hr.count > 1, hr.count == time.count else { return }
        let cutoff = TimeInterval(time.last ?? 0) - Self.window

        var path = Path()
        var started = false
        for index in 0..<hr.count {
            let t = TimeInterval(time[index])
            guard t >= cutoff else { continue }
            let point = position(bpm: Double(hr[index]), t: t, size: size)
            if started { path.addLine(to: point) } else { path.move(to: point); started = true }
        }

        let style: StrokeStyle
        let color: Color
        if dimmed {
            style = StrokeStyle(lineWidth: Theme.r3(2.6), lineCap: .round, lineJoin: .round)
            color = Theme.textFaint
        } else if paused {
            // §01 paused: the trace keeps drawing, dotted, so recovery stays
            // visible while the clock holds.
            style = StrokeStyle(
                lineWidth: Theme.r3(2.6), lineCap: .round, lineJoin: .round,
                dash: [Theme.r3(3), Theme.r3(6)]
            )
            color = Theme.textMuted
        } else {
            style = StrokeStyle(lineWidth: Theme.r3(2.6), lineCap: .round, lineJoin: .round)
            color = Theme.textPrimary
        }
        context.stroke(path, with: .color(color), style: style)
    }

    private func y(for bpm: Double, in size: CGSize) -> CGFloat {
        let clamped = min(max(bpm, Self.bpmMin), Self.bpmMax)
        let fraction = (clamped - Self.bpmMin) / (Self.bpmMax - Self.bpmMin)
        return size.height * (1 - fraction)
    }

    private func position(bpm: Double, t: TimeInterval, size: CGSize) -> CGPoint {
        let latest = TimeInterval(recorder.timeStream.last ?? 0)
        let start = max(0, latest - Self.window)
        let span = max(latest - start, 1)
        let x = size.width * (t - start) / span
        return CGPoint(x: min(max(x, 0), size.width), y: y(for: bpm, in: size))
    }
}
#endif
