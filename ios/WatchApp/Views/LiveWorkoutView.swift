// Live workout — vertically paged like modern watchOS Workout: metrics page
// (design 07), kettlebell set logger (the crown jewel: crown-dialed weight,
// tap reps, PR haptic), and the controls page (design 10).

#if os(watchOS)
import SwiftUI
import WatchKit

struct LiveWorkoutView: View {
    @EnvironmentObject private var model: AppModel
    let kind: WorkoutKind
    @State private var page = 0

    var body: some View {
        // Round 3 §00 carousel order:
        //   kettlebell  Metrics → Set logger → Effort → Controls
        //   outdoor     Metrics → Live map → Trail stats → Effort → Controls
        //   treadmill   Metrics → Effort → Controls
        TabView(selection: $page) {
            MetricsPage(recorder: model.recorder, kind: kind).tag(0)
            if kind == .kettlebell {
                SetLoggerPage().tag(1)
                EffortPage(recorder: model.recorder, kind: kind).tag(2)
                ControlsPage(recorder: model.recorder, kind: kind, isSequence: false).tag(3)
            } else if kind.isOutdoor {
                LiveMapPage(recorder: model.recorder, route: model.recorder.route, kind: kind)
                    .tag(1)
                // Design 12 — the GPS/route stats face.
                TrailPage(recorder: model.recorder, route: model.recorder.route, kind: kind)
                    .tag(2)
                EffortPage(recorder: model.recorder, kind: kind).tag(3)
                ControlsPage(recorder: model.recorder, kind: kind, isSequence: false).tag(4)
            } else {
                EffortPage(recorder: model.recorder, kind: kind).tag(1)
                ControlsPage(recorder: model.recorder, kind: kind, isSequence: false).tag(2)
            }
        }
        .tabViewStyle(.verticalPage)
        .onAppear {
            if kind == .kettlebell { page = 1 }
            #if DEBUG
            // Smoke seam: land on a specific carousel page for screenshots.
            if let forced = ProcessInfo.processInfo
                .environment["PITAYA_SMOKE_PAGE"].flatMap(Int.init) {
                page = forced
            }
            #endif
        }
        .overlay { ZoneBloomOverlay(recorder: model.recorder) }
        .overlay { SplitBannerOverlay(recorder: model.recorder) }
        .overlay(alignment: .bottom) {
            if let flash = model.prFlash {
                // §05: while the flash is up, Double Tap dismisses it.
                Button {
                    model.dismissPRFlash()
                } label: {
                    PRBanner(text: prCopy(flash))
                }
                .buttonStyle(.plain)
                .handGestureShortcut(.primaryAction)
                .overlay { PRSeeds() } // §10: five diamonds arc out, 0.9 s
                .padding(.horizontal, 8)
                .padding(.bottom, 2)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay {
            if model.idleNudgeActive {
                IdleNudgeOverlay(onEnd: { Task { await model.finishWorkout(kind) } })
            }
        }
        .overlay {
            CountdownOverlay()
        }
        // §10: the banner springs up 0.35 s on the design's curve.
        .animation(
            .timingCurve(0.34, 1.4, 0.5, 1, duration: 0.35), value: model.prFlash != nil
        )
    }

    /// §10 copy: "PR · Swing 32 kg — was 28".
    private func prCopy(_ flash: LoggedSet) -> String {
        var copy = "PR · \(flash.exercise.name) \(Fmt.kg(flash.weightKg)) kg"
        if let previous = flash.previousWeightKg {
            copy += " — was \(Fmt.kg(previous))"
        }
        return copy
    }
}

// MARK: - Metrics (design 07)

struct MetricsPage: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    let kind: WorkoutKind

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Text(kind == .kettlebell ? "KB SESSION" : kind.title.uppercased())
                    .font(Theme.text(8, weight: .bold))
                    .kerning(1.2)
                    .foregroundStyle(Theme.accent)
                Spacer()
                if recorder.phase == .paused {
                    Text("PAUSED")
                        .font(Theme.text(8, weight: .bold))
                        .kerning(1)
                        .foregroundStyle(Theme.textTertiary)
                }
                // Round 3 §00: every in-workout header carries the zone chip.
                ZoneChipStack(zone: recorder.currentZone, showName: false)
            }

            Text(Fmt.clock(recorder.elapsed))
                .font(Theme.numeric(42))
                .foregroundStyle(Theme.textBright)
                .padding(.top, 2)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                BeatingHeart(size: 16)
                Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                    .font(Theme.numeric(29))
                    .foregroundStyle(Theme.textBright)
                Text("BPM")
                    .font(Theme.text(9, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
            }
            .padding(.top, 4)

            ZoneBar(heartRate: recorder.heartRate)
                .padding(.top, 5)

            Spacer(minLength: 0)

            HStack {
                StatCell(
                    value: recorder.activeCalories.map { String(Int($0)) } ?? "––",
                    label: "KCAL"
                )
                if kind == .kettlebell {
                    StatCell(
                        value: "\(model.loggedSets.count)",
                        label: "SETS",
                        color: Theme.accent
                    )
                } else {
                    StatCell(
                        value: recorder.distanceMeters.map {
                            String(format: "%.2f", $0 / 1000)
                        } ?? "0.00",
                        label: "KM",
                        color: Theme.accent
                    )
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
    }
}

// MARK: - Controls (design 10)

struct ControlsPage: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var recorder: WorkoutRecorder
    let kind: WorkoutKind
    var isSequence: Bool = false

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                controlButton("End", bg: Theme.dangerDim, glyph: {
                    PitayaGlyph(
                        paths: Glyphs.endX, style: .stroke(width: 2.6),
                        color: Theme.danger, size: 15
                    )
                }) {
                    Task {
                        if isSequence {
                            await model.endSequenceEarly()
                        } else {
                            await model.finishWorkout(kind)
                        }
                    }
                }
                pauseResume
            }
            HStack(spacing: 8) {
                controlButton("Lock", bg: Theme.waterDim, glyph: {
                    PitayaGlyph(paths: Glyphs.drop, style: .fill, color: Theme.water, size: 15)
                }) {
                    WKInterfaceDevice.current().enableWaterLock()
                }
                if kind == .kettlebell && !isSequence {
                    // The design's 4th control is a Lap flag; kettlebell has
                    // no laps, so this slot repeats the last set. §12: the
                    // repeat-set glyph retires the arrow.counterclockwise SF.
                    controlButton("Repeat set", bg: Theme.accentDim, glyph: {
                        RepeatSetGlyph(color: Theme.accent, size: 15)
                    }) {
                        model.repeatLastSet()
                    }
                } else {
                    Color.clear.frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, 12)
    }

    private var pauseResume: some View {
        let paused = recorder.phase == .paused
        return controlButton(paused ? "Resume" : "Pause", bg: Theme.elementDim, glyph: {
            if paused {
                PlayGlyph(color: Theme.textPrimary, size: 15)
            } else {
                PauseGlyph(color: Theme.textPrimary, size: 15)
            }
        }) {
            if paused {
                recorder.resume()
                Haptics.key(.start) // Round 3 §01: resume lands with .start
            } else {
                recorder.pause()
            }
        }
    }

    private func controlButton(
        _ label: String, bg: Color,
        @ViewBuilder glyph: @escaping () -> some View,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    Circle().fill(bg)
                    glyph()
                }
                .frame(width: 50, height: 50)
                Text(label)
                    .font(Theme.text(8.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
#endif
