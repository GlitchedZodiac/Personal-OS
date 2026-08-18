// Freestyle — the wrist's whole job during a follow-along video or an
// improvised EMOM: record. Elapsed, live HR, the zone he's in, End. No
// structure UI: he describes the session on the phone afterwards and the
// coach attaches the movements.
//
// NO DESIGN SLICE EXISTS for this screen — built inside the watch design
// system (Theme idiom, existing tile/CTA grammar) and flagged for the next
// design pass. PORT GATE applies the moment a slice lands.

#if os(watchOS)
import SwiftUI
import WatchKit

struct FreestyleRunView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var recorder: WorkoutRecorder
    @Environment(\.isLuminanceReduced) private var dimmed
    @State private var lastZone: Int?

    init() {
        // The recorder is a let on the model; observing it directly is what
        // makes HR tick (a nested ObservableObject won't re-render through
        // the parent — the 2026-08-10 lesson).
        recorder = AppModel.shared?.recorder ?? WorkoutRecorder()
    }

    private var zone: Int? {
        guard let hr = recorder.heartRate, hr > 0 else { return nil }
        return model.zones?.zone(for: hr)
    }

    /// §09's zone vocabulary: Z1–2 mint, Z3–4 accent, Z5 blush.
    private var zoneColor: Color {
        switch zone {
        case 1, 2: return Theme.mint
        case 3, 4: return Theme.accent
        case 5: return Theme.prText
        default: return Theme.textSecondary
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            Spacer(minLength: 0)

            // HR is the hero — it's the one number that matters while his
            // eyes are on a screen across the room.
            HStack(alignment: .firstTextBaseline, spacing: Theme.px(6)) {
                Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                    .font(Theme.wNumeric(34))
                    .foregroundStyle(dimmed ? Theme.textTertiary : zoneColor)
                    .contentTransition(.numericText())
                Text("BPM")
                    .font(Theme.wText(6, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
            }

            zoneChip

            Spacer(minLength: 0)

            Text(Fmt.clock(recorder.elapsed))
                .font(Theme.wNumeric(16))
                .foregroundStyle(Theme.textBright)

            Spacer(minLength: 0)

            // Deliberately NOT wearing the Double Tap gesture: everywhere
            // else the primary action is additive, but here it would end a
            // running session — a bad thing to fire by accident mid-video.
            PitayaCTA(title: "End", background: Theme.accentDeep) {
                Task { await model.finishWorkout(.freestyle) }
            }
        }
        .padding(.horizontal, Theme.px(10))
        .padding(.vertical, Theme.px(4))
        .overlay { CountdownOverlay() }
        .overlay {
            if model.idleNudgeActive {
                IdleNudgeOverlay(onEnd: { Task { await model.finishWorkout(.freestyle) } })
            }
        }
        .onChange(of: zone) { _, new in
            // A tap per zone change — he can feel the effort move without
            // looking away from the video.
            guard let new, let old = lastZone, new != old else {
                lastZone = new
                return
            }
            Haptics.key(new > old ? .directionUp : .directionDown)
            lastZone = new
        }
    }

    private var header: some View {
        HStack(spacing: Theme.px(6)) {
            PitayaMark(size: Theme.px(9), color: Theme.accent)
            Text("FREESTYLE")
                .font(Theme.wText(5.5, weight: .bold))
                .kerning(1.2)
                .foregroundStyle(Theme.accent)
            Spacer(minLength: 0)
            if recorder.phase == .paused {
                Text("PAUSED")
                    .font(Theme.wText(5.5, weight: .bold))
                    .kerning(1)
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }

    @ViewBuilder
    private var zoneChip: some View {
        if let zone, let zones = model.zones {
            Text(zones.name(zone))
                .font(Theme.wText(5.75, weight: .bold))
                .kerning(0.8)
                .foregroundStyle(dimmed ? zoneColor : Theme.bg)
                .padding(.horizontal, Theme.px(9))
                .padding(.vertical, Theme.px(3))
                .background(
                    dimmed ? AnyShapeStyle(Color.clear) : AnyShapeStyle(zoneColor),
                    in: Capsule()
                )
                .overlay(Capsule().strokeBorder(zoneColor, lineWidth: dimmed ? 1 : 0))
                .padding(.top, Theme.px(5))
        } else if model.zones == nil {
            // Honest empty state: no cached boundaries yet, so no zone is
            // claimed (and the session will ship without timeInZones).
            Text("zones sync on next connection")
                .font(Theme.wText(5))
                .foregroundStyle(Theme.textFaint)
                .padding(.top, Theme.px(5))
        }
    }
}
#endif
