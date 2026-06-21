from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class AuthRouteMiddleware(BaseHTTPMiddleware):
    """Capture auth headers for auth routes without affecting the rest of the app."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith("/api/v1/auth"):
            authorization = request.headers.get("Authorization")
            request.state.auth_token = None

            if authorization and authorization.lower().startswith("bearer "):
                request.state.auth_token = authorization[7:].strip()

        return await call_next(request)