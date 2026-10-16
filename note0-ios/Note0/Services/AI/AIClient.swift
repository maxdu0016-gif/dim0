import Foundation
import Security
import UIKit

/// What the student wants done with the selected region.
enum AIAction: String, CaseIterable, Identifiable {
    case explain
    case summarize
    case quiz

    var id: String { rawValue }

    var title: String {
        switch self {
        case .explain: return "讲解"
        case .summarize: return "整理成笔记"
        case .quiz: return "出复习题"
        }
    }

    var systemImage: String {
        switch self {
        case .explain: return "lightbulb"
        case .summarize: return "list.bullet.rectangle"
        case .quiz: return "questionmark.circle"
        }
    }

    var instruction: String {
        switch self {
        case .explain:
            return "请讲解图中这部分内容：说清楚它在讲什么、关键概念和推导思路，最后用一两句话总结。"
        case .summarize:
            return "请把图中的手写笔记或课件内容整理成条理清晰的笔记要点，补全明显省略的步骤，保留关键公式。"
        case .quiz:
            return "请根据图中内容出 3 道复习题（由易到难），每道题后面给出简短答案和解析。"
        }
    }
}

/// Builds the OpenAI-shaped messages sent to the backend's `/ai/llm/stream`.
enum AIPrompt {
    static let system = """
    你是 note0 的学习助手，帮助大学生理解课程内容。用户会给你一张截图，是他笔记本里框选的一块区域，可能包含手写笔记、课件 PDF 或之前的 AI 卡片。
    回答要求：使用简体中文；简洁、准确、像好老师一样讲清楚；可以用 **加粗** 和 - 列表，但不要用表格和标题；数学公式写成易读的纯文本或 Unicode（如 x²、√、∫），不要用 LaTeX。
    如果截图内容看不清或与学习无关，直接说明。
    """

    static func messages(action: AIAction?, question: String, imageJPEG: Data) -> [[String: Any]] {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        let instruction: String
        switch (action, trimmed.isEmpty) {
        case (let action?, true): instruction = action.instruction
        case (let action?, false): instruction = action.instruction + "\n另外，我的问题是：" + trimmed
        case (nil, _): instruction = trimmed.isEmpty ? AIAction.explain.instruction : trimmed
        }
        let imageURL = "data:image/jpeg;base64," + imageJPEG.base64EncodedString()
        return [
            ["role": "system", "content": system],
            ["role": "user", "content": [
                ["type": "text", "text": instruction],
                ["type": "image_url", "image_url": ["url": imageURL]],
            ]],
        ]
    }

    /// System prompt for the chat panel (multi-turn, screenshots optional).
    static let chatSystem = """
    你是 note0 的学习助手，帮助大学生理解课程内容、整理笔记、准备考试。用户有时会附上笔记本里框选的截图，可能包含手写笔记、课件 PDF 或之前的 AI 回答。
    回答要求：使用简体中文；简洁、准确、像好老师一样讲清楚；可以用 **加粗** 和 - 列表，但不要用表格和标题；数学公式写成易读的纯文本或 Unicode（如 x²、√、∫），不要用 LaTeX。
    如果截图看不清或与学习无关，直接说明。
    """

    /// One turn of a chat, as sent to the model.
    struct Turn {
        var isUser: Bool
        var text: String
        var imageJPEG: Data?
    }

    /// Chat history → OpenAI-shaped messages. Only the most recent
    /// `maxImages` screenshots are sent again, to keep requests small.
    static func chatMessages(_ turns: [Turn], maxImages: Int = 3) -> [[String: Any]] {
        var imagesLeft = maxImages
        var keepImage = Array(repeating: false, count: turns.count)
        for index in turns.indices.reversed() where turns[index].imageJPEG != nil && imagesLeft > 0 {
            keepImage[index] = true
            imagesLeft -= 1
        }
        var messages: [[String: Any]] = [["role": "system", "content": chatSystem]]
        for (index, turn) in turns.enumerated() {
            if turn.isUser, let jpeg = turn.imageJPEG, keepImage[index] {
                messages.append(["role": "user", "content": [
                    ["type": "text", "text": turn.text],
                    ["type": "image_url", "image_url": ["url": "data:image/jpeg;base64," + jpeg.base64EncodedString()]],
                ]])
            } else {
                let text = turn.isUser && turn.imageJPEG != nil ? turn.text + "\n（附图见前文）" : turn.text
                messages.append(["role": turn.isUser ? "user" : "assistant", "content": text])
            }
        }
        return messages
    }

    /// One server-sent-events line from an OpenAI-compatible
    /// `/chat/completions` stream → text to append (nil for anything else).
    static func sseDeltaText(fromLine line: String) -> String? {
        guard line.hasPrefix("data:") else { return nil }
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        guard payload != "[DONE]", let data = payload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = object["choices"] as? [[String: Any]],
              let delta = choices.first?["delta"] as? [String: Any],
              let text = delta["content"] as? String, !text.isEmpty else { return nil }
        return text
    }

    /// One NDJSON line from `/ai/llm/stream` → text to append (nil for other events).
    static func deltaText(fromLine line: String) -> String? {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["type"] as? String == "delta" else { return nil }
        return object["text"] as? String
    }
}

/// Server address, chosen model and sign-in tokens.
enum AIConfig {
    /// Builds 23–24 stored the server under "note0.ai.baseURL"; that value is
    /// deliberately ignored now so an old or mistyped entry can't break sign-in.
    private static let customBaseURLKey = "note0.ai.customBaseURL"
    private static let modelKey = "note0.ai.model"
    static let defaultModel = "gpt-5.4-mini"
    /// Used when Info.plist has no `Note0APIBaseURL`.
    static let builtInBaseURL = "https://api.dim0.net"

    /// The note0 server students use; nothing to type.
    static var defaultBaseURL: String {
        let fromPlist = normalizedBaseURL((Bundle.main.object(forInfoDictionaryKey: "Note0APIBaseURL") as? String) ?? "")
        return fromPlist.isEmpty ? builtInBaseURL : fromPlist
    }

    /// Only set from "高级设置" for a self-hosted backend; empty = default.
    static var customBaseURL: String {
        get { UserDefaults.standard.string(forKey: customBaseURLKey) ?? "" }
        set {
            let value = normalizedBaseURL(newValue)
            if value.isEmpty || value == defaultBaseURL {
                UserDefaults.standard.removeObject(forKey: customBaseURLKey)
            } else {
                UserDefaults.standard.set(value, forKey: customBaseURLKey)
            }
        }
    }

    /// The server actually used.
    static var baseURL: String {
        customBaseURL.isEmpty ? defaultBaseURL : customBaseURL
    }

    static var model: String {
        get { UserDefaults.standard.string(forKey: modelKey).flatMap { $0.isEmpty ? nil : $0 } ?? defaultModel }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespaces), forKey: modelKey) }
    }

    /// Adds https:// when missing (http:// for local hosts) and drops a trailing slash.
    static func normalizedBaseURL(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return "" }
        while value.hasSuffix("/") { value.removeLast() }
        if value.lowercased().hasPrefix("http://") || value.lowercased().hasPrefix("https://") { return value }
        let host = value.split(separator: "/").first.map(String.init) ?? value
        let isLocal = host.hasPrefix("localhost") || host.hasPrefix("127.") || host.hasPrefix("192.168.")
            || host.hasPrefix("10.") || host.hasSuffix(".local")
        return (isLocal ? "http://" : "https://") + value
    }

    static var accessToken: String? {
        get { Keychain.read("note0.accessToken") }
        set { Keychain.write("note0.accessToken", newValue) }
    }

    static var refreshToken: String? {
        get { Keychain.read("note0.refreshToken") }
        set { Keychain.write("note0.refreshToken", newValue) }
    }

    static var signedInEmail: String? {
        get { UserDefaults.standard.string(forKey: "note0.ai.email") }
        set { UserDefaults.standard.set(newValue, forKey: "note0.ai.email") }
    }

    static var isSignedIn: Bool { accessToken != nil && !baseURL.isEmpty }

    /// "问 AI" can run: own key / built-in proxy, or a note0 account.
    static var isReady: Bool { AIDirect.active != nil || isSignedIn }

    static func signOut() {
        accessToken = nil
        refreshToken = nil
        signedInEmail = nil
    }
}

/// A ready-made OpenAI-compatible AI service the student can pick.
enum AIProvider: String, CaseIterable, Identifiable {
    case openAI, dashScope, openRouter, custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .openAI: return "OpenAI"
        case .dashScope: return "通义千问（阿里云百炼）"
        case .openRouter: return "OpenRouter"
        case .custom: return "其他（自填地址）"
        }
    }

    var baseURL: String {
        switch self {
        case .openAI: return "https://api.openai.com/v1"
        case .dashScope: return "https://dashscope.aliyuncs.com/compatible-mode/v1"
        case .openRouter: return "https://openrouter.ai/api/v1"
        case .custom: return ""
        }
    }

    /// A model that can read images (the AI is sent a picture of the page).
    var defaultModel: String {
        switch self {
        case .openAI: return "gpt-5-mini"
        case .dashScope: return "qwen-vl-max"
        case .openRouter: return "openai/gpt-5-mini"
        case .custom: return ""
        }
    }

    var keyHint: String {
        switch self {
        case .openAI: return "sk-…（platform.openai.com → API keys）"
        case .dashScope: return "sk-…（百炼控制台 → API-KEY）"
        case .openRouter: return "sk-or-…（openrouter.ai → Keys）"
        case .custom: return "API Key"
        }
    }
}

/// Where an OpenAI-compatible `/chat/completions` request goes.
struct AIEndpoint: Equatable {
    var baseURL: String
    var apiKey: String
    var model: String

    var chatURL: URL? {
        let base = AIConfig.normalizedBaseURL(baseURL)
        guard !base.isEmpty else { return nil }
        if base.hasSuffix("/chat/completions") { return URL(string: base) }
        return URL(string: base + "/chat/completions")
    }

    var isComplete: Bool { chatURL != nil && !apiKey.isEmpty && !model.isEmpty }
}

/// Connecting to an AI without a note0 account:
/// 1. the student's own API key (设置 → 使用自己的 AI Key), or
/// 2. a proxy built into the app (`Note0AIProxyURL` / `Note0AIProxyToken` /
///    `Note0AIProxyModel` in Info.plist), which keeps the real key on the
///    server. See `server/ai-proxy-worker.js`.
enum AIDirect {
    private static let enabledKey = "note0.ai.direct.enabled"
    private static let providerKey = "note0.ai.direct.provider"
    private static let baseURLKey = "note0.ai.direct.baseURL"
    private static let modelKey = "note0.ai.direct.model"
    private static let apiKeyKey = "note0.ai.direct.apiKey"

    private static func plist(_ key: String) -> String {
        ((Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The proxy shipped with the app, if one is configured.
    static var builtIn: AIEndpoint? {
        let endpoint = AIEndpoint(
            baseURL: plist("Note0AIProxyURL"),
            apiKey: plist("Note0AIProxyToken"),
            model: plist("Note0AIProxyModel").isEmpty ? "gpt-5-mini" : plist("Note0AIProxyModel")
        )
        return endpoint.isComplete ? endpoint : nil
    }

    static var useOwnKey: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static var provider: AIProvider {
        get { AIProvider(rawValue: UserDefaults.standard.string(forKey: providerKey) ?? "") ?? .openAI }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: providerKey) }
    }

    /// Only used for `.custom`; the presets have fixed addresses.
    static var customBaseURL: String {
        get { UserDefaults.standard.string(forKey: baseURLKey) ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: baseURLKey) }
    }

    /// Empty = the provider's default model.
    static var model: String {
        get { UserDefaults.standard.string(forKey: modelKey) ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: modelKey) }
    }

    static var apiKey: String {
        get { Keychain.read(apiKeyKey) ?? "" }
        set {
            let value = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            Keychain.write(apiKeyKey, value.isEmpty ? nil : value)
        }
    }

    /// The student's own key, as an endpoint.
    static var ownEndpoint: AIEndpoint {
        let provider = self.provider
        return AIEndpoint(
            baseURL: provider == .custom ? customBaseURL : provider.baseURL,
            apiKey: apiKey,
            model: model.isEmpty ? provider.defaultModel : model
        )
    }

    /// What "问 AI" uses instead of the note0 account, if anything.
    static var active: AIEndpoint? {
        if useOwnKey { return ownEndpoint.isComplete ? ownEndpoint : nil }
        return builtIn
    }
}

/// Minimal generic-password Keychain wrapper for the auth tokens.
enum Keychain {
    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String?) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }
}

enum AIError: LocalizedError {
    case notConfigured
    case notSignedIn
    case server(String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "AI 还没有连接：请在“账号与 AI”里登录，或填写自己的 API Key。"
        case .notSignedIn: return "请先登录 note0 账号。"
        case .server(let message): return message
        case .invalidResponse: return "服务器返回了无法识别的内容。"
        }
    }
}

/// Talks to the note0 Python backend (`/users/signin`, `/users/refresh`, `/ai/llm/stream`).
enum AIClient {
    static func signIn(email: String, password: String) async throws {
        guard let base = URL(string: AIConfig.baseURL), !AIConfig.baseURL.isEmpty else { throw AIError.notConfigured }
        var request = URLRequest(url: base.appendingPathComponent("users/signin"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncoded(["username": email, "password": password]).data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        try storeTokens(from: data, response: response, fallbackMessage: "邮箱或密码不正确。")
        AIConfig.signedInEmail = email
    }

    /// Creates an account and signs in (the backend returns tokens right away).
    static func signUp(email: String, password: String) async throws {
        guard let base = URL(string: AIConfig.baseURL), !AIConfig.baseURL.isEmpty else { throw AIError.notConfigured }
        var request = URLRequest(url: base.appendingPathComponent("users/signup"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let name = email.split(separator: "@").first.map(String.init) ?? email
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email, "password": password, "name": name, "username": email,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        try storeTokens(from: data, response: response, fallbackMessage: "注册失败，请稍后再试。")
        AIConfig.signedInEmail = email
    }

    /// Plain-language text for errors a student may see.
    static func describe(_ error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return "没有网络连接，请检查网络后再试。"
            case .timedOut:
                return "连接超时，请稍后再试。"
            case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
                return "暂时连不上 note0 服务器，请稍后再试。"
            default:
                return "网络出错了，请稍后再试。"
            }
        }
        return error.localizedDescription
    }

    /// Turns the backend's English messages into ones a student understands.
    static func friendly(_ raw: String) -> String {
        let lower = raw.lowercased()
        if lower.contains("incorrect username or password") { return "邮箱或密码不正确。" }
        if lower.contains("error when creating user") { return "这个邮箱可能已经注册过了，可以直接登录。" }
        if lower.contains("not available on your plan") { return "当前账号的套餐不能使用这个 AI 模型。" }
        if lower.contains("token") && (lower.contains("invalid") || lower.contains("expired") || lower.contains("revoked")) {
            return "登录已过期，请重新登录。"
        }
        if lower.contains("not configured") || lower.contains("no model available") { return "AI 服务暂时不可用，请稍后再试。" }
        return raw
    }

    /// Streams the answer; `onDelta` receives text chunks on the main actor.
    static func ask(action: AIAction?, question: String, image: UIImage, onDelta: @escaping @MainActor (String) -> Void) async throws {
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else { throw AIError.invalidResponse }
        try await chat(messages: AIPrompt.messages(action: action, question: question, imageJPEG: jpeg), onDelta: onDelta)
    }

    /// Streams a reply to a full message list, over whichever connection is set up.
    static func chat(messages: [[String: Any]], onDelta: @escaping @MainActor (String) -> Void) async throws {
        if let endpoint = AIDirect.active {
            try await streamChat(endpoint: endpoint, messages: messages, onDelta: onDelta)
            return
        }
        let body: [String: Any] = [
            "model": AIConfig.model,
            "messages": messages,
        ]
        let payload = try JSONSerialization.data(withJSONObject: body)

        var (bytes, response) = try await streamRequest(payload: payload)
        if (response as? HTTPURLResponse)?.statusCode == 401 {
            try await refreshTokens()
            (bytes, response) = try await streamRequest(payload: payload)
        }
        guard let http = response as? HTTPURLResponse else { throw AIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            var errorData = Data()
            for try await byte in bytes { errorData.append(byte) }
            if http.statusCode == 401 { throw AIError.notSignedIn }
            throw AIError.server(errorMessage(from: errorData, status: http.statusCode))
        }
        for try await line in bytes.lines {
            if let text = AIPrompt.deltaText(fromLine: line) {
                await onDelta(text)
            }
        }
    }

    /// Streams from any OpenAI-compatible `/chat/completions`.
    static func streamChat(endpoint: AIEndpoint, messages: [[String: Any]], onDelta: @escaping @MainActor (String) -> Void) async throws {
        guard let url = endpoint.chatURL, !endpoint.apiKey.isEmpty else { throw AIError.notConfigured }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(endpoint.apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": endpoint.model,
            "messages": messages,
            "stream": true,
        ])
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw AIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            var errorData = Data()
            for try await byte in bytes { errorData.append(byte) }
            throw AIError.server(directErrorMessage(from: errorData, status: http.statusCode))
        }
        var received = false
        for try await line in bytes.lines {
            if line.hasPrefix("data: [DONE]") { break }
            if let text = AIPrompt.sseDeltaText(fromLine: line) {
                received = true
                await onDelta(text)
            }
        }
        if !received { throw AIError.server("AI 没有返回内容，请检查模型名称是否正确、是否支持看图。") }
    }

    /// Sends one tiny text-only question to check address, key and model.
    @MainActor
    static func testConnection(_ endpoint: AIEndpoint) async throws -> String {
        var reply = ""
        let messages: [[String: Any]] = [["role": "user", "content": "请只回复四个字：连接成功"]]
        try await streamChat(endpoint: endpoint, messages: messages) { reply += $0 }
        return reply
    }

    /// Plain-Chinese errors for OpenAI-style `{"error":{"message":…}}` replies.
    static func directErrorMessage(from data: Data, status: Int) -> String {
        var detail = ""
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let error = object["error"] as? [String: Any], let message = error["message"] as? String {
                detail = message
            } else if let message = object["message"] as? String {
                detail = message
            } else if let message = object["detail"] as? String {
                detail = message
            }
        }
        let lower = detail.lowercased()
        switch status {
        case 401: return "API Key 不正确或已失效（401）。"
        case 402: return "账户余额不足（402），请先充值。"
        case 403: return "没有权限使用这个模型（403）。" + (detail.isEmpty ? "" : "\n" + detail)
        case 404: return "找不到这个地址或模型（404），请检查服务地址和模型名称。" + (detail.isEmpty ? "" : "\n" + detail)
        case 429:
            if lower.contains("quota") || lower.contains("billing") || lower.contains("balance") {
                return "额度已用完或还没开通付费（429），请到服务商后台充值。"
            }
            return "请求太频繁（429），请稍后再试。"
        default:
            if lower.contains("image") || lower.contains("vision") || lower.contains("multimodal") {
                return "这个模型不支持看图，请换一个能看图的模型（如 gpt-5-mini、qwen-vl-max）。"
            }
            let prefix = status >= 500 ? "AI 服务出错了（\(status)）" : "请求失败（\(status)）"
            return detail.isEmpty ? prefix + "。" : prefix + "：" + detail
        }
    }

    private static func streamRequest(payload: Data) async throws -> (URLSession.AsyncBytes, URLResponse) {
        guard let base = URL(string: AIConfig.baseURL), !AIConfig.baseURL.isEmpty else { throw AIError.notConfigured }
        guard let token = AIConfig.accessToken else { throw AIError.notSignedIn }
        var request = URLRequest(url: base.appendingPathComponent("ai/llm/stream"))
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Run-Id")
        request.httpBody = payload
        return try await URLSession.shared.bytes(for: request)
    }

    private static func refreshTokens() async throws {
        guard let base = URL(string: AIConfig.baseURL), let refresh = AIConfig.refreshToken else { throw AIError.notSignedIn }
        var request = URLRequest(url: base.appendingPathComponent("users/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": refresh])
        let (data, response) = try await URLSession.shared.data(for: request)
        do {
            try storeTokens(from: data, response: response, fallbackMessage: "登录已过期，请重新登录。")
        } catch {
            AIConfig.signOut()
            throw AIError.notSignedIn
        }
    }

    static func storeTokens(from data: Data, response: URLResponse, fallbackMessage: String) throws {
        let tokens = try parseTokens(from: data, response: response, fallbackMessage: fallbackMessage)
        AIConfig.accessToken = tokens.access
        if let refresh = tokens.refresh { AIConfig.refreshToken = refresh }
    }

    /// Parses `{"status":"success","data":{"token":{access_token, refresh_token}}}`.
    static func parseTokens(from data: Data, response: URLResponse, fallbackMessage: String) throws -> (access: String, refresh: String?) {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = object["data"] as? [String: Any],
              let token = payload["token"] as? [String: Any],
              let access = token["access_token"] as? String else {
            throw AIError.server(status == 0 ? fallbackMessage : errorMessage(from: data, status: status, fallback: fallbackMessage))
        }
        return (access, token["refresh_token"] as? String)
    }

    static func errorMessage(from data: Data, status: Int, fallback: String? = nil) -> String {
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let detail = object["detail"] as? String { return friendly(detail) }
            if let message = object["message"] as? String { return friendly(message) }
        }
        switch status {
        case 401: return fallback ?? "登录已过期，请重新登录。"
        case 403: return "当前账号的套餐不能使用这个 AI 模型。"
        case 429: return "请求太频繁或额度已用完，请稍后再试。"
        case 500...599: return "服务器出错了（\(status)），请稍后再试。"
        default: return fallback ?? "请求失败（\(status)）。"
        }
    }

    static func formEncoded(_ fields: [String: String]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return fields
            .sorted { $0.key < $1.key }
            .map { key, value in
                "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
            }
            .joined(separator: "&")
    }
}
