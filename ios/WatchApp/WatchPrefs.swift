// Watch preferences — Round 1 §01. Eight rows, four groups, persisted in
// UserDefaults. Not settable on purpose: complication content (§02 owns it),
// AOD behavior (system), workout types.
//
// TODO(main-lane): "sync up" per spec — no prefs endpoint exists yet; filed
// in deferred-items. Local persistence is authoritative until then.

#if os(watchOS)
import Foundation
import SwiftUI

@MainActor
final class WatchPrefs: ObservableObject {
    static let shared = WatchPrefs()

    enum StartRepsAt: String, CaseIterable {
        case lastLogged, routineDefault
        var label: String {
            self == .lastLogged ? "last logged" : "routine default"
        }
    }

    enum HapticsMode: String, CaseIterable {
        case keyMoments, everything, off
        var label: String {
            switch self {
            case .keyMoments: return "key moments"
            case .everything: return "everything"
            case .off: return "off"
            }
        }
    }

    /// All bells the rack can hold: 4–64 kg in 4 kg detents (§01).
    static let allDenominations: [Int] = Array(stride(from: 4, through: 64, by: 4))

    // MARK: - Stored values

    /// Owned bells (kg). Empty = not configured yet → every surface treats
    /// the full denomination range as available (assumption flagged in the
    /// handoff report; the spec names no default).
    @Published var ownedBells: [Int] {
        didSet { defaults.set(ownedBells, forKey: "prefs.ownedBells") }
    }

    /// Used only when a routine has no restSecondsDefault (0–180, 15 s steps).
    @Published var restFallbackSeconds: Int {
        didSet { defaults.set(restFallbackSeconds, forKey: "prefs.restFallback") }
    }

    @Published var startRepsAt: StartRepsAt {
        didSet { defaults.set(startRepsAt.rawValue, forKey: "prefs.startRepsAt") }
    }

    /// Outdoor sessions only.
    @Published var autoPause: Bool {
        didSet { defaults.set(autoPause, forKey: "prefs.autoPause") }
    }

    @Published var hapticsMode: HapticsMode {
        didSet { defaults.set(hapticsMode.rawValue, forKey: "prefs.haptics") }
    }

    /// Mid-set idle nudge threshold in minutes; 0 = off. (5/8/12/off)
    @Published var idleNudgeMinutes: Int {
        didSet { defaults.set(idleNudgeMinutes, forKey: "prefs.idleNudge") }
    }

    /// kg | lb (kg default).
    @Published var weightUnitIsKg: Bool {
        didSet { defaults.set(weightUnitIsKg, forKey: "prefs.weightKg") }
    }

    /// Last reps value logged on the free logger ("Start reps at: last logged").
    @Published var lastLoggedReps: Int {
        didSet { defaults.set(lastLoggedReps, forKey: "prefs.lastReps") }
    }

    private let defaults = UserDefaults.standard

    private init() {
        let stored = defaults.array(forKey: "prefs.ownedBells") as? [Int] ?? []
        ownedBells = stored
        restFallbackSeconds = defaults.object(forKey: "prefs.restFallback") as? Int ?? 60
        startRepsAt = StartRepsAt(
            rawValue: defaults.string(forKey: "prefs.startRepsAt") ?? ""
        ) ?? .lastLogged
        autoPause = defaults.object(forKey: "prefs.autoPause") as? Bool ?? true
        hapticsMode = HapticsMode(
            rawValue: defaults.string(forKey: "prefs.haptics") ?? ""
        ) ?? .keyMoments
        idleNudgeMinutes = defaults.object(forKey: "prefs.idleNudge") as? Int ?? 8
        weightUnitIsKg = defaults.object(forKey: "prefs.weightKg") as? Bool ?? true
        lastLoggedReps = defaults.object(forKey: "prefs.lastReps") as? Int ?? 10
    }

    // MARK: - Derived

    /// The detent list every weight dial uses: owned bells, or the full
    /// range until the rack is configured.
    var dialDetents: [Int] {
        ownedBells.isEmpty ? Self.allDenominations : ownedBells.sorted()
    }

    /// Settings row value, e.g. "8–32 kg · 7".
    var bellsRowValue: String {
        let bells = ownedBells.sorted()
        guard let low = bells.first, let high = bells.last else { return "all bells" }
        return "\(low)–\(high) kg · \(bells.count)"
    }

    func toggleBell(_ kg: Int) {
        if let index = ownedBells.firstIndex(of: kg) {
            ownedBells.remove(at: index)
        } else {
            ownedBells.append(kg)
        }
    }
}

// MARK: - Haptics tiering (§01 "Haptics: key moments / everything / off")

import WatchKit

@MainActor
enum Haptics {
    /// Key moments: PRs, round boundaries, GO, start/finish, failures.
    static func key(_ type: WKHapticType) {
        guard WatchPrefs.shared.hapticsMode != .off else { return }
        WKInterfaceDevice.current().play(type)
    }

    /// Minor ticks: per-set clicks and similar — only in "everything".
    static func minor(_ type: WKHapticType) {
        guard WatchPrefs.shared.hapticsMode == .everything else { return }
        WKInterfaceDevice.current().play(type)
    }
}
#endif
