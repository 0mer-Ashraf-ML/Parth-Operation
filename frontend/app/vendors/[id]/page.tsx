"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import { toast } from "react-toastify";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  createVendorAsync,
  fetchVendorByIdAsync,
  updateVendorAsync,
  deleteVendorAsync,
  createVendorAddressAsync,
  updateVendorAddressAsync,
  deleteVendorAddressAsync,
  CreateVendorRequest,
  UpdateVendorRequest,
  Vendor,
  type VendorAddressRequest,
} from "@/lib/store/vendorsSlice";
import { fetchSKUsAsync } from "@/lib/store/skusSlice";
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
  Separator,
} from "@radix-ui/themes";
import { FiArrowLeft, FiTrash2, FiSave, FiPlus } from "react-icons/fi";
import {
  fetchVendorClients,
  type VendorClientLink,
  type VendorClientSku,
} from "@/lib/api/services/vendorsService";

interface VendorAddressFormRow {
  id: string;
  label: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_default: boolean;
}

interface VendorFormData {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  lead_time_weeks: number;
  addresses: VendorAddressFormRow[];
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

function newAddressRow(): VendorAddressFormRow {
  return {
    id: `${Date.now()}`,
    label: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    zip_code: "",
    country: "US",
    is_default: false,
  };
}

function mapVendorAddressesToForm(vendor: Vendor | null): VendorAddressFormRow[] {
  if (!vendor?.addresses?.length) return [];
  return vendor.addresses.map((a) => ({
    id: a.id != null ? String(a.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    label: a.label || "",
    address_line_1: a.address_line_1 || "",
    address_line_2: a.address_line_2 ?? "",
    city: a.city || "",
    state: a.state || "",
    zip_code: a.zip_code || "",
    country: a.country || "",
    is_default: Boolean(a.is_default),
  }));
}

function rowToVendorAddressRequest(row: VendorAddressFormRow): VendorAddressRequest | null {
  if (!row.label.trim() || !row.address_line_1.trim()) return null;
  return {
    label: row.label.trim(),
    address_line_1: row.address_line_1.trim(),
    address_line_2: row.address_line_2.trim() || undefined,
    city: row.city.trim(),
    state: row.state.trim(),
    zip_code: row.zip_code.trim(),
    country: row.country.trim() || "US",
    is_default: row.is_default,
  };
}

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
      addresses: [],
    };
  }
  return {
    company_name: vendor.company_name || "",
    contact_name: vendor.contact_name || "",
    email: vendor.email || "",
    phone: vendor.phone || "",
    is_active: vendor.is_active ?? true,
    lead_time_weeks: vendor.lead_time_weeks ?? 0,
    addresses: mapVendorAddressesToForm(vendor),
  };
};

function VendorDetailContent() {
  const router = useRouter();
  const params = useParams();
  const dispatch = useAppDispatch();
  const { isLoading: reduxLoading } = useAppSelector((state) => state.vendors);
  const { skus: skusFromStore, lastFetched: skusLastFetched, isLoading: skusLoading } =
    useAppSelector((state) => state.skus);

  const vendorId = params?.id as string;
  const isNew = vendorId === "new";
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAddressDialogOpen, setDeleteAddressDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  const [originalFormValues, setOriginalFormValues] = useState<VendorFormData | null>(null);
  const [originalAddresses, setOriginalAddresses] = useState<VendorAddressFormRow[]>([]);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);
  const [vendorClients, setVendorClients] = useState<VendorClientLink[]>([]);
  const [isLoadingVendorClients, setIsLoadingVendorClients] = useState(false);

  const formik = useFormik<VendorFormData>({
    initialValues: {
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      is_active: true,
      lead_time_weeks: 0,
      addresses: [] as VendorAddressFormRow[],
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
          const vid = result.id;
          for (const row of values.addresses) {
            const payload = rowToVendorAddressRequest(row);
            if (payload) {
              try {
                await dispatch(createVendorAddressAsync({ vendorId: vid, addressData: payload })).unwrap();
              } catch {
                // Thunk already toasts errors
              }
            }
          }
          const vendor = await dispatch(fetchVendorByIdAsync(String(vid))).unwrap();
          const formData = mapVendorToFormData(vendor);
          formik.setValues(formData);
          setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
          setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
          router.push(`/vendors/${vid}`);
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
          const formData = mapVendorToFormData(updatedVendor);
          formik.setValues(formData);
          setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
          setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
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
          setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
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
      setOriginalAddresses([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, isNew, dispatch]);

  useEffect(() => {
    if (isNew || !vendorId) {
      setVendorClients([]);
      return;
    }
    let cancelled = false;
    setIsLoadingVendorClients(true);
    void fetchVendorClients(vendorId)
      .then((rows) => {
        if (!cancelled) setVendorClients(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          toast.error(err.message || "Failed to load vendor clients");
          setVendorClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVendorClients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, vendorId]);

  useEffect(() => {
    if (isNew || vendorClients.length === 0 || isLoadingVendorClients) return;
    if (skusLastFetched != null || skusLoading) return;
    void dispatch(fetchSKUsAsync());
  }, [
    isNew,
    vendorClients.length,
    isLoadingVendorClients,
    skusLastFetched,
    skusLoading,
    dispatch,
  ]);

  const skuIdByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of skusFromStore) {
      m.set(s.sku_code, s.id);
    }
    return m;
  }, [skusFromStore]);

  const resolveSkuDetailId = (sku: VendorClientSku): number | undefined => {
    if (sku.sku_id != null && Number.isFinite(sku.sku_id)) return sku.sku_id;
    return skuIdByCode.get(sku.sku_code);
  };

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

  const addAddress = () => {
    const row = newAddressRow();
    formik.setFieldValue("addresses", [...formik.values.addresses, row]);
    setEditingAddressId(row.id);
  };

  const removeAddress = (id: string) => {
    setAddressToDelete(id);
    setDeleteAddressDialogOpen(true);
  };

  const confirmDeleteAddress = async () => {
    if (!addressToDelete || !vendorId) return;
    const isPersisted = !isNew && originalAddresses.some((a) => a.id === addressToDelete);
    const numericAddressId = addressToDelete != null ? Number(addressToDelete) : NaN;

    setIsDeletingAddress(true);
    try {
      if (isPersisted && !Number.isNaN(numericAddressId)) {
        await dispatch(
          deleteVendorAddressAsync({
            vendorId: parseInt(vendorId, 10),
            addressId: numericAddressId,
          })
        ).unwrap();
        formik.setFieldValue(
          "addresses",
          formik.values.addresses.filter((a) => a.id !== addressToDelete)
        );
        setOriginalAddresses(originalAddresses.filter((a) => a.id !== addressToDelete));
      } else {
        formik.setFieldValue(
          "addresses",
          formik.values.addresses.filter((a) => a.id !== addressToDelete)
        );
        setOriginalAddresses(originalAddresses.filter((a) => a.id !== addressToDelete));
      }
      if (editingAddressId === addressToDelete) {
        setEditingAddressId(null);
      }
    } catch (error: any) {
      console.error("Error deleting address:", error);
    } finally {
      setIsDeletingAddress(false);
      setDeleteAddressDialogOpen(false);
      setAddressToDelete(null);
    }
  };

  const updateAddressField = (
    id: string,
    field: keyof VendorAddressFormRow,
    value: string | boolean
  ) => {
    const next = formik.values.addresses.map((row) =>
      row.id === id ? { ...row, [field]: value } : row
    );
    formik.setFieldValue("addresses", next);
    if (!isNew) {
      setEditingAddressId(id);
    }
  };

  const saveAddress = async (id: string) => {
    const address = formik.values.addresses.find((a) => a.id === id);
    if (!address) return;

    setSavingAddressId(id);
    try {
      if (isNew) {
        setEditingAddressId(null);
        const updatedOriginals = [...originalAddresses];
        const index = updatedOriginals.findIndex((a) => a.id === id);
        if (index !== -1) {
          updatedOriginals[index] = { ...address };
        } else {
          updatedOriginals.push({ ...address });
        }
        setOriginalAddresses(updatedOriginals);
        toast.success("Address saved (will be created with vendor)");
      } else {
        const addressData: VendorAddressRequest = {
          label: address.label || "",
          address_line_1: address.address_line_1 || "",
          address_line_2: address.address_line_2 || undefined,
          city: address.city || "",
          state: address.state || "",
          zip_code: address.zip_code || "",
          country: address.country || "US",
          is_default: address.is_default || false,
        };
        const isExisting = originalAddresses.some((a) => a.id === id);
        const vid = parseInt(vendorId, 10);

        if (isExisting) {
          await dispatch(
            updateVendorAddressAsync({
              vendorId: vid,
              addressId: Number(id),
              addressData,
            })
          ).unwrap();
          setEditingAddressId(null);
          const updatedOriginals = [...originalAddresses];
          const index = updatedOriginals.findIndex((a) => a.id === id);
          if (index !== -1) {
            updatedOriginals[index] = { ...address };
          }
          setOriginalAddresses(updatedOriginals);
        } else {
          const result = await dispatch(
            createVendorAddressAsync({ vendorId: vid, addressData })
          ).unwrap();
          const createdId = result.address.id;
          if (createdId == null) {
            console.error("API did not return address id");
            return;
          }
          const newId = String(createdId);
          const updatedAddresses = formik.values.addresses.map((a) =>
            a.id === id ? { ...a, id: newId } : a
          );
          formik.setFieldValue("addresses", updatedAddresses);
          setEditingAddressId(null);
          setOriginalAddresses([...originalAddresses, { ...address, id: newId }]);
        }
      }
    } catch (error: any) {
      console.error("Error saving address:", error);
    } finally {
      setSavingAddressId(null);
    }
  };

  const cancelAddressEdit = (id: string) => {
    const original = originalAddresses.find((a) => a.id === id);
    if (original) {
      formik.setFieldValue(
        "addresses",
        formik.values.addresses.map((row) => (row.id === id ? { ...original } : row))
      );
    } else {
      formik.setFieldValue(
        "addresses",
        formik.values.addresses.filter((row) => row.id !== id)
      );
    }
    setEditingAddressId(null);
  };

  const hasFormChanged = useMemo(() => {
    if (!originalFormValues) return false;
    const v = formik.values;
    const o = originalFormValues;
    return (
      v.company_name !== o.company_name ||
      v.contact_name !== o.contact_name ||
      v.email !== o.email ||
      v.phone !== o.phone ||
      v.is_active !== o.is_active ||
      v.lead_time_weeks !== o.lead_time_weeks
    );
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

          <Card style={{ padding: "1.5rem" }}>
            <Flex align="center" justify="between" mb="4">
              <Heading size={{ initial: "4", md: "5" }}>Addresses</Heading>
              <Button
                type="button"
                size="2"
                onClick={addAddress}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiPlus size={16} style={{ marginRight: "4px" }} />
                Add Address
              </Button>
            </Flex>
            {formik.values.addresses.length === 0 ? (
              <Box
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "var(--color-text-secondary)",
                }}
              >
                <Text>No addresses added yet. Click "Add Address" to add one.</Text>
              </Box>
            ) : (
              <Flex direction="column" gap="4">
                {formik.values.addresses.map((row, index) => (
                  <Box key={row.id}>
                    {index > 0 && <Separator my="4" />}
                    <Flex align="center" justify="between" mb="3">
                      <Text size="3" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                        Address {index + 1}
                      </Text>
                      <Button
                        type="button"
                        size="1"
                        variant="ghost"
                        onClick={() => removeAddress(row.id)}
                        style={{ color: "var(--color-error)" }}
                      >
                        <FiTrash2 size={16} />
                      </Button>
                    </Flex>
                    <Flex direction="column" gap="3">
                      <TextField.Root
                        placeholder="Label *"
                        value={row.label}
                        onChange={(e) => updateAddressField(row.id, "label", e.target.value)}
                        size="3"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <TextField.Root
                        placeholder="Address Line 1 *"
                        value={row.address_line_1}
                        onChange={(e) => updateAddressField(row.id, "address_line_1", e.target.value)}
                        size="3"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <TextField.Root
                        placeholder="Address Line 2 (Optional)"
                        value={row.address_line_2}
                        onChange={(e) => updateAddressField(row.id, "address_line_2", e.target.value)}
                        size="3"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <Flex gap="3" wrap="wrap">
                        <Box style={{ flex: "1", minWidth: "200px" }}>
                          <TextField.Root
                            placeholder="City *"
                            value={row.city}
                            onChange={(e) => updateAddressField(row.id, "city", e.target.value)}
                            size="3"
                            style={{
                              background: "var(--color-dark-bg-secondary)",
                              border: "1px solid var(--color-dark-bg-tertiary)",
                              color: "var(--color-text-primary)",
                            }}
                          />
                        </Box>
                        <Box style={{ flex: "1", minWidth: "150px" }}>
                          <TextField.Root
                            placeholder="State *"
                            value={row.state}
                            onChange={(e) => updateAddressField(row.id, "state", e.target.value)}
                            size="3"
                            style={{
                              background: "var(--color-dark-bg-secondary)",
                              border: "1px solid var(--color-dark-bg-tertiary)",
                              color: "var(--color-text-primary)",
                            }}
                          />
                        </Box>
                        <Box style={{ flex: "1", minWidth: "150px" }}>
                          <TextField.Root
                            placeholder="ZIP Code *"
                            value={row.zip_code}
                            onChange={(e) => updateAddressField(row.id, "zip_code", e.target.value)}
                            size="3"
                            style={{
                              background: "var(--color-dark-bg-secondary)",
                              border: "1px solid var(--color-dark-bg-tertiary)",
                              color: "var(--color-text-primary)",
                            }}
                          />
                        </Box>
                        <Box style={{ flex: "1", minWidth: "150px" }}>
                          <TextField.Root
                            placeholder="Country *"
                            value={row.country}
                            onChange={(e) => updateAddressField(row.id, "country", e.target.value)}
                            size="3"
                            style={{
                              background: "var(--color-dark-bg-secondary)",
                              border: "1px solid var(--color-dark-bg-tertiary)",
                              color: "var(--color-text-primary)",
                            }}
                          />
                        </Box>
                      </Flex>
                      <Box>
                        <Flex align="center" gap="3">
                          <Switch
                            checked={row.is_default}
                            onCheckedChange={(checked) => {
                              if (!checked) {
                                updateAddressField(row.id, "is_default", false);
                                return;
                              }
                              formik.setFieldValue(
                                "addresses",
                                formik.values.addresses.map((r) =>
                                  r.id === row.id ? { ...r, is_default: true } : { ...r, is_default: false }
                                )
                              );
                              if (!isNew) {
                                setEditingAddressId(row.id);
                              }
                            }}
                            size="3"
                          />
                          <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                            Set as default address
                          </Text>
                        </Flex>
                      </Box>
                      {!isNew && editingAddressId === row.id && (
                        <Flex gap="2" justify="end" mt="3">
                          <Button
                            type="button"
                            size="2"
                            variant="soft"
                            onClick={() => cancelAddressEdit(row.id)}
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="2"
                            onClick={() => saveAddress(row.id)}
                            disabled={savingAddressId === row.id}
                            style={{
                              background:
                                savingAddressId === row.id
                                  ? "var(--color-disabled-bg)"
                                  : "var(--color-primary)",
                              color:
                                savingAddressId === row.id
                                  ? "var(--color-disabled-text)"
                                  : "var(--color-text-dark)",
                              fontWeight: "600",
                            }}
                          >
                            {savingAddressId === row.id ? "Saving..." : "Save Address"}
                          </Button>
                        </Flex>
                      )}
                    </Flex>
                  </Box>
                ))}
              </Flex>
            )}
          </Card>

          {!isNew && (
            <Card style={{ padding: "1.5rem" }}>
              <Heading size={{ initial: "4", md: "5" }} mb="2">
                Clients & SKUs
              </Heading>
              <Text size="2" mb="4" style={{ color: "var(--color-text-secondary)" }}>
                Clients linked to this vendor and SKUs supplied for each client.
              </Text>
              {isLoadingVendorClients ? (
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  Loading clients…
                </Text>
              ) : vendorClients.length === 0 ? (
                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                  No clients linked to this vendor.
                </Text>
              ) : (
                <Flex direction="column" gap="4" >
                  {vendorClients.map((client, idx) => (
                    <Box mt={"2"} key={client.client_id}>
                      {idx > 0 && <Separator my="3" />}
                      <Flex align="center" gap="2" wrap="wrap" mb="2">
                        <Box
                        
                          style={{
                            color: "var(--color-primary)",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          {client.company_name}
                        </Box>
                        {/* <Text size="1" style={{ color: "var(--color-text-secondary)" }}>
                          ID {client.client_id}
                        </Text> */}
                      </Flex>
                      <Flex direction="column" gap="2" pl={{ initial: "0", sm: "2" }}>
                        {client.skus?.length ? (
                          client.skus.map((sku, skuIdx) => (
                            <Box
                              key={`${client.client_id}-${sku.sku_code}-${skuIdx}`}
                              style={{
                                padding: "0.75rem 1rem",
                                borderRadius: "8px",
                                background: "var(--color-dark-bg-secondary)",
                                border: "1px solid var(--color-dark-bg-tertiary)",
                              }}
                            >
                              <Flex align="center" justify="between" gap="3" wrap="wrap">
                                <Box style={{ flex: "1", minWidth: "200px" }}>
                                  {(() => {
                                    const detailId = resolveSkuDetailId(sku);
                                    if (detailId != null) {
                                      return (
                                        <Box
                                        
                                          style={{
                                            display: "inline-block",
                                          color: "var(--color-text-primary)",
                                            fontWeight: 600,
                                            textDecoration: "none",
                                            marginRight: "var(--space-2)",
                                          }}
                                        >
                                          <Text as="span" size="2" weight="medium">
                                            {sku.sku_code}
                                          </Text>
                                        </Box>
                                      );
                                    }
                                    return (
                                      <Text
                                        size="2"
                                        weight="medium"
                                        mr="2"
                                        style={{ color: "var(--color-text-primary)" }}
                                      >
                                        {sku.sku_code}
                                      </Text>
                                    );
                                  })()}
                                  <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                    {sku.sku_name}
                                  </Text>
                                </Box>
                                {/* {sku.relationship ? (
                                  <Badge size="1" variant="soft" color="gray">
                                    {sku.relationship}
                                  </Badge>
                                ) : null} */}
                              </Flex>
                            </Box>
                          ))
                        ) : (
                          <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                            No SKUs listed for this client.
                          </Text>
                        )}
                      </Flex>
                    </Box>
                  ))}
                </Flex>
              )}
            </Card>
          )}

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

      {/* Delete Vendor Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Confirm Delete"
        description="Are you sure you want to deactivate this vendor? This action cannot be undone."
      />

      <DeleteConfirmationDialog
        open={deleteAddressDialogOpen}
        onOpenChange={setDeleteAddressDialogOpen}
        onConfirm={confirmDeleteAddress}
        title="Confirm Delete Address"
        description="Are you sure you want to delete this address? This action cannot be undone."
        isLoading={isDeletingAddress}
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
