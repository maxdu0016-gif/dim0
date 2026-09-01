import Combine
import Foundation
import WebKit

@MainActor
final class Dim0WebAppModel: ObservableObject {
    @Published private(set) var isLoading = true
    @Published private(set) var errorMessage: String?

    weak var webView: WKWebView?

    /// Loads the configured Dim0 application and clears any previous navigation error.
    func loadApp() {
        errorMessage = nil
        isLoading = true
        webView?.load(URLRequest(url: Dim0WebAppConfiguration.appURL))
    }

    /// Reflects the web view's initial-page loading state in the SwiftUI shell.
    func setLoading(_ loading: Bool) {
        isLoading = loading
    }

    /// Surfaces a navigation failure without replacing the persistent web data store.
    func setError(_ message: String) {
        isLoading = false
        errorMessage = message
    }

    /// Clears the currently displayed navigation error after a successful load.
    func clearError() {
        errorMessage = nil
    }
}
