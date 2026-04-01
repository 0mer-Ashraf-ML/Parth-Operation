"""
User service – admin CRUD, role changes, deactivation.

Admins cannot change their own role or vendor assignment via set_user_role.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.exceptions import BadRequestException, ConflictException, ForbiddenException, NotFoundException
from app.models.enums import UserRole
from app.models.user import ClientAssignment, User
from app.models.vendor import Vendor
from app.schemas.auth import CurrentUser
from app.schemas.user import UserCreate, UserRoleUpdate, UserUpdate
from app.services.auth import hash_password


def get_user(db: Session, user_id: int) -> User:
    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None:
        raise NotFoundException(f"User with id={user_id} not found")
    return user


def list_users(db: Session) -> list[User]:
    stmt = select(User).order_by(User.id.asc())
    return list(db.execute(stmt).scalars().all())


def _email_taken(db: Session, email: str, exclude_user_id: int | None = None) -> bool:
    q = select(User.id).where(User.email == email)
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    return db.execute(q).scalar_one_or_none() is not None


def _ensure_vendor_exists(db: Session, vendor_id: int) -> None:
    v = db.execute(select(Vendor.id).where(Vendor.id == vendor_id)).scalar_one_or_none()
    if v is None:
        raise BadRequestException(f"Vendor with id={vendor_id} does not exist")


def _active_admin_exists(
    db: Session,
    *,
    exclude_user_id: int | None = None,
) -> bool:
    """True if some user has role admin and is_active (optionally excluding one id)."""
    q = select(User.id).where(
        User.role == UserRole.ADMIN,
        User.is_active.is_(True),
    )
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    return db.execute(q).scalar_one_or_none() is not None


def create_user(db: Session, data: UserCreate) -> User:
    if _email_taken(db, data.email):
        raise ConflictException(f"A user with email '{data.email}' already exists")

    if data.role == UserRole.ADMIN and _active_admin_exists(db):
        raise ConflictException(
            "An active administrator already exists. Only one active admin is allowed.",
        )

    vendor_id: int | None = None
    if data.role == UserRole.VENDOR:
        _ensure_vendor_exists(db, data.vendor_id)  # type: ignore[arg-type]
        vendor_id = data.vendor_id

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        is_active=True,
        vendor_id=vendor_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data: UserUpdate) -> User:
    user = get_user(db, user_id)
    payload = data.model_dump(exclude_unset=True)

    if "email" in payload:
        if _email_taken(db, payload["email"], exclude_user_id=user.id):
            raise ConflictException(f"A user with email '{payload['email']}' already exists")
        user.email = payload["email"]

    if "full_name" in payload:
        user.full_name = payload["full_name"]

    if "password" in payload:
        user.password_hash = hash_password(payload["password"])

    if "is_active" in payload:
        if (
            payload["is_active"] is True
            and user.role == UserRole.ADMIN
            and _active_admin_exists(db, exclude_user_id=user.id)
        ):
            raise ConflictException(
                "An active administrator already exists. Only one active admin is allowed.",
            )
        user.is_active = payload["is_active"]

    db.commit()
    db.refresh(user)
    return user


def _clear_client_assignments(db: Session, user_id: int) -> None:
    db.execute(delete(ClientAssignment).where(ClientAssignment.user_id == user_id))


def set_user_role(db: Session, user_id: int, data: UserRoleUpdate, actor: CurrentUser) -> User:
    user = get_user(db, user_id)

    new_role = data.role
    new_vendor_id: int | None = data.vendor_id if new_role == UserRole.VENDOR else None

    role_changed = new_role != user.role
    vendor_changed = new_vendor_id != user.vendor_id
    if actor.user_id == user_id and (role_changed or vendor_changed):
        raise ForbiddenException("You cannot change your own role or vendor assignment.")

    if new_role == UserRole.VENDOR:
        _ensure_vendor_exists(db, new_vendor_id)  # type: ignore[arg-type]

    if (
        new_role == UserRole.ADMIN
        and role_changed
        and _active_admin_exists(db, exclude_user_id=user.id)
    ):
        raise ConflictException(
            "An active administrator already exists. Only one active admin is allowed.",
        )

    if user.role == UserRole.ACCOUNT_MANAGER and new_role != UserRole.ACCOUNT_MANAGER:
        _clear_client_assignments(db, user.id)

    user.role = new_role
    user.vendor_id = new_vendor_id

    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, user_id: int, actor: CurrentUser) -> None:
    user = get_user(db, user_id)
    if actor.user_id == user.id:
        raise ForbiddenException("You cannot deactivate your own account.")
    user.is_active = False
    db.commit()
