import Foundation

struct Opponent {
    var board: [[Int]] = Array(repeating: Array(repeating: 0, count: GameEngine.width),
                               count: GameEngine.height)
    var score = 0
    var lines = 0
    var gameOver = false
    var left = false
}

@MainActor
final class MultiplayerClient: ObservableObject {
    enum MatchState { case idle, connecting, waiting, playing }

    @Published var state: MatchState = .idle
    @Published var playerID = -1
    @Published var opponents: [Int: Opponent] = [:]

    var onGarbage: ((Int) -> Void)?
    var onMatched: (() -> Void)?

    var allOpponentsOut: Bool {
        !opponents.isEmpty && opponents.values.allSatisfy { $0.gameOver || $0.left }
    }

    var sortedOpponentIDs: [Int] { opponents.keys.sorted() }

    private var task: URLSessionWebSocketTask?

    func connect(url: URL = URL(string: "ws://127.0.0.1:8765")!) {
        guard state == .idle else { return }
        state = .connecting
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        receive()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        state = .idle
        playerID = -1
        opponents = [:]
    }

    func sendState(board: [[Int]], score: Int, lines: Int) {
        send(["type": "state", "board": board, "score": score, "lines": lines])
    }

    func sendGarbage(_ count: Int) {
        guard count > 0 else { return }
        send(["type": "garbage", "count": count])
    }

    func sendGameOver(score: Int) {
        send(["type": "gameOver", "score": score])
    }

    private func send(_ payload: [String: Any]) {
        guard state == .playing || state == .waiting,
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { _ in }
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            Task { @MainActor in
                switch result {
                case .failure:
                    if self.state != .idle {
                        for id in self.opponents.keys { self.opponents[id]?.left = true }
                    }
                case .success(let message):
                    if case .string(let text) = message,
                       let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handle(json)
                    }
                    self.receive()
                }
            }
        }
    }

    private func handle(_ json: [String: Any]) {
        switch json["type"] as? String {
        case "waiting":
            state = .waiting
        case "matched":
            playerID = json["you"] as? Int ?? -1
            opponents = [:]
            for id in json["peers"] as? [Int] ?? [] {
                opponents[id] = Opponent()
            }
            state = .playing
            onMatched?()
        case "state":
            guard let from = json["from"] as? Int else { return }
            if let board = json["board"] as? [[Int]] { opponents[from]?.board = board }
            if let score = json["score"] as? Int { opponents[from]?.score = score }
            if let lines = json["lines"] as? Int { opponents[from]?.lines = lines }
        case "garbage":
            if let count = json["count"] as? Int { onGarbage?(count) }
        case "gameOver":
            if let from = json["from"] as? Int { opponents[from]?.gameOver = true }
        case "opponentLeft":
            if let from = json["from"] as? Int { opponents[from]?.left = true }
        default:
            break
        }
    }
}
