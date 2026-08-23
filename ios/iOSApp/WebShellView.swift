// The WKWebView shell — Pitaya's deployed web UI is the whole interface.
// Durable cookies (default persistent data store), origin-locked
// getUserMedia auto-grant (kills the every-launch mic prompt), external
// links out to Safari, bounce off, and shake-to-open-settings via the
// hosting view controller's motion handler.

#if os(iOS)
import SwiftUI
import UIKit
import WebKit

struct WebShellView: UIViewControllerRepresentable {
    let onShake: () -> Void

    func makeUIViewController(context: Context) -> ShellViewController {
        let controller = ShellViewController()
        controller.onShake = onShake
        return controller
    }

    func updateUIViewController(_ controller: ShellViewController, context: Context) {
        controller.onShake = onShake
    }
}

final class ShellViewController: UIViewController {
    /// The web origin. DEBUG builds honour `pitaya.devOrigin` in UserDefaults
    /// (e.g. http://localhost:3000 for a simulator smoke against `npm run dev`):
    ///   xcrun simctl spawn booted defaults write net.blacksheepglobal.pitaya pitaya.devOrigin http://localhost:3000
    static var origin: URL {
        #if DEBUG
        if let raw = UserDefaults.standard.string(forKey: "pitaya.devOrigin"), let url = URL(string: raw) {
            return url
        }
        #endif
        return MobileAPIClient.productionBaseURL
    }

    /// iPad opens on the desk's front door (Spirit Home); iPhone on the web
    /// app's own root. The web layer routes compact widths back to the phone
    /// layout, so a narrow Split View on iPad still lands somewhere sensible.
    static var landingURL: URL {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return origin.appendingPathComponent("home")
        }
        return origin
    }
    var onShake: (() -> Void)?
    private var webView: WKWebView?
    private var lastActiveAt = Date()

    override var canBecomeFirstResponder: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default() // persistent — PIN cookie survives
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // Haptics: the desk posts window.webkit.messageHandlers.haptic.postMessage("light"|…)
        // (lib/haptics.ts) and UIKit's feedback generators answer. Prepared once, kept warm.
        configuration.userContentController.add(HapticBridge.shared, name: "haptic")

        let webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // ——— THE PEN LIVES OR DIES HERE ———
        //
        // This app is a writing surface. Every native gesture recogniser that arbitrates over
        // the web view is a competitor for the Apple Pencil's very first samples, and when one
        // of them wins, WebKit sends the page `pointercancel` and the stroke ends mid-letter.
        // Arbitration restarts on EVERY pen-down, which is why writing letter by letter — lift,
        // land, lift, land — was so much worse than writing a continuous line.
        //
        // 1. delaysContentTouches (default TRUE) withholds touchesBegan from the web content
        //    for ~150 ms while the scroll view decides whether this is a scroll. That delay is
        //    literally the symptom he reported: "lag in reading the pencil between contact."
        // 2. canCancelContentTouches (default TRUE) lets the scroll view take back a contact it
        //    has ALREADY handed to the page. That is the stroke dying halfway through a letter.
        // Neither costs us anything: the page does its own finger panning in JS (ink-canvas's
        // scrollBy) inside its own overflow:auto panes. The web view's scroll view has nothing
        // to scroll here, so all it can do is steal.
        webView.scrollView.delaysContentTouches = false
        webView.scrollView.canCancelContentTouches = false

        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.949, green: 0.945, blue: 0.949, alpha: 1)
        view.backgroundColor = webView.backgroundColor

        // 3. Screen-edge back/forward swipes arm on any contact within ~44pt of a screen edge
        //    and cancel content touches when they recognise. On the two-pane desk the notebook
        //    sits flush against an edge, so a word started near the margin could be cancelled —
        //    or navigate the whole desk away mid-sentence. Routing is the web app's job here.
        webView.allowsBackForwardNavigationGestures = false

        // 4. Web Inspector. Without this, Safari on the Mac cannot see this web view at all
        //    (iOS 16.4+ defaults isInspectable to false) — which is the reason four rounds of
        //    pen fixes were only ever verified in a desktop browser that has none of the
        //    native arbitration above.
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        view.addSubview(webView)
        self.webView = webView

        // Apple Pencil double-tap (and squeeze on a Pencil Pro) never reaches a web view —
        // UIKit delivers it to native code only. Catch it here and hand it to the page.
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        webView.addInteraction(pencil)

        // Apple Pencil reaches the web ink engine as pointer events with
        // pressure + tilt; finger scrolling stays native. Nothing to bridge
        // for V1 — PencilKit is the upgrade path (docs/deferred-items.md).
        webView.load(URLRequest(url: Self.landingURL))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(refreshIfStale),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    /// A WKWebView document loaded once in viewDidLoad can survive weeks of suspend and resume,
    /// so the app can sit on a months-old bundle while the server has long since moved on —
    /// which is exactly how a round of Pencil fixes came to be judged against a build that was
    /// never installed. Reload when the app has been away long enough that it cannot be
    /// mid-thought, and never while there is unsaved ink in flight.
    @objc private func refreshIfStale() {
        guard let webView, Date().timeIntervalSince(lastActiveAt) > 900 else {
            lastActiveAt = Date()
            return
        }
        lastActiveAt = Date()
        webView.evaluateJavaScript("window.__pitayaHasUnsavedInk === true") { [weak webView] result, _ in
            if (result as? Bool) == true { return }
            webView?.reload()
        }
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake {
            onShake?()
        }
        super.motionEnded(motion, with: event)
    }
}

/// JS → UIKit haptics. Generators are prepared once so the first tick is not late.
final class HapticBridge: NSObject, WKScriptMessageHandler {
    static let shared = HapticBridge()
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let selection = UISelectionFeedbackGenerator()
    private let notify = UINotificationFeedbackGenerator()

    private override init() {
        super.init()
        [light, medium, heavy, rigid, soft].forEach { $0.prepare() }
        selection.prepare()
        notify.prepare()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let kind = message.body as? String else { return }
        DispatchQueue.main.async { [self] in
            switch kind {
            case "light": light.impactOccurred()
            case "medium": medium.impactOccurred()
            case "heavy": heavy.impactOccurred()
            case "rigid": rigid.impactOccurred()
            case "soft": soft.impactOccurred()
            case "selection": selection.selectionChanged()
            case "success": notify.notificationOccurred(.success)
            case "warning": notify.notificationOccurred(.warning)
            case "error": notify.notificationOccurred(.error)
            default: light.impactOccurred()
            }
        }
    }
}

// MARK: - Apple Pencil double-tap / squeeze -> the desk

extension ShellViewController: UIPencilInteractionDelegate {
    /// What the SYSTEM setting says the double-tap should mean. Respecting it means the
    /// gesture behaves the same here as it does in Notes and Procreate.
    private func actionName(for action: UIPencilPreferredAction) -> String {
        switch action {
        case .switchEraser: return "eraser"
        case .switchPrevious: return "previous"
        case .showColorPalette: return "palette"
        case .showInkAttributes: return "attributes"
        case .ignore: return "ignore"
        @unknown default: return "eraser"
        }
    }

    private func sendPencil(_ kind: String, _ action: String) {
        let js = "window.dispatchEvent(new CustomEvent('pitaya-pencil',{detail:{kind:'\(kind)',action:'\(action)'}}))"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // iPadOS 17.5+ — carries which physical gesture fired.
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        sendPencil("doubleTap", actionName(for: UIPencilInteraction.preferredTapAction))
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        sendPencil("squeeze", "palette")
    }

    // Pre-17.5 path — still the one that fires for an Apple Pencil 2 on older systems.
    @available(iOS, introduced: 12.1, deprecated: 17.5)
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        sendPencil("doubleTap", actionName(for: UIPencilInteraction.preferredTapAction))
    }
}

extension ShellViewController: WKUIDelegate {
    // window.alert / confirm / prompt — without these, WKWebView answers "no" silently
    // (the ✕-to-delete that "did nothing" on 2026-08-22). The desk now uses its own
    // in-app dialog, but the native ones stay as the safety net for any stray call.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    // iOS 15+: grant mic/camera to OUR origin only — the native permission
    // was granted once at install; the web origin never re-prompts.
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let ours = Self.origin.host?.lowercased()
        decisionHandler(origin.host.lowercased() == ours ? .grant : .deny)
    }
}

extension ShellViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard
            navigationAction.navigationType == .linkActivated,
            let url = navigationAction.request.url,
            let host = url.host?.lowercased(),
            host != Self.origin.host?.lowercased()
        else {
            decisionHandler(.allow)
            return
        }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        disableScribble(in: webView)
    }
}

extension ShellViewController {
    /// Take iPadOS Scribble off the web view.
    ///
    /// Scribble is on by default whenever a Pencil is paired, and WebKit installs a scribble
    /// interaction on its content view so a pencil can write into text fields. To do that, it
    /// has to inspect the beginning of EVERY pencil contact and ask the web content process
    /// whether there is something writable under the tip — an answer that arrives
    /// asynchronously. While it is waiting, it is holding a claim on the touch it may still
    /// cancel. On a page that is one large drawing canvas there is nothing for it to win, so
    /// the only thing it can contribute is a stolen first stroke.
    ///
    /// WebKit re-adds the interaction across navigations, so this runs after every load.
    /// UIIndirectScribbleInteraction is public API; removing an interaction we did not add is
    /// the documented way for a drawing surface to opt out.
    private func disableScribble(in webView: WKWebView) {
        // Matched by class name: UIIndirectScribbleInteraction is generic over its delegate, so
        // `is` cannot infer a type here, and WebKit's concrete interaction classes are private.
        func isScribble(_ interaction: UIInteraction) -> Bool {
            let name = NSStringFromClass(type(of: interaction) as AnyClass)
            return name.contains("Scribble")
        }
        func strip(_ v: UIView) {
            for interaction in v.interactions where isScribble(interaction) {
                v.removeInteraction(interaction)
            }
            v.subviews.forEach(strip)
        }
        strip(webView)
    }
}
#endif
