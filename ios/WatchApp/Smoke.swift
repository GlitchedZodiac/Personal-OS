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
