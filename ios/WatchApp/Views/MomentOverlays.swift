// Round 3 moments that ride over whichever live page is visible: the §03
// zone-change bloom and the §07 km-split banner. Values extracted 1:1 from
// docs/design/pitaya-watch-round3.dc.html. Haptics fire in the recorder at
// event time; these are the visuals only — AOD shows neither (a wrist-raise
// within 6 s replays the bloom once).

#if os(watchOS)
import SwiftUI
import WatchKit

// MARK: - §03 zone-change bloom

struct ZoneBloomOverlay: View {
    @ObservedObject var recorder: WorkoutRecorder
    @Environment(\.isLuminanceReduced) private var dimmed
    @State private var active: WorkoutRecorder.ZoneEvent?
    @State private var slid = false
    @State private var faded = false
    @State private var playedID: UUID?
    @State private var wristDownAt: Date?

    var body: some View {
        ZStack {
            if let event = active, !dimmed {
                sprite(for: event)
            }
        }
        .allowsHitTesting(false)
        .onChange(of: recorder.zoneEvent) { _, event in
            guard let event else { return }
            if dimmed {
                // Suppressed on AOD — the outlined chip recolors on the next
                // tick; remember the moment for a raise-replay.
                wristDownAt = Date()
                return
            }
            play(event)
        }
        .onChange(of: dimmed) { _, isDim in
            if !isDim, let event = recorder.zoneEvent, event.id != playedID,
               let at = wristDownAt, Date().timeIntervalSince(at) < 6 {
                play(event)
            }
            wristDownAt = nil
        }
    }

    private func play(_ event: WorkoutRecorder.ZoneEvent) {
        playedID = event.id
        slid = false
        faded = false
        active = event
        withAnimation(.easeOut(duration: 0.5)) { slid = true }
        withAnimation(.easeIn(duration: 0.4).delay(0.5)) { faded = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 900_000_000)
            if active?.id == event.id { active = nil }
        }
    }

    /// Pre-baked radial sprite (~516×340 px): zone color 55% → 0 at 62%.
    /// Direction encodes — up rises from the bottom bezel, down falls from
    /// the top. Transform + opacity only.
    private func sprite(for event: WorkoutRecorder.ZoneEvent) -> some View {
        let color = Theme.zoneFill(event.to)
        let screenH = WKInterfaceDevice.current().screenBounds.height
        let offscreen = screenH / 2 + Theme.r3(200)
        let landed = screenH / 2 - Theme.r3(30)
        let start = event.up ? offscreen : -offscreen
        let end = event.up ? landed : -landed
        return Ellipse()
            .fill(
                RadialGradient(
                    stops: [
                        .init(color: color.opacity(0.55), location: 0),
                        .init(color: color.opacity(0), location: 0.62),
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: Theme.r3(258)
                )
            )
            .frame(width: Theme.r3(516), height: Theme.r3(340))
            .offset(y: slid ? end : start)
            .opacity(faded ? 0 : 1)
    }
}

// MARK: - §07 km-split banner

struct SplitBannerOverlay: View {
    @ObservedObject var recorder: WorkoutRecorder
    @Environment(\.isLuminanceReduced) private var dimmed
    @State private var active: WorkoutRecorder.SplitEvent?
    @State private var shown = false

    var body: some View {
        ZStack(alignment: .top) {
            if let split = active, !dimmed {
                banner(split)
                    .offset(y: shown ? Theme.r3(16) : -Theme.r3(140))
                    .opacity(shown ? 1 : 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .allowsHitTesting(false)
        .onChange(of: recorder.splitEvent) { _, split in
            // Never in AOD — the split still logs; only the visual skips.
            guard let split, !dimmed else { return }
            present(split)
        }
    }

    private func present(_ split: WorkoutRecorder.SplitEvent) {
        active = split
        withAnimation(.spring(duration: 0.3)) { shown = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard active?.id == split.id else { return }
            withAnimation(.easeIn(duration: 0.26)) { shown = false }
            try? await Task.sleep(nanoseconds: 260_000_000)
            if active?.id == split.id { active = nil }
        }
    }

    private func banner(_ split: WorkoutRecorder.SplitEvent) -> some View {
        VStack(alignment: .leading, spacing: Theme.r3(4)) {
            HStack {
                Text("KM \(split.km)")
                    .font(Theme.r3Display(23, weight: .bold))
                    .foregroundStyle(Theme.prText)
                Spacer()
                Text(Fmt.clock(TimeInterval(split.seconds)))
                    .font(Theme.r3Display(23, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.textBright)
            }
            if let sub = subLine(split) {
                Text(sub.text)
                    .font(Theme.r3Text(11, weight: .semibold))
                    .foregroundStyle(sub.mint ? Theme.mint : Theme.textTertiary)
            }
        }
        .padding(.horizontal, Theme.r3(20))
        .padding(.vertical, Theme.r3(14))
        .background(Theme.accentWash, in: RoundedRectangle(cornerRadius: Theme.r3(20)))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.r3(20))
                .strokeBorder(Theme.accentDeep, lineWidth: 1)
        )
        .padding(.horizontal, Theme.r3(18))
    }

    /// "9 s faster than your average" — mint; slower stays plain ghost copy.
    private func subLine(_ split: WorkoutRecorder.SplitEvent) -> (text: String, mint: Bool)? {
        guard let delta = split.deltaVsAverage, delta != 0 else { return nil }
        if delta < 0 {
            return ("\(-delta) s faster than your average", true)
        }
        return ("\(delta) s slower than your average", false)
    }
}
#endif
