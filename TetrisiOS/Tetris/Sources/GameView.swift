import SwiftUI

struct GameView: View {
    @StateObject private var engine = GameEngine()
    @StateObject private var match = MultiplayerClient()
    @State private var dragCells = 0
    @State private var didSoftDrop = false
    @State private var showingInfo = false
    @State private var showingSettings = false
    @State private var feedbackVisible = false
    @State private var lockGlow = false
    @State private var vsMode = false
    @State private var matchResult: Bool?
    @AppStorage("hapticsEnabled") private var hapticsEnabled = true
    @AppStorage("leftHandedControls") private var leftHandedControls = false
    @AppStorage("themeIndex") private var themeIndex = 0
    @FocusState private var focused: Bool

    var body: some View {
        content
            .focusable()
            .focused($focused)
            .focusEffectDisabled()
            .onAppear {
                focused = true
                Haptics.enabled = hapticsEnabled
                configureMultiplayer()
            }
            .onChange(of: hapticsEnabled) { _, enabled in Haptics.enabled = enabled }
            .onChange(of: engine.feedbackID) { _, _ in showClearFeedback() }
            .onChange(of: engine.lockPulseID) { _, _ in showLockGlow() }
            .onChange(of: match.allOpponentsOut) { _, allOut in
                if allOut, vsMode, matchResult == nil, engine.phase != .gameOver {
                    matchResult = true
                    if engine.phase == .playing { engine.togglePause() }
                }
            }
            .sheet(isPresented: $showingInfo) { infoSheet }
            .sheet(isPresented: $showingSettings) { settingsSheet }
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

    private func configureMultiplayer() {
        engine.onLinesCleared = { [weak match] count in
            let garbage = [0, 1, 2, 4][min(count, 4) - 1]
            match?.sendGarbage(garbage)
        }
        engine.onPieceLocked = { [weak match, weak engine] in
            guard let engine, let match, match.state == .playing else { return }
            match.sendState(board: engine.boardCode, score: engine.score, lines: engine.lines)
        }
        engine.onGameOver = { [weak match, weak engine] in
            guard let engine, let match, match.state == .playing else { return }
            match.sendGameOver(score: engine.score)
        }
        match.onGarbage = { [weak engine] count in
            engine?.addGarbage(count)
        }
        match.onMatched = { [weak engine] in
            engine?.start()
        }
    }

    private var content: some View {
        GeometryReader { geometry in
            let safeWidth = geometry.size.width - 16
            let reservedHeight: CGFloat = 176
            let boardWidth = min(safeWidth, max(180, (geometry.size.height - reservedHeight) / 2))

            ZStack {
                background
                VStack(spacing: 6) {
                    header
                    previewRow
                    board(width: boardWidth)
                    controls
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
            }
        }
    }

    private var background: some View {
        let palettes: [[Color]] = [
            [Color(red: 0.035, green: 0.04, blue: 0.09), Color(red: 0.12, green: 0.055, blue: 0.17)],
            [Color(red: 0.015, green: 0.08, blue: 0.11), Color(red: 0.02, green: 0.16, blue: 0.17)],
            [Color(red: 0.12, green: 0.035, blue: 0.07), Color(red: 0.19, green: 0.08, blue: 0.035)]
        ]
        let palette = palettes[min(themeIndex, unlockedThemeCount - 1)]
        return ZStack {
            LinearGradient(colors: palette, startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(
                colors: [.purple.opacity(0.12), .clear],
                center: .top,
                startRadius: 20,
                endRadius: 420)
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        HStack(spacing: 5) {
            stat("SCORE", "\(engine.score)", symbol: "sparkles", color: .cyan)
            stat("LEVEL", "\(engine.level)", symbol: "speedometer", color: .purple)
            stat("LINES", "\(engine.lines)", symbol: "line.3.horizontal", color: .green)
            stat("BEST", "\(engine.highScore)", symbol: "crown.fill", color: .yellow)
            Button { showingSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 34, height: 43)
                    .foregroundStyle(.white.opacity(0.8))
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 11))
            }
            .accessibilityLabel("Settings")
        }
    }

    private func stat(_ label: String, _ value: String, symbol: String, color: Color) -> some View {
        VStack(spacing: 1) {
            HStack(spacing: 3) {
                Image(systemName: symbol)
                Text(label)
            }
            .font(.system(size: 8, weight: .bold, design: .rounded))
            .foregroundStyle(color.opacity(0.75))
            Text(value)
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .contentTransition(.numericText())
                .animation(.snappy, value: value)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 43)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(color.opacity(0.12)))
    }

    private var previewRow: some View {
        HStack(spacing: 6) {
            previewCard(title: engine.holdAvailable ? "HOLD · READY" : "HOLD · USED", accent: engine.holdAvailable ? .cyan : .gray) {
                MiniPieceView(type: engine.holdPiece, dimmed: !engine.holdAvailable)
                    .frame(width: 50, height: 30)
            }
            previewCard(title: "NEXT", accent: .purple) {
                HStack(spacing: 5) {
                    ForEach(Array(engine.nextQueue.prefix(vsMode ? 3 : 5).enumerated()), id: \.offset) { index, type in
                        MiniPieceView(type: type, dimmed: index > 0)
                            .frame(maxWidth: .infinity)
                            .frame(height: index == 0 ? 30 : 24)
                            .transition(.push(from: .trailing).combined(with: .opacity))
                    }
                }
                .animation(.snappy, value: engine.nextQueue)
            }
            if vsMode {
                ForEach(match.sortedOpponentIDs, id: \.self) { id in
                    let rival = match.opponents[id] ?? Opponent()
                    previewCard(
                        title: rival.gameOver || rival.left ? "P\(id + 1) · OUT" : "P\(id + 1) · \(rival.score)",
                        accent: rival.gameOver || rival.left ? .gray : .red
                    ) {
                        OpponentBoardView(board: rival.board)
                            .frame(width: 22, height: 30)
                            .opacity(rival.gameOver || rival.left ? 0.4 : 1)
                    }
                }
            }
            Button { showingInfo = true } label: {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 40, height: 47)
                    .foregroundStyle(.white.opacity(0.85))
                    .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 11))
            }
            .accessibilityLabel("How to play")
        }
    }

    private func previewCard<Content: View>(
        title: String,
        accent: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundStyle(accent.opacity(0.8))
            content()
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 47)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(accent.opacity(0.18)))
    }

    private func board(width: CGFloat) -> some View {
        BoardView(engine: engine)
            .frame(width: width, height: width * 2)
            .overlay {
                RoundedRectangle(cornerRadius: 10)
                    .stroke(.white.opacity(lockGlow ? 0.8 : 0), lineWidth: 3)
                    .shadow(color: .cyan.opacity(lockGlow ? 0.9 : 0), radius: 14)
            }
            .overlay(alignment: .center) { clearFeedback }
            .overlay { overlayContent }
            .gesture(playGesture(cellWidth: width / 10))
            .onTapGesture { engine.rotate(clockwise: true) }
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var clearFeedback: some View {
        if feedbackVisible, let clearKind = engine.clearKind {
            VStack(spacing: 2) {
                Text(clearKind.rawValue)
                    .font(.system(size: clearKind == .tetris ? 31 : 24, weight: .black, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(colors: [.cyan, .white, .purple], startPoint: .leading, endPoint: .trailing))
                if engine.comboCount > 0 {
                    Text("\(engine.comboCount + 1)× COMBO")
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundStyle(.yellow)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.black.opacity(0.72), in: Capsule())
            .transition(.scale.combined(with: .opacity))
        }
    }

    @ViewBuilder
    private var overlayContent: some View {
        if let matchResult {
            matchResultOverlay(won: matchResult)
        } else {
            switch engine.phase {
            case .ready:
                startOverlay
            case .gameOver:
                resultOverlay
            case .paused where engine.clearingRows.isEmpty:
                menuOverlay(title: "PAUSED", subtitle: "Take a breath", button: "RESUME") {
                    engine.togglePause()
                }
            default:
                EmptyView()
            }
        }
    }

    private var startOverlay: some View {
        VStack(spacing: 14) {
            Text("TETRIS")
                .font(.system(size: 36, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(colors: [.cyan, .purple], startPoint: .leading, endPoint: .trailing))
            Text(match.state == .waiting || match.state == .connecting
                 ? "Waiting for opponents…"
                 : "Daily goal · clear 10 lines")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.62))
            if match.state == .waiting || match.state == .connecting {
                ProgressView().tint(.white)
                Button("CANCEL") {
                    vsMode = false
                    match.disconnect()
                }
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(.white.opacity(0.7))
            } else {
                Button {
                    vsMode = false
                    engine.start()
                } label: {
                    Text("PLAY")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 38)
                        .padding(.vertical, 11)
                        .background(.white, in: Capsule())
                }
                Button {
                    vsMode = true
                    matchResult = nil
                    match.connect()
                } label: {
                    Text("VS MATCH")
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 9)
                        .background(.white.opacity(0.14), in: Capsule())
                        .overlay(Capsule().stroke(.white.opacity(0.3)))
                }
                .accessibilityLabel("Versus match")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 10))
    }

    private var rivalScoreLine: String {
        let scores = match.sortedOpponentIDs.compactMap { id -> String? in
            guard let rival = match.opponents[id] else { return nil }
            return "P\(id + 1) \(rival.score)"
        }
        return (["You \(engine.score)"] + scores).joined(separator: " · ")
    }

    private func matchResultOverlay(won: Bool) -> some View {
        VStack(spacing: 14) {
            Text(won ? "YOU WIN" : "DEFEAT")
                .font(.system(size: 33, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(
                        colors: won ? [.yellow, .orange] : [.red, .purple],
                        startPoint: .leading, endPoint: .trailing))
            Text(rivalScoreLine)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.62))
            Button("BACK TO MENU") {
                matchResult = nil
                vsMode = false
                match.disconnect()
                engine.phase = .ready
            }
            .font(.system(size: 15, weight: .heavy, design: .rounded))
            .foregroundStyle(.black)
            .padding(.horizontal, 30)
            .padding(.vertical, 11)
            .background(.white, in: Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.86), in: RoundedRectangle(cornerRadius: 10))
    }

    private func menuOverlay(title: String, subtitle: String, button: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 14) {
            Text(title)
                .font(.system(size: 36, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(colors: [.cyan, .purple], startPoint: .leading, endPoint: .trailing))
            Text(subtitle)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.62))
            Button(action: action) {
                Text(button)
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 38)
                    .padding(.vertical, 11)
                    .background(.white, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 10))
    }

    private var resultOverlay: some View {
        VStack(spacing: 12) {
            Text(vsMode ? "DEFEAT" : (engine.lastRun?.isNewBest == true ? "NEW BEST" : "GAME OVER"))
                .font(.system(size: 27, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(
                        colors: vsMode ? [.red, .purple] : [.cyan, .purple],
                        startPoint: .leading, endPoint: .trailing))
            HStack(spacing: 6) {
                resultStat("SCORE", engine.score)
                resultStat("LINES", engine.lines)
                resultStat("LEVEL", engine.level)
            }
            Text("Best lines \(engine.bestLines) · Highest level \(engine.highestLevel) · Longest combo \(engine.longestCombo)")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.58))
                .multilineTextAlignment(.center)
            Button(vsMode ? "BACK TO MENU" : "TRY AGAIN") {
                if vsMode {
                    vsMode = false
                    matchResult = nil
                    match.disconnect()
                    engine.phase = .ready
                } else {
                    engine.start()
                }
            }
            .font(.system(size: 16, weight: .heavy, design: .rounded))
            .foregroundStyle(.black)
            .padding(.horizontal, 35)
            .padding(.vertical, 11)
            .background(.white, in: Capsule())
            Text("Tap or press Return to restart")
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.42))
        }
        .padding(15)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.84), in: RoundedRectangle(cornerRadius: 10))
    }

    private func resultStat(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.system(size: 8, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.48))
            Text("\(value)").font(.system(size: 17, weight: .heavy, design: .rounded))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
    }

    private var controls: some View {
        let buttons = leftHandedControls ? leftHandedButtons : standardButtons
        return HStack(spacing: 6) {
            ForEach(buttons) { item in
                controlButton(item)
            }
        }
    }

    private struct ControlItem: Identifiable {
        let id: String
        let symbol: String
        let label: String
        let prominent: Bool
        let action: () -> Void
    }

    private var standardButtons: [ControlItem] {
        [
            ControlItem(id: "left", symbol: "arrow.left", label: "Move left", prominent: false) { engine.tryMove(dx: -1, dy: 0) },
            ControlItem(id: "down", symbol: "arrow.down", label: "Soft drop", prominent: false) { engine.softDrop() },
            ControlItem(id: "right", symbol: "arrow.right", label: "Move right", prominent: false) { engine.tryMove(dx: 1, dy: 0) },
            ControlItem(id: "rotate", symbol: "rotate.right", label: "Rotate clockwise", prominent: false) { engine.rotate(clockwise: true) },
            ControlItem(id: "drop", symbol: "arrow.down.to.line", label: "Hard drop", prominent: true) { engine.hardDrop() },
            ControlItem(id: "hold", symbol: "tray.and.arrow.down", label: engine.holdAvailable ? "Hold piece" : "Hold already used", prominent: false) { engine.hold() },
            ControlItem(id: "pause", symbol: engine.phase == .paused ? "play.fill" : "pause.fill", label: engine.phase == .paused ? "Resume" : "Pause", prominent: false) { engine.togglePause() }
        ]
    }

    private var leftHandedButtons: [ControlItem] {
        [standardButtons[5], standardButtons[4], standardButtons[3], standardButtons[0], standardButtons[1], standardButtons[2], standardButtons[6]]
    }

    private func controlButton(_ item: ControlItem) -> some View {
        Button(action: item.action) {
            Image(systemName: item.symbol)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(item.prominent ? .black : .white)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(
                    item.prominent ? AnyShapeStyle(.white) : AnyShapeStyle(.white.opacity(item.id == "pause" ? 0.14 : 0.075)),
                    in: RoundedRectangle(cornerRadius: 11))
        }
        .buttonRepeatBehavior(item.id == "left" || item.id == "right" || item.id == "down" ? .enabled : .disabled)
        .accessibilityLabel(item.label)
    }

    private func playGesture(cellWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                guard engine.phase == .playing else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                if abs(dy) > abs(dx) * 1.5, dy > 24, !didSoftDrop {
                    if value.predictedEndTranslation.height > 170 {
                        didSoftDrop = true
                        engine.hardDrop()
                    } else {
                        engine.softDrop()
                    }
                    return
                }
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

    private var infoSheet: some View {
        NavigationStack {
            List {
                Section("Touch") {
                    Label("Swipe sideways to move", systemImage: "arrow.left.and.right")
                    Label("Tap the board to rotate", systemImage: "rotate.right")
                    Label("Swipe down to drop", systemImage: "arrow.down.to.line")
                }
                Section("Keyboard") {
                    Text("Arrows move · Space hard drops · Z rotates left · C holds · P pauses")
                }
                Section("Versus") {
                    Text("VS Match pairs three players over the local relay. Clearing lines sends garbage rows to every rival: double sends 1, triple 2, Tetris 4. Last player standing wins.")
                }
                Section("Progress") {
                    Text("Clear lines to raise your level. Themes unlock at best scores of 500 and 1,500.")
                }
            }
            .navigationTitle("How to Play")
            .toolbar { Button("Done") { showingInfo = false } }
        }
        .presentationDetents([.medium])
    }

    private var settingsSheet: some View {
        NavigationStack {
            Form {
                Section("Gameplay") {
                    Toggle("Haptics", isOn: $hapticsEnabled)
                    Toggle("Left-handed controls", isOn: $leftHandedControls)
                }
                Section("Theme") {
                    Picker("Board theme", selection: $themeIndex) {
                        Text("Neon Night").tag(0)
                        Text(engine.highScore >= 500 ? "Aurora" : "Aurora · 500 points").tag(1)
                            .disabled(engine.highScore < 500)
                        Text(engine.highScore >= 1500 ? "Ember" : "Ember · 1,500 points").tag(2)
                            .disabled(engine.highScore < 1500)
                    }
                }
                Section("Records") {
                    LabeledContent("Best score", value: "\(engine.highScore)")
                    LabeledContent("Best lines", value: "\(engine.bestLines)")
                    LabeledContent("Highest level", value: "\(engine.highestLevel)")
                    LabeledContent("Longest combo", value: "\(engine.longestCombo)")
                }
            }
            .navigationTitle("Settings")
            .toolbar { Button("Done") { showingSettings = false } }
        }
        .presentationDetents([.medium, .large])
    }

    private var unlockedThemeCount: Int {
        if engine.highScore >= 1500 { return 3 }
        if engine.highScore >= 500 { return 2 }
        return 1
    }

    private func showClearFeedback() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.62)) { feedbackVisible = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
            withAnimation(.easeOut(duration: 0.25)) { feedbackVisible = false }
        }
    }

    private func showLockGlow() {
        withAnimation(.easeOut(duration: 0.08)) { lockGlow = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) {
            withAnimation(.easeOut(duration: 0.2)) { lockGlow = false }
        }
    }
}
