---
name: KD TAXI Expo Go support
description: Android Expo Go notification limits and the workspace package-maturity rule during Expo SDK upgrades.
---

On Android Expo Go, do not import or initialize `expo-notifications`: remote push was removed from Expo Go starting with SDK 53. Keep the app usable through its authenticated socket and in-app flows; real push notifications need an Android development build.

**Why:** Expo Go can throw an uncaught startup error when the app initializes the unsupported remote-notifications API.

**How to apply:** Detect Android's Expo Go runtime before dynamically importing the notification module. Test Android remote push in a development build, not Expo Go.

The guarded startup path was confirmed on the user's Android device: KD TAXI opened normally in Expo Go after aligning the project to SDK 57.

For Expo SDK updates, preserve the workspace's 24-hour minimum package age. Expo's compatibility checker can recommend patch releases that pnpm still blocks because they are too new; do not weaken the age guard or add temporary exemptions just to make the checker pass.

**Why:** The workspace uses the delay as a supply-chain safety control; the Expo SDK patch train can publish faster than that window.

**How to apply:** Use the newest mature compatible versions, verify app typechecks and platform exports, then rerun Expo's dependency checks once blocked packages have aged past the configured window.
