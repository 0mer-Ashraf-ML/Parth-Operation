"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Box, TextField, Button, Badge, Dialog, Select, DropdownMenu, Checkbox } from "@radix-ui/themes";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { FiSearch, FiPlus, FiMail, FiUser, FiUserX, FiColumns } from "react-icons/fi";
import { useFormik } from "formik";
import * as yup from "yup";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";
import { getAgGridColumnHide } from "@/lib/agGridResponsive";

type UserRole = "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR";

interface User {
  id: string;
  email: string;
  role: UserRole;
  status: "Active" | "Inactive";
  invitedAt: string;
  lastLogin: string | null;
  assignedClientsCount: number;
}

// Mock data - replace with actual API call
const mockUsers: User[] = [
  {
    id: "1",
    email: "admin@parth.com",
    role: "ADMIN",
    status: "Active",
    invitedAt: "2024-01-01",
    lastLogin: "2024-02-15",
    assignedClientsCount: 0,
  },
  {
    id: "2",
    email: "manager@parth.com",
    role: "ACCOUNT_MANAGER",
    status: "Active",
    invitedAt: "2024-01-05",
    lastLogin: "2024-02-14",
    assignedClientsCount: 3,
  },
  {
    id: "3",
    email: "vendor@techsolutions.com",
    role: "VENDOR",
    status: "Active",
    invitedAt: "2024-01-10",
    lastLogin: "2024-02-13",
    assignedClientsCount: 0,
  },
  {
    id: "4",
    email: "manager2@parth.com",
    role: "ACCOUNT_MANAGER",
    status: "Inactive",
    invitedAt: "2024-01-15",
    lastLogin: "2024-01-20",
    assignedClientsCount: 2,
  },
];

const inviteValidationSchema = yup.object({
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
  role: yup
    .string()
    .oneOf(["ADMIN", "ACCOUNT_MANAGER", "VENDOR"], "Please select a role")
    .required("Role is required"),
});

// Column visibility storage key
const COLUMN_VISIBILITY_STORAGE_KEY = "users-table-column-visibility";

const NARROW_AUTO_HIDE_FIELDS = new Set(["assignedClientsCount", "lastLogin"]);

function UsersContent() {
  const router = useRouter();
  const [rowData, setRowData] = useState<User[]>(mockUsers);
  const [searchText, setSearchText] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);
  const isNarrowScreen = useNarrowScreen();

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

  const inviteFormik = useFormik<{ email: string; role: UserRole | "" }>({
    initialValues: {
      email: "",
      role: "",
    },
    validationSchema: inviteValidationSchema,
    onSubmit: async (values) => {
      setIsInviting(true);
      // Simulate API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Add new user to list
      const newUser: User = {
        id: Date.now().toString(),
        email: values.email,
        role: values.role as UserRole,
        status: "Active",
        invitedAt: new Date().toISOString().split("T")[0],
        lastLogin: null,
        assignedClientsCount: 0,
      };
      
      setRowData([...rowData, newUser]);
      inviteFormik.resetForm();
      setInviteDialogOpen(false);
      setIsInviting(false);
      
      // In a real app, you would send an invitation email here
      alert(`Invitation sent to ${values.email}`);
    },
  });

  const filteredData = useMemo(() => {
    if (!searchText) return rowData;
    
    const searchLower = searchText.toLowerCase();
    return rowData.filter(
      (user) =>
        user.email.toLowerCase().includes(searchLower) ||
        user.role.toLowerCase().includes(searchLower) ||
        user.status.toLowerCase().includes(searchLower)
    );
  }, [rowData, searchText]);

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
    
    setRowData(
      rowData.map((user) =>
        user.id === userToDeactivate ? { ...user, status: "Inactive" as const } : user
      )
    );
    setDeactivateDialogOpen(false);
    setUserToDeactivate(null);
    
    // In a real app, you would call an API here
    alert("User deactivated successfully");
  };

  const handleActivate = async (userId: string) => {
    setRowData(
      rowData.map((user) =>
        user.id === userId ? { ...user, status: "Active" as const } : user
      )
    );
    
    // In a real app, you would call an API here
    alert("User activated successfully");
  };

  // Base column definitions - memoized to avoid recreation on every render
  const baseColDefs = useMemo<ColDef<User>[]>(() => [
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 120,
      filter: true,
      sortable: true,
      lockVisible: true, // Always show Email (primary identifier)
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
      field: "assignedClientsCount",
      headerName: "Assigned Clients",
      width: 150,
      flex: 1,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<User>) => {
        if (params.data?.role !== "ACCOUNT_MANAGER") {
          return <Text style={{ color: "var(--color-text-secondary)" }}>—</Text>;
        }
        return params.value || 0;
      },
    },
    {
      field: "lastLogin",
      headerName: "Last Login",
      width: 130,
      flex: 1,
      filter: true,
      sortable: true,
      cellRenderer: (params: ICellRendererParams<User>) => {
        return params.value
          ? new Date(params.value).toLocaleDateString()
          : <Text style={{ color: "var(--color-text-secondary)" }}>Never</Text>;
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
              Invite User
            </Button>
          </Dialog.Trigger>
          <Dialog.Content style={{ maxWidth: "500px" }}>
            <Dialog.Title>Invite New User</Dialog.Title>
            <Dialog.Description size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
              Send an invitation email to a new user. They will receive instructions to set up their account.
            </Dialog.Description>

            <form onSubmit={inviteFormik.handleSubmit}>
              <Flex direction="column" gap="4">
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
                    {isInviting ? "Sending..." : "Send Invitation"}
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
        }}
      >
        <div
          className="ag-theme-alpine-dark min-w-0"
          style={{
            height: "100%",
            width: "100%",
            "--ag-background-color": "var(--color-dark-bg-secondary)",
            "--ag-header-background-color": "var(--color-dark-bg-tertiary)",
            "--ag-odd-row-background-color": "var(--color-dark-bg)",
            "--ag-row-hover-color": "var(--color-primary-hover)",
            "--ag-header-foreground-color": "var(--color-text-primary)",
            "--ag-foreground-color": "var(--color-text-primary)",
            "--ag-border-color": "var(--color-dark-bg-tertiary)",
          } as React.CSSProperties}
        >
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
        </div>
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
