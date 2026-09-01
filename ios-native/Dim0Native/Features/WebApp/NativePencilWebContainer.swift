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
    private var completedStrokeIds = Set<String>()
    private var contextIdsByStrokeId: [String: String] = [:]
    private var inFlightStrokeIds = Set<String>()
    private var storedColorsByStrokeId: [String: String] = [:]
    private var isUsingTool = false
    private var lastDoubleTapAt = Date.distantPast
    private var contextId = ""
    private var storedColor = "#1F1F24"

    var onPencilDoubleTap: (() -> Void)?

    init(webView: PencilAwareWebView) {
        self.webView = webView
        self.sessionId = Self.persistentSessionId()
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
        for pencilStroke in canvasView.drawing.strokes {
            guard let stroke = PencilStrokeExporter.exportStroke(pencilStroke, origin: .zero) else {
                continue
            }
            completedStrokeIds.insert(stroke.id)
            if contextIdsByStrokeId[stroke.id] == nil {
                contextIdsByStrokeId[stroke.id] = contextId
            }
            if storedColorsByStrokeId[stroke.id] == nil {
                storedColorsByStrokeId[stroke.id] = storedColor
            }
        }
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
        for pencilStroke in pencilCanvas.drawing.strokes {
            guard let stroke = PencilStrokeExporter.exportStroke(pencilStroke, origin: .zero),
                  completedStrokeIds.contains(stroke.id),
                  contextIdsByStrokeId[stroke.id] == contextId,
                  !inFlightStrokeIds.contains(stroke.id) else {
                continue
            }
            submit(stroke)
        }
    }

    /// Dispatches one sampled stroke to JavaScript and waits for synchronous store acceptance.
    private func submit(_ stroke: NativeInkStroke) {
        let bridgedStroke = NativeInkStroke(
            id: stroke.id,
            tool: stroke.tool,
            color: storedColorsByStrokeId[stroke.id] ?? storedColor,
            width: stroke.width,
            opacity: stroke.opacity,
            points: stroke.points
        )
        let message = NativeCompletedInkStroke(
            sessionId: sessionId,
            contextId: contextIdsByStrokeId[stroke.id] ?? contextId,
            stroke: bridgedStroke
        )
        guard let data = try? JSONEncoder().encode(message),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        inFlightStrokeIds.insert(stroke.id)
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
                self.inFlightStrokeIds.remove(stroke.id)
                guard result as? Bool == true else { return }
                self.acknowledgedStrokeIds.insert(stroke.id)
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
        completedStrokeIds.subtract(removedIds)
        for strokeId in removedIds {
            contextIdsByStrokeId.removeValue(forKey: strokeId)
            storedColorsByStrokeId.removeValue(forKey: strokeId)
        }
        let remaining = pencilCanvas.drawing.strokes.filter { stroke in
            guard let id = PencilStrokeExporter.exportStroke(stroke, origin: .zero)?.id else {
                return true
            }
            return !removedIds.contains(id)
        }
        pencilCanvas.drawing = PKDrawing(strokes: remaining)
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
