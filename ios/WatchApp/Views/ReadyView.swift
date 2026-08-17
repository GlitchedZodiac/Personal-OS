// §07 Readiness (2b) — a verdict, never a coach. Morning verdict from HRV vs
// the 30-day baseline + resting HR (+ sleep when posted): Recovered (mint) /
// Take it easy (amber: HRV >1σ below 30d) / Rough night (red: low HRV +
// elevated RHR). It must never alter weights, rest, or the due routine, and
// never notifies. Surfaces: a diamond + word on the Home header line; tap →
// this screen.
//
// Data source: the watch's own HealthKit store. The spec's file map names
// "sync payload (HRV/RHR baselines)" but no such field exists on the live
// mobile surface — the same numbers read locally keep the verdict honest
// without inventing an API (flagged in the handoff report + deferred-items).

#if os(watchOS)
import HealthKit
import SwiftUI

@MainActor
final class Readiness: ObservableObject {
    enum Verdict {
        case recovered, takeItEasy, roughNight

        var word: String {
            switch self {
            case .recovered: return "Recovered"
            case .takeItEasy: return "Take it easy"
            case .roughNight: return "Rough night"
            }
        }

        /// Home header form: "◆ ready".
        var headerWord: String {
            switch self {
            case .recovered: return "ready"
            case .takeItEasy: return "easy"
            case .roughNight: return "rough"
            }
        }

        var color: Color {
            switch self {
            case .recovered: return Theme.mint
            case .takeItEasy: return Color(hex: 0xE8B675) // Settings' amber
            case .roughNight: return Theme.danger
            }
        }
    }

    @Published private(set) var verdict: Verdict?
    @Published private(set) var hrvMs: Int?
    @Published private(set) var hrvDelta30: Int?
    @Published private(set) var restingHR: Int?
    @Published private(set) var rhrDelta30: Int?
    @Published private(set) var sleepText: String?
    @Published private(set) var asOf: Date?

    private let store = HKHealthStore()

    func refresh() async {
        let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
        let rhrType = HKQuantityType(.restingHeartRate)
        let sleepType = HKCategoryType(.sleepAnalysis)
        try? await store.requestAuthorization(
            toShare: [], read: [hrvType, rhrType, sleepType]
        )

        let now = Date()
        let monthAgo = now.addingTimeInterval(-30 * 86_400)
        let hrv = await quantitySamples(hrvType, from: monthAgo, unit: .secondUnit(with: .milli))
        let rhr = await quantitySamples(rhrType, from: monthAgo, unit: HKUnit.count().unitDivided(by: .minute()))

        // Today's readings vs the 30-day mean ± σ.
        guard let todayHRV = hrv.last(where: { Calendar.current.isDateInToday($0.at) })
            ?? hrv.last, !hrv.isEmpty
        else { return } // no data → no verdict, the surface stays quiet

        let hrvValues = hrv.map(\.value)
        let hrvMean = hrvValues.reduce(0, +) / Double(hrvValues.count)
        let hrvSigma = sigma(hrvValues, mean: hrvMean)
        let hrvLow = todayHRV.value < hrvMean - hrvSigma

        var rhrElevated = false
        if let todayRHR = rhr.last(where: { Calendar.current.isDateInToday($0.at) }) ?? rhr.last,
           !rhr.isEmpty {
            let rhrValues = rhr.map(\.value)
            let rhrMean = rhrValues.reduce(0, +) / Double(rhrValues.count)
            let rhrSigma = max(sigma(rhrValues, mean: rhrMean), 1)
            rhrElevated = todayRHR.value > rhrMean + rhrSigma
            restingHR = Int(todayRHR.value.rounded())
            rhrDelta30 = Int((todayRHR.value - rhrMean).rounded())
        }

        hrvMs = Int(todayHRV.value.rounded())
        hrvDelta30 = Int((todayHRV.value - hrvMean).rounded())
        asOf = todayHRV.at
        verdict = hrvLow ? (rhrElevated ? .roughNight : .takeItEasy) : .recovered
        sleepText = await lastNightSleep(sleepType)
    }

    private func sigma(_ values: [Double], mean: Double) -> Double {
        guard values.count > 1 else { return 0 }
        let variance = values.reduce(0) { $0 + ($1 - mean) * ($1 - mean) }
            / Double(values.count - 1)
        return variance.squareRoot()
    }

    private struct Reading { let value: Double; let at: Date }

    private func quantitySamples(
        _ type: HKQuantityType, from start: Date, unit: HKUnit
    ) async -> [Reading] {
        await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: HKQuery.predicateForSamples(withStart: start, end: nil),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, _ in
                let readings = (samples as? [HKQuantitySample])?.map {
                    Reading(value: $0.quantity.doubleValue(for: unit), at: $0.startDate)
                } ?? []
                continuation.resume(returning: readings)
            }
            store.execute(query)
        }
    }

    /// Last night's asleep time as "7:12", nil when nothing posted.
    private func lastNightSleep(_ type: HKCategoryType) async -> String? {
        await withCheckedContinuation { continuation in
            let start = Date().addingTimeInterval(-18 * 3600)
            let query = HKSampleQuery(
                sampleType: type,
                predicate: HKQuery.predicateForSamples(withStart: start, end: nil),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                let asleep = (samples as? [HKCategorySample])?.filter {
                    HKCategoryValueSleepAnalysis.allAsleepValues.contains(
                        HKCategoryValueSleepAnalysis(rawValue: $0.value) ?? .inBed
                    ) == true
                } ?? []
                let seconds = asleep.reduce(0.0) {
                    $0 + $1.endDate.timeIntervalSince($1.startDate)
                }
                guard seconds > 0 else {
                    continuation.resume(returning: nil)
                    return
                }
                let h = Int(seconds) / 3600, m = (Int(seconds) % 3600) / 60
                continuation.resume(returning: String(format: "%d:%02d", h, m))
            }
            store.execute(query)
        }
    }
}

// MARK: - Ready screen (2b verbatim)

struct ReadyView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var readiness: Readiness

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: Theme.px(8)) {
                    Button {
                        model.backToHome()
                    } label: {
                        ZStack {
                            Circle().fill(Theme.card)
                            Image(systemName: "chevron.left")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundStyle(Theme.textMuted)
                        }
                        .frame(width: Theme.px(26), height: Theme.px(26))
                    }
                    .buttonStyle(.plain)
                    Text("Ready")
                        .font(Theme.wDisplay(13))
                        .foregroundStyle(Theme.textBright)
                }

                if let verdict = readiness.verdict {
                    HStack(spacing: Theme.px(12)) {
                        PitayaMark(size: Theme.px(24), color: verdict.color)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(verdict.word)
                                .font(Theme.wDisplay(13))
                                .foregroundStyle(verdict.color)
                            if let asOf = readiness.asOf {
                                Text("as of \(shortTime(asOf))")
                                    .font(Theme.wText(6))
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        }
                    }
                    .padding(.top, Theme.px(16))
                }

                VStack(spacing: Theme.px(7)) {
                    row("HRV", value: readiness.hrvMs.map(String.init),
                        delta: readiness.hrvDelta30.map { deltaText($0, suffix: " vs 30d") },
                        deltaColor: (readiness.hrvDelta30 ?? 0) >= 0 ? Theme.mint : Theme.textMuted)
                    row("Resting HR", value: readiness.restingHR.map(String.init),
                        delta: readiness.rhrDelta30.map { $0 == 0 ? "=" : deltaText($0, suffix: "") },
                        deltaColor: Theme.textMuted)
                    row("Sleep", value: readiness.sleepText,
                        delta: readiness.sleepText == nil ? "when posted" : nil,
                        deltaColor: Theme.textMuted)
                }
                .padding(.top, Theme.px(16))

                Text("A verdict, never a coach —\nyour plan is untouched.")
                    .font(Theme.wText(6))
                    .foregroundStyle(Theme.textFaint)
                    .lineSpacing(2)
                    .padding(.top, Theme.px(14))
            }
            .padding(.horizontal, Theme.px(28))
            .padding(.vertical, Theme.px(10))
        }
        .task { await readiness.refresh() }
    }

    private func row(
        _ label: String, value: String?, delta: String?, deltaColor: Color
    ) -> some View {
        HStack {
            Text(label)
                .font(Theme.wText(7))
                .foregroundStyle(Theme.textSecondary)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Text(value ?? "––")
                    .font(Theme.wText(7.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                if let delta {
                    Text(delta)
                        .font(Theme.wText(5.5))
                        .foregroundStyle(deltaColor)
                }
            }
        }
        .padding(.horizontal, Theme.px(15))
        .padding(.vertical, Theme.px(12))
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.px(16)))
    }

    private func deltaText(_ delta: Int, suffix: String) -> String {
        (delta >= 0 ? "+\(delta)" : "−\(-delta)") + suffix
    }

    private func shortTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        return f.string(from: date).lowercased()
    }
}
#endif
