import Combine
import PencilKit
import SwiftUI

@MainActor
final class CanvasViewModel: NSObject, ObservableObject {
    enum SaveState: Equatable {
        case loading
        case saved
        case saving
        case failed

        var label: String {
            switch self {
            case .loading: "正在打开"
            case .saved: "已保存在 iPad"
            case .saving: "正在保存"
            case .failed: "保存失败"
            }
        }
    }

    @Published var selectedTool: CanvasTool = .pen {
        didSet { applySelectedTool() }
    }
    @Published var selectedColor: InkColor = .charcoal {
        didSet { applySelectedTool() }
    }
    @Published private(set) var saveState: SaveState = .loading
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false

    let canvasView = PencilCanvasView()

    private let store: CanvasDocumentStore
    private var pendingSave: Task<Void, Never>?
    private var toolBeforeEraser: CanvasTool = .pen
    private var didCenterInitialViewport = false

    init(store: CanvasDocumentStore = CanvasDocumentStore()) {
        self.store = store
        super.init()
        configureCanvas()
        loadDocument()
    }

    /// Undoes one local PencilKit action without involving sync or networking.
    func undo() {
        canvasView.undoManager?.undo()
        updateHistoryState()
        scheduleSave()
    }

    /// Redoes one local PencilKit action without involving sync or networking.
    func redo() {
        canvasView.undoManager?.redo()
        updateHistoryState()
        scheduleSave()
    }

    /// Clears the current drawing and its local persisted representation.
    func clearDrawing() {
        pendingSave?.cancel()
        canvasView.drawing = PKDrawing()
        canvasView.undoManager?.removeAllActions()
        updateHistoryState()
        saveState = .saving

        Task {
            do {
                try await store.remove()
                saveState = .saved
            } catch {
                saveState = .failed
            }
        }
    }

    /// Flushes the current document when iPadOS backgrounds the application.
    func persistImmediately() {
        pendingSave?.cancel()
        persistCurrentDrawing()
    }

    /// Centers the large PencilKit surface once, leaving later viewport changes untouched.
    func centerInitialViewportIfNeeded() {
        guard !didCenterInitialViewport, canvasView.bounds.width > 0 else { return }
        didCenterInitialViewport = true

        let offset = CGPoint(
            x: max(0, (canvasView.contentSize.width - canvasView.bounds.width) / 2),
            y: max(0, (canvasView.contentSize.height - canvasView.bounds.height) / 2)
        )
        canvasView.setContentOffset(offset, animated: false)
    }

    private func configureCanvas() {
        canvasView.delegate = self
        canvasView.backgroundColor = UIColor(red: 0.965, green: 0.957, blue: 0.93, alpha: 1)
        canvasView.isOpaque = true
        canvasView.drawingPolicy = .pencilOnly
        canvasView.minimumZoomScale = 0.3
        canvasView.maximumZoomScale = 4
        canvasView.bouncesZoom = true
        canvasView.alwaysBounceHorizontal = true
        canvasView.alwaysBounceVertical = true
        canvasView.contentSize = CGSize(width: 12_000, height: 12_000)
        canvasView.contentInsetAdjustmentBehavior = .never
        canvasView.delaysContentTouches = false
        canvasView.onPencilDoubleTap = { [weak self] in
            self?.toggleEraser()
        }
        applySelectedTool()
    }

    private func loadDocument() {
        Task {
            do {
                if let data = try await store.load() {
                    canvasView.drawing = try PKDrawing(data: data)
                }
                saveState = .saved
            } catch {
                saveState = .failed
            }
            updateHistoryState()
        }
    }

    private func applySelectedTool() {
        switch selectedTool {
        case .pen:
            canvasView.tool = PKInkingTool(.pen, color: selectedColor.uiColor, width: 4)
        case .highlighter:
            canvasView.tool = PKInkingTool(.marker, color: selectedColor.uiColor.withAlphaComponent(0.35), width: 14)
        case .eraser:
            canvasView.tool = PKEraserTool(.vector)
        }
    }

    private func toggleEraser() {
        if selectedTool == .eraser {
            selectedTool = toolBeforeEraser
        } else {
            toolBeforeEraser = selectedTool
            selectedTool = .eraser
        }
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        saveState = .saving
        pendingSave = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(550))
            guard !Task.isCancelled else { return }
            self?.persistCurrentDrawing()
        }
    }

    private func persistCurrentDrawing() {
        let data = canvasView.drawing.dataRepresentation()
        saveState = .saving

        Task {
            do {
                try await store.save(data)
                saveState = .saved
            } catch {
                saveState = .failed
            }
        }
    }

    private func updateHistoryState() {
        canUndo = canvasView.undoManager?.canUndo ?? false
        canRedo = canvasView.undoManager?.canRedo ?? false
    }
}

extension CanvasViewModel: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        updateHistoryState()
        scheduleSave()
    }
}

