"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Flex,
  Text,
  Heading,
  Box,
  Card,
  Badge,
  Button,
  Select,
  Separator,
  Checkbox,
  TextField,
  Dialog,
} from "@radix-ui/themes";
import { 
  FiArrowLeft, 
  FiUser, 
  FiMail, 
  FiShield,
  FiUsers,
  FiSave,
  FiUserX,
  FiUserCheck
} from "react-icons/fi";

type UserRole = "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR";

interface UserDetail {
  id: string;
  email: string;
  role: UserRole;
  status: "Active" | "Inactive";
  invitedAt: string;
  lastLogin: string | null;
  assignedClientIds: string[];
}

interface Client {
  id: string;
  name: string;
}

// Mock clients - replace with actual API call
const mockClients: Client[] = [
  { id: "1", name: "Acme Corporation" },
  { id: "2", name: "Tech Solutions Inc" },
  { id: "3", name: "Global Industries" },
  { id: "4", name: "Metro Distributors" },
];

// Mock function to fetch user data - replace with actual API call
const fetchUserData = async (id: string): Promise<UserDetail | null> => {
  // Mock data - replace with actual API call
  const mockUsers: Record<string, UserDetail> = {
    "1": {
      id: "1",
      email: "admin@parth.com",
      role: "ADMIN",
      status: "Active",
      invitedAt: "2024-01-01",
      lastLogin: "2024-02-15",
      assignedClientIds: [],
    },
    "2": {
      id: "2",
      email: "manager@parth.com",
      role: "ACCOUNT_MANAGER",
      status: "Active",
      invitedAt: "2024-01-05",
      lastLogin: "2024-02-14",
      assignedClientIds: ["1", "2", "3"],
    },
    "3": {
      id: "3",
      email: "vendor@techsolutions.com",
      role: "VENDOR",
      status: "Active",
      invitedAt: "2024-01-10",
      lastLogin: "2024-02-13",
      assignedClientIds: [],
    },
    "4": {
      id: "4",
      email: "manager2@parth.com",
      role: "ACCOUNT_MANAGER",
      status: "Inactive",
      invitedAt: "2024-01-15",
      lastLogin: "2024-01-20",
      assignedClientIds: ["1", "4"],
    },
  };
  
  return mockUsers[id] || null;
};

const validationSchema = yup.object({
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
  role: yup
    .string()
    .oneOf(["ADMIN", "ACCOUNT_MANAGER", "VENDOR"], "Please select a role")
    .required("Role is required"),
});

function UserDetailContent() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [notFoundState, setNotFoundState] = useState(false);

  const formik = useFormik<UserDetail>({
    initialValues: {
      id: "",
      email: "",
      role: "ADMIN",
      status: "Active",
      invitedAt: "",
      lastLogin: null,
      assignedClientIds: [],
    },
    validationSchema,
    onSubmit: async (values) => {
      setIsSaving(true);
      // Simulate API call - replace with actual API
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log("Saving user:", values);
      setIsSaving(false);
      alert("User updated successfully");
    },
  });

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) {
        setIsLoading(false);
        setNotFoundState(true);
        return;
      }
      
      const userData = await fetchUserData(userId);
      if (userData) {
        formik.setValues(userData);
      } else {
        // User not found - trigger 404
        setNotFoundState(true);
      }
      setIsLoading(false);
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleClientToggle = (clientId: string) => {
    const currentIds = formik.values.assignedClientIds;
    const newIds = currentIds.includes(clientId)
      ? currentIds.filter((id) => id !== clientId)
      : [...currentIds, clientId];
    formik.setFieldValue("assignedClientIds", newIds);
  };

  const handleDeactivate = () => {
    setDeactivateDialogOpen(true);
  };

  const confirmDeactivate = async () => {
    setIsDeactivating(true);
    // Simulate API call - replace with actual API
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    formik.setFieldValue("status", "Inactive");
    setIsDeactivating(false);
    setDeactivateDialogOpen(false);
    // TODO: Replace alert with toast notification
    alert("User deactivated successfully");
  };

  const handleActivate = async () => {
    setIsDeactivating(true);
    // Simulate API call - replace with actual API
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    formik.setFieldValue("status", "Active");
    setIsDeactivating(false);
    alert("User activated successfully");
  };

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

  // Trigger Next.js 404 handling when resource is not found
  if (notFoundState && !isLoading) {
    notFound();
  }

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: "400px" }}>
        <Text>Loading...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" gap="3">
        <Button
          variant="ghost"
          onClick={() => router.push("/users")}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <FiUser size={24} style={{ color: "var(--color-primary)" }} />
        <Heading size={{ initial: "6", md: "8" }}>User Details</Heading>
      </Flex>

      <form onSubmit={formik.handleSubmit}>
        <Flex direction="column" gap="6">
          {/* Basic Information */}
          <Card style={{ padding: "1.5rem" }}>
            <Heading size={{ initial: "4", md: "5" }} mb="4">
              Basic Information
            </Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Flex align="center" gap="2" mb="2">
                  <FiMail size={14} style={{ color: "var(--color-text-secondary)" }} />
                  <Text
                    size="2"
                    weight="medium"
                    as="label"
                    htmlFor="email"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Email Address *
                  </Text>
                </Flex>
                <TextField.Root
                  id="email"
                  name="email"
                  type="email"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border:
                      formik.touched.email && formik.errors.email
                        ? "1px solid var(--color-error)"
                        : "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {formik.touched.email && formik.errors.email && (
                  <Text size="1" color="red" mt="1" className="block">
                    {formik.errors.email}
                  </Text>
                )}
              </Box>

              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Flex align="center" gap="2" mb="2">
                    <FiShield size={14} style={{ color: "var(--color-text-secondary)" }} />
                    <Text
                      size="2"
                      weight="medium"
                      as="label"
                      htmlFor="role"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Role *
                    </Text>
                  </Flex>
                  <Select.Root
                    value={formik.values.role}
                    onValueChange={(value) => formik.setFieldValue("role", value as UserRole)}
                  >
                    <Select.Trigger
                      id="role"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.role && formik.errors.role
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
                  {formik.touched.role && formik.errors.role && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.role}
                    </Text>
                  )}
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Status
                  </Text>
                  <Badge color={formik.values.status === "Active" ? "green" : "gray"} size="2">
                    {formik.values.status}
                  </Badge>
                </Box>
              </Flex>

              <Flex gap="4" wrap="wrap">
                <Box>
                  <Text size="2" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Invited At
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {new Date(formik.values.invitedAt).toLocaleDateString()}
                  </Text>
                </Box>
                <Box>
                  <Text size="2" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Last Login
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {formik.values.lastLogin
                      ? new Date(formik.values.lastLogin).toLocaleDateString()
                      : "Never"}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          </Card>

          {/* Client Assignment (Only for Account Managers) */}
          {formik.values.role === "ACCOUNT_MANAGER" && (
            <Card style={{ padding: "1.5rem" }}>
              <Flex align="center" gap="2" mb="4">
                <FiUsers size={20} style={{ color: "var(--color-primary)" }} />
                <Heading size={{ initial: "4", md: "5" }}>Assigned Clients</Heading>
              </Flex>
              <Text size="2" style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}>
                Select which clients this Account Manager can access:
              </Text>
              <Flex direction="column" gap="3">
                {mockClients.map((client) => (
                  <Flex key={client.id} align="center" gap="2">
                    <Checkbox
                      checked={formik.values.assignedClientIds.includes(client.id)}
                      onCheckedChange={() => handleClientToggle(client.id)}
                    />
                    <Text 
                      size="3" 
                      style={{ color: "var(--color-text-primary)", cursor: "pointer" }}
                      onClick={() => handleClientToggle(client.id)}
                    >
                      {client.name}
                    </Text>
                  </Flex>
                ))}
              </Flex>
              {formik.values.assignedClientIds.length === 0 && (
                <Text size="2" style={{ color: "var(--color-text-secondary)", marginTop: "12px" }}>
                  No clients assigned. This Account Manager will not have access to any clients.
                </Text>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <Flex gap="3" justify="between" wrap="wrap">
            <Flex gap="3">
              {formik.values.status === "Active" ? (
                <Button
                  type="button"
                  variant="soft"
                  size="3"
                  onClick={handleDeactivate}
                  disabled={isDeactivating}
                  style={{
                    color: "var(--color-error)",
                    borderColor: "var(--color-error)",
                  }}
                >
                  <FiUserX size={18} style={{ marginRight: "8px" }} />
                  {isDeactivating ? "Deactivating..." : "Deactivate User"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="soft"
                  size="3"
                  onClick={handleActivate}
                  disabled={isDeactivating}
                  style={{
                    color: "var(--color-primary)",
                    borderColor: "var(--color-primary)",
                  }}
                >
                  <FiUserCheck size={18} style={{ marginRight: "8px" }} />
                  {isDeactivating ? "Activating..." : "Activate User"}
                </Button>
              )}
            </Flex>
            <Flex gap="3">
              <Button
                type="button"
                variant="soft"
                size="3"
                onClick={() => router.push("/users")}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="3"
                disabled={isSaving || !formik.isValid}
                style={{
                  background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiSave size={18} style={{ marginRight: "8px" }} />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </form>

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
              disabled={isDeactivating}
              style={{
                background: "var(--color-error)",
                color: "white",
                fontWeight: "600",
              }}
            >
              {isDeactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export default function UserDetailPage() {
  return (
    <ProtectedRoute>
      <UserDetailContent />
    </ProtectedRoute>
  );
}
