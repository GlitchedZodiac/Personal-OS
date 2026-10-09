// Voice logging on the live screens (2026-10-05): the mic button and the
// line that answers it.
//
// NO DESIGN SLICE EXISTS — the mic glyph is the designed one (Round 3 §09,
// Glyphs.mic), everything around it is built inside the watch design system
// at Michael's call and flagged for the next design pass.
//
// The whole surface is two things. A button big enough to hit sweaty and
// mid-set; and one line that says what Pitaya heard — which never asks him
// to confirm. Wrong? One tap on Undo. Unsure? It says "check" and the phone
// asks him later. Either way the workout carries on.
//
// 2026-10-09 (his ask after the first real session): the LOG. A chip in the
// live screen's header opens everything he has said this session — what was
// heard, word for word, next to what was logged from it — so he can see how
// accurately it is logging without waiting for the phone. A "?" is no longer
// a bare mark: the entry says WHY it was unsure, and any entry (not only the
// last) can be taken back, or put back.

#if os(watchOS)
import SwiftUI

/// The record button. Idle: the pink button (so Double Tap's "it always
/// presses the pink button" rule still holds). Listening: a blush ring that
/// breathes with his voice; tap again to stop, or just stop talking.
struct VoiceMicButton: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var voice: VoiceLogger
    var diameter: CGFloat = 54
    /// Wears the Double Tap gesture — exactly one control per screen may.
    var primary = false

    var body: some View {
        let listening = voice.state == .recording
        let button = Button {
            model.toggleVoice()
        } label: {
            ZStack {
                Circle()
                    .fill(listening ? Theme.accentWash : Theme.accentDeep)
                if listening {
                    Circle()
                        .stroke(Theme.prText, lineWidth: 2 + 4 * voice.level)
                        .padding(1)
                        .animation(.easeOut(duration: 0.1), value: voice.level)
                }
                PitayaGlyph(
                    paths: Glyphs.mic, style: .stroke(width: 2),
                    color: listening ? Theme.prText : Theme.textBright,
                    size: diameter * 0.46
                )
            }
            .frame(width: diameter, height: diameter)
            .pitayaTappable(minWidth: max(diameter, Theme.minTap), minHeight: max(diameter, Theme.minTap))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(listening ? "Stop listening" : "Log by voice")

        if primary {
            button.handGestureShortcut(.primaryAction)
        } else {
            button
        }
    }
}

/// What Pitaya heard, across the top of the live screen. Stays a few
/// seconds, then gets out of the way. Tap Undo to take the entry back.
struct VoiceFlashOverlay: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var voice: VoiceLogger

    var body: some View {
        VStack(spacing: 0) {
            if voice.state == .recording {
                banner(lines: ["Listening…"], tone: Theme.prText, undo: false, note: nil)
            } else if let flash = model.voiceFlash {
                banner(
                    lines: flash.lines.map(VoiceLogText.plain), tone: tone(flash),
                    undo: canUndo(flash),
                    note: flash.status == .review ? VoiceLogText.why(flash).map { "check · \($0)" } : nil
                )
            }
            Spacer(minLength: 0)
        }
        .animation(.easeOut(duration: 0.25), value: model.voiceFlash)
        .animation(.easeOut(duration: 0.2), value: voice.state)
    }

    private func tone(_ flash: VoiceEntryState) -> Color {
        switch flash.status {
        case .ok: return Theme.mint
        case .review: return Theme.prText
        case .working, .queued, .undone: return Theme.textSecondary
        case .failed: return Theme.danger
        }
    }

    /// Only a real entry can be taken back — not "Got it…" or a failure.
    private func canUndo(_ flash: VoiceEntryState) -> Bool {
        (flash.status == .ok || flash.status == .review || flash.status == .queued)
            && model.voiceEntries.last(where: { $0.status != .undone })?.id == flash.id
    }

    private func banner(lines: [String], tone: Color, undo: Bool, note: String?) -> some View {
        HStack(alignment: .center, spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                ForEach(Array(lines.prefix(2).enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(Theme.text(11, weight: .semibold))
                        .foregroundStyle(tone)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                if lines.count > 2 {
                    Text("+\(lines.count - 2) more")
                        .font(Theme.text(8.5))
                        .foregroundStyle(Theme.textTertiary)
                }
                if let note {
                    Text(note)
                        .font(Theme.text(8.5))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 0)
            if undo {
                Button {
                    model.undoLastVoiceEntry()
                } label: {
                    Text("Undo")
                        .font(Theme.text(10, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .padding(.horizontal, 9)
                        .pitayaTappable(minWidth: 46)
                        .background(Theme.element, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 11)
        .padding(.trailing, undo ? 4 : 11)
        .padding(.vertical, undo ? 3 : 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius)
                .strokeBorder(tone.opacity(0.45), lineWidth: 1)
        )
        .padding(.horizontal, 4)
        .padding(.top, 2)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

// MARK: - The log

/// Wording shared by the banner and the log.
enum VoiceLogText {
    /// The server marks an unsure line with a leading "? ". On the wrist the
    /// mark is replaced by a CHECK tag and the reason in words.
    static func plain(_ line: String) -> String {
        line.hasPrefix("? ") ? String(line.dropFirst(2)) : line
    }

    /// Why this clip was flagged — every distinct reason, in his words.
    static func why(_ entry: VoiceEntryState) -> String? {
        var seen: [String] = []
        for parsed in entry.parsed where parsed.needsReview {
            if let text = VoiceEntryState.reasonText(parsed.reason), !seen.contains(text) {
                seen.append(text)
            }
        }
        return seen.isEmpty ? nil : seen.joined(separator: ", ")
    }
}

/// The way into the log from a live screen's header: how many entries count
/// so far, blush when any of them needs a look.
struct VoiceLogChip: View {
    @EnvironmentObject private var model: AppModel
    @State private var showing = false
    /// Freestyle shows it from the start (so he knows it is there); the
    /// strength logger's header is tight, so there it appears with the first
    /// entry.
    var always = true

    var body: some View {
        let count = model.countedVoiceEntries.count
        let flagged = model.voiceEntries.contains { $0.status == .review }
        if always || !model.voiceEntries.isEmpty {
            Button {
                showing = true
            } label: {
                HStack(spacing: 3) {
                    Text(count > 0 ? "\(count) LOGGED" : "LOG")
                        .font(Theme.wText(5.5, weight: .bold))
                        .kerning(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 7, weight: .bold))
                }
                .foregroundStyle(
                    flagged ? Theme.prText : (count > 0 ? Theme.mint : Theme.textSecondary)
                )
                .padding(.horizontal, 9)
                // Inline header chip: the documented 32 pt exception.
                .pitayaTappable(minWidth: 44, minHeight: 32)
                .background(Theme.card, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(count > 0 ? "Voice log, \(count) logged" : "Voice log")
            .sheet(isPresented: $showing) {
                VoiceLogSheet().environmentObject(model)
            }
            #if DEBUG
            .onChange(of: model.debugShowVoiceLog) { _, open in
                if open { showing = true }
            }
            #endif
        }
    }
}

/// Everything he has said this session, newest first: the words as they were
/// heard, and what was logged from them. Tap an entry to read it in full and
/// to take it back (or put it back).
struct VoiceLogSheet: View {
    @EnvironmentObject private var model: AppModel
    @State private var open: String?

    var body: some View {
        let entries = Array(model.voiceEntries.reversed())
        let counted = model.countedVoiceEntries.count
        let toCheck = entries.filter { $0.status == .review }.count
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.px(8)) {
                Text(counted > 0 ? "VOICE LOG · \(counted)" : "VOICE LOG")
                    .font(Theme.wText(6.5, weight: .semibold))
                    .kerning(1.0)
                    .foregroundStyle(Theme.textTertiary)
                if entries.isEmpty {
                    Text("Nothing logged yet.")
                        .font(Theme.text(11, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .padding(.top, Theme.px(6))
                    Text("Tap the mic and say what you did — “8 swings, 24 kilos”. It shows up here with what was heard.")
                        .font(Theme.text(9.5))
                        .foregroundStyle(Theme.textSecondary)
                } else {
                    Text(toCheck > 0
                         ? "\(toCheck) to check · tap an entry"
                         : "tap an entry to read or remove it")
                        .font(Theme.text(8.5))
                        .foregroundStyle(toCheck > 0 ? Theme.prText : Theme.textMuted)
                    ForEach(entries) { entry in
                        row(entry)
                    }
                }
            }
            .padding(.horizontal, Theme.px(8))
            .padding(.bottom, Theme.px(12))
        }
    }

    private func tag(_ entry: VoiceEntryState) -> (text: String, color: Color)? {
        switch entry.status {
        case .ok: return nil
        case .review: return ("CHECK", Theme.prText)
        case .working: return ("LISTENING", Theme.textSecondary)
        case .queued: return ("WAITING", Theme.textSecondary)
        case .failed: return ("NOT HEARD", Theme.danger)
        case .undone: return ("TAKEN BACK", Theme.textMuted)
        }
    }

    private func lineColor(_ entry: VoiceEntryState) -> Color {
        switch entry.status {
        case .ok: return Theme.textPrimary
        case .review: return Theme.prText
        case .undone: return Theme.textMuted
        case .failed: return Theme.danger
        case .working, .queued: return Theme.textSecondary
        }
    }

    @ViewBuilder
    private func row(_ entry: VoiceEntryState) -> some View {
        let expanded = open == entry.id
        VStack(alignment: .leading, spacing: Theme.px(5)) {
            Button {
                withAnimation(.easeOut(duration: 0.15)) { open = expanded ? nil : entry.id }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(Fmt.clock(TimeInterval(entry.t)))
                            .font(Theme.wText(5.5, weight: .bold))
                            .foregroundStyle(Theme.textTertiary)
                        Spacer(minLength: 0)
                        if let tag = tag(entry) {
                            Text(tag.text)
                                .font(Theme.wText(5.5, weight: .bold))
                                .kerning(0.8)
                                .foregroundStyle(tag.color)
                        }
                    }
                    ForEach(Array(entry.lines.enumerated()), id: \.offset) { _, line in
                        Text(VoiceLogText.plain(line))
                            .font(Theme.text(11, weight: .semibold))
                            .foregroundStyle(lineColor(entry))
                            .strikethrough(entry.status == .undone)
                            .lineLimit(expanded ? nil : 2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let said = entry.transcript, !said.isEmpty {
                        Text("“\(said)”")
                            .font(Theme.text(9.5))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(expanded ? nil : 2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if entry.status == .review, let why = VoiceLogText.why(entry) {
                        Text("unsure: \(why)")
                            .font(Theme.text(8.5))
                            .foregroundStyle(Theme.prText)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: Theme.minTap, alignment: .leading)
                .contentShape(Rectangle())
                .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.cardRadius)
                        .strokeBorder(expanded ? Theme.element : Color.clear, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            if expanded, entry.status != .working {
                let undone = entry.status == .undone
                Button {
                    if undone {
                        model.restoreVoiceEntry(entry.id)
                    } else {
                        model.removeVoiceEntry(entry.id)
                    }
                    open = nil
                } label: {
                    Text(undone ? "Put back" : "Remove")
                        .font(Theme.display(12, weight: .semibold))
                        .foregroundStyle(undone ? Theme.textPrimary : Theme.danger)
                        .frame(maxWidth: .infinity)
                        .pitayaTappable(minHeight: Theme.minTap)
                        .background(undone ? Theme.element : Theme.dangerDim, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
#endif
