// HR recovery — Round 3 §07, extracted 1:1 from the board: post-save full
// screen for any workout with HR while the 60 s window is still live. The
// mint ring drains linearly, the falling BPM sits center with its spark, and
// the verdict fades in at zero (quick ≥25 · typical 15–25 · slow <15).
// Skipping the screen never skips the capture — it completes off-screen and
// rides metricsData either way.

#if os(watchOS)
import SwiftUI
import WatchKit

struct RecoveryView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var recorder: WorkoutRecorder
    @State private var spark: [Int] = []
    @State private var verdictShown = false

    init() {
        recorder = AppModel.shared?.recorder ?? WorkoutRecorder()
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let remaining = max(0, model.recorder.recoveryEndsAt?.timeIntervalSince(context.date) ?? 0)
            content(remaining: remaining)
        }
        .onChange(of: recorder.heartRate.map { Int($0) }) { _, bpm in
            guard let bpm, model.recoveryCapture == nil else { return }
            spark.append(bpm)
        }
        .onChange(of: model.recoveryCapture != nil) { _, landed in
            guard landed else { return }
            withAnimation(Theme.Motion.exit) { verdictShown = true }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await model.finishHRR()
            }
        }
    }

    private func content(remaining: TimeInterval) -> some View {
        VStack(spacing: 0) {
            Text("RECOVERY · \(clock(remaining))")
                .font(Theme.r3Text(12, weight: .bold))
                .kerning(0.96)
                .foregroundStyle(Theme.mint)
                .padding(.top, Theme.r3(40))

            Spacer(minLength: 0)

            ZStack {
                // 190 px mint ring draining linearly over the 60 s.
                Circle()
                    .stroke(Theme.mintRing, lineWidth: Theme.r3(7))
                Circle()
                    .trim(from: 0, to: max(0.001, remaining / 60))
                    .stroke(
                        Theme.mint,
                        style: StrokeStyle(lineWidth: Theme.r3(7), lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                VStack(spacing: Theme.r3(4)) {
                    if verdictShown, let capture = model.recoveryCapture {
                        Text("−\(capture.drop)")
                            .font(Theme.r3Display(58, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.mint)
                        Text("in 1:00 · \(capture.band)")
                            .font(Theme.r3Text(12, weight: .semibold))
                            .foregroundStyle(Theme.textSecondary)
                    } else {
                        Text(recorder.heartRate.map { String(Int($0)) } ?? "––")
                            .font(Theme.r3Display(58, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.textBright)
                            .contentTransition(.numericText(countsDown: true))
                        Text("BPM · FALLING")
                            .font(Theme.r3Text(10, weight: .semibold))
                            .kerning(1)
                            .foregroundStyle(Theme.textTertiary)
                        sparkLine
                            .frame(width: Theme.r3(110), height: Theme.r3(24))
                    }
                }
            }
            .frame(width: Theme.r3(190), height: Theme.r3(190))

            Spacer(minLength: 0)

            Button {
                Task { await model.finishHRR() }
            } label: {
                Text("Skip")
                    .font(Theme.r3Text(14, weight: .semibold))
                    .foregroundStyle(Theme.textTertiary)
                    .frame(maxWidth: .infinity)
                    .pitayaTappable()
            }
            .buttonStyle(.plain)
            .padding(.bottom, Theme.r3(12))
        }
        .padding(.horizontal, Theme.r3(24))
    }

    /// Mint spark of the descent so far, drawn as the samples land.
    private var sparkLine: some View {
        Canvas { context, size in
            guard spark.count > 1 else { return }
            let mn = Double(spark.min() ?? 0)
            let mx = Double(spark.max() ?? 1)
            let range = max(mx - mn, 1)
            var path = Path()
            for (index, bpm) in spark.enumerated() {
                let x = size.width * CGFloat(index) / CGFloat(spark.count - 1)
                let y = size.height * (1 - CGFloat((Double(bpm) - mn) / range))
                if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
            context.stroke(
                path,
                with: .color(Theme.mint),
                style: StrokeStyle(lineWidth: Theme.r3(2.5), lineCap: .round, lineJoin: .round)
            )
        }
    }

    private func clock(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
#endif
