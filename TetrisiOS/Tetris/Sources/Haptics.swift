import UIKit

enum Haptics {
    static var enabled = true

    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let notify = UINotificationFeedbackGenerator()

    static func move() { if enabled { light.impactOccurred(intensity: 0.5) } }
    static func rotate() { if enabled { light.impactOccurred() } }
    static func hardDrop() { if enabled { heavy.impactOccurred() } }

    static func lineClear(count: Int) {
        guard enabled else { return }
        if count >= 4 {
            notify.notificationOccurred(.success)
        } else {
            medium.impactOccurred()
        }
    }

    static func gameOver() { if enabled { notify.notificationOccurred(.error) } }
}
