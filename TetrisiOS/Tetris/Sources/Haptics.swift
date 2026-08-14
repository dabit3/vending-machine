import UIKit

enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let notify = UINotificationFeedbackGenerator()

    static func move() { light.impactOccurred(intensity: 0.5) }
    static func rotate() { light.impactOccurred() }
    static func hardDrop() { heavy.impactOccurred() }

    static func lineClear(count: Int) {
        if count >= 4 {
            notify.notificationOccurred(.success)
        } else {
            medium.impactOccurred()
        }
    }

    static func gameOver() { notify.notificationOccurred(.error) }
}
