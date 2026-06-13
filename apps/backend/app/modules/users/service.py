from app.db.client import DatabaseClient
from app.modules.users.dto import CreateUserRequest, UpdateUserRequest


class UsersService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    async def create(self, payload: CreateUserRequest) -> dict:
        """Insert a new user document."""
        # TODO: hash password, check for duplicates, insert into MongoDB
        raise NotImplementedError

    async def find_by_id(self, user_id: str) -> dict | None:
        """Retrieve a user by their MongoDB _id."""
        # TODO: query users collection by _id
        raise NotImplementedError

    async def find_by_email(self, email: str) -> dict | None:
        """Retrieve a user by email."""
        # TODO: query users collection by email
        raise NotImplementedError

    async def update(self, user_id: str, payload: UpdateUserRequest) -> dict | None:
        """Partially update a user document."""
        # TODO: build $set from non-None fields, update in MongoDB
        raise NotImplementedError

    async def delete(self, user_id: str) -> bool:
        """Delete a user by _id."""
        # TODO: delete from MongoDB, return True if deleted
        raise NotImplementedError

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[dict]:
        """Return a paginated list of users."""
        # TODO: query with skip/limit
        raise NotImplementedError
