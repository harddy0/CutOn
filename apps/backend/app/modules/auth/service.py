from app.db.client import DatabaseClient
from app.modules.auth.dto import RegisterRequest, LoginRequest


class AuthService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    async def register(self, payload: RegisterRequest) -> dict:
        """Register a new user account."""
        # TODO: hash password, check for duplicate email/username, insert into DB, return token
        raise NotImplementedError

    async def login(self, payload: LoginRequest) -> dict:
        """Authenticate a user and return an access token."""
        # TODO: look up user, verify password, generate JWT
        raise NotImplementedError

    async def get_current_user(self, token: str) -> dict:
        """Decode a JWT and return the current user."""
        # TODO: decode token, fetch user from DB
        raise NotImplementedError
