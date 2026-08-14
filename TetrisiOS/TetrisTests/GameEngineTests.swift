import XCTest
@testable import Tetris

@MainActor
final class GameEngineTests: XCTestCase {

    private func freshEngine() -> GameEngine {
        let engine = GameEngine()
        engine.start()
        return engine
    }

    func testSpawnQueueAndBagRandomizer() {
        let engine = freshEngine()
        XCTAssertNotNil(engine.current)
        XCTAssertEqual(engine.nextQueue.count, 5)
        // First 7 pieces (current + next 5 + refill) must come from a 7-bag:
        // the current piece plus queue must have no duplicates beyond bag boundaries.
        var seen = Set<PieceType>()
        var pieces = [engine.current!.type]
        pieces.append(contentsOf: engine.nextQueue)
        for piece in pieces.prefix(7) {
            XCTAssertFalse(seen.contains(piece), "7-bag must not repeat within first 7 pieces")
            seen.insert(piece)
        }
    }

    func testHardDropLocksAndSpawnsNext() {
        let engine = freshEngine()
        let firstType = engine.current!.type
        let nextType = engine.nextQueue.first!
        engine.hardDrop()
        let settled = engine.board.flatMap { $0 }.compactMap { $0 }
        XCTAssertEqual(settled.count, 4)
        XCTAssertEqual(settled.first, firstType)
        XCTAssertEqual(engine.current?.type, nextType)
    }

    func testSingleLineClearScoresAndCollapses() {
        let engine = freshEngine()
        // Fill bottom row except columns 3-6, drop a flat I piece into the gap.
        for x in [0, 1, 2, 7, 8, 9] {
            engine.board[GameEngine.height - 1][x] = .j
        }
        engine.current = Piece(type: .i, rotation: 0, x: 3, y: 0)
        let scoreBefore = engine.score
        engine.hardDrop()

        let expectation = expectation(description: "line collapse")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { expectation.fulfill() }
        wait(for: [expectation], timeout: 2)

        XCTAssertEqual(engine.lines, 1)
        XCTAssertTrue(engine.board[GameEngine.height - 1].allSatisfy { $0 == nil })
        // 100 * level + hard-drop distance * 2
        XCTAssertGreaterThanOrEqual(engine.score - scoreBefore, 100)
    }

    func testTetrisClearScores800() {
        let engine = freshEngine()
        for row in (GameEngine.height - 4)..<GameEngine.height {
            for x in 0..<(GameEngine.width - 1) {
                engine.board[row][x] = .j
            }
        }
        // Vertical I piece in the last column.
        engine.current = Piece(type: .i, rotation: 1, x: GameEngine.width - 3, y: 0)
        engine.hardDrop()

        let expectation = expectation(description: "tetris collapse")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { expectation.fulfill() }
        wait(for: [expectation], timeout: 2)

        XCTAssertEqual(engine.lines, 4)
        XCTAssertTrue(engine.lastClearWasTetris)
        XCTAssertGreaterThanOrEqual(engine.score, 800)
        XCTAssertTrue(engine.board.allSatisfy { row in row.allSatisfy { $0 == nil } })
    }

    func testLevelAdvancesEveryTenLines() {
        let engine = freshEngine()
        engine.lines = 9
        XCTAssertEqual(engine.level, 1)
        for x in [0, 1, 2, 7, 8, 9] {
            engine.board[GameEngine.height - 1][x] = .j
        }
        engine.current = Piece(type: .i, rotation: 0, x: 3, y: 0)
        engine.hardDrop()
        let expectation = expectation(description: "collapse")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { expectation.fulfill() }
        wait(for: [expectation], timeout: 2)
        XCTAssertEqual(engine.lines, 10)
        XCTAssertEqual(engine.level, 2)
    }

    func testWallKickRotationNearWall() {
        let engine = freshEngine()
        // T piece flush against the left wall, rotation should kick it inward.
        engine.current = Piece(type: .t, rotation: 1, x: -1, y: 5)
        engine.rotate(clockwise: true)
        let piece = engine.current!
        XCTAssertEqual(piece.rotation, 2)
        for (x, _) in piece.cells {
            XCTAssertGreaterThanOrEqual(x, 0)
        }
    }

    func testMovementBlockedByWalls() {
        let engine = freshEngine()
        engine.current = Piece(type: .o, rotation: 0, x: -1, y: 5)  // O occupies cols 0-1
        XCTAssertFalse(engine.tryMove(dx: -1, dy: 0))
        XCTAssertTrue(engine.tryMove(dx: 1, dy: 0))
    }

    func testHoldSwapsPieceOncePerDrop() {
        let engine = freshEngine()
        let firstType = engine.current!.type
        let nextType = engine.nextQueue.first!
        engine.hold()
        XCTAssertEqual(engine.holdPiece, firstType)
        XCTAssertEqual(engine.current?.type, nextType)
        let typeBeforeSecondHold = engine.current?.type
        engine.hold()  // Should be a no-op until next lock.
        XCTAssertEqual(engine.current?.type, typeBeforeSecondHold)
        XCTAssertEqual(engine.holdPiece, firstType)
    }

    func testGhostLandsOnStack() {
        let engine = freshEngine()
        for x in 0..<GameEngine.width {
            engine.board[GameEngine.height - 1][x] = .j
        }
        engine.current = Piece(type: .o, rotation: 0, x: 0, y: 0)
        let ghost = engine.ghost!
        let maxY = ghost.cells.map(\.1).max()!
        XCTAssertEqual(maxY, GameEngine.height - 2)
    }

    func testTopOutEndsGame() {
        let engine = freshEngine()
        for row in 0..<GameEngine.height {
            for x in 0..<GameEngine.width where x != 9 {
                engine.board[row][x] = .j
            }
        }
        engine.current = Piece(type: .o, rotation: 0, x: 0, y: 0)
        engine.nextQueue.insert(.o, at: 0)
        engine.hardDrop()
        XCTAssertEqual(engine.phase, .gameOver)
    }

    func testAddGarbageInsertsRowsWithHole() {
        let engine = freshEngine()
        engine.board[GameEngine.height - 1][0] = .j
        engine.addGarbage(2)
        let bottomTwo = Array(engine.board.suffix(2))
        for row in bottomTwo {
            XCTAssertEqual(row.filter { $0 == nil }.count, 1, "garbage row must have one hole")
        }
        XCTAssertEqual(engine.board[GameEngine.height - 3][0], .j, "stack must shift up")
    }
}
