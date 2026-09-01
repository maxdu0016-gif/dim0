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

    /// Lets finger gestures reach the web canvas while this overlay owns Apple Pencil strokes.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard event?.allTouches?.contains(where: { $0.type == .pencil }) == true else {
            return nil
        }
        return super.hitTest(point, with: event)
    }

    private func installPencilInteraction() {
        let pencilInteraction = UIPencilInteraction()
        pencilInteraction.delegate = self
        addInteraction(pencilInteraction)
    }
}
