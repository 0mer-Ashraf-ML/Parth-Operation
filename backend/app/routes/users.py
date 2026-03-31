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
from app.schemas.user import (
    UserClientAssignmentCreate,
    UserClientAssignmentOut,
    UserCreate,
    UserOut,
    UserRoleUpdate,
    UserUpdate,
)
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


@router.get(
    "/{user_id}/client-assignments",
    summary="List account manager client assignments",
)
def list_client_assignments(
    user_id: int,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    assignments = user_svc.list_client_assignments(db, user_id)
    return {
        "success": True,
        "data": [
            UserClientAssignmentOut(
                client_id=assignment.client_id,
                client_name=assignment.client.company_name if assignment.client else "",
                assigned_at=assignment.assigned_at,
            )
            for assignment in assignments
        ],
    }


@router.post(
    "/{user_id}/client-assignments",
    summary="Assign a client to an account manager",
    status_code=status.HTTP_201_CREATED,
)
def assign_client(
    user_id: int,
    body: UserClientAssignmentCreate,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    assignment = user_svc.assign_client(db, user_id, body.client_id)
    return {
        "success": True,
        "data": UserClientAssignmentOut(
            client_id=assignment.client_id,
            client_name=assignment.client.company_name if assignment.client else "",
            assigned_at=assignment.assigned_at,
        ),
    }


@router.delete(
    "/{user_id}/client-assignments/{client_id}",
    summary="Remove a client assignment from an account manager",
)
def remove_client_assignment(
    user_id: int,
    client_id: int,
    _current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user_svc.remove_client_assignment(db, user_id, client_id)
    return {"success": True, "data": {"message": "Client assignment removed"}}
