from slowapi import Limiter


def _ip_key(request):
    return request.client.host if request.client else "unknown"


# Single shared Limiter instance — used by the SlowAPIMiddleware in main.py
# and by the @limiter.limit() decorator.
# `default_limits` applies a global cap across **all** endpoints as a safety net.
# Per-endpoint overrides (e.g. login at 10/min, query at 30/min) take precedence.
limiter = Limiter(
    key_func=_ip_key,
    default_limits=["60/minute"],
)
