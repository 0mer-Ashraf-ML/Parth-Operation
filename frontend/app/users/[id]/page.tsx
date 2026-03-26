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
import { toast } from "react-toastify";
import { fetchVendors } from "@/lib/api/services/vendorsService";
import { formatAppDate } from "@/lib/formatDate";
import type { Vendor } from "@/lib/store/vendorsSlice";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  deactivateUserAsync,
  fetchUserByIdAsync,
  updateUserAsync,
  updateUserRoleAsync,
  type User as ApiUser,
  type UserRole as ApiUserRole,
} from "@/lib/store/usersSlice";

type UserRole = "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR";

interface UserDetail {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
  vendor_id: number | null;
  password: string;
}

const validationSchema = yup.object({
  full_name: yup.string().trim().required("Full name is required"),
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
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

const mapUserFromApi = (user: ApiUser): UserDetail => ({
  id: String(user.id),
  full_name: user.full_name,
  email: user.email,
  role: roleToUi(user.role),
  status: user.is_active ? "Active" : "Inactive",
  createdAt: user.created_at,
  updatedAt: user.updated_at,
  vendor_id: user.vendor_id,
  password: "",
});

function UserDetailContent() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const users = useAppSelector((state) => state.users.users);
  const params = useParams();
  const userId = params?.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [notFoundState, setNotFoundState] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [initialRole, setInitialRole] = useState<UserRole>("ADMIN");
  const [initialVendorId, setInitialVendorId] = useState<number | null>(null);

  const formik = useFormik<UserDetail>({
    initialValues: {
      id: "",
      full_name: "",
      email: "",
      role: "ADMIN",
      status: "Active",
      createdAt: "",
      updatedAt: "",
      vendor_id: null,
      password: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      setIsSaving(true);
      try {
        if (
          initialRole !== values.role ||
          (values.role === "VENDOR" && initialVendorId !== values.vendor_id)
        ) {
          await dispatch(
            updateUserRoleAsync({
              userId: values.id,
              payload: {
            role: roleToApi(values.role),
            vendor_id: values.role === "VENDOR" ? values.vendor_id : null,
              },
            })
          ).unwrap();
        }

        const patchPayload: {
          email?: string;
          full_name?: string;
          password?: string;
          is_active?: boolean;
        } = {
          email: values.email.trim(),
          full_name: values.full_name.trim(),
          is_active: values.status === "Active",
        };
        if (values.password.trim()) {
          patchPayload.password = values.password.trim();
        }

        const updated = await dispatch(
          updateUserAsync({ userId: values.id, payload: patchPayload })
        ).unwrap();
        formik.setValues(mapUserFromApi(updated));
        setInitialRole(roleToUi(updated.role));
        setInitialVendorId(updated.vendor_id);
      } catch (error: any) {
        toast.error(error.message || "Failed to update user");
      } finally {
        setIsSaving(false);
      }
    },
  });

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) {
        setIsLoading(false);
        setNotFoundState(true);
        return;
      }

      try {
        const existing = users.find((u) => String(u.id) === userId);
        const userData = existing ?? (await dispatch(fetchUserByIdAsync(userId)).unwrap());
        const mapped = mapUserFromApi(userData);
        formik.setValues(mapped);
        setInitialRole(mapped.role);
        setInitialVendorId(mapped.vendor_id);
      } catch {
        setNotFoundState(true);
      }
      setIsLoading(false);
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, users, dispatch]);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const data = await fetchVendors();
        setVendors(data.filter((v) => v.is_active));
      } catch {
        // Keep page usable even if vendors endpoint fails.
      }
    };
    loadVendors();
  }, []);

  const handleDeactivate = () => {
    setDeactivateDialogOpen(true);
  };

  const confirmDeactivate = async () => {
    setIsDeactivating(true);
    try {
      await dispatch(deactivateUserAsync(formik.values.id)).unwrap();
      formik.setFieldValue("status", "Inactive");
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate user");
    } finally {
      setIsDeactivating(false);
      setDeactivateDialogOpen(false);
    }
  };

  const handleActivate = async () => {
    setIsDeactivating(true);
    try {
      await dispatch(
        updateUserAsync({ userId: formik.values.id, payload: { is_active: true } })
      ).unwrap();
      formik.setFieldValue("status", "Active");
    } catch (error: any) {
      toast.error(error.message || "Failed to activate user");
    } finally {
      setIsDeactivating(false);
    }
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

  const isViewedUserAdmin = formik.values.role === "ADMIN";

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
                  <FiUser size={14} style={{ color: "var(--color-text-secondary)" }} />
                  <Text
                    size="2"
                    weight="medium"
                    as="label"
                    htmlFor="full_name"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Full Name *
                  </Text>
                </Flex>
                <TextField.Root
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={formik.values.full_name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border:
                      formik.touched.full_name && formik.errors.full_name
                        ? "1px solid var(--color-error)"
                        : "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {formik.touched.full_name && formik.errors.full_name && (
                  <Text size="1" color="red" mt="1" className="block">
                    {formik.errors.full_name}
                  </Text>
                )}
              </Box>

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
                      as={isViewedUserAdmin ? "span" : "label"}
                      htmlFor={isViewedUserAdmin ? undefined : "role"}
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Role {isViewedUserAdmin ? "" : "*"}
                    </Text>
                  </Flex>
                  {isViewedUserAdmin ? (
                    <Badge color="red" size="2" id="role-readonly">
                      Admin
                    </Badge>
                  ) : (
                    <>
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
                    </>
                  )}
                </Box>

                {!isViewedUserAdmin && (
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="vendor_id"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Vendor {formik.values.role === "VENDOR" ? "*" : "(optional)"}
                  </Text>
                  <Select.Root
                    value={formik.values.vendor_id ? String(formik.values.vendor_id) : ""}
                    onValueChange={(value) =>
                      formik.setFieldValue("vendor_id", value ? Number(value) : null)
                    }
                  >
                    <Select.Trigger
                      id="vendor_id"
                      placeholder="Select vendor"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.vendor_id && formik.errors.vendor_id
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
                  {formik.touched.vendor_id && formik.errors.vendor_id && (
                    <Text size="1" color="red" mt="1" className="block">
                      {String(formik.errors.vendor_id)}
                    </Text>
                  )}
                </Box>
                )}

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
                    Created At{" "}
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {formik.values.createdAt ? formatAppDate(formik.values.createdAt) : "—"}
                  </Text>
                </Box>
                <Box>
                  <Text size="2" style={{ color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                    Last Updated{" "}
                  </Text>
                  <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                    {formik.values.updatedAt ? formatAppDate(formik.values.updatedAt) : "—"}
                  </Text>
                </Box>
              </Flex>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="password"
                  className="block"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  New Password (optional)
                </Text>
                <TextField.Root
                  id="password"
                  name="password"
                  type="password"
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  placeholder="Leave empty to keep current password"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </Box>
            </Flex>
          </Card>

          {/* Action Buttons */}
          <Flex gap="3" justify="between" wrap="wrap">
            {!isViewedUserAdmin && (
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
            )}
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
