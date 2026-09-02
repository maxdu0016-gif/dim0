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
}
