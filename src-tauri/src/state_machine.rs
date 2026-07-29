/// Finite state machine for torrent lifecycle.
///
/// Valid transitions:
///
/// ┌──────────┐    metadata    ┌──────────────┐
/// │ Unknown  │ ─────────────→ │  Downloading │
/// └──────────┘   fetched      └──────┬───────┘
///                                    │
///                     paused ┌───────┴────────┐  finished
///                     ┌─────→│    Paused      │←──────────┐
///                     │      └───────┬────────┘           │
///                     │     resumed  │                    │
///                     │     (unfini) │     ┌──────────┐   │
///                     │              └────→│  Seeding  │───┘
///                     │                     └─────┬────┘
///                     │                           │
///                     │     ┌──────────┐          │
///                     └────→│ Checking │←─────────┘
///                            └────┬─────┘
///                        done     │
///                      ┌──────────┴──────────┐
///                      │  resumed (finished)  │
///                      │  → Seeding           │
///                      │  resumed (unfinish)  │
///                      │  → Downloading       │
///                      └──────────────────────┘
///
/// Any state → Error (on error event)
/// Error → Paused (user acknowledges)

use serde::{Deserialize, Serialize};

/// All possible states a torrent can be in, with their valid transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TorrentState {
    /// Metadata is being fetched (initial state for magnet links).
    Metadata,
    /// Active download.
    Downloading,
    /// Download complete, seeding.
    Seeding,
    /// User-paused.
    Paused,
    /// Error state.
    Error,
    /// Checking integrity (re-check).
    Checking,
    /// Unknown/uninitialized.
    Unknown,
}

impl TorrentState {
    /// All valid state transitions.
    const TRANSITIONS: &'static [(TorrentState, TorrentState)] = &[
        // Metadata → Downloading (when metadata is fetched)
        (TorrentState::Metadata, TorrentState::Downloading),
        // Metadata → Paused (user pauses during metadata fetch)
        (TorrentState::Metadata, TorrentState::Paused),
        // Metadata → Error (metadata fetch failed)
        (TorrentState::Metadata, TorrentState::Error),
        // Downloading → Seeding (when download completes / finished=true)
        (TorrentState::Downloading, TorrentState::Seeding),
        // Downloading → Paused (user pause)
        (TorrentState::Downloading, TorrentState::Paused),
        // Downloading → Checking (re-check)
        (TorrentState::Downloading, TorrentState::Checking),
        // Seeding → Paused (user pause)
        (TorrentState::Seeding, TorrentState::Paused),
        // Seeding → Checking (re-check)
        (TorrentState::Seeding, TorrentState::Checking),
        // Paused → Downloading (user resume, not finished)
        (TorrentState::Paused, TorrentState::Downloading),
        // Paused → Seeding (user resume, finished)
        (TorrentState::Paused, TorrentState::Seeding),
        // Paused → Checking (re-check)
        (TorrentState::Paused, TorrentState::Checking),
        // Checking → Downloading (re-check done, not finished)
        (TorrentState::Checking, TorrentState::Downloading),
        // Checking → Seeding (re-check done, finished)
        (TorrentState::Checking, TorrentState::Seeding),
        // Checking → Paused (pause during check)
        (TorrentState::Checking, TorrentState::Paused),
        // Error → Paused (user acknowledges error, pauses)
        (TorrentState::Error, TorrentState::Paused),
        // Error → Downloading (retry)
        (TorrentState::Error, TorrentState::Downloading),
        // Any → Error (on error event)
        // Any → Unknown (fallback)
    ];

    /// Attempt a transition from `self` to `target`.
    /// Returns `Ok(())` if the transition is valid, `Err(message)` otherwise.
    pub fn can_transition_to(self, target: TorrentState) -> Result<(), String> {
        if self == target {
            return Ok(());  // Same state is always allowed (idempotent actions)
        }

        // Error is a sink state: any state can transition to error
        if target == TorrentState::Error {
            return Ok(());
        }

        // Known transitions
        if Self::TRANSITIONS.contains(&(self, target)) {
            return Ok(());
        }

        Err(format!(
            "Invalid state transition: {:?} → {:?}",
            self, target
        ))
    }

    /// Transition with automatic error mapping.
    pub fn transition(self, target: TorrentState) -> Result<TorrentState, String> {
        self.can_transition_to(target)?;
        Ok(target)
    }

    /// Check if this state is "active" (downloading or seeding).
    #[allow(dead_code)]
    pub fn is_active(self) -> bool {
        matches!(self, TorrentState::Downloading | TorrentState::Seeding)
    }

    /// Check if this state is "paused" (can be resumed).
    #[allow(dead_code)]
    pub fn is_paused(self) -> bool {
        self == TorrentState::Paused
    }

    /// Check if this state is a terminal/error state.
    #[allow(dead_code)]
    pub fn is_error(self) -> bool {
        self == TorrentState::Error
    }

    /// Map from librqbit raw state + finished flag to our enum.
    pub fn from_librqbit(raw_state: &str, finished: bool) -> Self {
        match raw_state {
            "live" if finished => TorrentState::Seeding,
            "live" => TorrentState::Downloading,
            "paused" if finished => TorrentState::Seeding, // librqbit's "paused" with finished = seeding that's paused
            "paused" => TorrentState::Paused,
            "error" => TorrentState::Error,
            "initializing" => TorrentState::Metadata,
            _ => {
                // For the HTTP download synthetic states
                match raw_state {
                    "downloading" => TorrentState::Downloading,
                    "seeding" => TorrentState::Seeding,
                    "error" => TorrentState::Error,
                    "metadata" => TorrentState::Metadata,
                    "checking" => TorrentState::Checking,
                    _ => TorrentState::Unknown,
                }
            }
        }
    }

    /// Convert back to a string for the frontend.
    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            TorrentState::Metadata => "metadata",
            TorrentState::Downloading => "downloading",
            TorrentState::Seeding => "seeding",
            TorrentState::Paused => "paused",
            TorrentState::Error => "error",
            TorrentState::Checking => "checking",
            TorrentState::Unknown => "unknown",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        // Metadata → Downloading
        assert!(TorrentState::Metadata.can_transition_to(TorrentState::Downloading).is_ok());

        // Downloading → Seeding
        assert!(TorrentState::Downloading.can_transition_to(TorrentState::Seeding).is_ok());

        // Downloading → Paused
        assert!(TorrentState::Downloading.can_transition_to(TorrentState::Paused).is_ok());

        // Seeding → Paused
        assert!(TorrentState::Seeding.can_transition_to(TorrentState::Paused).is_ok());

        // Paused → Downloading
        assert!(TorrentState::Paused.can_transition_to(TorrentState::Downloading).is_ok());

        // Paused → Seeding
        assert!(TorrentState::Paused.can_transition_to(TorrentState::Seeding).is_ok());

        // Any → Error
        assert!(TorrentState::Downloading.can_transition_to(TorrentState::Error).is_ok());
        assert!(TorrentState::Seeding.can_transition_to(TorrentState::Error).is_ok());
        assert!(TorrentState::Paused.can_transition_to(TorrentState::Error).is_ok());

        // Error → Paused
        assert!(TorrentState::Error.can_transition_to(TorrentState::Paused).is_ok());

        // Same state
        assert!(TorrentState::Downloading.can_transition_to(TorrentState::Downloading).is_ok());
    }

    #[test]
    fn test_invalid_transitions() {
        // Metadata → Seeding (can't skip downloading)
        assert!(TorrentState::Metadata.can_transition_to(TorrentState::Seeding).is_err());

        // Metadata → Paused (now valid — user can pause during metadata fetch)
        assert!(TorrentState::Metadata.can_transition_to(TorrentState::Paused).is_ok());

        // Seeding → Downloading (can't go back)
        assert!(TorrentState::Seeding.can_transition_to(TorrentState::Downloading).is_err());

        // Paused → Metadata (can't go back)
        assert!(TorrentState::Paused.can_transition_to(TorrentState::Metadata).is_err());

        // Unknown → Seeding (can't skip states)
        assert!(TorrentState::Unknown.can_transition_to(TorrentState::Seeding).is_err());
    }

    #[test]
    fn test_from_librqbit() {
        assert_eq!(TorrentState::from_librqbit("live", false), TorrentState::Downloading);
        assert_eq!(TorrentState::from_librqbit("live", true), TorrentState::Seeding);
        assert_eq!(TorrentState::from_librqbit("paused", false), TorrentState::Paused);
        assert_eq!(TorrentState::from_librqbit("error", false), TorrentState::Error);
        assert_eq!(TorrentState::from_librqbit("initializing", false), TorrentState::Metadata);
    }

    #[test]
    fn test_as_str() {
        assert_eq!(TorrentState::Downloading.as_str(), "downloading");
        assert_eq!(TorrentState::Seeding.as_str(), "seeding");
        assert_eq!(TorrentState::Error.as_str(), "error");
    }
}
