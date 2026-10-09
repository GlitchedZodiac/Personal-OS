// Freestyle — the wrist's job during a follow-along video or an improvised
// EMOM: record. Elapsed, live HR, calories, the zone he's in, End.
//
// 2026-10-05: it can also LISTEN. One big mic button — tap (or Double Tap),
// say "10 kettlebell swings", and the movement list builds itself, so the
// session no longer needs describing on the phone afterwards. Describing it
// later still works for sessions he never spoke during.
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
    @State private var page = 0

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
        // Round 3 §00: freestyle runs a two-page carousel — the recording
        // face (End stays HERE, never a swipe away from a mid-video fumble)
        // plus the Effort page.
        TabView(selection: $page) {
            recordingFace.tag(0)
            EffortPage(recorder: recorder, kind: .freestyle).tag(1)
        }
        .tabViewStyle(.verticalPage)
        .onAppear {
            #if DEBUG
            if let forced = ProcessInfo.processInfo
                .environment["PITAYA_SMOKE_PAGE"].flatMap(Int.init) {
                page = forced
            }
            #endif
        }
        .overlay { ZoneBloomOverlay(recorder: recorder) }
        .overlay { VoiceFlashOverlay(voice: model.voice) }
        .overlay { CountdownOverlay() }
        .overlay {
            if model.idleNudgeActive {
                IdleNudgeOverlay(onEnd: { Task { await model.finishWorkout(.freestyle) } })
            }
        }
    }

    private var recordingFace: some View {
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

            // Elapsed and calories side by side — calories were recorded on
            // every freestyle session and shown nowhere on this face.
            HStack(alignment: .firstTextBaseline, spacing: Theme.px(8)) {
                Text(Fmt.clock(recorder.elapsed))
                    .font(Theme.wNumeric(14))
                    .foregroundStyle(Theme.textBright)
                Text("·")
                    .font(Theme.wNumeric(14))
                    .foregroundStyle(Theme.textMuted)
                Text(recorder.activeCalories.map { String(Int($0)) } ?? "––")
                    .font(Theme.wNumeric(14))
                    .foregroundStyle(Theme.textBright)
                    .contentTransition(.numericText())
                Text("KCAL")
                    .font(Theme.wText(6, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
            }

            Spacer(minLength: 0)

            // The mic is the pink button now, so it is what Double Tap
            // presses — additive, like every other primary. End stays on
            // this face (never a swipe away mid-video) but steps back: dark,
            // smaller, and still NOT reachable by gesture, because ending a
            // running session by accident is the one thing that must not
            // happen here.
            HStack(spacing: Theme.px(10)) {
                Button {
                    Task { await model.finishWorkout(.freestyle) }
                } label: {
                    Text("End")
                        .font(Theme.display(13, weight: .semibold))
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity)
                        .pitayaTappable(minHeight: 44)
                        .background(Theme.dangerDim, in: Capsule())
                }
                .buttonStyle(.plain)
                VoiceMicButton(voice: model.voice, diameter: 54, primary: true)
            }
        }
        .padding(.horizontal, Theme.px(10))
        .padding(.vertical, Theme.px(4))
        // The per-crossing haptic moved into the recorder's ZonePublisher
        // (Round 3 §03: 5-sample confirm + cooldown) — the old raw-sample
        // onChange here would have double-fired every crossing.
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
            // How much of the session he has already said — and the way in
            // to read it back (2026-10-09: "a menu in the freestyle that
            // shows the log so I can see how accurate it's been logging").
            VoiceLogChip()
                // Clear of the carousel's page dots on the right edge.
                .padding(.trailing, 8)
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
