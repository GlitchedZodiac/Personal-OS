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

extension ShellViewController: WKUIDelegate {
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
