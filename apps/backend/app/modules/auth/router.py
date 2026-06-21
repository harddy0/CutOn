from fastapi import APIRouter, Depends, Request

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.auth.dto import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    AuthResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.modules.auth.service import AuthService
from app.modules.auth.limiter import limiter
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service() -> AuthService:
    return AuthService(DatabaseClient)


@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    return await service.register(payload)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    return await service.login(payload)


@router.get("/me", response_model=UserResponse)
async def get_me(user: UserResponse = Depends(require_user)):
    """Return the currently authenticated user from the JWT token."""
    return user


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Send a password-reset email with a unique link.

    The frontend provides its own ``base_url`` so the reset link points to
    the correct origin (e.g. ``https://app.cuton.com/reset-password``).
    The link expires in 60 minutes (configurable via ``RESET_TOKEN_EXPIRE_MINUTES``).

    Always returns 200 to prevent email enumeration attacks.
    """
    return await service.forgot_password(payload)


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Complete a password reset using the token from the email link."""
    return await service.reset_password(payload)
