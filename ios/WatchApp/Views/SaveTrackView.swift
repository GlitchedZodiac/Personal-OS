// Save track — Round 3 §05, extracted 1:1 from the board: 600 ms after an
// outdoor save syncs, the prompt slides up with at most two near-ranked
// suggestions, a dictate-a-name row, and Skip (which never re-asks this
// session). Success is the mint ring + drawn check, then back to the summary.

#if os(watchOS)
import SwiftUI
import WatchKit

struct SaveTrackView: View {
    @EnvironmentObject private var model: AppModel
    @State private var appeared = false
    @State private var checkDrawn = false

    var body: some View {
        Group {
            if let name = model.trailSaveSuccess {
                success(name: name)
            } else {
                prompt
            }
        }
        .offset(y: appeared ? 0 : Theme.r3(120))
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(Theme.Motion.arrival) { appeared = true }
        }
    }

    // MARK: - The prompt

    private var prompt: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.r3(10)) {
                Text("Save this track?")
                    .font(Theme.r3Display(27, weight: .bold))
                    .foregroundStyle(Theme.textBright)
                    .padding(.top, Theme.r3(30))
                Text(subLine)
                    .font(Theme.r3Text(12.5))
                    .foregroundStyle(Theme.textTertiary)

                ForEach(model.trailSuggestions) { trail in
                    suggestionRow(trail)
                }

                newTrailRow

                Button {
                    Task { await model.skipTrailPrompt() }
                } label: {
                    Text("Skip")
                        .font(Theme.r3Text(14, weight: .semibold))
                        .foregroundStyle(Theme.textTertiary)
                        .frame(maxWidth: .infinity)
                        .pitayaTappable()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Theme.r3(24))
        }
        .disabled(model.trailSaving)
        .opacity(model.trailSaving ? 0.6 : 1)
    }

    private var subLine: String {
        let km = model.summary?.distanceMeters.map { String(format: "%.1f km", $0 / 1000) }
        if model.trailSuggestions.isEmpty {
            return km.map { "\($0) · new ground" } ?? "new ground"
        }
        return km.map { "\($0) · looks like one you know" } ?? "looks like one you know"
    }

    private func suggestionRow(_ trail: TrailSummary) -> some View {
        Button {
            Task { await model.saveTrack(trailId: trail.id) }
        } label: {
            HStack(spacing: Theme.r3(12)) {
                ZStack {
                    Circle().fill(Theme.accentDim)
                    PitayaGlyph(
                        paths: Glyphs.trailBookmark, color: Theme.accent, size: Theme.r3(17)
                    )
                }
                .frame(width: Theme.r3(34), height: Theme.r3(34))

                VStack(alignment: .leading, spacing: Theme.r3(2)) {
                    Text(trail.name)
                        .font(Theme.r3Text(15, weight: .semibold))
                        .foregroundStyle(Theme.textBright)
                        .fixedSize(horizontal: false, vertical: true) // wraps, never truncates
                    Text(suggestionSub(trail))
                        .font(Theme.r3Text(11))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, Theme.r3(14))
            .padding(.vertical, Theme.r3(12))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.r3(18)))
        }
        .buttonStyle(.plain)
    }

    /// "3rd time · 6.4 km · 94% match"
    private func suggestionSub(_ trail: TrailSummary) -> String {
        var parts = [ordinal(trail.runCount + 1) + " time"]
        if let meters = trail.distanceMeters {
            parts.append(String(format: "%.1f km", meters / 1000))
        }
        if let pct = trail.matchPct {
            parts.append("\(pct)% match")
        }
        return parts.joined(separator: " · ")
    }

    private var newTrailRow: some View {
        TextFieldLink(prompt: Text("Trail name")) {
            HStack(spacing: Theme.r3(12)) {
                ZStack {
                    Circle()
                        .fill(Theme.card)
                        .overlay(Circle().strokeBorder(Theme.elementDim, lineWidth: 1))
                    PitayaGlyph(paths: Glyphs.mic, color: Theme.accent, size: Theme.r3(17))
                }
                .frame(width: Theme.r3(34), height: Theme.r3(34))

                VStack(alignment: .leading, spacing: Theme.r3(2)) {
                    Text("New trail…")
                        .font(Theme.r3Text(15, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                    Text("dictate a name")
                        .font(Theme.r3Text(11))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.r3(14))
            .padding(.vertical, Theme.r3(12))
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.r3(18)))
        } onSubmit: { name in
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            Task { await model.saveTrack(name: trimmed) }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Success

    private func success(name: String) -> some View {
        VStack(spacing: Theme.r3(10)) {
            ZStack {
                Circle()
                    .stroke(Theme.mint, lineWidth: Theme.r3(4))
                    .frame(width: Theme.r3(76), height: Theme.r3(76))
                PitayaGlyph(
                    paths: Glyphs.check, style: .stroke(width: 3),
                    color: Theme.mint, size: Theme.r3(34)
                )
                .opacity(checkDrawn ? 1 : 0)
                .scaleEffect(checkDrawn ? 1 : 0.6)
            }
            Text("Track saved")
                .font(Theme.r3Display(26, weight: .bold))
                .foregroundStyle(Theme.textBright)
            Text(name)
                .font(Theme.r3Text(14, weight: .semibold))
                .foregroundStyle(Theme.mint)
                .multilineTextAlignment(.center)
            Text(runsSub)
                .font(Theme.r3Text(11))
                .foregroundStyle(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, Theme.r3(24))
        .onAppear {
            withAnimation(.easeOut(duration: 0.35)) { checkDrawn = true }
        }
    }

    private var runsSub: String {
        let runs = model.trails.first { $0.name == model.trailSaveSuccess }?.runCount
        if let runs, runs > 0 {
            return "\(runs) \(runs == 1 ? "run" : "runs") · syncs with the workout"
        }
        return "syncs with the workout"
    }

    private func ordinal(_ n: Int) -> String {
        switch n % 100 {
        case 11, 12, 13: return "\(n)th"
        default:
            switch n % 10 {
            case 1: return "\(n)st"
            case 2: return "\(n)nd"
            case 3: return "\(n)rd"
            default: return "\(n)th"
            }
        }
    }
}
#endif
