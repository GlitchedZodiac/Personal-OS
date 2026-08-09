// Shared Pitaya UI atoms for the watch screens — cards, CTAs, stats, the PR
// banner, the beating heart, and the HR zone bar from the design.

#if os(watchOS)
import SwiftUI

// MARK: - Buttons & cards

struct PitayaCTA: View {
    let title: String
    var icon: String?
    var background: Color = Theme.accentDeep
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 10, weight: .bold))
                }
                Text(title).font(Theme.display(13, weight: .semibold))
            }
            .foregroundStyle(Theme.textBright)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(background, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct PitayaCard<Content: View>: View {
    var background: Color = Theme.card
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(background, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
    }
}

// MARK: - Stats

struct StatCell: View {
    let value: String
    let label: String
    var color: Color = Theme.textBright

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(Theme.numeric(15))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(Theme.text(7, weight: .semibold))
                .kerning(0.8)
                .foregroundStyle(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - PR banner (design screen 12)

struct PRBanner: View {
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            PitayaMark(size: 6, color: .white)
                .padding(.leading, 2)
            Text(text)
                .font(Theme.text(10, weight: .semibold))
                .foregroundStyle(Theme.prText)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .background(Theme.accentWash, in: RoundedRectangle(cornerRadius: 11))
    }
}

// MARK: - Beating heart

struct BeatingHeart: View {
    var size: CGFloat = 15
    var color: Color = Theme.accent
    @State private var beat = false

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size))
            .foregroundStyle(color)
            .scaleEffect(beat ? 1.18 : 1.0)
            .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: beat)
            .onAppear { beat = true }
    }
}

// MARK: - HR zone bar (design screen 07)

struct ZoneBar: View {
    let heartRate: Double?

    private var zone: Int? {
        guard let hr = heartRate, hr > 0 else { return nil }
        let pct = hr / 190.0
        switch pct {
        case ..<0.57: return 1
        case ..<0.64: return 2
        case ..<0.76: return 3
        case ..<0.88: return 4
        default: return 5
        }
    }

    private static let names = ["RECOVERY", "EASY", "AEROBIC", "THRESHOLD", "MAX"]

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2.5) {
                ForEach(1...5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2.5)
                        .fill(i == zone ? Theme.accent : Theme.elementDim)
                        .frame(height: 4.5)
                }
            }
            if let zone {
                Text("ZONE \(zone) · \(Self.names[zone - 1])")
                    .font(Theme.text(7, weight: .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.textTertiary)
            }
        }
    }
}

// MARK: - Formatting

enum Fmt {
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }

    static func kg(_ value: Double) -> String {
        value == value.rounded()
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    static func grouped(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? "\(Int(value))"
    }
}
#endif
