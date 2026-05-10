// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "GotItInfra",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItInfra", targets: ["GotItInfra"]),
    ],
    dependencies: [
        .package(path: "../GotItModels"),
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", .upToNextMinor(from: "1.15.0")),
    ],
    targets: [
        .target(
            name: "GotItInfra",
            dependencies: [
                "GotItModels",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ],
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
            ]
        ),
        .testTarget(
            name: "GotItInfraTests",
            dependencies: ["GotItInfra"]
        ),
    ]
)
