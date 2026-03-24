"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  createVendorAsync,
  fetchVendorByIdAsync,
  updateVendorAsync,
  deleteVendorAsync,
  CreateVendorRequest,
  UpdateVendorRequest,
  Vendor,
} from "@/lib/store/vendorsSlice";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import {
  Flex,
  Text,
  Heading,
  Box,
  TextField,
  Button,
  Card,
  Switch,
  Badge,
} from "@radix-ui/themes";
import { FiArrowLeft, FiTrash2, FiSave } from "react-icons/fi";

interface VendorFormData {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  lead_time_weeks: number;
}

const validationSchema = yup.object({
  company_name: yup.string().required("Company name is required"),
  contact_name: yup.string().required("Contact name is required"),
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
  phone: yup.string(),
  is_active: yup.boolean(),
  lead_time_weeks: yup.number().min(0, "Lead time must be 0 or greater").nullable(),
});

// Helper function to map vendor to form data
const mapVendorToFormData = (vendor: Vendor | null): VendorFormData => {
  if (!vendor) {
    return {
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      is_active: true,
      lead_time_weeks: 0,
    };
  }
  return {
    company_name: vendor.company_name || "",
    contact_name: vendor.contact_name || "",
    email: vendor.email || "",
    phone: vendor.phone || "",
    is_active: vendor.is_active ?? true,
    lead_time_weeks: vendor.lead_time_weeks ?? 0,
  };
};

function VendorDetailContent() {
  const router = useRouter();
  const params = useParams();
  const dispatch = useAppDispatch();
  const { isLoading: reduxLoading } = useAppSelector((state) => state.vendors);
  
  const vendorId = params?.id as string;
  const isNew = vendorId === "new";
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [originalFormValues, setOriginalFormValues] = useState<VendorFormData | null>(null);

  const formik = useFormik<VendorFormData>({
    initialValues: {
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      is_active: true,
      lead_time_weeks: 0,
    },
    validationSchema,
    onSubmit: async (values) => {
      setIsSaving(true);
      try {
        if (isNew) {
          const createData: CreateVendorRequest = {
            company_name: values.company_name,
            contact_name: values.contact_name,
            email: values.email,
            phone: values.phone || undefined,
            lead_time_weeks: values.lead_time_weeks || undefined,
          };
          const result = await dispatch(createVendorAsync(createData)).unwrap();
          // Use the response data directly instead of fetching again
          const formData = mapVendorToFormData(result);
          formik.setValues(formData);
          setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
          router.push(`/vendors/${result.id}`);
        } else {
          const updateData: UpdateVendorRequest = {
            company_name: values.company_name,
            contact_name: values.contact_name,
            email: values.email,
            phone: values.phone || undefined,
            is_active: values.is_active,
            lead_time_weeks: values.lead_time_weeks || undefined,
          };
          const updatedVendor = await dispatch(updateVendorAsync({ vendorId: parseInt(vendorId), vendorData: updateData })).unwrap();
          // Use the response data directly instead of fetching again
          const formData = mapVendorToFormData(updatedVendor);
          formik.setValues(formData);
          setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
        }
      } catch (error: any) {
        console.error("Error saving vendor:", error);
        // Error toast is handled in the slice
      } finally {
        setIsSaving(false);
      }
    },
  });

  // Load vendor data when editing
  useEffect(() => {
    if (!isNew && vendorId) {
      const loadVendor = async () => {
        try {
          const vendor = await dispatch(fetchVendorByIdAsync(vendorId)).unwrap();
          const formData = mapVendorToFormData(vendor);
          formik.setValues(formData);
          setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
        } catch (error: any) {
          console.error("Error loading vendor:", error);
          // Error toast is handled in the slice
        }
      };
      loadVendor();
    } else {
      const initialData = mapVendorToFormData(null);
      formik.setValues(initialData);
      setOriginalFormValues(JSON.parse(JSON.stringify(initialData)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, isNew, dispatch]);

  const handleDelete = async () => {
    if (isNew) return;
    setIsDeleting(true);
    try {
      await dispatch(deleteVendorAsync(parseInt(vendorId))).unwrap();
      router.push("/vendors");
    } catch (error: any) {
      console.error("Error deleting vendor:", error);
      // Error toast is handled in the slice
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const hasFormChanged = useMemo(() => {
    if (!originalFormValues) return false;
    return JSON.stringify(formik.values) !== JSON.stringify(originalFormValues);
  }, [formik.values, originalFormValues]);

  const isLoading = reduxLoading && !isNew;

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: "400px" }}>
        <Text size="3" style={{ color: "var(--color-text-secondary)" }}>
          Loading vendor...
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <Flex align="center" gap="3">
          <Button
            variant="ghost"
            onClick={() => router.push("/vendors")}
            style={{ color: "var(--color-text-primary)" }}
          >
            <FiArrowLeft size={18} />
          </Button>
          <Heading size={{ initial: "6", md: "8" }}>
            {isNew ? "Add New Vendor" : "Vendor Details"}
          </Heading>
        </Flex>
        {!isNew && (
          <Button
            variant="soft"
            color="red"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isDeleting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FiTrash2 size={16} />
            {isDeleting ? "Deleting..." : "Delete Vendor"}
          </Button>
        )}
      </Flex>

      <form onSubmit={formik.handleSubmit}>
        <Flex direction="column" gap="6">
          {/* Basic Information Card */}
          <Card style={{ padding: "1.5rem", background: "var(--color-dark-bg-secondary)" }}>
            <Flex direction="column" gap="4">
              <Flex align="center" justify="between" wrap="wrap" gap="3">
                <Heading size={{ initial: "4", md: "5" }}>Basic Information</Heading>
                {!isNew && (
                  <Badge color={formik.values.is_active ? "green" : "red"} size="2">
                    {formik.values.is_active ? "Active" : "Inactive"}
                  </Badge>
                )}
              </Flex>

              <Flex direction="column" gap="4">
                <Flex gap="4" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "250px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="company_name"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Company Name *
                    </Text>
                    <TextField.Root
                      id="company_name"
                      name="company_name"
                      value={formik.values.company_name}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.company_name && formik.errors.company_name
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.company_name && formik.errors.company_name && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.company_name}
                      </Text>
                    )}
                  </Box>

                  <Box style={{ flex: "1", minWidth: "250px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="contact_name"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Contact Name *
                    </Text>
                    <TextField.Root
                      id="contact_name"
                      name="contact_name"
                      value={formik.values.contact_name}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.contact_name && formik.errors.contact_name
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.contact_name && formik.errors.contact_name && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.contact_name}
                      </Text>
                    )}
                  </Box>
                </Flex>

                <Flex gap="4" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "250px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="email"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Email *
                    </Text>
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

                  <Box style={{ flex: "1", minWidth: "250px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="phone"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Phone
                    </Text>
                    <TextField.Root
                      id="phone"
                      name="phone"
                      value={formik.values.phone}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.phone && formik.errors.phone
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.phone && formik.errors.phone && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.phone}
                      </Text>
                    )}
                  </Box>
                </Flex>

                <Flex gap="4" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "250px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="lead_time_weeks"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Lead Time (Weeks)
                    </Text>
                    <TextField.Root
                      id="lead_time_weeks"
                      name="lead_time_weeks"
                      type="number"
                      min="0"
                      value={formik.values.lead_time_weeks || ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                        formik.setFieldValue("lead_time_weeks", isNaN(value) ? 0 : value);
                      }}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.lead_time_weeks && formik.errors.lead_time_weeks
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.lead_time_weeks && formik.errors.lead_time_weeks && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.lead_time_weeks}
                      </Text>
                    )}
                  </Box>
                </Flex>

                {!isNew && (
                  <Flex align="center" gap="3">
                    <Text
                      size="2"
                      weight="medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Active Status
                    </Text>
                    <Switch
                      checked={formik.values.is_active}
                      onCheckedChange={(checked) =>
                        formik.setFieldValue("is_active", checked)
                      }
                    />
                    <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                      {formik.values.is_active ? "Active" : "Inactive"}
                    </Text>
                  </Flex>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Action Buttons for Existing Vendors - Show when form has changes */}
          {hasFormChanged && !isNew && (
            <Flex gap="3" justify="end" wrap="wrap">
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => {
                  if (originalFormValues) {
                    formik.setValues(originalFormValues);
                  }
                }}
                disabled={isSaving}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="2"
                disabled={isSaving || !formik.isValid}
                style={{
                  background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiSave size={16} />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </Flex>
          )}

          {/* Action Buttons for New Vendors - Show at bottom */}
          {isNew && (
            <Flex gap="3" justify="end" wrap="wrap">
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => router.push("/vendors")}
                disabled={isSaving}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="2"
                disabled={isSaving || !formik.isValid}
                style={{
                  background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiSave size={16} />
                {isSaving ? "Creating..." : "Create Vendor"}
              </Button>
            </Flex>
          )}
        </Flex>
      </form>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Confirm Delete"
        description="Are you sure you want to deactivate this vendor? This action cannot be undone."
      />
    </Flex>
  );
}

export default function VendorDetailPage() {
  return (
    <ProtectedRoute>
      <VendorDetailContent />
    </ProtectedRoute>
  );
}
