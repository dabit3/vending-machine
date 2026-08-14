# Tetris (iOS)

A native iOS Tetris clone built with SwiftUI.

## Features

- SRS rotation system with full wall-kick tables (JLSTZ + I)
- 7-bag randomizer, 5-piece next queue, hold piece
- Ghost piece, soft drop, hard drop, lock delay with move resets (15)
- Guideline scoring (100/300/500/800 x level, combos, drop bonuses)
- Level progression every 10 lines with guideline gravity curve
- Line-clear flash animation, haptic feedback, persistent high score
- Touch controls (swipe to move, tap to rotate, swipe down to drop),
  on-screen buttons, and hardware keyboard support
  (arrows, space = hard drop, `z` = ccw, `c` = hold, `p` = pause)

## Run

```sh
brew install xcodegen   # if Tetris.xcodeproj is not present
xcodegen generate
xcodebuild -project Tetris.xcodeproj -scheme Tetris \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build
```

Or open `Tetris.xcodeproj` in Xcode and hit Run.

## Test

```sh
xcodebuild -project Tetris.xcodeproj -scheme Tetris \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro' test
```
