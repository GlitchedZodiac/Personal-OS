// Pitaya watch-face complications — Round 1+2 handoff §02 (rewrite) + §09 2a
// (face re-weight). Extracted verbatim from Pitaya Watch Round 1.dc.html
// blocks 1d "Today's session", 1e "The week", 2a "Face re-weight":
//   circular  = streak (diamond · count · DAYS)
//   corner    = zone-2 minutes (mint arc · count · Z2 MIN)
//   inline    = "◆ 23d · Block A due" → "◆ 23d · trained ✓"
//   rect      = DUE TODAY · routine · week ring 4/5 · hero footer
//               → TRAINED ✓ 7:12A · "<name> done" · week kg + PR count
//
// Real timeline: the extension fetches /api/mobile/summary (+ workouts,
// sequences, PRs for the due rotation and receipts) with the bearer session
// shared through the keychain access group, caches last-good in its own
// container, and reloads at midnight — the app fires WidgetCenter.reloadAll()
// after every sync. Offline shows last-good with "as of <day>", never blank.

import SwiftUI
import WidgetKit

// Complication mocks are drawn on 128px tiles standing in for the ~50pt
// circular family → px→pt factor 0.6 for every §02 value (distinct from the
// app screens' 0.5625, which maps the 352px canvas).
private func cpx(_ designPx: CGFloat) -> CGFloat { designPx * 0.6 }

private func familjen(_ px: CGFloat, _ weight: Font.Weight = .bold) -> Font {
    let name: String
    switch weight {
    case .bold, .heavy, .black: name = "FamiljenGrotesk-Bold"
    case .semibold: name = "FamiljenGrotesk-SemiBold"
    case .medium: name = "FamiljenGrotesk-Medium"
    default: name = "FamiljenGrotesk-Regular"
    }
    return .custom(name, size: cpx(px))
}

private func instrument(_ px: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    let name: String
    switch weight {
    case .bold, .heavy, .black, .semibold: name = "InstrumentSans-SemiBold"
    case .medium: name = "InstrumentSans-Medium"
    default: name = "InstrumentSans-Regular"
    }
    return .custom(name, size: cpx(px))
}

// MARK: - Timeline (data layer lives in Shared/HeroSnapshot.swift)

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let data: ComplicationData
    var isPlaceholder = false
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), data: .sample, isPlaceholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        if context.isPreview {
            completion(ComplicationEntry(date: Date(), data: .sample, isPlaceholder: true))
            return
        }
        completion(ComplicationEntry(date: Date(), data: ComplicationStore.load() ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        Task {
            let cached = ComplicationStore.load()
            let fresh = await ComplicationFetcher.refresh(previous: cached)
            if let fresh { ComplicationStore.save(fresh) }
            let data = fresh ?? cached ?? .empty

            // One entry, refreshed at local midnight (the week ring, due
            // rotation, and "trained today" all roll over there); the app
            // reloads all timelines after every sync for intraday truth.
            let calendar = Calendar.current
            let midnight = calendar.nextDate(
                after: Date(), matching: DateComponents(hour: 0, minute: 5),
                matchingPolicy: .nextTime
            ) ?? Date().addingTimeInterval(6 * 3600)

            completion(Timeline(
                entries: [ComplicationEntry(date: Date(), data: data)],
                policy: .after(midnight)
            ))
        }
    }
}

// MARK: - Bundle

@main
struct PitayaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PitayaComplicationWidget()
    }
}

struct PitayaComplicationWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PitayaHero", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("Pitaya")
        .description("Streak, zone 2, and what's due today.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular,
        ])
    }
}

// MARK: - Palette (design hex, verbatim)

private enum WPal {
    static let accent = Color(red: 0xDC / 255, green: 0x74 / 255, blue: 0xA0 / 255)
    static let mint = Color(red: 0x8F / 255, green: 0xBF / 255, blue: 0x9C / 255)
    static let track = Color(red: 0x2A / 255, green: 0x29 / 255, blue: 0x2E / 255)
    static let bright = Color(red: 0xF2 / 255, green: 0xF1 / 255, blue: 0xF2 / 255)
    static let sub = Color(red: 0x96 / 255, green: 0x94 / 255, blue: 0x9B / 255)
    static let muted = Color(red: 0x66 / 255, green: 0x64 / 255, blue: 0x6C / 255)
}

// MARK: - Views

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular: CircularStreakView(data: entry.data)
            case .accessoryCorner: CornerZ2View(data: entry.data)
            case .accessoryInline: InlineView(data: entry.data)
            default: RectangularView(data: entry.data)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

/// 2a CIRCULAR · STREAK — diamond ◆ 9px, count Familjen 30px, "DAYS" 8px.
/// Proportions from the mock's 84px circle so 41/45 mm both hold the ratio.
struct CircularStreakView: View {
    let data: ComplicationData

    var body: some View {
        GeometryReader { geo in
            let h = geo.size.height
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: h * 0.02) {
                    Diamond()
                        .fill(WPal.accent)
                        .frame(width: h * (9 / 84), height: h * (9 / 84))
                    Text("\(data.streakDays)")
                        .font(.custom("FamiljenGrotesk-Bold", size: h * (30 / 84)))
                        .foregroundStyle(WPal.bright)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text("DAYS")
                        .font(.custom("InstrumentSans-Regular", size: h * (8 / 84)))
                        .kerning(h * (8 / 84) * 0.14)
                        .foregroundStyle(WPal.muted)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

/// 2a CORNER · Z2 — mint arc (mock: 142 min at 71% ⇒ 200 min weekly scale),
/// center "142" Familjen 17px + "Z2 MIN" 8px.
struct CornerZ2View: View {
    let data: ComplicationData

    var body: some View {
        VStack(spacing: 0) {
            Text("\(data.z2WeeklyMinutes)")
                .font(familjen(17))
                .foregroundStyle(WPal.bright)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("Z2 MIN")
                .font(instrument(8))
                .kerning(cpx(8) * 0.12)
                .foregroundStyle(WPal.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .widgetLabel {
            Gauge(value: min(Double(data.z2WeeklyMinutes), 200), in: 0...200) {
                Text("Z2")
            }
            .tint(WPal.mint)
        }
    }
}

/// 2a INLINE — "◆ 23d · Block A due" flipping to "◆ 23d · trained ✓".
struct InlineView: View {
    let data: ComplicationData

    var body: some View {
        Text(line)
    }

    private var line: String {
        var line = "◆ \(data.streakDays)d"
        if data.trainedToday != nil {
            line += " · trained ✓"
        } else if let due = data.dueName {
            line += " · \(due) due"
        } else if let asOf = data.asOfLine {
            line += " · \(asOf)"
        }
        return line
    }
}

/// 2a RECT (due) — DUE TODAY · name · week ring · hero footer;
/// 1d RECT · AFTER (trained) — TRAINED ✓ time · "<name> done" · receipts.
struct RectangularView: View {
    let data: ComplicationData

    var body: some View {
        if let trainedAt = data.trainedToday {
            trained(at: trainedAt)
        } else {
            due
        }
    }

    private var due: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: cpx(14)) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("DUE TODAY")
                        .font(instrument(10.5, .bold))
                        .kerning(cpx(10.5) * 0.16)
                        .foregroundStyle(WPal.accent)
                    Text(data.dueName ?? "Free session")
                        .font(familjen(22))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.top, cpx(2))
                }
                Spacer(minLength: 0)
                WeekRing(done: data.weekSessionDays)
                    .frame(width: cpx(44), height: cpx(44))
            }
            Spacer(minLength: 0)
            heroFooter
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    /// "◆ 23d   84.1 kg ↘   Z2 142 min" — 12px #96949B, gap 14px.
    private var heroFooter: some View {
        HStack(spacing: cpx(14)) {
            Text("◆ \(data.streakDays)d")
            if let avg = data.weight7dAvgKg {
                Text("\(avg, specifier: "%.1f") kg\(deltaArrow)")
            }
            Text("Z2 \(data.z2WeeklyMinutes) min")
            if let asOf = data.asOfLine {
                Spacer(minLength: 0)
                Text(asOf)
            }
        }
        .font(instrument(12))
        .foregroundStyle(WPal.sub)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.top, cpx(6))
    }

    private var deltaArrow: String {
        guard let delta = data.weight7dDeltaKg, delta != 0 else { return "" }
        return delta < 0 ? " ↘" : " ↗"
    }

    private func trained(at date: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("TRAINED ✓ \(shortTime(date))")
                .font(instrument(10.5, .bold))
                .kerning(cpx(10.5) * 0.16)
                .foregroundStyle(WPal.mint)
            Text("\(data.trainedName ?? "Session") done")
                .font(familjen(22))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, cpx(2))
            Text(receiptLine)
                .font(instrument(12.5))
                .foregroundStyle(WPal.sub)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, cpx(2))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    /// "12,480 kg this week · 1 PR" (PR clause only when there is one).
    private var receiptLine: String {
        let kg = Self.grouped(data.weekTonnageKg)
        var line = "\(kg) kg this week"
        if data.weekPRCount > 0 {
            line += " · \(data.weekPRCount) PR\(data.weekPRCount == 1 ? "" : "s")"
        }
        return line
    }

    private func shortTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        return f.string(from: date).uppercased()
    }

    private static func grouped(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? "0"
    }
}

/// The week ring — 1d/2a: r22 sw5 track #2A292E, #DC74A0 progress from the
/// top (rotate -90), round linecap, "4/5" Familjen 13px center. Denominator
/// 5 = the mock's weekly session target ("session 5 tomorrow").
struct WeekRing: View {
    let done: Int
    private let target = 5

    var body: some View {
        ZStack {
            Circle()
                .stroke(WPal.track, style: StrokeStyle(lineWidth: cpx(5)))
            Circle()
                .trim(from: 0, to: min(Double(done) / Double(target), 1))
                .stroke(WPal.accent, style: StrokeStyle(lineWidth: cpx(5), lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(min(done, target))/\(target)")
                .font(familjen(13))
                .foregroundStyle(WPal.bright)
        }
        .padding(cpx(3))
    }
}

/// §08 diamond — rotated square, the brand tick.
struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}
