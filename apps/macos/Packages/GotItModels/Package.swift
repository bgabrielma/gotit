// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "GotItModels",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItModels", targets: ["GotItModels"]),
    ],
    targets: [
        .target(name: "GotItModels"),
        .testTarget(name: "GotItModelsTests", dependencies: ["GotItModels"]),
    ]
)
