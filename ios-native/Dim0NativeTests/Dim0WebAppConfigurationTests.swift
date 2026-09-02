import Foundation
import XCTest
@testable import Dim0Native

final class Dim0WebAppConfigurationTests: XCTestCase {
    /// Production navigation requires TLS, while development HTTP stays local.
    func testAllowedWebURLPolicy() throws {
        XCTAssertTrue(Dim0WebAppConfiguration.isAllowedWebURL(
            try XCTUnwrap(URL(string: "https://app.dim0.net/local/board"))
        ))
        XCTAssertTrue(Dim0WebAppConfiguration.isAllowedWebURL(
            try XCTUnwrap(URL(string: "http://192.168.1.20:5175"))
        ))
        XCTAssertTrue(Dim0WebAppConfiguration.isAllowedWebURL(
            try XCTUnwrap(URL(string: "http://dim0.local:5175"))
        ))
        XCTAssertFalse(Dim0WebAppConfiguration.isAllowedWebURL(
            try XCTUnwrap(URL(string: "http://example.com"))
        ))
        XCTAssertFalse(Dim0WebAppConfiguration.isAllowedWebURL(
            try XCTUnwrap(URL(string: "file:///tmp/index.html"))
        ))
    }

    /// Pending native strokes retain their board context across persistence round trips.
    func testCompletedStrokeRoundTrip() throws {
        let message = NativeCompletedInkStroke(
            sessionId: "ad7dbd1d-7235-49c9-854f-c00613504eae",
            contextId: "board:folder",
            stroke: NativeInkStroke(
                id: String(repeating: "a", count: 64),
                tool: .pen,
                color: "#123456",
                width: 5,
                opacity: 1,
                points: [NativeInkPoint(x: 1, y: 2, pressure: 0.5)]
            )
        )

        let restored = try JSONDecoder().decode(
            NativeCompletedInkStroke.self,
            from: JSONEncoder().encode(message)
        )

        XCTAssertEqual(restored, message)
    }
}
