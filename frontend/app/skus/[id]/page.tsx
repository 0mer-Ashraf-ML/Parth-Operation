"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Flex,
  Text,
  Heading,
  Box,
  TextField,
  Button,
  Card,
  Select,
  Separator,
  Table,
} from "@radix-ui/themes";
import { FiArrowLeft, FiSave, FiTrash2, FiPlus, FiX } from "react-icons/fi";
import { 
  fetchSKUById, 
  createSKU, 
  updateSKU, 
  deleteSKU, 
  replaceTierPrices,
  deleteTierPrice,
  fetchSKUVendors,
  linkVendorToSKU,
  unlinkVendorFromSKU,
  type SKUApiResponse,
  type SKUVendorResponse
} from "@/lib/api/services/skusService";
import { fetchVendors } from "@/lib/api/services/vendorsService";
import { toast } from "react-toastify";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";

interface TieredPrice {
  id: string;
  minQuantity: number;
  maxQuantity: number | null; // null means unlimited
  price: number;
}

interface SKUFormData {
  skuCode: string;
  name: string;
  description: string;
  defaultVendor: string;
  secondaryVendor: string;
  trackInventory: boolean;
  inventoryCount: number;
  status: string;
  tieredPricing: TieredPrice[];
}

const validationSchema = yup.object({
  skuCode: yup.string().required("SKU Code is required"),
  name: yup.string().required("Name is required"),
  description: yup.string(),
  defaultVendor: yup.string(),
  trackInventory: yup.boolean(),
  inventoryCount: yup.number().min(0),
  status: yup.string().oneOf(["Active", "Inactive"]).required("Status is required"),
});

interface Vendor {
  id: number;
  company_name: string;
}

// Helper function to map API response to form data
const mapSKUToFormData = (apiSKU: SKUApiResponse): SKUFormData => {
  return {
    skuCode: apiSKU.sku_code,
    name: apiSKU.name,
    description: apiSKU.description || "",
    defaultVendor: apiSKU.default_vendor_id?.toString() || "none",
    secondaryVendor: apiSKU.secondary_vendor_id?.toString() || "none",
    trackInventory: apiSKU.track_inventory,
    inventoryCount: apiSKU.inventory_count,
    status: apiSKU.is_active ? "Active" : "Inactive",
    tieredPricing: apiSKU.tier_prices?.map((tp, index) => ({
      id: tp.id.toString(),
      minQuantity: tp.min_qty,
      maxQuantity: tp.max_qty,
      price: parseFloat(tp.unit_price),
    })) || [{ id: Date.now().toString(), minQuantity: 1, maxQuantity: null, price: 0 }],
  };
};

// Helper function to map form data to API create request
const mapFormDataToCreateRequest = (formData: SKUFormData) => {
  return {
    sku_code: formData.skuCode,
    name: formData.name,
    description: formData.description || undefined,
    default_vendor_id: formData.defaultVendor && formData.defaultVendor !== "none" 
      ? parseInt(formData.defaultVendor) 
      : null,
    secondary_vendor_id: formData.secondaryVendor && formData.secondaryVendor !== "none"
      ? parseInt(formData.secondaryVendor)
      : null,
    track_inventory: formData.trackInventory,
    inventory_count: formData.inventoryCount,
    tier_prices: formData.tieredPricing.map(tp => ({
      min_qty: tp.minQuantity,
      max_qty: tp.maxQuantity,
      unit_price: tp.price,
    })),
  };
};

// Helper function to map form data to API update request
const mapFormDataToUpdateRequest = (formData: SKUFormData) => {
  return {
    sku_code: formData.skuCode,
    name: formData.name,
    description: formData.description || undefined,
    default_vendor_id: formData.defaultVendor && formData.defaultVendor !== "none"
      ? parseInt(formData.defaultVendor)
      : null,
    secondary_vendor_id: formData.secondaryVendor && formData.secondaryVendor !== "none"
      ? parseInt(formData.secondaryVendor)
      : null,
    track_inventory: formData.trackInventory,
    inventory_count: formData.inventoryCount,
    is_active: formData.status === "Active",
    // Note: tier_prices are not included in update based on API example
    // They may need to be managed separately if updates are needed
  };
};

function SKUDetailContent() {
  const router = useRouter();
  const params = useParams();
  const skuId = params?.id as string;
  const isNew = skuId === "new";
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTiers, setIsSavingTiers] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTierDialogOpen, setDeleteTierDialogOpen] = useState(false);
  const [tierToDelete, setTierToDelete] = useState<string | null>(null);
  const [isDeletingTier, setIsDeletingTier] = useState(false);
  const [skuVendors, setSkuVendors] = useState<SKUVendorResponse[]>([]);
  const [isLoadingSkuVendors, setIsLoadingSkuVendors] = useState(false);
  const [isLinkingVendor, setIsLinkingVendor] = useState(false);
  const [selectedVendorToLink, setSelectedVendorToLink] = useState<string>("");
  const [deleteVendorLinkDialogOpen, setDeleteVendorLinkDialogOpen] = useState(false);
  const [vendorLinkToDelete, setVendorLinkToDelete] = useState<number | null>(null);
  const [isDeletingVendorLink, setIsDeletingVendorLink] = useState(false);
  
  // Track original values to detect changes
  const [originalBasicInfo, setOriginalBasicInfo] = useState<{
    skuCode: string;
    name: string;
    description: string;
    defaultVendor: string;
    secondaryVendor: string;
    trackInventory: boolean;
    inventoryCount: number;
    status: string;
  } | null>(null);
  const [originalTierPrices, setOriginalTierPrices] = useState<TieredPrice[]>([]);

  const formik = useFormik<SKUFormData>({
    initialValues: {
      skuCode: "",
      name: "",
      description: "",
      defaultVendor: "none",
      secondaryVendor: "none",
      trackInventory: false,
      inventoryCount: 0,
      status: "Active",
      tieredPricing: [
        { id: Date.now().toString(), minQuantity: 1, maxQuantity: null, price: 0 },
      ],
    },
    validationSchema,
    onSubmit: async (values) => {
      // This is only used for new SKU creation
      if (isNew) {
        try {
      setIsSaving(true);
          const createData = mapFormDataToCreateRequest(values);
          await createSKU(createData);
          toast.success("SKU created successfully");
      router.push("/skus");
        } catch (error: any) {
          toast.error(error.message || "Failed to create SKU");
          console.error("Error creating SKU:", error);
        } finally {
          setIsSaving(false);
        }
      }
    },
  });

  // Load vendors
  useEffect(() => {
    const loadVendors = async () => {
      try {
        setIsLoadingVendors(true);
        const vendorsData = await fetchVendors();
        setVendors(vendorsData);
      } catch (error: any) {
        toast.error(error.message || "Failed to load vendors");
        console.error("Error loading vendors:", error);
      } finally {
        setIsLoadingVendors(false);
      }
    };
    loadVendors();
  }, []);

  // Load SKU data if editing
  useEffect(() => {
    if (!isNew) {
      const loadSKU = async () => {
        try {
          setIsLoading(true);
          const apiSKU = await fetchSKUById(skuId);
          const formData = mapSKUToFormData(apiSKU);
          formik.setValues(formData);
          
          // Store original values
          setOriginalBasicInfo({
            skuCode: formData.skuCode,
            name: formData.name,
            description: formData.description,
            defaultVendor: formData.defaultVendor,
            secondaryVendor: formData.secondaryVendor,
            trackInventory: formData.trackInventory,
            inventoryCount: formData.inventoryCount,
            status: formData.status,
          });
          setOriginalTierPrices(JSON.parse(JSON.stringify(formData.tieredPricing)));
        } catch (error: any) {
          toast.error(error.message || "Failed to load SKU");
          console.error("Error loading SKU:", error);
          router.push("/skus");
        } finally {
        setIsLoading(false);
        }
      };
      loadSKU();
    } else {
      setIsLoading(false);
    }
  }, [skuId, isNew]);

  // Load SKU vendors
  useEffect(() => {
    if (!isNew && skuId) {
      const loadSkuVendors = async () => {
        try {
          setIsLoadingSkuVendors(true);
          const vendors = await fetchSKUVendors(parseInt(skuId));
          setSkuVendors(vendors);
        } catch (error: any) {
          toast.error(error.message || "Failed to load SKU vendors");
          console.error("Error loading SKU vendors:", error);
        } finally {
          setIsLoadingSkuVendors(false);
        }
      };
      loadSkuVendors();
    }
  }, [skuId, isNew]);

  // Handle linking a vendor to SKU
  const handleLinkVendor = async () => {
    if (!selectedVendorToLink || isNew) return;
    
    try {
      setIsLinkingVendor(true);
      const vendorId = parseInt(selectedVendorToLink);
      
      // Check if vendor is already linked
      if (skuVendors.some(sv => sv.vendor_id === vendorId)) {
        toast.error("This vendor is already linked to this SKU");
        return;
      }
      
      await linkVendorToSKU(parseInt(skuId), {
        vendor_id: vendorId,
        is_default: false,
      });
      
      // Reload SKU vendors
      const updatedVendors = await fetchSKUVendors(parseInt(skuId));
      setSkuVendors(updatedVendors);
      setSelectedVendorToLink("");
      toast.success("Vendor linked successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to link vendor");
      console.error("Error linking vendor:", error);
    } finally {
      setIsLinkingVendor(false);
    }
  };

  // Handle unlinking a vendor from SKU
  const handleUnlinkVendor = async () => {
    if (!vendorLinkToDelete || isNew) return;
    
    try {
      setIsDeletingVendorLink(true);
      const vendorLink = skuVendors.find(sv => sv.id === vendorLinkToDelete);
      if (!vendorLink) return;
      
      await unlinkVendorFromSKU(parseInt(skuId), vendorLink.vendor_id);
      
      // Reload SKU vendors
      const updatedVendors = await fetchSKUVendors(parseInt(skuId));
      setSkuVendors(updatedVendors);
      toast.success("Vendor unlinked successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink vendor");
      console.error("Error unlinking vendor:", error);
    } finally {
      setIsDeletingVendorLink(false);
      setDeleteVendorLinkDialogOpen(false);
      setVendorLinkToDelete(null);
    }
  };

  // Check if basic info has changed
  const hasBasicInfoChanged = useMemo(() => {
    if (!originalBasicInfo || isNew) return false;
    return (
      formik.values.skuCode !== originalBasicInfo.skuCode ||
      formik.values.name !== originalBasicInfo.name ||
      formik.values.description !== originalBasicInfo.description ||
      formik.values.defaultVendor !== originalBasicInfo.defaultVendor ||
      formik.values.secondaryVendor !== originalBasicInfo.secondaryVendor ||
      formik.values.trackInventory !== originalBasicInfo.trackInventory ||
      formik.values.inventoryCount !== originalBasicInfo.inventoryCount ||
      formik.values.status !== originalBasicInfo.status
    );
  }, [formik.values, originalBasicInfo, isNew]);

  // Check if tier prices have changed
  const hasTierPricesChanged = useMemo(() => {
    if (isNew) return false;
    if (formik.values.tieredPricing.length !== originalTierPrices.length) return true;
    
    return formik.values.tieredPricing.some((tier, index) => {
      const original = originalTierPrices[index];
      if (!original) return true;
      return (
        tier.minQuantity !== original.minQuantity ||
        tier.maxQuantity !== original.maxQuantity ||
        tier.price !== original.price
      );
    });
  }, [formik.values.tieredPricing, originalTierPrices, isNew]);

  // Save basic information
  const handleSaveBasicInfo = async () => {
    if (!isNew && originalBasicInfo) {
      try {
        setIsSaving(true);
        const updateData = mapFormDataToUpdateRequest(formik.values);
        await updateSKU(parseInt(skuId), updateData);
        
        // Update original values
        setOriginalBasicInfo({
          skuCode: formik.values.skuCode,
          name: formik.values.name,
          description: formik.values.description,
          defaultVendor: formik.values.defaultVendor,
          secondaryVendor: formik.values.secondaryVendor,
          trackInventory: formik.values.trackInventory,
          inventoryCount: formik.values.inventoryCount,
          status: formik.values.status,
        });
        
        toast.success("Basic information updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update basic information");
        console.error("Error updating basic info:", error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Save tier prices
  const handleSaveTierPrices = async () => {
    if (!isNew) {
      try {
        setIsSavingTiers(true);
        const tierPricesData = formik.values.tieredPricing.map(tp => ({
          min_qty: tp.minQuantity,
          max_qty: tp.maxQuantity,
          unit_price: tp.price,
        }));
        
        await replaceTierPrices(parseInt(skuId), tierPricesData);
        
        // Update original tier prices
        setOriginalTierPrices(JSON.parse(JSON.stringify(formik.values.tieredPricing)));
        
        toast.success("Tier prices updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update tier prices");
        console.error("Error updating tier prices:", error);
      } finally {
        setIsSavingTiers(false);
      }
    }
  };

  const addTieredPrice = () => {
    const lastTier = formik.values.tieredPricing[formik.values.tieredPricing.length - 1];
    const newMinQuantity = lastTier ? (lastTier.maxQuantity || lastTier.minQuantity) + 1 : 1;
    
    const newTier: TieredPrice = {
      id: Date.now().toString(),
      minQuantity: newMinQuantity,
      maxQuantity: null,
      price: lastTier?.price || 0,
    };
    formik.setFieldValue("tieredPricing", [...formik.values.tieredPricing, newTier]);
  };

  const handleDeleteTierClick = (id: string) => {
    if (formik.values.tieredPricing.length > 1) {
      setTierToDelete(id);
      setDeleteTierDialogOpen(true);
    }
  };

  const confirmDeleteTier = async () => {
    if (!tierToDelete) return;
    
    const tier = formik.values.tieredPricing.find(t => t.id === tierToDelete);
    if (!tier) return;

    // Check if this is an existing tier (saved in API) by checking if it exists in originalTierPrices
    const isExistingTier = !isNew && originalTierPrices.some(ot => ot.id === tierToDelete);

    setIsDeletingTier(true);
    
    try {
      // Only delete from API if it's an existing tier that was saved
      if (isExistingTier) {
        await deleteTierPrice(parseInt(skuId), parseInt(tierToDelete));
        toast.success("Tier price deleted");
      }
      
      // Remove from form (for both new and existing tiers)
      const updatedTiers = formik.values.tieredPricing.filter((t) => t.id !== tierToDelete);
      formik.setFieldValue("tieredPricing", updatedTiers);
      
      // Update original tier prices if it was an existing tier
      if (isExistingTier) {
        setOriginalTierPrices(JSON.parse(JSON.stringify(updatedTiers)));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete tier price");
      console.error("Error deleting tier price:", error);
    } finally {
      setIsDeletingTier(false);
      setDeleteTierDialogOpen(false);
      setTierToDelete(null);
    }
  };

  const updateTieredPrice = (
    id: string,
    field: keyof TieredPrice,
    value: number | string | null
  ) => {
    formik.setFieldValue(
      "tieredPricing",
      formik.values.tieredPricing.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier
      )
    );
  };

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
          onClick={() => router.push("/skus")}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <Heading size={{ initial: "6", md: "8" }}>
          {isNew ? "Add New SKU" : "SKU Details"}
        </Heading>
      </Flex>

      <form onSubmit={formik.handleSubmit}>
        <Flex direction="column" gap="6">
          {/* Basic Information Card */}
          <Card style={{ padding: "1.5rem" }}>
            <Heading size={{ initial: "4", md: "5" }} mb="4">
              Basic Information
            </Heading>
            <Flex direction="column" gap="4">
              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="skuCode"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    SKU Code *
                  </Text>
                  <TextField.Root
                    id="skuCode"
                    name="skuCode"
                    value={formik.values.skuCode}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        formik.touched.skuCode && formik.errors.skuCode
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {formik.touched.skuCode && formik.errors.skuCode && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.skuCode}
                    </Text>
                  )}
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="status"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Status *
                  </Text>
                  <Select.Root
                    value={formik.values.status}
                    onValueChange={(value) => formik.setFieldValue("status", value)}
                  >
                    <Select.Trigger
                      id="status"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.status && formik.errors.status
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                      }}
                    />
                    <Select.Content>
                      <Select.Item value="Active">Active</Select.Item>
                      <Select.Item value="Inactive">Inactive</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  {formik.touched.status && formik.errors.status && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.status}
                    </Text>
                  )}
                </Box>
              </Flex>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="name"
                  className="block"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Name *
                </Text>
                <TextField.Root
                  id="name"
                  name="name"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border:
                      formik.touched.name && formik.errors.name
                        ? "1px solid var(--color-error)"
                        : "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {formik.touched.name && formik.errors.name && (
                  <Text size="1" color="red" mt="1" className="block">
                    {formik.errors.name}
                  </Text>
                )}
              </Box>

              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="description"
                  className="block"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Description
                </Text>
                <TextField.Root
                  id="description"
                  name="description"
                  value={formik.values.description}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border: "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </Box>

              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="defaultVendor"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Default Vendor
                  </Text>
                  <Select.Root
                    value={formik.values.defaultVendor}
                    onValueChange={(value) => formik.setFieldValue("defaultVendor", value)}
                    disabled={isLoadingVendors}
                  >
                    <Select.Trigger
                      id="defaultVendor"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                          formik.touched.defaultVendor && formik.errors.defaultVendor
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                        width: "100%",
                      }}
                    />
                    <Select.Content>
                      <Select.Item value="none">None</Select.Item>
                      {vendors.map((vendor) => (
                        <Select.Item key={vendor.id.toString()} value={vendor.id.toString()}>
                          {vendor.company_name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                  {formik.touched.defaultVendor && formik.errors.defaultVendor && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.defaultVendor}
                    </Text>
                  )}
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="secondaryVendor"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Secondary Vendor
                  </Text>
                  <Select.Root
                    value={formik.values.secondaryVendor}
                    onValueChange={(value) => formik.setFieldValue("secondaryVendor", value)}
                    disabled={isLoadingVendors}
                  >
                    <Select.Trigger
                      id="secondaryVendor"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                      }}
                    />
                    <Select.Content>
                      <Select.Item value="none">None</Select.Item>
                      {vendors.map((vendor) => (
                        <Select.Item key={vendor.id.toString()} value={vendor.id.toString()}>
                          {vendor.company_name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Box>
              </Flex>

              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="trackInventory"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Track Inventory
                  </Text>
                  <Select.Root
                    value={formik.values.trackInventory ? "true" : "false"}
                    onValueChange={(value) => {
                      formik.setFieldValue("trackInventory", value === "true");
                      if (value === "false") {
                        formik.setFieldValue("inventoryCount", 0);
                      }
                    }}
                  >
                    <Select.Trigger
                      id="trackInventory"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        width: "100%",
                      }}
                    />
                    <Select.Content>
                      <Select.Item value="true">Yes</Select.Item>
                      <Select.Item value="false">No</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>

                {formik.values.trackInventory && (
                  <Box style={{ flex: "1", minWidth: "200px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="inventoryCount"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Inventory Count
                    </Text>
                    <TextField.Root
                      id="inventoryCount"
                      name="inventoryCount"
                      type="number"
                      min="0"
                      value={formik.values.inventoryCount}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                          formik.touched.inventoryCount && formik.errors.inventoryCount
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    {formik.touched.inventoryCount && formik.errors.inventoryCount && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.inventoryCount}
                      </Text>
                    )}
                  </Box>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Action Buttons for Basic Information - Only show for existing SKUs when form has changed */}
          {!isNew && hasBasicInfoChanged && (
            <Flex gap="3" justify="end" wrap="wrap">
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => {
                  if (originalBasicInfo) {
                    formik.setFieldValue("skuCode", originalBasicInfo.skuCode);
                    formik.setFieldValue("name", originalBasicInfo.name);
                    formik.setFieldValue("description", originalBasicInfo.description);
                    formik.setFieldValue("defaultVendor", originalBasicInfo.defaultVendor);
                    formik.setFieldValue("secondaryVendor", originalBasicInfo.secondaryVendor);
                    formik.setFieldValue("trackInventory", originalBasicInfo.trackInventory);
                    formik.setFieldValue("inventoryCount", originalBasicInfo.inventoryCount);
                    formik.setFieldValue("status", originalBasicInfo.status);
                    // Reset to original values to hide buttons
                    setOriginalBasicInfo(JSON.parse(JSON.stringify(originalBasicInfo)));
                  }
                }}
                disabled={isSaving}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="2"
                onClick={handleSaveBasicInfo}
                disabled={isSaving || !formik.isValid}
                style={{
                  background: isSaving || !formik.isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSaving || !formik.isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiSave size={16} style={{ marginRight: "6px" }} />
                {isSaving ? "Saving..." : "Update"}
              </Button>
            </Flex>
          )}

          {/* Tiered Pricing Card */}
          <Card style={{ padding: "1.5rem" }}>
            <Flex align="center" justify="between" mb="4">
              <Heading size={{ initial: "4", md: "5" }}>Tiered Pricing</Heading>
              <Button
                type="button"
                size="2"
                onClick={addTieredPrice}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiPlus size={16} style={{ marginRight: "4px" }} />
                Add Tier
              </Button>
            </Flex>

            <Box style={{ overflowX: "auto" }}>
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                      Min Quantity
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                      Max Quantity
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                      Price per Unit
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)", width: "100px" }}>
                      Actions
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {formik.values.tieredPricing.map((tier, index) => (
                    <Table.Row key={tier.id}>
                      <Table.Cell>
                        <TextField.Root
                          type="number"
                          min="0"
                          value={tier.minQuantity}
                          onChange={(e) =>
                            updateTieredPrice(tier.id, "minQuantity", parseInt(e.target.value))
                          }
                          size="2"
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                            width: "120px",
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <TextField.Root
                          type="number"
                          min={tier.minQuantity}
                          placeholder="Unlimited"
                          value={tier.maxQuantity === null ? "" : tier.maxQuantity}
                          onChange={(e) => {
                            const value = e.target.value === "" ? null : parseInt(e.target.value);
                            updateTieredPrice(tier.id, "maxQuantity", value);
                          }}
                          size="2"
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                            width: "120px",
                          }}
                        />
                        {tier.maxQuantity === null && (
                          <Text size="1" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
                            (Unlimited)
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <TextField.Root
                          type="number"
                          step="0.01"
                          min="0"
                          value={tier.price}
                          onChange={(e) =>
                            updateTieredPrice(tier.id, "price", parseFloat(e.target.value))
                          }
                          size="2"
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                            width: "120px",
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        {formik.values.tieredPricing.length > 1 && (
                          <Button
                            type="button"
                            size="1"
                            variant="ghost"
                            onClick={() => handleDeleteTierClick(tier.id)}
                            style={{ color: "var(--color-error)" }}
                          >
                            <FiTrash2 size={16} />
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>

            {formik.values.tieredPricing.length > 0 && (
              <Box mt="4" style={{ padding: "1rem", background: "var(--color-dark-bg)", borderRadius: "6px" }}>
                <Text size="2" weight="medium" style={{ color: "var(--color-text-primary)", marginBottom: "8px" }}>
                  Pricing Examples:
                </Text>
                {formik.values.tieredPricing.map((tier, index) => (
                  <Text key={tier.id} size="1" style={{ color: "var(--color-text-secondary)", display: "block" }}>
                    {tier.minQuantity} - {tier.maxQuantity === null ? "∞" : tier.maxQuantity} units = ${tier.price.toFixed(2)} per unit
                  </Text>
                ))}
              </Box>
            )}
          </Card>

          {/* Action Buttons for Tier Prices - Only show for existing SKUs when tier prices have changed */}
          {!isNew && hasTierPricesChanged && (
            <Flex gap="3" justify="end" wrap="wrap">
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => {
                  formik.setFieldValue("tieredPricing", JSON.parse(JSON.stringify(originalTierPrices)));
                  // Reset to original values to hide buttons
                  setOriginalTierPrices(JSON.parse(JSON.stringify(originalTierPrices)));
                }}
                disabled={isSavingTiers}
                style={{ color: "var(--color-text-primary)" }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="2"
                onClick={handleSaveTierPrices}
                disabled={isSavingTiers}
                style={{
                  background: isSavingTiers ? "var(--color-disabled-bg)" : "var(--color-primary)",
                  color: isSavingTiers ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiSave size={16} style={{ marginRight: "6px" }} />
                {isSavingTiers ? "Saving..." : "Update"}
              </Button>
            </Flex>
          )}

          {/* Linked Vendors Card - Only show for existing SKUs */}
          {!isNew && (
            <Card className="p-6 sm:p-8">
              {/* Native div so flex row isn’t broken by Radix block widths; heading stays narrow, actions ml-auto */}
              <div
                className="mb-6 flex w-full min-w-0 flex-col md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-6"
              >
                <Heading
                  size={{ initial: "4", md: "5" }}
                  className="w-full min-w-0 shrink-0 basis-auto md:w-auto md:max-w-[min(100%,60%)]"
                >
                  Linked Vendors
                </Heading>
                <div className="mt-5 flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4 md:mt-0 md:ml-auto md:w-auto md:max-w-full md:shrink-0 md:justify-end md:gap-4">
                  <Select.Root
                    value={selectedVendorToLink}
                    onValueChange={setSelectedVendorToLink}
                    disabled={isLinkingVendor || isLoadingVendors}
                  >
                    <Select.Trigger
                      placeholder="Select vendor to link"
                      className="w-full min-w-0 sm:min-w-[200px] sm:max-w-md sm:flex-1 md:max-w-sm md:flex-none"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <Select.Content>
                      {vendors
                        .filter(v => !skuVendors.some(sv => sv.vendor_id === v.id))
                        .map((vendor) => (
                          <Select.Item key={vendor.id.toString()} value={vendor.id.toString()}>
                            {vendor.company_name}
                          </Select.Item>
                        ))}
                    </Select.Content>
                  </Select.Root>
                  <Button
                    type="button"
                    size="2"
                    onClick={handleLinkVendor}
                    disabled={!selectedVendorToLink || isLinkingVendor || isLoadingVendors}
                    className="w-full shrink-0 sm:w-auto"
                    style={{
                      background: "var(--color-primary)",
                      color: "var(--color-text-dark)",
                      fontWeight: "600",
                    }}
                  >
                    <FiPlus size={16} style={{ marginRight: "4px" }} />
                    {isLinkingVendor ? "Linking..." : "Link Vendor"}
                  </Button>
                </div>
              </div>

              {isLoadingSkuVendors ? (
                <Flex align="center" justify="center" style={{ minHeight: "100px" }}>
                  <Text>Loading vendors...</Text>
                </Flex>
              ) : skuVendors.length === 0 ? (
                <Box style={{ padding: "2rem", textAlign: "center" }}>
                  <Text size="3" style={{ color: "var(--color-text-secondary)" }}>
                    No vendors linked to this SKU
                  </Text>
                </Box>
              ) : (
                <Box style={{ overflowX: "auto" }}>
                  <Table.Root>
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                          Vendor Name
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)" }}>
                          Status
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell style={{ color: "var(--color-text-primary)", width: "100px" }}>
                          Actions
                        </Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {skuVendors.map((skuVendor) => {
                        const vendor = vendors.find(v => v.id === skuVendor.vendor_id);
                        return (
                          <Table.Row key={skuVendor.id}>
                            <Table.Cell>
                              <Text size="3" style={{ color: "var(--color-text-primary)" }}>
                                {skuVendor.vendor_name || vendor?.company_name || `Vendor ID: ${skuVendor.vendor_id}`}
                              </Text>
                            </Table.Cell>
                            <Table.Cell>
                              {skuVendor.is_default ? (
                                <Text size="2" weight="medium" style={{ color: "var(--color-primary)" }}>
                                  Default
                                </Text>
                              ) : (
                                <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                                  Linked
                                </Text>
                              )}
                            </Table.Cell>
                            <Table.Cell>
                              {!skuVendor.is_default && (
                                <Button
                                  type="button"
                                  size="1"
                                  variant="ghost"
                                  onClick={() => {
                                    setVendorLinkToDelete(skuVendor.id);
                                    setDeleteVendorLinkDialogOpen(true);
                                  }}
                                  style={{ color: "var(--color-error)" }}
                                >
                                  <FiTrash2 size={16} />
                                </Button>
                              )}
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </Card>
          )}

          {/* Action Buttons for New SKU */}
          {isNew && (
            <Flex gap="3" justify="end" wrap="wrap">
            <Button
              type="button"
              variant="soft"
              size="3"
              onClick={() => router.push("/skus")}
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
                {isSaving ? "Creating..." : "Create SKU"}
            </Button>
          </Flex>
          )}

          {/* Delete SKU Button - Show at end of section for existing clients */}
          {!isNew && (
            <Flex justify="start">
              <Button
                type="button"
                size="3"
                variant="soft"
                color="red"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isDeleting}
                style={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <FiTrash2 size={18} style={{ marginRight: "8px" }} />
                Delete SKU
              </Button>
            </Flex>
          )}
        </Flex>
      </form>

      {/* Delete SKU Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (!skuId || isNew) return;
          setIsDeleting(true);
          try {
            await deleteSKU(parseInt(skuId));
            toast.success("SKU deactivated successfully");
            router.push("/skus");
          } catch (error: any) {
            toast.error(error.message || "Failed to deactivate SKU");
            console.error("Error deleting SKU:", error);
          } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
          }
        }}
        title="Confirm Delete"
        description="Are you sure you want to deactivate this SKU? This action cannot be undone."
        itemName={formik.values.name || formik.values.skuCode}
        isLoading={isDeleting}
      />

      {/* Delete Tier Price Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteTierDialogOpen}
        onOpenChange={setDeleteTierDialogOpen}
        onConfirm={confirmDeleteTier}
        title="Confirm Delete Tier Price"
        description="Are you sure you want to delete this tier price? This action cannot be undone."
        isLoading={isDeletingTier}
      />

      {/* Delete Vendor Link Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteVendorLinkDialogOpen}
        onOpenChange={setDeleteVendorLinkDialogOpen}
        onConfirm={handleUnlinkVendor}
        title="Confirm Unlink Vendor"
        description="Are you sure you want to unlink this vendor from the SKU? This action cannot be undone."
        isLoading={isDeletingVendorLink}
      />
    </Flex>
  );
}

export default function SKUDetailPage() {
  return (
    <ProtectedRoute>
      <SKUDetailContent />
    </ProtectedRoute>
  );
}
