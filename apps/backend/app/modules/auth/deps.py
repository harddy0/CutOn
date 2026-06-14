from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.client import DatabaseClient
from app.modules.auth.service import AuthService

# HTTPBearer registers itself in the OpenAPI schema so Swagger UI shows
# the "Authorize" button and sends the Bearer token on protected endpoints.
# auto_error=False lets us handle missing tokens ourselves with proper 401.
bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_service() -> AuthService:
    return AuthService(DatabaseClient)


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    auth: AuthService = Depends(get_auth_service),
) -> dict:
    """Extract and validate the JWT from the Authorization header.

    Returns the authenticated user dict (without password_hash).
    Raises 401 if the token is missing, expired, or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await auth.get_current_user(credentials.credentials)


async def require_own_user(
    user_id: str,
    current_user: dict = Depends(require_user),
) -> dict:
    """Require that the authenticated user matches the ``user_id`` path param.

    Ensures users can only access/update/delete their own account.
    """
    if current_user["id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only perform this action on your own account",
        )
    return current_user


async def require_admin(
    current_user: dict = Depends(require_user),
) -> dict:
    """Require that the authenticated user has an admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )
    return current_user
