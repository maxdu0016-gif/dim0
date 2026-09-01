import SwiftUI
import UIKit
import WebKit

struct Dim0WebView: UIViewRepresentable {
    @ObservedObject var model: Dim0WebAppModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    /// Creates one persistent WKWebView containing the complete Dim0 web application.
    func makeUIView(context: Context) -> NativePencilWebContainer {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.addUserScript(Self.nativeBootstrapScript())
        configuration.userContentController.add(context.coordinator, name: "dim0NativePencil")

        let webView = PencilAwareWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = true
        webView.backgroundColor = .systemBackground
        let container = NativePencilWebContainer(webView: webView)
        container.onPencilDoubleTap = { [weak webView] in
            Self.toggleWebEraser(in: webView)
        }
        context.coordinator.container = container

        model.webView = webView
        model.loadApp()
        return container
    }

    func updateUIView(_ container: NativePencilWebContainer, context: Context) {}

    /// Marks the runtime before application JavaScript executes so Dim0 can enable iPad-native behavior.
    private static func nativeBootstrapScript() -> WKUserScript {
        let source = """
        window.__DIM0_IOS_NATIVE__ = Object.freeze({ version: 1, platform: 'ipad' });
        document.documentElement.classList.add('ios-native');
        var viewport = document.querySelector('meta[name="viewport"]');
        if (viewport && !viewport.content.includes('viewport-fit')) {
          viewport.content += ', viewport-fit=cover';
        }
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    /// Lets the native Apple Pencil gesture switch the same pen/eraser state used by the web canvas.
    private static func toggleWebEraser(in webView: WKWebView?) {
        let script = """
        (() => {
          const detail = { handled: false };
          window.dispatchEvent(new CustomEvent('dim0:native-pencil-double-tap', { detail }));
          if (detail.handled) return true;
          const eraser = document.querySelector('button[aria-label="Eraser"]');
          const pen = document.querySelector('button[aria-label="Pen"]');
          if (!eraser || !pen) return false;
          (eraser.getAttribute('aria-pressed') === 'true' ? pen : eraser).click();
          return true;
        })();
        """
        webView?.evaluateJavaScript(script)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
        private let model: Dim0WebAppModel
        private var downloadDestinations: [ObjectIdentifier: URL] = [:]
        weak var container: NativePencilWebContainer?

        init(model: Dim0WebAppModel) {
            self.model = model
        }

        /// Receives strict canvas geometry and pen settings from the trusted Dim0 page.
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.frameInfo.isMainFrame,
                  message.name == "dim0NativePencil",
                  let body = message.body as? [String: Any],
                  body["kind"] as? String == "dim0.native-pencil.configure",
                  (body["version"] as? NSNumber)?.intValue == 1,
                  let enabled = body["enabled"] as? Bool,
                  let rect = body["rect"] as? [String: Any],
                  let x = rect["x"] as? NSNumber,
                  let y = rect["y"] as? NSNumber,
                  let width = rect["width"] as? NSNumber,
                  let height = rect["height"] as? NSNumber,
                  let colorHex = body["color"] as? String,
                  let color = UIColor(dim0Hex: colorHex),
                  let contextId = body["contextId"] as? String,
                  !contextId.isEmpty,
                  let storedColor = body["storedColor"] as? String,
                  UIColor(dim0Hex: storedColor) != nil,
                  let penWidth = body["width"] as? NSNumber else {
                return
            }

            let frame = CGRect(
                x: CGFloat(x.doubleValue),
                y: CGFloat(y.doubleValue),
                width: CGFloat(max(0, width.doubleValue)),
                height: CGFloat(max(0, height.doubleValue))
            )
            guard frame.origin.x.isFinite,
                  frame.origin.y.isFinite,
                  frame.width.isFinite,
                  frame.height.isFinite,
                  penWidth.doubleValue.isFinite else {
                return
            }
            container?.configurePencil(
                enabled: enabled,
                frame: frame,
                color: color,
                contextId: contextId,
                storedColor: storedColor,
                width: CGFloat(min(64, max(0.5, penWidth.doubleValue)))
            )
        }

        /// Keeps target-blank links inside the app so authentication and app routes retain one session.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let requestURL = navigationAction.request.url {
                webView.load(URLRequest(url: requestURL))
            }
            return nil
        }

        /// Opens non-web URL schemes in iPadOS and lets HTTP(S) Dim0 routes remain in the shell.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased() else {
                decisionHandler(.cancel)
                return
            }

            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
            } else if scheme == "http" || scheme == "https" || scheme == "about" || scheme == "blob" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        /// Converts attachment responses into native downloads that can be exported from the iPad.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            let disposition = (navigationResponse.response as? HTTPURLResponse)?
                .value(forHTTPHeaderField: "Content-Disposition")?
                .lowercased()
            if disposition?.contains("attachment") == true || !navigationResponse.canShowMIMEType {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            model.clearError()
            model.setLoading(true)
            container?.disablePencil()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            model.clearError()
            model.setLoading(false)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation?,
            withError error: Error
        ) {
            reportNavigationFailure(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            reportNavigationFailure(error)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        /// Stores each completed web download in a unique temporary file before presenting the share sheet.
        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let safeName = suggestedFilename.replacingOccurrences(of: "/", with: "-")
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("Dim0-\(UUID().uuidString)", isDirectory: true)
                .appendingPathComponent(safeName)
            do {
                try FileManager.default.createDirectory(
                    at: destination.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                downloadDestinations[ObjectIdentifier(download)] = destination
                completionHandler(destination)
            } catch {
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let destination = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else {
                return
            }
            presentShareSheet(for: destination)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
            model.setError("文件下载失败：\(error.localizedDescription)")
        }

        /// Ignores cancelled subnavigations and reports real page-load failures to the app shell.
        private func reportNavigationFailure(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
                return
            }
            model.setError("请检查网络或 Dim0 服务地址。\n\(error.localizedDescription)")
        }

        /// Presents the standard iPad share sheet from the currently active scene.
        private func presentShareSheet(for fileURL: URL) {
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }),
                  let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
                return
            }

            var presenter = root
            while let presented = presenter.presentedViewController {
                presenter = presented
            }
            let share = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = presenter.view
            share.popoverPresentationController?.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.midY,
                width: 1,
                height: 1
            )
            presenter.present(share, animated: true)
        }
    }
}

final class PencilAwareWebView: WKWebView, UIPencilInteractionDelegate {
    var onPencilDoubleTap: (() -> Void)?

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        installPencilInteraction()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        installPencilInteraction()
    }

    /// Forwards Apple Pencil double-tap without intercepting Pointer Events used for drawing.
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        onPencilDoubleTap?()
    }

    private func installPencilInteraction() {
        let pencilInteraction = UIPencilInteraction()
        pencilInteraction.delegate = self
        addInteraction(pencilInteraction)
    }
}
