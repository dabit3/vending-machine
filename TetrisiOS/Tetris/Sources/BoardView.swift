import SwiftUI

struct BoardView: View {
    @ObservedObject var engine: GameEngine

    var body: some View {
        GeometryReader { geo in
            let cell = min(
                geo.size.width / CGFloat(GameEngine.width),
                geo.size.height / CGFloat(GameEngine.height))
            let boardW = cell * CGFloat(GameEngine.width)
            let boardH = cell * CGFloat(GameEngine.height)
            let ox = (geo.size.width - boardW) / 2
            let oy = (geo.size.height - boardH) / 2

            Canvas { ctx, _ in
                // Background
                let boardRect = CGRect(x: ox, y: oy, width: boardW, height: boardH)
                ctx.fill(
                    Path(roundedRect: boardRect, cornerRadius: 6),
                    with: .color(Color(white: 0.07)))

                // Grid lines
                var grid = Path()
                for c in 1..<GameEngine.width {
                    grid.move(to: CGPoint(x: ox + CGFloat(c) * cell, y: oy))
                    grid.addLine(to: CGPoint(x: ox + CGFloat(c) * cell, y: oy + boardH))
                }
                for r in 1..<GameEngine.height {
                    grid.move(to: CGPoint(x: ox, y: oy + CGFloat(r) * cell))
                    grid.addLine(to: CGPoint(x: ox + boardW, y: oy + CGFloat(r) * cell))
                }
                ctx.stroke(grid, with: .color(Color(white: 0.13)), lineWidth: 0.5)

                func drawBlock(x: Int, y: Int, color: Color, ghost: Bool = false, flash: Bool = false) {
                    guard y >= 0 else { return }
                    let rect = CGRect(
                        x: ox + CGFloat(x) * cell + 1,
                        y: oy + CGFloat(y) * cell + 1,
                        width: cell - 2, height: cell - 2)
                    let path = Path(roundedRect: rect, cornerRadius: cell * 0.18)
                    if ghost {
                        ctx.stroke(path, with: .color(color.opacity(0.45)), lineWidth: 1.5)
                        return
                    }
                    if flash {
                        ctx.fill(path, with: .color(.white))
                        return
                    }
                    ctx.fill(path, with: .linearGradient(
                        Gradient(colors: [color.opacity(1.0), color.opacity(0.72)]),
                        startPoint: rect.origin,
                        endPoint: CGPoint(x: rect.maxX, y: rect.maxY)))
                    // Top bevel highlight
                    let bevel = CGRect(
                        x: rect.minX + cell * 0.12, y: rect.minY + cell * 0.10,
                        width: rect.width - cell * 0.24, height: cell * 0.16)
                    ctx.fill(
                        Path(roundedRect: bevel, cornerRadius: cell * 0.08),
                        with: .color(.white.opacity(0.28)))
                }

                // Settled blocks
                for y in 0..<GameEngine.height {
                    let flash = engine.clearingRows.contains(y)
                    for x in 0..<GameEngine.width {
                        if let t = engine.board[y][x] {
                            drawBlock(x: x, y: y, color: t.color, flash: flash)
                        }
                    }
                }

                // Ghost
                if let ghost = engine.ghost, engine.phase == .playing {
                    for (x, y) in ghost.cells {
                        drawBlock(x: x, y: y, color: ghost.type.color, ghost: true)
                    }
                }

                // Current piece
                if let piece = engine.current {
                    for (x, y) in piece.cells {
                        drawBlock(x: x, y: y, color: piece.type.color)
                    }
                }
            }
        }
        .aspectRatio(CGFloat(GameEngine.width) / CGFloat(GameEngine.height), contentMode: .fit)
    }
}

struct MiniPieceView: View {
    let type: PieceType?
    var dimmed = false

    var body: some View {
        Canvas { ctx, size in
            guard let type else { return }
            let cells = type.baseCells
            let minX = cells.map(\.0).min()!
            let maxX = cells.map(\.0).max()!
            let minY = cells.map(\.1).min()!
            let maxY = cells.map(\.1).max()!
            let w = CGFloat(maxX - minX + 1)
            let h = CGFloat(maxY - minY + 1)
            let cell = min(size.width / w, size.height / h, size.width / 4)
            let ox = (size.width - w * cell) / 2
            let oy = (size.height - h * cell) / 2
            for (x, y) in cells {
                let rect = CGRect(
                    x: ox + CGFloat(x - minX) * cell + 1,
                    y: oy + CGFloat(y - minY) * cell + 1,
                    width: cell - 2, height: cell - 2)
                ctx.fill(
                    Path(roundedRect: rect, cornerRadius: cell * 0.18),
                    with: .color(type.color.opacity(dimmed ? 0.35 : 0.9)))
            }
        }
    }
}
