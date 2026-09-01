import Foundation

struct NativeInkPoint: Codable, Equatable, Sendable {
    let x: Double
    let y: Double
    let pressure: Double
}

struct NativeInkStroke: Codable, Equatable, Sendable {
    enum Tool: String, Codable, Sendable {
        case pen
        case highlighter
    }

    let id: String
    let tool: Tool
    let color: String
    let width: Double
    let opacity: Double
    let points: [NativeInkPoint]
}

struct NativeInkSnapshot: Codable, Equatable, Sendable {
    let kind = "dim0.native-ink.snapshot"
    let version = 1
    let sessionId: String
    let revision: Int
    let strokes: [NativeInkStroke]
}

/// Versioned one-stroke handoff sent after PencilKit finishes a tool gesture.
struct NativeCompletedInkStroke: Codable, Equatable, Sendable {
    let kind = "dim0.native-pencil.stroke"
    let version = 1
    let sessionId: String
    let contextId: String
    let stroke: NativeInkStroke
}
