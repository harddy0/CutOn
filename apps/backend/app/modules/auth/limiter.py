from slowapi import Limiter


def _ip_key(request):
    return request.client.host if request.client else "unknown"


# Single shared Limiter instance — used by the SlowAPIMiddleware in main.py
# and by the @limiter.limit() decorator on the login endpoint.
limiter = Limiter(key_func=_ip_key)
