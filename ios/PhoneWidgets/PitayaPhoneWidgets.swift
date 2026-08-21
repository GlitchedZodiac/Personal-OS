// iPhone glance surfaces — §09 2f. Home small = streak (sub flips due-pink
// when untrained); Home medium = due line + the quoted trio (streak / kg 7d
// / Z2 min); Lock Screen circular = streak, rectangular = "Block A due ·
// 4/5" + trio, inline. The Live Activity / Dynamic Island mirror of the
// watch live tile is NOT built: a standalone WKWatchOnly app has no
// real-time watch→phone channel (flagged in the handoff report).
//
// Same architecture as the watch complication: widget-side bearer fetch
// through the shared keychain group (the iPhone companion's session),
// last-good cache in the extension container, midnight reload.

import SwiftUI
import WidgetKit

private let phoneService = "net.blacksheepglobal.pitaya.ios.session"

// Design px are iPhone pt at 1:1 on these mocks (150px small-widget card).
private func familjen(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
    let name: String
    switch weight {
    case .bold, .heavy, .black: name = "FamiljenGrotesk-Bold"
    case .semibold: name = "FamiljenGrotesk-SemiBold"
    case .medium: name = "FamiljenGrotesk-Medium"
    default: name = "FamiljenGrotesk-Regular"
    }
    return .custom(name, size: size)
}

private func instrument(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    let name: String
    switch weight {
    case .bold, .heavy, .black, .semibold: name = "InstrumentSans-SemiBold"
    case .medium: name = "InstrumentSans-Medium"
    default: name = "InstrumentSans-Regular"
    }
    return .custom(name, size: size)
}

private enum PPal {
    static let tile = Color(red: 0x1C / 255, green: 0x15 / 255, blue: 0x20 / 255)
    static let accent = Color(red: 0xDC / 255, green: 0x74 / 255, blue: 0xA0 / 255)
    static let washText = Color(red: 0xE9 / 255, green: 0xA8 / 255, blue: 0xC4 / 255)
    static let mint = Color(red: 0x8F / 255, green: 0xBF / 255, blue: 0x9C / 255)
    static let sub = Color(red: 0x96 / 255, green: 0x94 / 255, blue: 0x9B / 255)
    static let ghost = Color(red: 0x66 / 255, green: 0x64 / 255, blue: 0x6C / 255)
    static let track = Color(red: 0x2A / 255, green: 0x29 / 255, blue: 0x2E / 255)
}

// MARK: - Timeline

struct PhoneEntry: TimelineEntry {
    let date: Date
    let data: ComplicationData
}

struct PhoneProvider: TimelineProvider {
    func placeholder(in context: Context) -> PhoneEntry {
        PhoneEntry(date: Date(), data: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (PhoneEntry) -> Void) {
        if context.isPreview {
            completion(PhoneEntry(date: Date(), data: .sample))
            return
        }
        completion(PhoneEntry(date: Date(), data: ComplicationStore.load() ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PhoneEntry>) -> Void) {
        Task {
            let cached = ComplicationStore.load()
            let fresh = await ComplicationFetcher.refresh(previous: cached, service: phoneService)
            if let fresh { ComplicationStore.save(fresh) }
            let data = fresh ?? cached ?? .empty

            let midnight = Calendar.current.nextDate(
                after: Date(), matching: DateComponents(hour: 0, minute: 5),
                matchingPolicy: .nextTime
            ) ?? Date().addingTimeInterval(6 * 3600)

            completion(Timeline(
                entries: [PhoneEntry(date: Date(), data: data)],
                policy: .after(midnight)
            ))
        }
    }
}

@main
struct PitayaPhoneWidgetBundle: WidgetBundle {
    var body: some Widget {
        PitayaPhoneWidget()
    }
}

struct PitayaPhoneWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PitayaPhoneHero", provider: PhoneProvider()) { entry in
            PhoneWidgetView(entry: entry)
        }
        .configurationDisplayName("Pitaya")
        .description("Streak, weight trend, zone 2, and what's due.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}

struct PhoneWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PhoneEntry

    var body: some View {
        Group {
            switch family {
            case .systemSmall: SmallStreakView(data: entry.data)
            case .systemMedium: MediumTrioView(data: entry.data)
            case .accessoryCircular: LockCircularView(data: entry.data)
            case .accessoryInline: Text(inline(entry.data))
            default: LockRectangularView(data: entry.data)
            }
        }
        .containerBackground(for: .widget) {
            switch family {
            case .systemSmall, .systemMedium: PPal.tile
            default: Color.clear
            }
        }
    }

    private func inline(_ data: ComplicationData) -> String {
        var line = "◆ \(data.streakDays)d"
        if data.trainedToday != nil {
            line += " · trained ✓"
        } else if let due = data.dueName {
            line += " · \(due) due"
        }
        return line
    }
}

/// 2f small — diamond top, streak bottom; sub flips due-pink when untrained.
struct SmallStreakView: View {
    let data: ComplicationData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Diamond().fill(PPal.accent).frame(width: 12, height: 12)
            Spacer(minLength: 0)
            Text("\(data.streakDays)")
                .font(familjen(38))
                .foregroundStyle(.white)
            Text("DAY STREAK")
                .font(instrument(10, .semibold))
                .kerning(10 * 0.12)
                .foregroundStyle(PPal.accent)
                .padding(.top, 3)
            Group {
                if let trained = data.trainedToday {
                    Text("trained ✓ \(shortTime(trained))")
                        .foregroundStyle(PPal.sub)
                } else if let due = data.dueName {
                    Text("due · \(due)")
                        .foregroundStyle(PPal.washText)
                } else if let asOf = data.asOfLine {
                    Text(asOf).foregroundStyle(PPal.sub)
                }
            }
            .font(instrument(10.5))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func shortTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mma"
        return f.string(from: date).lowercased()
    }
}

/// 2f medium — "DUE · KB BLOCK A" header + the quoted trio.
struct MediumTrioView: View {
    let data: ComplicationData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Diamond().fill(PPal.accent).frame(width: 10, height: 10)
                Text(headerLine)
                    .font(instrument(11, .bold))
                    .kerning(11 * 0.14)
                    .foregroundStyle(data.trainedToday == nil ? PPal.accent : PPal.mint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if let asOf = data.asOfLine {
                    Text(asOf).font(instrument(10)).foregroundStyle(PPal.ghost)
                }
            }
            Spacer(minLength: 0)
            HStack(alignment: .top, spacing: 18) {
                trioCell(
                    value: "\(data.streakDays)", unit: "d", unitColor: PPal.ghost,
                    label: "STREAK"
                )
                trioCell(
                    value: data.weight7dAvgKg.map { String(format: "%.1f", $0) } ?? "––",
                    unit: weightArrow, unitColor: PPal.mint, label: "KG · 7D"
                )
                trioCell(
                    value: "\(data.z2WeeklyMinutes)", unit: "m", unitColor: PPal.ghost,
                    label: "ZONE 2"
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var headerLine: String {
        if data.trainedToday != nil {
            return "TRAINED ✓ \(data.trainedName?.uppercased() ?? "")"
        }
        return "DUE · \(data.dueName?.uppercased() ?? "FREE SESSION")"
    }

    private var weightArrow: String {
        guard let delta = data.weight7dDeltaKg, delta != 0 else { return "" }
        return delta < 0 ? "↘" : "↗"
    }

    private func trioCell(
        value: String, unit: String, unitColor: Color, label: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value).font(familjen(26)).foregroundStyle(.white)
                if !unit.isEmpty {
                    Text(unit).font(instrument(13)).foregroundStyle(unitColor)
                }
            }
            Text(label)
                .font(instrument(9.5))
                .kerning(9.5 * 0.1)
                .foregroundStyle(PPal.sub)
        }
    }
}

/// 2f Lock circular (vibrant) — streak count + DAYS.
struct LockCircularView: View {
    let data: ComplicationData

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text("\(data.streakDays)")
                    .font(familjen(22))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text("DAYS")
                    .font(instrument(7))
                    .kerning(7 * 0.12)
                    .opacity(0.7)
            }
        }
    }
}

/// 2f Lock rectangular — "Block A due · 4/5" + the trio line.
struct LockRectangularView: View {
    let data: ComplicationData

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titleLine)
                .font(instrument(12, .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(trioLine)
                .font(instrument(11))
                .opacity(0.7)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var titleLine: String {
        if let trained = data.trainedToday {
            let f = DateFormatter()
            f.dateFormat = "h:mma"
            return "Trained ✓ \(f.string(from: trained).lowercased())"
        }
        return "\(data.dueName ?? "Free session") due · \(min(data.weekSessionDays, 5))/5"
    }

    private var trioLine: String {
        var parts: [String] = []
        if let avg = data.weight7dAvgKg {
            let arrow = (data.weight7dDeltaKg ?? 0) < 0 ? " ↘" : ((data.weight7dDeltaKg ?? 0) > 0 ? " ↗" : "")
            parts.append("\(String(format: "%.1f", avg)) kg\(arrow)")
        }
        parts.append("Z2 \(data.z2WeeklyMinutes) min")
        return parts.joined(separator: " · ")
    }
}

/// The brand tick — rotated square.
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
