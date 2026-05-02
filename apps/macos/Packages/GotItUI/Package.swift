// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "GotItUI",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "GotItUI", targets: ["GotItUI"]),
    ],
    dependencies: [
        .package(path: "../GotItModels"),
        .package(path: "../GotItInfra"),
    ],
    targets: [
        .target(name: "GotItUI", dependencies: ["GotItModels", "GotItInfra"]),
        .testTarget(name: "GotItUITests", dependencies: ["GotItUI", "GotItModels", "GotItInfra"]),
    ]
)
