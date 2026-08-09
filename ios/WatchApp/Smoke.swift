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

        log("autorun: starting kettlebell workout (recorder off — no HK sheet)…")
        await model.startWorkout(.kettlebell, useRecorder: false)

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

        try? await Task.sleep(nanoseconds: 3_000_000_000)
        await model.finishWorkout(.kettlebell)

        let prs = model.summary?.prs ?? []
        log("finished — sets=\(model.summary?.setCount ?? 0) volume=\(model.summary?.totalVolumeKg ?? 0) prs=\(prs.map { "\($0.exerciseId)/\($0.kind)=\($0.value)" }.joined(separator: ","))")
        log("syncState=\(String(describing: model.syncState))")
        #endif
    }

    private static func log(_ message: String) {
        print("PITAYA-SMOKE: \(message)")
    }
}
#endif
