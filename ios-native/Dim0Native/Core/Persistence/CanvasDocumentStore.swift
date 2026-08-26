import Foundation

actor CanvasDocumentStore {
    enum StoreError: Error {
        case applicationSupportUnavailable
    }

    private let fileManager: FileManager
    private let baseDirectory: URL?

    init(fileManager: FileManager = .default, baseDirectory: URL? = nil) {
        self.fileManager = fileManager
        self.baseDirectory = baseDirectory
    }

    /// Loads the PencilKit document bytes saved on this device, if present.
    func load() throws -> Data? {
        let fileURL = try documentURL()
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        return try Data(contentsOf: fileURL)
    }

    /// Atomically replaces the local PencilKit document without touching the UI thread.
    func save(_ data: Data) throws {
        let fileURL = try documentURL()
        try fileManager.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: fileURL, options: .atomic)
    }

    /// Removes the local document after the user confirms a destructive clear action.
    func remove() throws {
        let fileURL = try documentURL()
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        try fileManager.removeItem(at: fileURL)
    }

    private func documentURL() throws -> URL {
        if let baseDirectory {
            return baseDirectory.appendingPathComponent("canvas-v1.drawing", isDirectory: false)
        }

        guard let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw StoreError.applicationSupportUnavailable
        }

        return applicationSupport
            .appendingPathComponent("Dim0", isDirectory: true)
            .appendingPathComponent("canvas-v1.drawing", isDirectory: false)
    }
}

