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
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.949, green: 0.945, blue: 0.949, alpha: 1)
        view.backgroundColor = webView.backgroundColor
        webView.allowsBackForwardNavigationGestures = true
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
}
#endif
