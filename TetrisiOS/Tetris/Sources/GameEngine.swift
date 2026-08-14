import SwiftUI
import Combine

@MainActor
final class GameEngine: ObservableObject {
    static let width = 10
    static let height = 20

    enum Phase { case ready, playing, paused, gameOver }

    @Published var board: [[PieceType?]] = Array(
        repeating: Array(repeating: nil, count: width), count: height)
    @Published var current: Piece?
    @Published var holdPiece: PieceType?
    @Published var nextQueue: [PieceType] = []
    @Published var phase: Phase = .ready
    @Published var score = 0
    @Published var lines = 0
    @Published var level = 1
    @Published var highScore = UserDefaults.standard.integer(forKey: "highScore")
    @Published var clearingRows: Set<Int> = []
    @Published var lastClearWasTetris = false
    @Published var comboCount = -1

    private var bag: [PieceType] = []
    private var canHold = true
    private var timer: AnyCancellable?
    private var gravityAccumulator: TimeInterval = 0
    private var lockTimer: TimeInterval = 0
    private var isOnGround = false
    private var lockResets = 0
    private var lastTick = Date()

    private var gravityInterval: TimeInterval {
        // Guideline-ish gravity curve.
        max(0.05, pow(0.8 - Double(level - 1) * 0.007, Double(level - 1)))
    }

    // MARK: - Lifecycle

    func start() {
        board = Array(repeating: Array(repeating: nil, count: Self.width), count: Self.height)
        score = 0
        lines = 0
        level = 1
        comboCount = -1
        holdPiece = nil
        canHold = true
        bag = []
        nextQueue = []
        clearingRows = []
        refillQueue()
        spawnNext()
        phase = .playing
        lastTick = Date()
        timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.tick() }
    }

    func togglePause() {
        if phase == .playing {
            phase = .paused
        } else if phase == .paused {
            phase = .playing
            lastTick = Date()
        }
    }

    private func endGame() {
        phase = .gameOver
        timer?.cancel()
        if score > highScore {
            highScore = score
            UserDefaults.standard.set(score, forKey: "highScore")
        }
        Haptics.gameOver()
    }

    // MARK: - Tick

    private func tick() {
        guard phase == .playing, current != nil else { return }
        let now = Date()
        let dt = min(now.timeIntervalSince(lastTick), 0.25)
        lastTick = now

        if grounded() {
            if !isOnGround { isOnGround = true; lockTimer = 0 }
            lockTimer += dt
            if lockTimer >= 0.5 || lockResets >= 15 {
                lockCurrent()
                return
            }
        } else {
            isOnGround = false
            gravityAccumulator += dt
            while gravityAccumulator >= gravityInterval {
                gravityAccumulator -= gravityInterval
                _ = tryMove(dx: 0, dy: 1)
            }
        }
    }

    // MARK: - Queue / spawn

    private func refillQueue() {
        while nextQueue.count < 5 {
            if bag.isEmpty { bag = PieceType.allCases.shuffled() }
            nextQueue.append(bag.removeFirst())
        }
    }

    private func spawnNext() {
        refillQueue()
        let type = nextQueue.removeFirst()
        refillQueue()
        var piece = Piece.spawn(type, boardWidth: Self.width)
        if collides(piece) {
            piece.y -= 1
            if collides(piece) {
                current = piece
                endGame()
                return
            }
        }
        current = piece
        canHold = true
        gravityAccumulator = 0
        lockTimer = 0
        lockResets = 0
        isOnGround = false
    }

    // MARK: - Collision

    private func collides(_ piece: Piece) -> Bool {
        for (x, y) in piece.cells {
            if x < 0 || x >= Self.width || y >= Self.height { return true }
            if y >= 0, board[y][x] != nil { return true }
        }
        return false
    }

    private func grounded() -> Bool {
        guard var p = current else { return false }
        p.y += 1
        return collides(p)
    }

    // MARK: - Player actions

    @discardableResult
    func tryMove(dx: Int, dy: Int) -> Bool {
        guard phase == .playing, var p = current else { return false }
        p.x += dx
        p.y += dy
        guard !collides(p) else { return false }
        current = p
        if dx != 0, isOnGround, lockResets < 15 {
            lockTimer = 0
            lockResets += 1
        }
        if dx != 0 { Haptics.move() }
        return true
    }

    func rotate(clockwise: Bool) {
        guard phase == .playing, let p = current else { return }
        let from = p.rotation
        let to = (p.rotation + (clockwise ? 1 : 3)) % 4
        for (kx, ky) in SRS.kicks(type: p.type, from: from, to: to) {
            var candidate = p
            candidate.rotation = to
            candidate.x += kx
            candidate.y += ky
            if !collides(candidate) {
                current = candidate
                if isOnGround, lockResets < 15 {
                    lockTimer = 0
                    lockResets += 1
                }
                Haptics.rotate()
                return
            }
        }
    }

    func softDrop() {
        if tryMove(dx: 0, dy: 1) { score += 1 }
    }

    func hardDrop() {
        guard phase == .playing, var p = current else { return }
        var distance = 0
        while true {
            var next = p
            next.y += 1
            if collides(next) { break }
            p = next
            distance += 1
        }
        current = p
        score += distance * 2
        Haptics.hardDrop()
        lockCurrent()
    }

    func hold() {
        guard phase == .playing, canHold, let p = current else { return }
        canHold = false
        let previous = holdPiece
        holdPiece = p.type
        if let previous {
            var piece = Piece.spawn(previous, boardWidth: Self.width)
            if collides(piece) { piece.y -= 1 }
            current = piece
        } else {
            spawnNext()
            canHold = false
        }
        gravityAccumulator = 0
        lockTimer = 0
        isOnGround = false
        Haptics.rotate()
    }

    var ghost: Piece? {
        guard var p = current else { return nil }
        while true {
            var next = p
            next.y += 1
            if collides(next) { break }
            p = next
        }
        return p
    }

    // MARK: - Locking & clearing

    private func lockCurrent() {
        guard let p = current else { return }
        var topOut = true
        for (x, y) in p.cells {
            if y >= 0 {
                board[y][x] = p.type
                topOut = false
            }
        }
        current = nil
        if topOut {
            endGame()
            return
        }
        clearLines()
    }

    private func clearLines() {
        let full = (0..<Self.height).filter { row in board[row].allSatisfy { $0 != nil } }
        guard !full.isEmpty else {
            comboCount = -1
            spawnNext()
            return
        }
        comboCount += 1
        clearingRows = Set(full)
        lastClearWasTetris = full.count == 4
        Haptics.lineClear(count: full.count)

        let base: Int
        switch full.count {
        case 1: base = 100
        case 2: base = 300
        case 3: base = 500
        default: base = 800
        }
        score += base * level + max(0, comboCount) * 50 * level
        lines += full.count
        level = lines / 10 + 1

        // Brief pause for clear animation, then collapse.
        phase = .paused
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self else { return }
            var newBoard = self.board.enumerated()
                .filter { !full.contains($0.offset) }
                .map { $0.element }
            while newBoard.count < Self.height {
                newBoard.insert(Array(repeating: nil, count: Self.width), at: 0)
            }
            self.board = newBoard
            self.clearingRows = []
            self.phase = .playing
            self.lastTick = Date()
            self.spawnNext()
        }
    }
}
