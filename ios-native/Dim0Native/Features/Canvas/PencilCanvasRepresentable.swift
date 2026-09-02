import SwiftUI

struct PencilCanvasRepresentable: UIViewRepresentable {
    @ObservedObject var model: CanvasViewModel

    func makeUIView(context: Context) -> PencilCanvasView {
        model.canvasView
    }

    func updateUIView(_ canvasView: PencilCanvasView, context: Context) {
        DispatchQueue.main.async {
            model.centerInitialViewportIfNeeded()
        }
    }
}
