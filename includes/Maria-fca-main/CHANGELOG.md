# CHANGELOG

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-08-22
### Added
- **Duplicate Event Guard (`extra/monitor/eventGuard.js`)**: Facebook sometimes delivers the same MQTT event (same `threadID` + `messageID`) 2–3 times in quick succession. A TTL-based (60s) in-memory guard now wraps the `listenMqtt` callback — the first occurrence is processed, every subsequent duplicate is skipped and logged with a red `[ MARI -FCA ]` frame. A periodic cleanup timer keeps memory bounded.
- **`[ MARI -FCA ]` Styled Memory Monitor (`extra/monitor/mariLogger.js`)**: New shared console logger that prints a colored `[ MARI -FCA ]` frame (bright green when normal, bright red on overload) with uncolored message text. Used by the memory monitor and the duplicate-event guard for consistent styling.

### Changed
- **Memory Monitor Output (`extra/monitor/memoryUsage.js`)**: Replaced the old magenta `[MemoryUsage]` lines with `[ MARI -FCA ] hh:mm:ss, d/m/yyyy - Memory usage: X.XX% | FCA Heap: X.XX% | Hosting: X.XX%`. The frame is green while usage is normal and turns red once FCA heap or hosting load reaches 90%, which still triggers automatic cache cleanup via `extra/monitor/cacheCleaner.js`.
- **Monitor Interval**: Default reporting interval reduced from 5 minutes to 1 minute.

### Fixed
- **Memory Monitor Never Started (`index.js`)**: `require('./extra/monitor/memoryUsage')` returns a factory function, but the return value was being destructured directly — so `startMonitoring` was `undefined` and the monitor silently never ran (the error was swallowed by a `try/catch`). The factory is now invoked correctly and the monitor starts right after login.

> **Note:** Versions between 1.2.31 and 1.6.5 were released without changelog entries. This file documents changes going forward.

## [1.2.31] - 2026-08-19
### Fixed
- **Post Reaction**: Fixed `setPostReaction` failing to apply reactions correctly on posts.

## [1.2.30] - 2026-07-25
### Fixed
- **Version Comparison**: Fixed a critical bug in version comparison inside the auto-updater (`checkUpdate.js`) that returned invalid results on non-numeric version suffixes (e.g., `1.2.3-beta.1` vs `1.2.2` returning as equal due to `NaN`).
- **NPM Registry 404 Handling**: Resolved issues where unpublished/local packages caused update check failures and threw crash-worthy errors. Handled NPM registry 404 responses gracefully with user-friendly warnings.
- **Changelog Retrieval URL**: Corrected the raw GitHub repository URL to point directly to the main repository (`https://github.com/abdullahrx07/Maria-fca`) instead of outdated fork sources.

### Added
- **Configurable Auto Update**: Implemented a custom, configurable `autoUpdate` option (`options.autoUpdate = true/false`) during the `login()` sequence, allowing developers to disable automatic library updates and process restarts.
- **Dynamic Package Name Resolution**: Enhanced `checkUpdate` to dynamically resolve the package name from `package.json` rather than hardcoding `'xdi-fca'`, providing complete out-of-the-box support for forks and renamed versions.
- **Section-by-Section Dependency Update**: Upgraded user `package.json` updater to search and replace dependency versions across all sections (`dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`).

## [1.2.29] - 2026-07-20
### Added
- **E2EE Bridge Integration**: Exposed `api.connectE2EE` and `api.getE2EEDeviceData` for seamless and robust native Labyrinth E2EE connection management.
- **Silent Attachment Hosting**: Implemented a multi-provider silent image uploader leveraging ImgBB (fallback to ImageKit) to dynamically host decrypted files.

## [1.2.28] - 2026-07-15
### Fixed
- **Listener Crashes**: Resolved automatic logout, disconnection, and fatal crash loops in the `listenMqtt` protocol listener.
- **Decrypted Media Cache**: Decoupled decrypted media buffers from transient memory, establishing a structured local HTTP caching server on dynamic ports.
