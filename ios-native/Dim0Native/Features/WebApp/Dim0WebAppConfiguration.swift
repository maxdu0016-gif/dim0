import Foundation

enum Dim0WebAppConfiguration {
    private static let fallbackURL = URL(string: "https://app.dim0.net")!

    /// Resolves the full Dim0 web application hosted inside the native iPad shell.
    static var appURL: URL {
        if let override = ProcessInfo.processInfo.environment["DIM0_APP_URL"],
           let url = normalizedURL(override) {
            return url
        }

        if let configured = Bundle.main.object(forInfoDictionaryKey: "Dim0AppURL") as? String,
           let url = normalizedURL(configured) {
            return url
        }

        return fallbackURL
    }

    /// Accepts HTTPS production URLs and HTTP LAN URLs used by self-hosted development builds.
    private static func normalizedURL(_ rawValue: String) -> URL? {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        let candidate = value.contains("://") ? value : "https://\(value)"
        guard let url = URL(string: candidate),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              url.host != nil else {
            return nil
        }
        return url
    }
}
