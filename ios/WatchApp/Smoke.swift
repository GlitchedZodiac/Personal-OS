// Headless self-smoke seam — DEBUG builds only, compiled out of release.
// Launching the app with environment variables drives the REAL AppModel
// paths (pairing → set logging → finish → sync) so a simulator run can be
// verified end-to-end without UI scripting:
//
//   SIMCTL_CHILD_PITAYA_SMOKE_PIN=<pin>     pair on launch via the normal flow
//   SIMCTL_CHILD_PITAYA_SMOKE_AUTORUN=1     then record + log sets + sync
//
// Output lines are prefixed PITAYA-SMOKE for log scraping.

#if os(watchOS)
import Foundation

enum Smoke {
    @MainActor
    static func runIfRequested(on model: AppModel) async {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment

        if let pin = env["PITAYA_SMOKE_PIN"], model.phase == .welcome {
            log("pairing via smoke PIN…")
            model.beginPairing()
            await model.pair(pin: pin)
            if case .pairedIntro = model.phase {
                log("PAIRED ok — history=\(model.historyCount) prExercises=\(model.prExerciseCount)")
                model.finishIntro()
            } else {
                log("PAIR FAILED: \(model.pairError ?? "unknown")")
                return
            }
        }

        // Any smoke-driven workout syncs under its own externalSource so
        // test rows are unmistakable and cleanup can never touch real data.
        if env["PITAYA_SMOKE_HOLD"] == "1" || env["PITAYA_SMOKE_AUTORUN"] == "1" {
            model.externalSourceOverride = "watch_smoke"
        }

        // Visual-verification aid: a local 3-round circuit with prescribed
        // weights (the backend can't build circuits yet — rounds field filed).
        if env["PITAYA_SMOKE_SAMPLE_CIRCUIT"] == "1" {
            model.debugInjectSequence(SequenceDef(
                id: "smoke-circuit",
                name: "Armor Builder (sample)",
                kind: "circuit",
                restSecondsDefault: 15,
                durationMinutes: nil,
                rounds: 3,
                steps: [
                    SequenceStep(exercise: "kb-swing", exerciseName: "Kettlebell Swing",
                                 reps: 15, seconds: nil, weightKg: 20, restSeconds: nil),
                    SequenceStep(exercise: "kb-goblet-squat", exerciseName: "Goblet Squat",
                                 reps: 10, seconds: nil, weightKg: 20, restSeconds: nil),
                    SequenceStep(exercise: "kb-clean-and-press", exerciseName: "Clean and Press",
                                 reps: 5, seconds: nil, weightKg: 16, restSeconds: nil),
                ],
                updatedAt: Date()
            ))
            log("sample circuit injected")
        }

        // Discipline-split check (2026-08-20): a gym routine with no bell in
        // it, so Workouts → Weight Training has something to list and the
        // Kettlebell list can be seen NOT to contain it.
        if env["PITAYA_SMOKE_SAMPLE_WEIGHTS"] == "1" {
            model.debugInjectSequence(SequenceDef(
                id: "smoke-weights",
                name: "Leg Day (sample)",
                kind: "straight",
                restSecondsDefault: 90,
                durationMinutes: nil,
                rounds: nil,
                steps: [
                    SequenceStep(exercise: "leg-press", exerciseName: "Leg Press",
                                 reps: 10, seconds: nil, weightKg: 120, restSeconds: nil),
                    SequenceStep(exercise: "back-squat", exerciseName: "Squat",
                                 reps: 5, seconds: nil, weightKg: 80, restSeconds: nil),
                    SequenceStep(exercise: "romanian-deadlift", exerciseName: "Romanian Deadlift",
                                 reps: 8, seconds: nil, weightKg: 60, restSeconds: nil),
                ],
                updatedAt: Date()
            ))
            log("sample weights routine injected")
        }

        // Prove the classifier, not just the screens: every routine the model
        // holds, with the list it will appear under.
        if env["PITAYA_SMOKE_DISCIPLINES"] == "1" {
            // The injected samples are there from launch; his real routines
            // arrive with the history fetch — wait for them or the dump only
            // ever proves the synthetic half.
            await model.refreshHistory()
            for sequence in model.sequences {
                log("discipline: \(model.discipline(of: sequence).rawValue) ← \(sequence.name)")
            }
            log("discipline: kettlebell=\(model.sequences(for: .kettlebell).count) weights=\(model.sequences(for: .weights).count)")
        }

        // WALK variant: an outdoor session with the real recorder + GPS, held
        // open for N seconds while a route is fed in (simctl location), then
        // finished and saved — proves the whole route pipeline to prod.
        if let seconds = env["PITAYA_SMOKE_WALK"].flatMap(Int.init), model.phase == .home {
            model.externalSourceOverride = "watch_smoke"
            log("walk: starting outdoor session for \(seconds)s…")
            await model.startWorkout(.walk)
            try? await Task.sleep(nanoseconds: UInt64(seconds) * 1_000_000_000)
            let route = model.recorder.route
            log("walk: fixes=\(route.coordinates.count) gpsDistance=\(Int(route.distanceMeters))m")
            log("walk: finishing…")
            await model.finishWorkout(.walk)
            log("walk: finished — summary dist=\(model.summary?.distanceMeters ?? -1)")
            await model.saveWorkout()
            log("walk: saved — syncState=\(String(describing: model.syncState))")
            return
        }

        // §03 deltas proof: run the sample circuit twice, saving both — the
        // second summary must carry "· vs <first run>" with per-stat deltas
        // (volume/time equal ⇒ ghost "="). Ends holding the saved summary.
        if env["PITAYA_SMOKE_CIRCUIT_TWICE"] == "1", model.phase == .home {
            model.externalSourceOverride = "watch_smoke"
            guard let circuit = model.sequences.first(where: { $0.id == "smoke-circuit" }) else {
                log("circuit-twice: sample circuit missing — set SAMPLE_CIRCUIT=1 too")
                return
            }
            for pass in 1...2 {
                await model.startSequence(circuit, useRecorder: false)
                let taps = circuit.steps.count * model.circuitTotalRounds(circuit)
                for _ in 0..<taps {
                    let advance = Task { await model.advanceCircuitStep(circuit) }
                    try? await Task.sleep(nanoseconds: 150_000_000)
                    model.skipCircuitRest()
                    await advance.value
                }
                log("circuit-twice pass \(pass): baseline=\(model.lastRunBaseline != nil) vol=\(model.summary?.totalVolumeKg ?? -1)")
                await model.saveWorkout()
                log("circuit-twice pass \(pass): saved — syncState=\(String(describing: model.syncState))")
                if pass == 1 {
                    model.dismissSummary()
                    // Let refreshHistory pull the just-synced row back down.
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                }
            }
            log("circuit-twice: done — vsBaseline=\(String(describing: model.lastRunBaseline?.startedAt)) — holding summary")
            return
        }

        // FREESTYLE end-to-end: record for N seconds with the real recorder,
        // stand in a synthetic HR trace (no sensor in the sim), finish, save.
        // Proves: zones fetched → timeInZones computed on-wrist → streams
        // downsampled to ≤200 → row lands as workoutType "freestyle".
        if let seconds = env["PITAYA_SMOKE_FREESTYLE"].flatMap(Int.init), model.phase == .home {
            model.externalSourceOverride = "watch_smoke"
            DoubleTapCoach.shared.coachShown = true // don't gate on the coach
            await model.refreshHistory()            // pulls zone boundaries
            log("freestyle: zones=\(model.zones.map { "\($0.tops)" } ?? "MISSING")")

            await model.startWorkout(.freestyle)
            try? await Task.sleep(nanoseconds: UInt64(seconds) * 1_000_000_000)

            #if DEBUG
            // 600 samples at 2 s cadence — a warm-up climbing through the
            // zones then settling, so every zone bucket gets real seconds
            // and the ≤200 downsample actually has work to do.
            if model.recorder.hrStream.isEmpty {
                let hr = (0..<600).map { i -> Int in
                    let t = Double(i) / 600.0
                    return Int(105 + 80 * min(t * 1.6, 1.0))
                }
                let time = (0..<600).map { $0 * 2 }
                model.recorder.injectSyntheticStreams(hr: hr, time: time)
                log("freestyle: injected \(hr.count) synthetic HR samples")
            }
            #endif

            await model.finishWorkout(.freestyle)
            log("freestyle: zoneSeconds=\(model.freestyleZoneSeconds.map { "\($0)" } ?? "nil")")
            await model.saveWorkout()
            log("freestyle: saved — syncState=\(String(describing: model.syncState))")
            // 2026-08-20: Save is one tap now — it confirms and returns him
            // home itself. If this ever prints .summary again, the second
            // "Done" tap is back.
            log("freestyle: phase after save = \(String(describing: model.phase))")
            return
        }

        // §08 visual check: present the wrist-voice weight confirm card.
        if let weight = env["PITAYA_SMOKE_VOICE"].flatMap(Double.init), model.phase == .home {
            model.presentVoiceWeight(weight)
            log("voice: weight confirm card at \(weight) kg")
            return
        }

        // HOLD variant: start a kettlebell session, log one set, and stay on
        // the live set-logger screen (for visual verification runs).
        if env["PITAYA_SMOKE_HOLD"] == "1", model.phase == .home {
            await model.startWorkout(.kettlebell, useRecorder: false)
            model.weightKg = 16
            model.reps = 10
            model.logSet()
            log("hold: live on set logger, 1 set logged")
            return
        }

        guard env["PITAYA_SMOKE_AUTORUN"] == "1", model.phase == .home else { return }

        // Bootstrap no longer blocks on the network; smoke needs real
        // baselines before evaluating PRs, so refresh explicitly.
        await model.refreshHistory()

        // RECORDER=1: use the real HealthKit recorder (works when the sim
        // install already granted HK) so stream capture gets smoked too.
        let useRecorder = env["PITAYA_SMOKE_RECORDER"] == "1"
        log("autorun: starting kettlebell workout (recorder \(useRecorder ? "ON" : "off"))…")
        await model.startWorkout(.kettlebell, useRecorder: useRecorder)

        // Below-baseline set (no PR expected on real history), then a heavy
        // single designed to beat any stored swing weight PR.
        if let swing = ExerciseCatalog.byId("kb-swing") {
            model.currentExercise = swing
        }
        model.weightKg = 12
        model.reps = 10
        model.logSet()
        log("set 1: swing 12kg×10 pr=\(model.loggedSets.last?.isWeightPR ?? false)")

        model.weightKg = 48
        model.reps = 5
        model.logSet()
        log("set 2: swing 48kg×5 pr=\(model.loggedSets.last?.isWeightPR ?? false)")

        // With the recorder on, linger so several HR samples accumulate.
        try? await Task.sleep(nanoseconds: useRecorder ? 15_000_000_000 : 3_000_000_000)
        await model.finishWorkout(.kettlebell)
        log("finished — reviewing (unsaved), now saving…")
        await model.saveWorkout()

        let prs = model.summary?.prs ?? []
        let source = model.syncState == .synced ? "SERVER-CONFIRMED" : "local-estimate"
        log("finished — sets=\(model.summary?.setCount ?? 0) volume=\(model.summary?.totalVolumeKg ?? 0) prs(\(source))=\(prs.map { "\($0.exerciseId)/\($0.kind)=\($0.value)" }.joined(separator: ","))")
        log("syncState=\(String(describing: model.syncState)) baselineExercises=\(model.prExerciseCount)")
        #endif
    }

    private static func log(_ message: String) {
        print("PITAYA-SMOKE: \(message)")
    }
}
#endif
