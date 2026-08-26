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
    @Published private(set) var localSyncState: LocalSyncServer.State = .starting
    @Published private(set) var connectedComputerCount = 0
    @Published private(set) var lastSyncMessage = "尚未同步"

    let canvasView = PencilCanvasView()

    private let store: CanvasDocumentStore
    private let syncServer: LocalSyncServer
    private let syncSessionId: String
    private var pendingSave: Task<Void, Never>?
    private var toolBeforeEraser: CanvasTool = .pen
    private var didCenterInitialViewport = false
    private var syncRevision = 0

    init(
        store: CanvasDocumentStore = CanvasDocumentStore(),
        syncServer: LocalSyncServer = LocalSyncServer()
    ) {
        self.store = store
        self.syncServer = syncServer
        self.syncSessionId = Self.persistentSyncSessionId()
        super.init()
        configureCanvas()
        configureLocalSync()
        loadDocument()
    }

    var localSyncAddress: String? {
        guard case .ready(let address) = localSyncState else { return nil }
        return address
    }

    var localSyncPort: UInt16 { syncServer.port }

    var pairingCode: String { syncServer.pairingCode }

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

    /// Exports completed strokes and publishes one full, idempotent desktop snapshot.
    func syncNow() {
        syncRevision += 1
        let snapshot = PencilStrokeExporter.snapshot(
            drawing: canvasView.drawing,
            sessionId: syncSessionId,
            revision: syncRevision
        )

        do {
            let data = try JSONEncoder().encode(snapshot)
            syncServer.publish(snapshot: data)
            lastSyncMessage = connectedComputerCount > 0
                ? "已同步 \(snapshot.strokes.count) 笔"
                : "快照已准备，等待电脑连接"
        } catch {
            lastSyncMessage = "同步数据生成失败"
        }
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
        canvasView.contentSize = CanvasGeometry.contentSize
        canvasView.contentInsetAdjustmentBehavior = .never
        canvasView.delaysContentTouches = false
        canvasView.onPencilDoubleTap = { [weak self] in
            self?.toggleEraser()
        }
        applySelectedTool()
    }

    private func configureLocalSync() {
        syncServer.onStateChange = { [weak self] state in
            self?.localSyncState = state
        }
        syncServer.onPeerCountChange = { [weak self] count in
            self?.connectedComputerCount = count
            if count > 0 {
                self?.lastSyncMessage = "电脑已连接"
            }
        }
        syncServer.onSnapshotRequested = { [weak self] in
            DispatchQueue.main.async {
                self?.syncNow()
            }
        }
        syncServer.start()
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

    private static func persistentSyncSessionId() -> String {
        let key = "dim0.native-sync.session-id"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let created = UUID().uuidString.lowercased()
        UserDefaults.standard.set(created, forKey: key)
        return created
    }
}

extension CanvasViewModel: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        updateHistoryState()
        scheduleSave()
    }
}
