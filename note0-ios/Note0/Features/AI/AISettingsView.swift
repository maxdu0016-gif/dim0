import SwiftUI

/// Sign in / sign up, written for students: one email, one password, one
/// button. Server address and model are tucked away under "高级设置".
struct AccountForm: View {
    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "登录"
        case signUp = "注册新账号"
        var id: String { rawValue }
    }

    /// Called after a successful sign-in or sign-up.
    var onSignedIn: () -> Void = {}

    @State private var mode: Mode = .signIn
    @State private var email = AIConfig.signedInEmail ?? ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var message: String?
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSubmit: Bool {
        !isWorking && trimmedEmail.contains("@") && password.count >= (mode == .signUp ? 8 : 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: mode) { _, _ in message = nil }

            VStack(spacing: 0) {
                TextField("邮箱", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .padding(12)
                Divider()
                SecureField(mode == .signUp ? "设置密码（至少 8 位）" : "密码", text: $password)
                    .textContentType(mode == .signUp ? .newPassword : .password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { if canSubmit { Task { await submit() } } }
                    .padding(12)
            }
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

            if let message {
                Label(message, systemImage: "exclamationmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await submit() }
            } label: {
                HStack {
                    Spacer()
                    if isWorking {
                        ProgressView().tint(.white)
                    } else {
                        Text(mode == .signIn ? "登录" : "注册并登录")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
                .frame(height: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canSubmit)

            Text(mode == .signIn
                 ? "和 note0 网页版是同一个账号。没有账号？点上面的“注册新账号”。"
                 : "注册后就能直接使用 AI 讲解、整理和出题。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func submit() async {
        guard canSubmit else { return }
        isWorking = true
        message = nil
        defer { isWorking = false }
        do {
            switch mode {
            case .signIn: try await AIClient.signIn(email: trimmedEmail, password: password)
            case .signUp: try await AIClient.signUp(email: trimmedEmail, password: password)
            }
            password = ""
            onSignedIn()
        } catch {
            message = AIClient.describe(error)
        }
    }
}

/// The account screen opened from the bookshelf.
struct AISettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var signedInEmail = AIConfig.isSignedIn ? AIConfig.signedInEmail : nil
    @State private var showAdvanced = false
    @State private var customServer = AIConfig.customBaseURL
    @State private var model = AIConfig.model
    @State private var useOwnKey = AIDirect.useOwnKey

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header

                    if AIDirect.builtIn != nil && !useOwnKey {
                        Label("AI 已经连好，不登录也能直接用", systemImage: "checkmark.seal.fill")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.green)
                    }

                    OwnKeySettings(useOwnKey: $useOwnKey)

                    if !useOwnKey {
                        if let signedInEmail {
                            signedInCard(email: signedInEmail)
                        } else if AIDirect.builtIn == nil {
                            AccountForm {
                                signedInEmail = AIConfig.signedInEmail ?? "已登录"
                            }
                        }
                    }

                    DisclosureGroup("note0 服务器设置", isExpanded: $showAdvanced) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("一般不需要改，留空就是默认服务器。只有自己部署了 note0 后端时才填写。")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            LabeledContent("服务器") {
                                TextField(AIConfig.defaultBaseURL, text: $customServer)
                                    .keyboardType(.URL)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .multilineTextAlignment(.trailing)
                            }
                            LabeledContent("AI 模型") {
                                TextField(AIConfig.defaultModel, text: $model)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        .padding(.top, 8)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                .padding(24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        saveAdvanced()
                        dismiss()
                    }
                }
            }
            .onChange(of: customServer) { _, _ in saveAdvanced() }
            .onChange(of: model) { _, _ in saveAdvanced() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "sparkles")
                .font(.system(size: 30))
                .foregroundStyle(.tint)
            Text("账号与 AI")
                .font(.title2.weight(.bold))
            Text("写笔记不需要登录。连上 AI 后可以框选笔记让 AI 讲解、整理要点、出复习题。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func signedInCard(email: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(email).font(.headline)
                Text("已登录，可以使用 AI").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("退出登录", role: .destructive) {
                AIConfig.signOut()
                signedInEmail = nil
            }
            .buttonStyle(.bordered)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func saveAdvanced() {
        AIConfig.customBaseURL = customServer
        AIConfig.model = model
    }
}

/// "使用自己的 AI Key": any OpenAI-compatible service, no note0 account needed.
struct OwnKeySettings: View {
    @Binding var useOwnKey: Bool

    @State private var provider = AIDirect.provider
    @State private var customBaseURL = AIDirect.customBaseURL
    @State private var apiKey = AIDirect.apiKey
    @State private var model = AIDirect.model
    @State private var isTesting = false
    @State private var testResult: (ok: Bool, text: String)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $useOwnKey) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("使用自己的 AI Key").font(.headline)
                    Text("填 OpenAI、通义千问等服务的 API Key，不需要 note0 账号")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            if useOwnKey {
                Picker("服务商", selection: $provider) {
                    ForEach(AIProvider.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.menu)

                VStack(spacing: 0) {
                    if provider == .custom {
                        TextField("服务地址，如 https://example.com/v1", text: $customBaseURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(12)
                        Divider()
                    }
                    SecureField(provider.keyHint, text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(12)
                    Divider()
                    TextField("模型（留空用 \(provider.defaultModel.isEmpty ? "服务商默认" : provider.defaultModel)）", text: $model)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(12)
                }
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

                HStack {
                    Button {
                        Task { await test() }
                    } label: {
                        if isTesting {
                            ProgressView()
                        } else {
                            Label("测试连接", systemImage: "bolt.horizontal")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isTesting || !AIDirect.ownEndpoint.isComplete)

                    if let testResult {
                        Label(testResult.text, systemImage: testResult.ok ? "checkmark.circle.fill" : "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(testResult.ok ? .green : .red)
                    }
                }

                Text("Key 只保存在这台 iPad 的钥匙串里。AI 会收到你框选区域的截图，所以模型要能看图。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground).opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
        .onChange(of: useOwnKey) { _, value in AIDirect.useOwnKey = value }
        .onChange(of: provider) { _, value in AIDirect.provider = value; testResult = nil }
        .onChange(of: customBaseURL) { _, value in AIDirect.customBaseURL = value; testResult = nil }
        .onChange(of: apiKey) { _, value in AIDirect.apiKey = value; testResult = nil }
        .onChange(of: model) { _, value in AIDirect.model = value; testResult = nil }
    }

    private func test() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let reply = try await AIClient.testConnection(AIDirect.ownEndpoint)
            testResult = (true, "连接成功：" + String(reply.prefix(20)))
        } catch {
            testResult = (false, AIClient.describe(error))
        }
    }
}
