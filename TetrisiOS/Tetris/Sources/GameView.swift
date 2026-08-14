import SwiftUI

struct GameView: View {
    @StateObject private var engine = GameEngine()
    @State private var dragOffset: CGFloat = 0
    @State private var dragCells = 0
    @State private var didSoftDrop = false
    @FocusState private var focused: Bool

    var body: some View {
        content
            .focusable()
            .focused($focused)
            .focusEffectDisabled()
            .onAppear { focused = true }
            .onKeyPress(phases: .down) { press in
                switch press.key {
                case .leftArrow: engine.tryMove(dx: -1, dy: 0)
                case .rightArrow: engine.tryMove(dx: 1, dy: 0)
                case .downArrow: engine.softDrop()
                case .upArrow: engine.rotate(clockwise: true)
                case .space: engine.hardDrop()
                case .init("z"): engine.rotate(clockwise: false)
                case .init("c"): engine.hold()
                case .init("p"): engine.togglePause()
                case .return:
                    if engine.phase == .ready || engine.phase == .gameOver { engine.start() }
                default: return .ignored
                }
                return .handled
            }
    }

    private var content: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.05, blue: 0.10), Color(red: 0.10, green: 0.06, blue: 0.16)],
                startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()

            VStack(spacing: 12) {
                header
                HStack(alignment: .top, spacing: 8) {
                    sidePanel(title: "HOLD") {
                        MiniPieceView(type: engine.holdPiece)
                            .frame(width: 48, height: 36)
                    }
                    .frame(width: 66)
                    BoardView(engine: engine)
                        .overlay(overlayContent)
                        .gesture(playGesture)
                        .onTapGesture { engine.rotate(clockwise: true) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    sidePanel(title: "NEXT") {
                        VStack(spacing: 8) {
                            ForEach(Array(engine.nextQueue.prefix(4).enumerated()), id: \.offset) { i, t in
                                MiniPieceView(type: t, dimmed: i > 0)
                                    .frame(width: 44, height: i == 0 ? 32 : 24)
                            }
                        }
                    }
                    .frame(width: 66)
                }
                .padding(.horizontal, 8)
                controls
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 0) {
            stat("SCORE", "\(engine.score)")
            stat("LEVEL", "\(engine.level)")
            stat("LINES", "\(engine.lines)")
            stat("BEST", "\(engine.highScore)")
        }
        .padding(.horizontal, 14)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.45))
            Text(value)
                .font(.system(size: 19, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .contentTransition(.numericText())
                .animation(.snappy, value: value)
        }
        .frame(maxWidth: .infinity)
    }

    private func sidePanel<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.45))
            content()
        }
        .padding(8)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Overlays

    @ViewBuilder
    private var overlayContent: some View {
        switch engine.phase {
        case .ready:
            menuOverlay(title: "TETRIS", subtitle: "Swipe to move · Tap to rotate\nSwipe down to drop", button: "PLAY") {
                engine.start()
            }
        case .gameOver:
            menuOverlay(
                title: "GAME OVER",
                subtitle: "Score \(engine.score)" + (engine.score >= engine.highScore && engine.score > 0 ? " · New Best!" : ""),
                button: "PLAY AGAIN") {
                engine.start()
            }
        case .paused where engine.clearingRows.isEmpty:
            menuOverlay(title: "PAUSED", subtitle: "", button: "RESUME") {
                engine.togglePause()
            }
        default:
            EmptyView()
        }
    }

    private func menuOverlay(title: String, subtitle: String, button: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 16) {
            Text(title)
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(colors: [.cyan, .purple], startPoint: .leading, endPoint: .trailing))
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
            }
            Button(action: action) {
                Text(button)
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 12)
                    .background(.white, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Controls

    private var controls: some View {
        HStack(spacing: 8) {
            controlButton("arrow.left") { engine.tryMove(dx: -1, dy: 0) }
            controlButton("arrow.down") { engine.softDrop() }
            controlButton("arrow.right") { engine.tryMove(dx: 1, dy: 0) }
            controlButton("rotate.right") { engine.rotate(clockwise: true) }
            controlButton("arrow.down.to.line", prominent: true) { engine.hardDrop() }
            controlButton("tray.and.arrow.down") { engine.hold() }
            controlButton(engine.phase == .paused ? "play.fill" : "pause.fill") { engine.togglePause() }
        }
        .padding(.horizontal, 12)
    }

    private func controlButton(_ symbol: String, prominent: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(prominent ? .black : .white)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    prominent ? AnyShapeStyle(.white) : AnyShapeStyle(.white.opacity(0.08)),
                    in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonRepeatBehavior(.enabled)
    }

    // MARK: - Gestures

    private var playGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                guard engine.phase == .playing else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                if abs(dy) > abs(dx) * 1.5, dy > 30, !didSoftDrop {
                    if value.predictedEndTranslation.height > 220 {
                        didSoftDrop = true
                        engine.hardDrop()
                    } else {
                        engine.softDrop()
                    }
                    return
                }
                let cellWidth: CGFloat = 26
                let targetCells = Int((dx / cellWidth).rounded(.towardZero))
                while dragCells < targetCells {
                    if engine.tryMove(dx: 1, dy: 0) { dragCells += 1 } else { break }
                }
                while dragCells > targetCells {
                    if engine.tryMove(dx: -1, dy: 0) { dragCells -= 1 } else { break }
                }
            }
            .onEnded { _ in
                dragCells = 0
                didSoftDrop = false
            }
    }
}
