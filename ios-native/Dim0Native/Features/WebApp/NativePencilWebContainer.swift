import PencilKit
import UIKit
import WebKit

/// Hosts Dim0's web app and a Pencil-only native drawing layer over the active board.
@MainActor
final class NativePencilWebContainer: UIView, PKCanvasViewDelegate {
    let webView: PencilAwareWebView

    private let pencilCanvas = PencilCanvasView()
    private let sessionId: String
    private var overlayFrame = CGRect.zero
    private var acknowledgedStrokeIds = Set<String>()
    private var inFlightStrokeIds = Set<String>()
    private var pendingStrokes: [String: NativeCompletedInkStroke]
    private var isUsingTool = false
    private var lastDoubleTapAt = Date.distantPast
    private var contextId = ""
    private var storedColor = "#1F1F24"

    var onPencilDoubleTap: (() -> Void)?

    init(webView: PencilAwareWebView) {
        self.webView = webView
        self.sessionId = Self.persistentSessionId()
        self.pendingStrokes = Self.loadPendingStrokes()
        super.init(frame: .zero)
        configureViews()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// Keeps the web application full-screen and positions native ink over its canvas surface only.
    override func layoutSubviews() {
        super.layoutSubviews()
        webView.frame = bounds
        pencilCanvas.frame = overlayFrame.intersection(bounds)
    }

    /// Applies the web tool state and canvas rectangle without putting networking in the local ink path.
    func configurePencil(
        enabled: Bool,
        frame: CGRect,
        color: UIColor,
        contextId: String,
        storedColor: String,
        width: CGFloat
    ) {
        overlayFrame = frame
        self.contextId = contextId
        self.storedColor = storedColor
        pencilCanvas.tool = PKInkingTool(.pen, color: color, width: width)
        pencilCanvas.isHidden = !enabled || frame.isEmpty
        pencilCanvas.isUserInteractionEnabled = enabled && !frame.isEmpty
        setNeedsLayout()

        if enabled {
            submitCompletedStrokes()
        }
    }

    /// Hides native input while a page navigation replaces the active Dim0 canvas.
    func disablePencil() {
        pencilCanvas.isHidden = true
        pencilCanvas.isUserInteractionEnabled = false
    }

    /// Defers clearing acknowledged strokes while a newer Pencil gesture is still rendering.
    func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
        isUsingTool = true
    }

    /// Records the finished stroke before submitting it to the active web canvas.
    func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
        isUsingTool = false
        var addedPendingStroke = false
        for pencilStroke in canvasView.drawing.strokes {
            guard let stroke = PencilStrokeExporter.exportStroke(pencilStroke, origin: .zero) else {
                continue
            }
            guard pendingStrokes[stroke.id] == nil else { continue }
            pendingStrokes[stroke.id] = NativeCompletedInkStroke(
                sessionId: sessionId,
                contextId: contextId,
                stroke: NativeInkStroke(
                    id: stroke.id,
                    tool: stroke.tool,
                    color: storedColor,
                    width: stroke.width,
                    opacity: stroke.opacity,
                    points: stroke.points
                )
            )
            addedPendingStroke = true
        }
        if addedPendingStroke { persistPendingStrokes() }
        removeAcknowledgedStrokes()
        submitCompletedStrokes()
    }

    /// Installs the web and native layers while keeping their rendering paths independent.
    private func configureViews() {
        addSubview(webView)

        pencilCanvas.delegate = self
        pencilCanvas.backgroundColor = .clear
        pencilCanvas.isOpaque = false
        pencilCanvas.drawingPolicy = .pencilOnly
        pencilCanvas.isScrollEnabled = false
        pencilCanvas.bounces = false
        pencilCanvas.alwaysBounceHorizontal = false
        pencilCanvas.alwaysBounceVertical = false
        pencilCanvas.isHidden = true
        pencilCanvas.isUserInteractionEnabled = false
        pencilCanvas.onPencilDoubleTap = { [weak self] in
            self?.forwardPencilDoubleTap()
        }
        addSubview(pencilCanvas)

        webView.onPencilDoubleTap = { [weak self] in
            self?.forwardPencilDoubleTap()
        }
    }

    /// Coalesces the two nested Pencil interactions into one shared tool toggle.
    private func forwardPencilDoubleTap() {
        let now = Date()
        guard now.timeIntervalSince(lastDoubleTapAt) > 0.3 else { return }
        lastDoubleTapAt = now
        onPencilDoubleTap?()
    }

    /// Retries only stroke identifiers recorded by the end-of-tool delegate callback.
    private func submitCompletedStrokes() {
        for message in pendingStrokes.values {
            guard message.contextId == contextId,
                  !inFlightStrokeIds.contains(message.stroke.id) else {
                continue
            }
            submit(message)
        }
    }

    /// Dispatches one sampled stroke to JavaScript and waits for synchronous store acceptance.
    private func submit(_ message: NativeCompletedInkStroke) {
        guard let data = try? JSONEncoder().encode(message),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        inFlightStrokeIds.insert(message.stroke.id)
        let script = """
        (() => {
          const detail = \(json);
          detail.handled = false;
          window.dispatchEvent(new CustomEvent('dim0:native-pencil-stroke', { detail }));
          return detail.handled === true;
        })();
        """
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.inFlightStrokeIds.remove(message.stroke.id)
                guard result as? Bool == true else { return }
                self.pendingStrokes.removeValue(forKey: message.stroke.id)
                self.persistPendingStrokes()
                self.acknowledgedStrokeIds.insert(message.stroke.id)
                if !self.isUsingTool {
                    self.removeAcknowledgedStrokes()
                }
            }
        }
    }

    /// Removes acknowledged strokes only while no newer Pencil gesture is in progress.
    private func removeAcknowledgedStrokes() {
        guard !acknowledgedStrokeIds.isEmpty else { return }
        let removedIds = acknowledgedStrokeIds
        acknowledgedStrokeIds.removeAll()
        let remaining = pencilCanvas.drawing.strokes.filter { stroke in
            guard let id = PencilStrokeExporter.exportStroke(stroke, origin: .zero)?.id else {
                return true
            }
            return !removedIds.contains(id)
        }
        pencilCanvas.drawing = PKDrawing(strokes: remaining)
    }

    /// Persists the small failure outbox so an app restart cannot discard completed Pencil input.
    private func persistPendingStrokes() {
        // ponytail: UserDefaults is enough for the normally empty queue; move to a file if offline drawing is added.
        let messages = pendingStrokes.values.sorted { $0.stroke.id < $1.stroke.id }
        if messages.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.pendingStrokesKey)
        } else if let data = try? JSONEncoder().encode(messages) {
            UserDefaults.standard.set(data, forKey: Self.pendingStrokesKey)
        }
    }

    /// Restores strokes that were not acknowledged before the previous process exited.
    private static func loadPendingStrokes() -> [String: NativeCompletedInkStroke] {
        guard let data = UserDefaults.standard.data(forKey: pendingStrokesKey),
              let messages = try? JSONDecoder().decode([NativeCompletedInkStroke].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: messages.map { ($0.stroke.id, $0) })
    }

    /// Returns the stable installation session used to derive idempotent web node identifiers.
    private static func persistentSessionId() -> String {
        let key = "dim0.native-sync.session-id"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let created = UUID().uuidString.lowercased()
        UserDefaults.standard.set(created, forKey: key)
        return created
    }

    private static let pendingStrokesKey = "dim0.native-pencil.pending-strokes-v1"
}


extension UIColor {
    /// Parses the strict six-digit color contract sent by the Dim0 web canvas.
    convenience init?(dim0Hex value: String) {
        let hex = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6, let rgb = UInt64(hex, radix: 16) else { return nil }
        self.init(
            red: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}
