// §05 Double Tap — the button wears the gesture (1m) + one-time coach (1o).
//
// Rule: `handGestureShortcut(.primaryAction)` on exactly one control per
// screen — the accent CTA, never navigation. The pinch glyph sits inside the
// CTA it fires; the first 3 fires show the "Double Tap logged it" toast,
// then the glyph dims to 45% forever (a UserDefaults counter).
//
// Platform note (flagged in the handoff report): watchOS gives no way to
// tell a Double Tap fire from a finger tap on the same control — the counter
// advances on either, so the toast can spend itself on touch. The coach
// screen carries the teaching either way.

#if os(watchOS)
import SwiftUI

@MainActor
final class DoubleTapCoach: ObservableObject {
    static let shared = DoubleTapCoach()

    /// Toast visible right now (1m blush pill, bannerUp 0.4 s).
    @Published var toastVisible = false

    private let defaults = UserDefaults.standard
    private var hideTask: Task<Void, Never>?

    var fireCount: Int {
        get { defaults.integer(forKey: "doubleTap.fires") }
        set { defaults.set(newValue, forKey: "doubleTap.fires") }
    }

    /// 1o: shown once before the first-ever live session.
    var coachShown: Bool {
        get { defaults.bool(forKey: "doubleTap.coachShown") }
        set { defaults.set(newValue, forKey: "doubleTap.coachShown") }
    }

    /// After 3 fires the glyph dims to 45% and the toast never returns.
    var glyphDimmed: Bool { fireCount >= 3 }

    /// A designated-primary CTA fired — count it and toast the first three.
    func recordFire() {
        guard fireCount < 3 else { return }
        fireCount += 1
        objectWillChange.send()
        toastVisible = true
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if !Task.isCancelled { self?.toastVisible = false }
        }
    }
}

/// 1m toast — blush pill: diamond ◆ 9px + "Double Tap logged it" 12.5px,
/// #FFD9E8 on #3D1526, radius 99, bannerUp 0.4 s.
struct DoubleTapToast: View {
    @ObservedObject private var coach = DoubleTapCoach.shared

    var body: some View {
        VStack {
            if coach.toastVisible {
                HStack(spacing: Theme.px(8)) {
                    PitayaMark(size: Theme.px(9), color: Theme.prText)
                    Text("Double Tap logged it")
                        .font(Theme.text(6.25, weight: .semibold))
                        .foregroundStyle(Theme.prText)
                }
                .padding(.horizontal, Theme.px(15))
                .padding(.vertical, Theme.px(7))
                .background(Theme.accentWash, in: Capsule())
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer(minLength: 0)
        }
        .animation(.easeOut(duration: 0.4), value: coach.toastVisible)
        .allowsHitTesting(false)
    }
}

/// 1o one-time coach — pinch glyph + ripple, shown before the first live
/// session ever. States the rule so it transfers to every context.
struct DoubleTapCoachView: View {
    @EnvironmentObject private var model: AppModel
    @State private var ripple = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Circle()
                    .stroke(Theme.accentDim, lineWidth: 1.5)
                    .scaleEffect(ripple ? 1.25 : 0.95)
                    .opacity(ripple ? 0 : 0.9)
                    .animation(
                        .easeOut(duration: 1.6).repeatForever(autoreverses: false),
                        value: ripple
                    )
                DoubleTapGlyph(color: Theme.accent, size: Theme.px(64))
            }
            .frame(width: Theme.px(64), height: Theme.px(64))
            .onAppear { ripple = true }

            Text("Pinch twice —\nhands stay on the bell.")
                .font(Theme.display(13))
                .foregroundStyle(Theme.textBright)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Theme.px(16))

            Text("It always presses the pink button.")
                .font(Theme.text(6.5))
                .foregroundStyle(Theme.textTertiary)
                .padding(.top, Theme.px(8))

            Spacer(minLength: Theme.px(12))

            PitayaCTA(title: "Got it") {
                model.finishDoubleTapCoach()
            }
        }
        .padding(.horizontal, Theme.px(34))
        .padding(.vertical, Theme.px(20))
    }
}

// MARK: - §08 wrist-voice offline queue

/// Voice-logged weight/food entries. There is no ingest endpoint on the
/// mobile surface yet (spec §8 wants them landing in phone Chat tagged
/// "watch") — entries persist here until the main lane ships one; filed in
/// deferred-items. The confirm card's "offline — queued until sync" footer
/// is literal.
struct VoiceLogEntry: Codable, Identifiable {
    var id: Date { at }
    let kind: String // "weight" | "food"
    let weightKg: Double?
    let text: String?
    let at: Date
}

enum VoiceLogQueue {
    private static var fileURL: URL? {
        guard let dir = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("voice-log-queue.json")
    }

    static func load() -> [VoiceLogEntry] {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return [] }
        return (try? PitayaJSON.decoder().decode([VoiceLogEntry].self, from: data)) ?? []
    }

    static func append(_ entry: VoiceLogEntry) {
        guard let url = fileURL else { return }
        var entries = load()
        entries.append(entry)
        if let data = try? PitayaJSON.encoder().encode(entries) {
            try? data.write(to: url, options: .atomic)
        }
        // TODO(main-lane): drain to the voice-note ingest endpoint once it
        // exists — POST tagged "watch" so it lands in phone Chat (§8).
    }
}
#endif
