import SwiftUI

struct Dim0WebAppScreen: View {
    @StateObject private var model = Dim0WebAppModel()

    var body: some View {
        ZStack {
            Dim0WebView(model: model)
                .ignoresSafeArea()

            if model.isLoading {
                ProgressView("正在打开完整 Dim0…")
                    .padding(.horizontal, 22)
                    .padding(.vertical, 16)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            if let errorMessage = model.errorMessage {
                ContentUnavailableView {
                    Label("无法打开 Dim0", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("重新加载") {
                        model.loadApp()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(32)
                .background(.regularMaterial)
            }
        }
        .background(Color(uiColor: .systemBackground))
    }
}
