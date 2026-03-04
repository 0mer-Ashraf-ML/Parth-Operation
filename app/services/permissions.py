"""
Permission service – database-level scoping for role-based access control.

The most important rule in the spec:
    "Access control is enforced at the database query level,
     not just at the route level."

This module provides helper functions that inject WHERE clauses into
SQLAlchemy queries so that:
  • Admins see everything (no filter applied).
  • Account Managers see only their assigned clients' data.
  • Vendors see only their own Purchase Orders.

Usage in service / route layer
──────────────────────────────
    from app.services.permissions import PermissionService

    query = select(SalesOrder)
    query = PermissionService.scope_by_client(query, current_user, SalesOrder.client_id)
    results = db.execute(query).scalars().all()
"""

from sqlalchemy import Select

from app.exceptions import ForbiddenException
from app.models.enums import UserRole
from app.schemas.auth import CurrentUser


class PermissionService:
    """Static helpers that apply role-based filters to SQLAlchemy queries."""

    # ── Client-scoped queries ─────────────────────────────

    @staticmethod
    def scope_by_client(
        query: Select,
        current_user: CurrentUser,
        client_id_column,
    ) -> Select:
        """
        Filter a query to only the clients the user is allowed to see.

        • Admin            → no filter (sees all clients).
        • Account Manager  → WHERE client_id IN (assigned_client_ids).
        • Vendor           → raises ForbiddenException (vendors don't
                             access client-scoped data).

        Parameters
        ----------
        query : Select
            The SQLAlchemy select statement to filter.
        current_user : CurrentUser
            Decoded JWT data for the caller.
        client_id_column :
            The SQLAlchemy column expression to filter on,
            e.g. ``SalesOrder.client_id`` or ``Client.id``.
        """
        if current_user.role == UserRole.ADMIN:
            return query  # full access

        if current_user.role == UserRole.ACCOUNT_MANAGER:
            if not current_user.client_ids:
                # AM with no assignments → sees nothing
                return query.where(client_id_column == -1)
            return query.where(client_id_column.in_(current_user.client_ids))

        # Vendors cannot access client data
        raise ForbiddenException("Vendors cannot access client data")

    # ── Vendor-scoped queries ─────────────────────────────

    @staticmethod
    def scope_by_vendor(
        query: Select,
        current_user: CurrentUser,
        vendor_id_column,
    ) -> Select:
        """
        Filter a query to only the vendor the user belongs to.

        • Admin            → no filter (sees all vendors' POs).
        • Account Manager  → no filter (can see POs for their clients
                             — caller must also apply client scoping).
        • Vendor           → WHERE vendor_id = current_user.vendor_id.

        Parameters
        ----------
        query : Select
            The SQLAlchemy select statement to filter.
        current_user : CurrentUser
            Decoded JWT data for the caller.
        vendor_id_column :
            The SQLAlchemy column expression to filter on,
            e.g. ``PurchaseOrder.vendor_id``.
        """
        if current_user.role == UserRole.VENDOR:
            if current_user.vendor_id is None:
                raise ForbiddenException("Vendor account is not linked to a vendor record")
            return query.where(vendor_id_column == current_user.vendor_id)

        # Admin and AM see all vendors (AM is further filtered by client scope)
        return query

    # ── Convenience checks ────────────────────────────────

    @staticmethod
    def can_access_client(current_user: CurrentUser, client_id: int) -> bool:
        """
        Check if the current user is allowed to access a specific client.

        Returns True for Admins (always), True for AMs if client_id is
        in their assigned list, and False otherwise.
        """
        if current_user.role == UserRole.ADMIN:
            return True
        if current_user.role == UserRole.ACCOUNT_MANAGER:
            return client_id in current_user.client_ids
        return False

    @staticmethod
    def assert_can_access_client(current_user: CurrentUser, client_id: int) -> None:
        """
        Like ``can_access_client`` but raises ForbiddenException instead of
        returning False.  Useful for single-record endpoints.
        """
        if not PermissionService.can_access_client(current_user, client_id):
            raise ForbiddenException("You do not have access to this client")

    @staticmethod
    def is_admin(current_user: CurrentUser) -> bool:
        """Shorthand – True when the caller is an Admin."""
        return current_user.role == UserRole.ADMIN
