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
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.2.0"),
    ],
    targets: [
        .target(
            name: "GotItInfra",
            dependencies: [
                "GotItModels",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ]
        ),
        .testTarget(
            name: "GotItInfraTests",
            dependencies: ["GotItInfra"]
        ),
    ]
)
