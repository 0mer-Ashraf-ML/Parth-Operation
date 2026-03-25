"""
User routes – admin-only user management.

• Admins cannot change their own role or vendor (PATCH .../role).
• Admins cannot deactivate themselves (DELETE /users/{id}).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.schemas.auth import CurrentUser
from app.schemas.user import UserCreate, UserOut, UserRoleUpdate, UserUpdate
from app.services import user as user_svc

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "",
    summary="List all users",
    response_description="All users in the system",
)
def list_users(
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = user_svc.list_users(db)
    return {
        "success": True,
        "data": [UserOut.model_validate(u) for u in users],
    }


@router.get(
    "/{user_id}",
    summary="Get user by id",
)
def get_user(
    user_id: int,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = user_svc.get_user(db, user_id)
    return {"success": True, "data": UserOut.model_validate(user)}


@router.post(
    "",
    summary="Create user",
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    body: UserCreate,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = user_svc.create_user(db, body)
    return {"success": True, "data": UserOut.model_validate(user)}


@router.patch(
    "/{user_id}",
    summary="Update user profile or active flag",
)
def update_user(
    user_id: int,
    body: UserUpdate,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = user_svc.update_user(db, user_id, body)
    return {"success": True, "data": UserOut.model_validate(user)}


@router.patch(
    "/{user_id}/role",
    summary="Set user role (and vendor when role is vendor)",
)
def set_user_role(
    user_id: int,
    body: UserRoleUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = user_svc.set_user_role(db, user_id, body, current_user)
    return {"success": True, "data": UserOut.model_validate(user)}


@router.delete(
    "/{user_id}",
    summary="Deactivate user (sets is_active to false)",
)
def delete_user(
    user_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user_svc.deactivate_user(db, user_id, current_user)
    return {"success": True, "data": {"message": "User deactivated"}}
