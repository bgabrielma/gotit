import Testing
@testable import GotItInfra

@Suite struct ResolveCollisionTests {
    @Test func returnsCandidateWhenUnique() {
        #expect(resolveCollision(existing: ["a.md", "b.md"], candidate: "c.md") == "c.md")
    }
    @Test func appendsSuffixWhenCollides() {
        #expect(resolveCollision(existing: ["c.md"], candidate: "c.md") == "c-1.md")
    }
    @Test func incrementsUntilUnique() {
        #expect(resolveCollision(existing: ["c.md", "c-1.md", "c-2.md"], candidate: "c.md") == "c-3.md")
    }
    @Test func handlesNoExtension() {
        #expect(resolveCollision(existing: ["c"], candidate: "c") == "c-1")
    }
    @Test func caseInsensitive() {
        #expect(resolveCollision(existing: ["FOO.md"], candidate: "foo.md") == "foo-1.md")
    }
}
