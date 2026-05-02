import XCTest

final class PanelSmokeTests: XCTestCase {
    func testHotkeyOpensPanelAndSendsHello() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["GOTIT_BACKEND_LIVE"] == "1",
                          "skipped unless GOTIT_BACKEND_LIVE=1 (developer runs backend separately)")
        let app = XCUIApplication()
        app.launchEnvironment["GotItBackendURL"] = "http://localhost:3000"
        app.launch()

        // Hotkey synthesis is unreliable in XCUITest; poke the status item by title instead.
        let menuBar = XCUIApplication(bundleIdentifier: "com.apple.controlcenter").menuBars.firstMatch
        menuBar.statusItems["GotIt!"].click()

        let textField = app.textFields["Ask anything…"]
        XCTAssertTrue(textField.waitForExistence(timeout: 3))
        textField.typeText("hi\n")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'hi'")).firstMatch
            .waitForExistence(timeout: 5))
    }
}
