// Pitaya watch-face complications — a one-tap launcher for the app in every
// accessory slot (circular, corner, inline, rectangular/Smart Stack).
// Deliberately self-contained: static branding only, no app-group data
// sharing (free personal teams make shared containers fragile) — tapping any
// complication simply opens Pitaya.

import SwiftUI
import WidgetKit

@main
struct PitayaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PitayaLauncherWidget()
    }
}

struct LauncherEntry: TimelineEntry {
    let date: Date
}

struct LauncherProvider: TimelineProvider {
    func placeholder(in context: Context) -> LauncherEntry {
        LauncherEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (LauncherEntry) -> Void) {
        completion(LauncherEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LauncherEntry>) -> Void) {
        completion(Timeline(entries: [LauncherEntry(date: Date())], policy: .never))
    }
}

struct PitayaLauncherWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PitayaLauncher", provider: LauncherProvider()) { _ in
            LauncherView()
        }
        .configurationDisplayName("Pitaya")
        .description("Open Pitaya — kettlebell, sequences, runs.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular,
        ])
    }
}

struct LauncherView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text("◆ Pitaya")
            case .accessoryRectangular:
                HStack(spacing: 7) {
                    DragonfruitMark(size: 26)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Pitaya")
                            .font(.system(size: 15, weight: .bold))
                        Text("start a workout")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            default: // circular + corner
                ZStack {
                    AccessoryWidgetBackground()
                    DragonfruitMark(size: 30)
                }
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

/// The dragonfruit, self-contained (no tile — faces tint/mask their own
/// backgrounds; the flesh ring reads clearly even in vibrant rendering).
struct DragonfruitMark: View {
    var size: CGFloat

    var body: some View {
        Canvas { context, canvasSize in
            let u = canvasSize.width / 48
            let raspberry = Color(red: 0xA6 / 255.0, green: 0x3D / 255.0, blue: 0x63 / 255.0)

            func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, _ color: Color) {
                let rect = CGRect(
                    x: (cx - r) * u, y: (cy - r) * u, width: 2 * r * u, height: 2 * r * u
                )
                context.fill(Path(ellipseIn: rect), with: .color(color))
            }

            // Recentered flesh (the widget crops tight; no tile behind it).
            circle(24, 26, 14, .white)
            circle(19.5, 22.5, 1.8, raspberry)
            circle(27.5, 27, 1.8, raspberry)
            circle(21.5, 30.5, 1.8, raspberry)
            circle(28.5, 20.5, 1.8, raspberry)

            var leaf1 = Path()
            leaf1.move(to: CGPoint(x: 28 * u, y: 11 * u))
            leaf1.addQuadCurve(to: CGPoint(x: 36 * u, y: 8 * u), control: CGPoint(x: 31 * u, y: 7 * u))
            leaf1.addQuadCurve(to: CGPoint(x: 30 * u, y: 13.5 * u), control: CGPoint(x: 34 * u, y: 13 * u))
            leaf1.closeSubpath()
            context.fill(leaf1, with: .color(.white.opacity(0.9)))

            var leaf2 = Path()
            leaf2.move(to: CGPoint(x: 18 * u, y: 12 * u))
            leaf2.addQuadCurve(to: CGPoint(x: 10.5 * u, y: 11 * u), control: CGPoint(x: 14 * u, y: 9 * u))
            leaf2.addQuadCurve(to: CGPoint(x: 17 * u, y: 14.5 * u), control: CGPoint(x: 13 * u, y: 15 * u))
            leaf2.closeSubpath()
            context.fill(leaf2, with: .color(.white.opacity(0.7)))
        }
        .frame(width: size, height: size)
    }
}
