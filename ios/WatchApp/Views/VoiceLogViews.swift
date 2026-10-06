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
                banner(lines: ["Listening…"], tone: Theme.prText, undo: false)
            } else if let flash = model.voiceFlash {
                banner(lines: flash.lines, tone: tone(flash), undo: canUndo(flash))
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
        case .working, .queued: return Theme.textSecondary
        case .failed: return Theme.danger
        }
    }

    /// Only a real entry can be taken back — not "Got it…" or a failure.
    private func canUndo(_ flash: VoiceEntryState) -> Bool {
        (flash.status == .ok || flash.status == .review || flash.status == .queued)
            && model.voiceEntries.last?.id == flash.id
    }

    private func banner(lines: [String], tone: Color, undo: Bool) -> some View {
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
#endif
