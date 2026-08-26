import SwiftUI

@main
struct Dim0NativeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var canvasModel = CanvasViewModel()

    var body: some Scene {
        WindowGroup {
            CanvasScreen(model: canvasModel)
                .preferredColorScheme(.light)
                .onChange(of: scenePhase) { _, phase in
                    guard phase != .active else { return }
                    canvasModel.persistImmediately()
                }
        }
    }
}
