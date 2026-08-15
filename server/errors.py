"""Server error class hierarchy.

Maps to the three error classes in the spec:
- TransientError -> retried with backoff in provider calls
- RecoverableError -> surfaced immediately, requires user action
- ConfigurationError -> blocks the action, routes to settings
"""


class TranslateError(Exception):
    """Base for all server errors."""


class TransientError(TranslateError):
    """Network blip, 5xx, rate limit. Subject to retry."""


class RecoverableError(TranslateError):
    """Bad model output, malformed response. No retry; surface to user."""


class ConfigurationError(TranslateError):
    """Bad API key, missing config. Block action; route to settings."""
