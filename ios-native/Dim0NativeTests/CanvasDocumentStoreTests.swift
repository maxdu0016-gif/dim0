import Foundation
import XCTest
@testable import Dim0Native

final class CanvasDocumentStoreTests: XCTestCase {
    func testDocumentRoundTrip() async throws {
        let temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let store = CanvasDocumentStore(baseDirectory: temporaryDirectory)
        let expected = Data([0x44, 0x49, 0x4D, 0x30])

        try await store.save(expected)

        let actual = try await store.load()
        XCTAssertEqual(actual, expected)
    }

    func testMissingDocumentLoadsAsNil() async throws {
        let temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = CanvasDocumentStore(baseDirectory: temporaryDirectory)

        let data = try await store.load()

        XCTAssertNil(data)
    }
}
