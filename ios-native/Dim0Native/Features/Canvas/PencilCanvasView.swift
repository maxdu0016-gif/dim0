import PencilKit
import UIKit

final class PencilCanvasView: PKCanvasView, UIPencilInteractionDelegate {
    var onPencilDoubleTap: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        installPencilInteraction()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        installPencilInteraction()
    }

    /// Maps the Apple Pencil double-tap gesture to the model's tool toggle.
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        onPencilDoubleTap?()
    }

    private func installPencilInteraction() {
        let pencilInteraction = UIPencilInteraction()
        pencilInteraction.delegate = self
        addInteraction(pencilInteraction)
    }
}

