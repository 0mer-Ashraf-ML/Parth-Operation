"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, TextField, Button, Badge, Dialog, Select, DropdownMenu, Checkbox } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiMail, FiColumns } from "react-icons/fi";
import { useFormik } from "formik";
import * as yup from "yup";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";
import { TableDataLoader } from "@/components/TableDataLoader";
import { AgGridThemeShell } from "@/components/AgGridThemeShell";
import { toast } from "react-toastify";
import { fetchVendors } from "@/lib/api/services/vendorsService";
import { formatAppDate } from "@/lib/formatDate";
import type { Vendor } from "@/lib/store/vendorsSlice";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  createUserAsync,
  deactivateUserAsync,
  fetchUsersAsync,
  updateUserAsync,
  type User as ApiUser,
  type UserRole as ApiUserRole,
} from "@/lib/store/usersSlice";

type UserRole = "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR";

interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
  vendorId: number | null;
}

const roleToUi = (role: ApiUserRole): UserRole => {
  if (role === "admin") return "ADMIN";
  if (role === "account_manager") return "ACCOUNT_MANAGER";
  return "VENDOR";
};

const roleToApi = (role: UserRole): ApiUserRole => {
  if (role === "ADMIN") return "admin";
  if (role === "ACCOUNT_MANAGER") return "account_manager";
  return "vendor";
};

const mapUserFromApi = (user: ApiUser): User => ({
  id: String(user.id),
  fullName: user.full_name,
  email: user.email,
  role: roleToUi(user.role),
  status: user.is_active ? "Active" : "Inactive",
  createdAt: user.created_at,
  updatedAt: user.updated_at,
  vendorId: user.vendor_id,
});

const inviteValidationSchema = yup.object({
  full_name: yup.string().trim().required("Full name is required"),
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
  password: yup.string().min(8, "Password must be at least 8 characters").required("Password is required"),
  role: yup
    .string()
    .oneOf(["ADMIN", "ACCOUNT_MANAGER", "VENDOR"], "Please select a role")
    .required("Role is required"),
  vendor_id: yup
    .number()
    .nullable()
    .when("role", {
      is: "VENDOR",
      then: (schema) => schema.required("Vendor is required for vendor users"),
      otherwise: (schema) => schema.nullable(),
    }),
});

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "users-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set(["createdAt"]);

function UsersContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { users, isLoading, lastFetched } = useAppSelector((state) => state.users);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchText, setSearchText] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);
  const isNarrowScreen = useNarrowScreen();
  const hasFetchedRef = useRef(false);

  // Column visibility state - track which columns are visible
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    // Load from localStorage if available
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return {};
        }
      }
    }
    return {};
  });

  useEffect(() => {
    const hasData = users.length > 0 || lastFetched !== null;
    if (!hasFetchedRef.current && !hasData && !isLoading) {
      hasFetchedRef.current = true;
      dispatch(fetchUsersAsync());
    } else if (hasData) {
      hasFetchedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const data = await fetchVendors();
        setVendors(data.filter((v) => v.is_active));
      } catch {
        // Keep user flow usable even if vendors endpoint fails.
      }
    };
    loadVendors();
  }, []);

  const inviteFormik = useFormik<{
    full_name: string;
    email: string;
    password: string;
    role: UserRole | "";
    vendor_id: number | null;
  }>({
    initialValues: {
      full_name: "",
      email: "",
      password: "",
      role: "",
      vendor_id: null,
    },
    validationSchema: inviteValidationSchema,
    onSubmit: async (values) => {
      setIsInviting(true);
      try {
        await dispatch(
          createUserAsync({
          email: values.email.trim(),
          password: values.password,
          full_name: values.full_name.trim(),
          role: roleToApi(values.role as UserRole),
          vendor_id: values.role === "VENDOR" ? values.vendor_id : null,
          })
        ).unwrap();
        inviteFormik.resetForm();
        setInviteDialogOpen(false);
      } catch (error: any) {
        toast.error(error.message || "Failed to create user");
      } finally {
        setIsInviting(false);
      }
    },
  });

  const filteredData = useMemo(() => {
    const rowData = users.map(mapUserFromApi);
    if (!searchText) return rowData;
    
    const searchLower = searchText.toLowerCase();
    return rowData.filter(
      (user) =>
        user.fullName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower) ||
        user.role.toLowerCase().includes(searchLower) ||
        user.status.toLowerCase().includes(searchLower)
    );
  }, [users, searchText]);

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case "ADMIN":
        return "red";
      case "ACCOUNT_MANAGER":
        return "blue";
      case "VENDOR":
        return "green";
      default:
        return "gray";
    }
  };

  const handleDeactivate = async (userId: string) => {
    setUserToDeactivate(userId);
    setDeactivateDialogOpen(true);
  };

  const confirmDeactivate = () => {
    if (!userToDeactivate) return;

    (async () => {
      try {
        await dispatch(deactivateUserAsync(userToDeactivate)).unwrap();
      } catch (error: any) {
        toast.error(error.message || "Failed to deactivate user");
      } finally {
        setDeactivateDialogOpen(false);
        setUserToDeactivate(null);
      }
    })();
  };

  const handleActivate = async (userId: string) => {
    try {
      await dispatch(updateUserAsync({ userId, payload: { is_active: true } })).unwrap();
    } catch (error: any) {
      toast.error(error.message || "Failed to activate user");
    }
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<User>[]>(() => [
    {
      field: "fullName",
      headerName: "Name",
      flex: 1,
      minWidth: 140,
      filter: true,
      sortable: true,
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      lockVisible: true,
    },
    {
      field: "role",
      headerName: "Role",
      flex: 1,
      width: 150,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<User>) => {
        return (
          <Badge color={getRoleColor(params.value as UserRole)}>
            {params.value}
          </Badge>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      width: 120,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<User>) => {
        return (
          <Badge color={params.value === "Active" ? "green" : "gray"}>
            {params.value}
          </Badge>
        );
      },
    },
    {
      field: "createdAt",
      headerName: "Created At",
      width: 130,
      flex: 1,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<User>) => {
        return params.value ? formatAppDate(params.value as string) : "—";
      },
    },
  ], []);

  // Apply column visibility to column definitions
  const colDefs = useMemo<ColDef<User>[]>(() => {
    return baseColDefs.map((colDef) => {
      if (colDef.field && !colDef.lockVisible) {
        const field = colDef.field;
        return {
          ...colDef,
          hide: getAgGridColumnHide(
            field,
            columnVisibility,
            isNarrowScreen,
            NARROW_AUTO_HIDE_FIELDS
          ),
        };
      }
      return colDef;
    });
  }, [columnVisibility, baseColDefs, isNarrowScreen]);

  // Get all column definitions for the visibility menu
  const columnMenuItems = useMemo(() => {
    return colDefs
      .filter((col) => col.field && !col.lockVisible)
      .map((col) => ({
        field: col.field!,
        headerName: col.headerName || col.field!,
        isVisible: !col.hide,
      }));
  }, [colDefs]);

  const setColumnVisible = (field: string, visible: boolean) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [field]: visible,
    }));
  };

  // Save column visibility to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      resizable: true,
      minWidth: 80,
    };
  }, []);

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex
        align="start"
        justify="between"
        wrap="wrap"
        gap="4"
        className="w-full min-w-0"
      >
        <Box style={{ flex: "1 1 220px", minWidth: 0 }}>
          <Heading size={{ initial: "6", md: "8" }}>Users</Heading>
          <Text size="3" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Manage system users and permissions
          </Text>
        </Box>
        <Flex
          gap="3"
          wrap="wrap"
          align="center"
          justify="end"
          className="w-full min-w-0 sm:w-auto sm:ml-auto"
        >
        <Dialog.Root open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <Dialog.Trigger>
            <Button
              size="3"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-text-dark)",
                fontWeight: "600",
              }}
            >
              <FiMail size={18} style={{ marginRight: "8px" }} />
              Create User
            </Button>
          </Dialog.Trigger>
          <Dialog.Content style={{ maxWidth: "500px" }}>
            <Dialog.Title>Create New User</Dialog.Title>
            <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
              Create a new user account with role-specific access.
            </Dialog.Description>

            <form onSubmit={inviteFormik.handleSubmit}>
              <Flex direction="column" gap="4">
                <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="invite-full-name"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Full Name *
                  </Text>
                  <TextField.Root
                    id="invite-full-name"
                    name="full_name"
                    placeholder="User full name"
                    value={inviteFormik.values.full_name}
                    onChange={inviteFormik.handleChange}
                    onBlur={inviteFormik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        inviteFormik.touched.full_name && inviteFormik.errors.full_name
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {inviteFormik.touched.full_name && inviteFormik.errors.full_name && (
                    <Text size="1" color="red" mt="1" className="block">
                      {inviteFormik.errors.full_name}
                    </Text>
                  )}
                </Box>

                <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="invite-email"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Email Address *
                  </Text>
                  <TextField.Root
                    id="invite-email"
                    name="email"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteFormik.values.email}
                    onChange={inviteFormik.handleChange}
                    onBlur={inviteFormik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        inviteFormik.touched.email && inviteFormik.errors.email
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {inviteFormik.touched.email && inviteFormik.errors.email && (
                    <Text size="1" color="red" mt="1" className="block">
                      {inviteFormik.errors.email}
                    </Text>
                  )}
                </Box>

                <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="invite-password"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Password *
                  </Text>
                  <TextField.Root
                    id="invite-password"
                    name="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={inviteFormik.values.password}
                    onChange={inviteFormik.handleChange}
                    onBlur={inviteFormik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        inviteFormik.touched.password && inviteFormik.errors.password
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {inviteFormik.touched.password && inviteFormik.errors.password && (
                    <Text size="1" color="red" mt="1" className="block">
                      {inviteFormik.errors.password}
                    </Text>
                  )}
                </Box>

                <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="invite-role"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Role *
                  </Text>
                  <Select.Root
                    value={inviteFormik.values.role}
                    onValueChange={(value) => inviteFormik.setFieldValue("role", value)}
                  >
                    <Select.Trigger
                      id="invite-role"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          inviteFormik.touched.role && inviteFormik.errors.role
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                      }}
                    />
                    <Select.Content>
                      <Select.Item value="ADMIN">Admin</Select.Item>
                      <Select.Item value="ACCOUNT_MANAGER">Account Manager</Select.Item>
                      <Select.Item value="VENDOR">Vendor</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  {inviteFormik.touched.role && inviteFormik.errors.role && (
                    <Text size="1" color="red" mt="1" className="block">
                      {inviteFormik.errors.role}
                    </Text>
                  )}
                </Box>

                {inviteFormik.values.role === "VENDOR" && (
                  <Box>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="invite-vendor"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Vendor *
                    </Text>
                    <Select.Root
                      value={inviteFormik.values.vendor_id ? String(inviteFormik.values.vendor_id) : ""}
                      onValueChange={(value) =>
                        inviteFormik.setFieldValue("vendor_id", value ? Number(value) : null)
                      }
                    >
                      <Select.Trigger
                        id="invite-vendor"
                        placeholder="Select vendor"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border:
                            inviteFormik.touched.vendor_id && inviteFormik.errors.vendor_id
                              ? "1px solid var(--color-error)"
                              : "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                          width: "100%",
                        }}
                      />
                      <Select.Content>
                        {vendors.map((vendor) => (
                          <Select.Item key={vendor.id} value={String(vendor.id)}>
                            {vendor.company_name}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    {inviteFormik.touched.vendor_id && inviteFormik.errors.vendor_id && (
                      <Text size="1" color="red" mt="1" className="block">
                        {String(inviteFormik.errors.vendor_id)}
                      </Text>
                    )}
                  </Box>
                )}

                <Flex gap="3" justify="end" mt="4">
                  <Dialog.Close>
                    <Button
                      type="button"
                      variant="soft"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="submit"
                    disabled={isInviting || !inviteFormik.isValid}
                    style={{
                      background: isInviting || !inviteFormik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                      color: isInviting || !inviteFormik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                      fontWeight: "600",
                    }}
                  >
                    {isInviting ? "Creating..." : "Create User"}
                  </Button>
                </Flex>
              </Flex>
            </form>
          </Dialog.Content>
        </Dialog.Root>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button
                size="3"
                variant="soft"
                style={{
                  background: "var(--color-dark-bg-secondary)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiColumns size={18} />
                Columns
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              style={{
                background: "var(--color-dark-bg-secondary)",
                border: "1px solid var(--color-dark-bg-tertiary)",
                minWidth: "220px",
                padding: "8px",
              }}
            >
              <DropdownMenu.Label
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "12px",
                  fontWeight: "600",
                  padding: "8px 12px 4px",
                  textTransform: "uppercase",
                }}
              >
                Show/Hide Columns
              </DropdownMenu.Label>
              <DropdownMenu.Separator
                style={{
                  margin: "8px 0",
                  borderTop: "1px solid var(--color-dark-bg-tertiary)",
                }}
              />
              {columnMenuItems.map((col) => {
                const isVisible = col.isVisible;
                return (
                  <DropdownMenu.Item
                    key={col.field}
                    onSelect={(e) => {
                      e.preventDefault();
                      setColumnVisible(col.field, !isVisible);
                    }}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <Checkbox
                      checked={isVisible}
                      onCheckedChange={(checked) =>
                        setColumnVisible(col.field, checked === true)
                      }
                      style={{
                        pointerEvents: "none",
                      }}
                    />
                    <Text size="2" style={{ flex: 1 }}>
                      {col.headerName}
                    </Text>
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>

      <Flex gap="3" wrap="wrap" align="center" className="w-full min-w-0">
        <Box className="w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
          <TextField.Root
            placeholder="Search users..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="3"
            style={{
              background: "var(--color-dark-bg-secondary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
            }}
          >
            <TextField.Slot>
              <FiSearch style={{ color: "var(--color-text-secondary)" }} size={16} />
            </TextField.Slot>
          </TextField.Root>
        </Box>
      </Flex>

      <Box
        className="table-scroll-x"
        style={{
          flex: 1,
          minHeight: "500px",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          position: "relative",
        }}
      >
        {isLoading ? (
          <TableDataLoader minHeight={500} />
        ) : (
          <AgGridThemeShell>
            <AgGridReact
              rowData={filteredData}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50, 100]}
              animateRows={true}
              rowSelection="single"
              onRowClicked={(params) => {
                router.push(`/users/${params.data?.id}`);
              }}
              suppressCellFocus={true}
              rowStyle={{ cursor: "pointer" }}
            />
          </AgGridThemeShell>
        )}
      </Box>

      {/* Deactivate Confirmation Dialog */}
      <Dialog.Root open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <Dialog.Content style={{ maxWidth: 400 }}>
          <Dialog.Title>Confirm Deactivate</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Are you sure you want to deactivate this user? They will no longer be able to access the system.
          </Dialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={confirmDeactivate}
              style={{
                background: "var(--color-error)",
                color: "white",
                fontWeight: "600",
              }}
            >
              Deactivate
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export default function UsersPage() {
  return (
    <ProtectedRoute>
      <UsersContent />
    </ProtectedRoute>
  );
}
