import SwiftUI

@main
struct TetrisApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .preferredColorScheme(.dark)
                .statusBarHidden()
        }
    }
}
