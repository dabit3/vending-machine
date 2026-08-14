import SwiftUI

enum PieceType: CaseIterable {
    case i, o, t, s, z, j, l

    var color: Color {
        switch self {
        case .i: return Color(red: 0.20, green: 0.85, blue: 0.94)
        case .o: return Color(red: 0.98, green: 0.83, blue: 0.20)
        case .t: return Color(red: 0.72, green: 0.40, blue: 0.95)
        case .s: return Color(red: 0.35, green: 0.88, blue: 0.45)
        case .z: return Color(red: 0.96, green: 0.33, blue: 0.38)
        case .j: return Color(red: 0.30, green: 0.50, blue: 0.98)
        case .l: return Color(red: 0.98, green: 0.58, blue: 0.22)
        }
    }

    /// Cells for rotation 0, in a 4x4 (I/O) or 3x3 grid, (x, y) with y down.
    var baseCells: [(Int, Int)] {
        switch self {
        case .i: return [(0, 1), (1, 1), (2, 1), (3, 1)]
        case .o: return [(1, 0), (2, 0), (1, 1), (2, 1)]
        case .t: return [(1, 0), (0, 1), (1, 1), (2, 1)]
        case .s: return [(1, 0), (2, 0), (0, 1), (1, 1)]
        case .z: return [(0, 0), (1, 0), (1, 1), (2, 1)]
        case .j: return [(0, 0), (0, 1), (1, 1), (2, 1)]
        case .l: return [(2, 0), (0, 1), (1, 1), (2, 1)]
        }
    }

    var boxSize: Int { self == .i || self == .o ? 4 : 3 }
}

struct Piece {
    var type: PieceType
    var rotation: Int  // 0..3
    var x: Int
    var y: Int

    /// Board-space cells occupied by the piece.
    var cells: [(Int, Int)] {
        let n = type.boxSize
        return type.baseCells.map { (cx, cy) in
            var px = cx, py = cy
            for _ in 0..<rotation {
                let t = px
                px = n - 1 - py
                py = t
            }
            return (x + px, y + py)
        }
    }

    static func spawn(_ type: PieceType, boardWidth: Int) -> Piece {
        Piece(type: type, rotation: 0, x: (boardWidth - type.boxSize) / 2, y: type == .i ? -1 : 0)
    }
}

/// SRS wall-kick data. Returns offsets to try for rotation from `from` to `to`.
enum SRS {
    static func kicks(type: PieceType, from: Int, to: Int) -> [(Int, Int)] {
        if type == .o { return [(0, 0)] }
        let table: [String: [(Int, Int)]]
        if type == .i {
            table = [
                "0>1": [(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)],
                "1>0": [(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)],
                "1>2": [(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)],
                "2>1": [(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)],
                "2>3": [(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)],
                "3>2": [(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)],
                "3>0": [(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)],
                "0>3": [(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)],
            ]
        } else {
            table = [
                "0>1": [(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)],
                "1>0": [(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)],
                "1>2": [(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)],
                "2>1": [(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)],
                "2>3": [(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)],
                "3>2": [(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)],
                "3>0": [(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)],
                "0>3": [(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)],
            ]
        }
        // SRS kick y is up-positive; our y is down-positive, so negate y.
        return (table["\(from)>\(to)"] ?? [(0, 0)]).map { ($0.0, -$0.1) }
    }
}
