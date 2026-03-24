"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAppDispatch } from "@/lib/store/hooks";
import { 
  createClientAsync, 
  fetchClientByIdAsync, 
  updateClientAsync, 
  deleteClientAsync,
  createContactAsync,
  updateContactAsync,
  deleteContactAsync,
  createAddressAsync,
  updateAddressAsync,
  deleteAddressAsync,
  CreateClientRequest, 
  UpdateClientRequest,
  ContactRequest,
  AddressRequest,
  Client 
} from "@/lib/store/clientsSlice";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { toast } from "react-toastify";
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
  Switch,
} from "@radix-ui/themes";
import { FiArrowLeft, FiSave, FiTrash2, FiPlus, FiX } from "react-icons/fi";

interface Contact {
  id?: string;
  contact_type: string;
  name: string;
  email: string;
  phone: string;
}

interface ShipToAddress {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
}

interface ClientFormData {
  companyName: string;
  notes: string;
  contacts: Contact[];
  paymentTerms: number;
  taxPercent: number;
  discountPercent: number;
  autoInvoice: boolean;
  addresses: ShipToAddress[];
}

const validationSchema = yup.object({
  companyName: yup.string().required("Company name is required"),
  notes: yup.string(),
  contacts: yup
    .array()
    .of(
      yup.object({
        contact_type: yup.string().required(),
        name: yup.string().required("Contact name is required"),
        email: yup.string().email("Invalid email address"),
        phone: yup.string(),
      })
    )
    .min(1, "At least one contact is required"),
  paymentTerms: yup
    .number()
    .min(1, "Payment terms must be at least 1 day")
    .required("Payment terms is required"),
  taxPercent: yup
    .number()
    .min(0, "Tax percent must be 0 or greater")
    .max(100, "Tax percent cannot exceed 100")
    .required("Tax percent is required"),
  discountPercent: yup
    .number()
    .min(0, "Discount percent must be 0 or greater")
    .max(100, "Discount percent cannot exceed 100")
    .required("Discount percent is required"),
  addresses: yup.array().of(
    yup.object({
      label: yup.string().required("Address label is required"),
      addressLine1: yup.string().required("Address line 1 is required"),
      addressLine2: yup.string(),
      city: yup.string().required("City is required"),
      state: yup.string().required("State is required"),
      zipCode: yup.string().required("ZIP code is required"),
      country: yup.string().required("Country is required"),
      isDefault: yup.boolean(),
    })
  ),
});

// Helper function to map API client data to form data
const mapClientToFormData = (client: Client): ClientFormData => {
  return {
    companyName: client.company_name || "",
    notes: client.notes || "",
    contacts: (client.contacts || []).map((contact) => ({
      id: contact.id?.toString() || "",
      contact_type: contact.contact_type || "main",
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
    })),
    paymentTerms: client.payment_terms,
    taxPercent: parseFloat(client.tax_percentage || "0"),
    discountPercent: parseFloat(client.discount_percentage || "0"),
    autoInvoice: client.auto_invoice,
    addresses: (client.addresses || []).map((addr) => ({
      id: addr.id?.toString() || "",
      label: addr.label || "",
      addressLine1: addr.address_line_1 || "",
      addressLine2: addr.address_line_2 || "",
      city: addr.city || "",
      state: addr.state || "",
      zipCode: addr.zip_code || "",
      country: addr.country || "",
      isDefault: addr.is_default || false,
    })),
  };
};

function ClientProfileContent() {
  const router = useRouter();
  const params = useParams();
  const dispatch = useAppDispatch();
  const clientId = params?.id as string;
  const isNew = clientId === "new";
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Track original contacts and addresses for cancel functionality
  const [originalContacts, setOriginalContacts] = useState<Contact[]>([]);
  const [originalAddresses, setOriginalAddresses] = useState<ShipToAddress[]>([]);
  
  // Track which contacts/addresses are being edited
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  
  // Track loading states for individual contacts/addresses
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);
  
  // Track delete dialogs for contacts and addresses
  const [deleteContactDialogOpen, setDeleteContactDialogOpen] = useState(false);
  const [deleteAddressDialogOpen, setDeleteAddressDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);
  const [isDeletingAddress, setIsDeletingAddress] = useState(false);
  
  // Track original form values to detect changes
  const [originalFormValues, setOriginalFormValues] = useState<ClientFormData | null>(null);

  const formik = useFormik<ClientFormData>({
    initialValues: {
      companyName: "",
      notes: "",
      contacts: [
        {
          id: "1",
          contact_type: "",
          name: "",
          email: "",
          phone: "",
        },
      ],
      paymentTerms: 30,
      taxPercent: 0,
      discountPercent: 0,
      autoInvoice: false,
      addresses: [],
    },
    validationSchema,
    onSubmit: async (values) => {
      if (isNew) {
        // Create new client
      setIsSaving(true);
        try {
          // Map form data to API request format
          const createRequest: CreateClientRequest = {
            company_name: values.companyName,
            payment_terms: values.paymentTerms,
            tax_percentage: values.taxPercent,
            discount_percentage: values.discountPercent,
            auto_invoice: values.autoInvoice,
            notes: values.notes || "",
            contacts: values.contacts.map((contact) => ({
              contact_type: contact.contact_type,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            })),
            addresses: values.addresses.map((addr) => ({
              label: addr.label,
              address_line_1: addr.addressLine1,
              address_line_2: addr.addressLine2 || "",
              city: addr.city,
              state: addr.state,
              zip_code: addr.zipCode,
              country: addr.country,
              is_default: addr.isDefault || false,
            })),
          };

          const newClient = await dispatch(createClientAsync(createRequest)).unwrap();
          // Use the response data directly instead of fetching again
          if (newClient) {
            const formData = mapClientToFormData(newClient);
            formik.setValues(formData);
            setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
            setOriginalContacts(JSON.parse(JSON.stringify(formData.contacts)));
            setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
            router.replace(`/clients/${newClient.id}`);
          }
        } catch (error: any) {
          console.error("Error creating client:", error);
          // Error toast is already shown in the slice
        } finally {
      setIsSaving(false);
        }
      } else {
        // Update existing client
        setIsSaving(true);
        try {
          if (!clientId) return;
          
          // Map form data to API request format
          const updateRequest: UpdateClientRequest = {
            company_name: values.companyName,
            payment_terms: values.paymentTerms,
            tax_percentage: values.taxPercent,
            discount_percentage: values.discountPercent,
            auto_invoice: values.autoInvoice,
            notes: values.notes || "",
            is_active: true, // You can add a toggle for this in the form if needed
          };

          const updatedClient = await dispatch(updateClientAsync({ clientId: parseInt(clientId), clientData: updateRequest })).unwrap();
          // Use the response data directly instead of fetching again
          if (updatedClient) {
            const formData = mapClientToFormData(updatedClient);
            formik.setValues(formData);
            setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
            // Also update original contacts and addresses
            setOriginalContacts(JSON.parse(JSON.stringify(formData.contacts)));
            setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
          }
        } catch (error: any) {
          console.error("Error updating client:", error);
          // Error toast is already shown in the slice
        } finally {
          setIsSaving(false);
        }
      }
    },
  });

  // Detect if form has changed (Basic Info & Financial Settings)
  const hasFormChanged = useMemo(() => {
    if (!originalFormValues) return isNew; // For new clients, always show buttons
    
    // Compare Basic Information fields
    if (
      formik.values.companyName !== originalFormValues.companyName ||
      formik.values.notes !== originalFormValues.notes
    ) {
      return true;
    }
    
    // Compare Financial Settings fields
    if (
      formik.values.paymentTerms !== originalFormValues.paymentTerms ||
      formik.values.taxPercent !== originalFormValues.taxPercent ||
      formik.values.discountPercent !== originalFormValues.discountPercent ||
      formik.values.autoInvoice !== originalFormValues.autoInvoice
    ) {
      return true;
    }
    
    // Note: Contacts and addresses are managed separately with their own save buttons
    // So we don't need to check them here for the main form buttons
    
    return false;
  }, [formik.values, originalFormValues, isNew]);

  useEffect(() => {
    if (!isNew && clientId) {
      const loadClient = async () => {
        try {
          setIsLoading(true);
          const client = await dispatch(fetchClientByIdAsync(clientId)).unwrap();
          if (client) {
            const formData = mapClientToFormData(client);
            formik.setValues(formData);
            // Store original contacts and addresses for cancel functionality
            setOriginalContacts(JSON.parse(JSON.stringify(formData.contacts)));
            setOriginalAddresses(JSON.parse(JSON.stringify(formData.addresses)));
            // Store original form values to detect changes
            setOriginalFormValues(JSON.parse(JSON.stringify(formData)));
          }
        } catch (error: any) {
          console.error("Error loading client:", error);
          // Error toast is already shown in the slice
          // Navigate back if client not found
          router.push("/clients");
        } finally {
        setIsLoading(false);
        }
      };
      loadClient();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isNew, dispatch]);

  const addContact = () => {
    // Just add to form - will be saved when user clicks Save
    const newContact: Contact = {
      id: Date.now().toString(),
      contact_type: "",
      name: "",
      email: "",
      phone: "",
    };
    formik.setFieldValue("contacts", [...formik.values.contacts, newContact]);
    setEditingContactId(newContact.id || null);
  };

  const removeContact = (id: string) => {
    if (formik.values.contacts.length <= 1) {
      toast.error("At least one contact is required");
      return;
    }
    
    // Open delete confirmation dialog
    setContactToDelete(id);
    setDeleteContactDialogOpen(true);
  };

  const confirmDeleteContact = async () => {
    if (!contactToDelete) return;
    
    const contact = formik.values.contacts.find((c) => c.id === contactToDelete);
    const contactId = contact?.id;

    setIsDeletingContact(true);
    
    // If it's an existing client and contact has a numeric ID, delete via API
    if (!isNew && clientId && contactId && !isNaN(Number(contactId))) {
      try {
        await dispatch(
          deleteContactAsync({ clientId: parseInt(clientId), contactId: Number(contactId) })
        ).unwrap();
        // Remove from form after successful API call
        formik.setFieldValue(
          "contacts",
          formik.values.contacts.filter((contact) => contact.id !== contactToDelete)
        );
        // Update original contacts
        setOriginalContacts(originalContacts.filter((c) => c.id !== contactToDelete));
        // Success toast is already shown in the slice
      } catch (error: any) {
        console.error("Error deleting contact:", error);
        // Error toast is already shown in the slice
      }
    } else {
      // For new contacts, just remove from form
      formik.setFieldValue(
        "contacts",
        formik.values.contacts.filter((contact) => contact.id !== contactToDelete)
      );
    }
    
    if (editingContactId === contactToDelete) {
      setEditingContactId(null);
    }
    
    setIsDeletingContact(false);
    setDeleteContactDialogOpen(false);
    setContactToDelete(null);
  };

  const updateContactField = (
    id: string,
    field: keyof Contact,
    value: string
  ) => {
    // Only update form - don't call API
    const updatedContacts = formik.values.contacts.map((contact) =>
      contact.id === id ? { ...contact, [field]: value } : contact
    );
    formik.setFieldValue("contacts", updatedContacts);
    // Only set editing state for existing clients (not for new clients)
    if (!isNew) {
      setEditingContactId(id);
    }
  };

  const saveContact = async (id: string) => {
    const contact = formik.values.contacts.find((c) => c.id === id);
    if (!contact) return;

    setSavingContactId(id);

    try {
      if (isNew) {
        // For new clients, just mark as saved (will be sent with client creation)
        setEditingContactId(null);
        // Update original contacts
        const updatedOriginals = [...originalContacts];
        const index = updatedOriginals.findIndex((c) => c.id === id);
        if (index !== -1) {
          updatedOriginals[index] = { ...contact };
        } else {
          updatedOriginals.push({ ...contact });
        }
        setOriginalContacts(updatedOriginals);
        toast.success("Contact saved (will be created with client)");
      } else if (clientId) {
        // Check if this is an existing contact by looking in originalContacts
        // If the ID exists in originalContacts, it's an existing contact that was loaded from the API
        const originalContact = originalContacts.find((c) => c.id === id);
        const isExistingContact = originalContact !== undefined && !isNaN(Number(id)) && Number(id) > 0;
        
        if (isExistingContact) {
          // Update existing contact via PATCH
          const contactData: ContactRequest = {
            contact_type: contact.contact_type,
            name: contact.name || "",
            email: contact.email || "",
            phone: contact.phone || "",
          };
          await dispatch(
            updateContactAsync({
              clientId: parseInt(clientId),
              contactId: Number(id),
              contactData,
            })
          ).unwrap();
          setEditingContactId(null);
          // Update original contacts
          const updatedOriginals = [...originalContacts];
          const index = updatedOriginals.findIndex((c) => c.id === id);
          if (index !== -1) {
            updatedOriginals[index] = { ...contact };
          }
          setOriginalContacts(updatedOriginals);
          // Success toast is already shown in the slice
        } else {
          // Create new contact via POST
          const contactData: ContactRequest = {
            contact_type: contact.contact_type,
            name: contact.name || "",
            email: contact.email || "",
            phone: contact.phone || "",
          };
          const result = await dispatch(
            createContactAsync({ clientId: parseInt(clientId), contactData })
          ).unwrap();
          
          // Update the contact ID with the API response
          const updatedContacts = formik.values.contacts.map((c) =>
            c.id === id ? { ...c, id: result.contact.id.toString() } : c
          );
          formik.setFieldValue("contacts", updatedContacts);
          setEditingContactId(null);
          // Update original contacts
          setOriginalContacts([...originalContacts, { ...contact, id: result.contact.id.toString() }]);
          // Success toast is already shown in the slice
        }
      }
    } catch (error: any) {
      console.error("Error saving contact:", error);
      // Error toast is already shown in the slice
    } finally {
      setSavingContactId(null);
    }
  };

  const cancelContactEdit = (id: string) => {
    // Restore from original contacts
    const originalContact = originalContacts.find((c) => c.id === id);
    if (originalContact) {
      const updatedContacts = formik.values.contacts.map((contact) =>
        contact.id === id ? { ...originalContact } : contact
      );
      formik.setFieldValue("contacts", updatedContacts);
    } else {
      // If it's a new contact, remove it
      formik.setFieldValue(
        "contacts",
        formik.values.contacts.filter((contact) => contact.id !== id)
      );
    }
    setEditingContactId(null);
  };

  const addAddress = () => {
    // Just add to form - will be saved when user clicks Save
    const newAddress: ShipToAddress = {
      id: Date.now().toString(),
      label: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zipCode: "",
      country: "US",
      isDefault: false,
    };
    formik.setFieldValue("addresses", [
      ...formik.values.addresses,
      newAddress,
    ]);
    setEditingAddressId(newAddress.id || null);
  };

  const removeAddress = (id: string) => {
    // Open delete confirmation dialog
    setAddressToDelete(id);
    setDeleteAddressDialogOpen(true);
  };

  const confirmDeleteAddress = async () => {
    if (!addressToDelete || !clientId) return;
    
    const address = formik.values.addresses.find((a) => a.id === addressToDelete);
    const addressId = address?.id;

    setIsDeletingAddress(true);
    
    // If it's an existing client and address has a numeric ID, delete via API
    if (!isNew && addressId && !isNaN(Number(addressId))) {
      try {
        await dispatch(
          deleteAddressAsync({ clientId: parseInt(clientId), addressId: Number(addressId) })
        ).unwrap();
        // Remove from form after successful API call
    formik.setFieldValue(
          "addresses",
          formik.values.addresses.filter((addr) => addr.id !== addressToDelete)
        );
        // Update original addresses
        setOriginalAddresses(originalAddresses.filter((a) => a.id !== addressToDelete));
        // Success toast is already shown in the slice
      } catch (error: any) {
        console.error("Error deleting address:", error);
        // Error toast is already shown in the slice
      }
    } else {
      // For new addresses, just remove from form
      formik.setFieldValue(
        "addresses",
        formik.values.addresses.filter((addr) => addr.id !== addressToDelete)
      );
      setOriginalAddresses(originalAddresses.filter((a) => a.id !== addressToDelete));
    }
    
    if (editingAddressId === addressToDelete) {
      setEditingAddressId(null);
    }
    
    setIsDeletingAddress(false);
    setDeleteAddressDialogOpen(false);
    setAddressToDelete(null);
  };

  const updateAddressField = (
    id: string,
    field: keyof ShipToAddress,
    value: string | boolean
  ) => {
    // Only update form - don't call API
    const updatedAddresses = formik.values.addresses.map((addr) =>
        addr.id === id ? { ...addr, [field]: value } : addr
    );
    formik.setFieldValue("addresses", updatedAddresses);
    // Only set editing state for existing clients (not for new clients)
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
        // For new clients, just mark as saved (will be sent with client creation)
        setEditingAddressId(null);
        // Update original addresses
        const updatedOriginals = [...originalAddresses];
        const index = updatedOriginals.findIndex((a) => a.id === id);
        if (index !== -1) {
          updatedOriginals[index] = { ...address };
        } else {
          updatedOriginals.push({ ...address });
        }
        setOriginalAddresses(updatedOriginals);
        toast.success("Address saved (will be created with client)");
      } else if (clientId) {
        // Check if this is an existing address by looking in originalAddresses
        const originalAddress = originalAddresses.find((a) => a.id === id);
        const isExistingAddress = originalAddress !== undefined && !isNaN(Number(id)) && Number(id) > 0;
        
        if (isExistingAddress) {
          // Update existing address via PATCH
          const addressData: AddressRequest = {
            label: address.label || "",
            address_line_1: address.addressLine1 || "",
            address_line_2: address.addressLine2 || "",
            city: address.city || "",
            state: address.state || "",
            zip_code: address.zipCode || "",
            country: address.country || "US",
            is_default: address.isDefault || false,
          };
          const result = await dispatch(
            updateAddressAsync({
              clientId: parseInt(clientId),
              addressId: Number(id),
              addressData,
            })
          ).unwrap();
          
          setEditingAddressId(null);
          // Update original addresses
          const updatedOriginals = [...originalAddresses];
          const index = updatedOriginals.findIndex((a) => a.id === id);
          if (index !== -1) {
            updatedOriginals[index] = { ...address };
          }
          setOriginalAddresses(updatedOriginals);
          // Success toast is already shown in the slice
        } else {
          // Create new address via POST
          const addressData: AddressRequest = {
            label: address.label || "",
            address_line_1: address.addressLine1 || "",
            address_line_2: address.addressLine2 || "",
            city: address.city || "",
            state: address.state || "",
            zip_code: address.zipCode || "",
            country: address.country || "US",
            is_default: address.isDefault || false,
          };
          const result = await dispatch(
            createAddressAsync({ clientId: parseInt(clientId), addressData })
          ).unwrap();
          
          // Update the address ID with the API response
          const updatedAddresses = formik.values.addresses.map((a) =>
            a.id === id ? { ...a, id: result.address.id.toString() } : a
          );
          formik.setFieldValue("addresses", updatedAddresses);
          setEditingAddressId(null);
          // Update original addresses
          setOriginalAddresses([...originalAddresses, { ...address, id: result.address.id.toString() }]);
          // Success toast is already shown in the slice
        }
      }
    } catch (error: any) {
      console.error("Error saving address:", error);
      // Error toast is already shown in the slice
    } finally {
      setSavingAddressId(null);
    }
  };

  const cancelAddressEdit = (id: string) => {
    // Restore from original addresses
    const originalAddress = originalAddresses.find((a) => a.id === id);
    if (originalAddress) {
      const updatedAddresses = formik.values.addresses.map((addr) =>
        addr.id === id ? { ...originalAddress } : addr
      );
      formik.setFieldValue("addresses", updatedAddresses);
    } else {
      // If it's a new address, remove it
      formik.setFieldValue(
        "addresses",
        formik.values.addresses.filter((addr) => addr.id !== id)
      );
    }
    setEditingAddressId(null);
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
          onClick={() => router.push("/clients")}
          style={{ color: "var(--color-text-primary)" }}
        >
          <FiArrowLeft size={18} />
        </Button>
        <Heading size={{ initial: "6", md: "8" }}>
          {isNew ? "Add New Client" : "Client Profile"}
        </Heading>
      </Flex>

      <form onSubmit={formik.handleSubmit}>
        <Flex direction="column" gap="6">
          {/* Basic Information & Financial Settings Card */}
          <Card style={{ padding: "1.5rem" }}>
          
            <Flex direction="column" gap="6">
              {/* Basic Information Section */}
              <Box>
                <Heading size={{ initial: "3", md: "4" }} mb="3" style={{ color: "var(--color-text-primary)" }}>
              Basic Information
            </Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Text
                  size="2"
                  weight="medium"
                  mb="2"
                  as="label"
                  htmlFor="companyName"
                  className="block"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Company Name *
                </Text>
                <TextField.Root
                  id="companyName"
                  name="companyName"
                  value={formik.values.companyName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  size="3"
                  style={{
                    background: "var(--color-dark-bg-secondary)",
                    border:
                      formik.touched.companyName && formik.errors.companyName
                        ? "1px solid var(--color-error)"
                        : "1px solid var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                  }}
                />
                {formik.touched.companyName && formik.errors.companyName && (
                  <Text size="1" color="red" mt="1" className="block">
                    {formik.errors.companyName}
                  </Text>
                )}
              </Box>

                  <Box>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                      htmlFor="notes"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                      Notes
                  </Text>
                  <TextField.Root
                      id="notes"
                      name="notes"
                      value={formik.values.notes}
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
              </Flex>
              </Box>

              {/* Financial Settings Section */}
              <Box>
                <Heading size={{ initial: "3", md: "4" }} mb="3" style={{ color: "var(--color-text-primary)" }}>
              Financial Settings
            </Heading>
            <Flex direction="column" gap="4">
              <Flex gap="4" wrap="wrap">
                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="paymentTerms"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Payment Terms (Days) *
                  </Text>
                  <TextField.Root
                    id="paymentTerms"
                    name="paymentTerms"
                    type="number"
                    min="1"
                    value={formik.values.paymentTerms}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    size="3"
                      style={{
                        background: "var(--color-dark-bg-secondary)",
                        border:
                        formik.touched.paymentTerms && formik.errors.paymentTerms
                            ? "1px solid var(--color-error)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                    }}
                  />
                  {formik.touched.paymentTerms && formik.errors.paymentTerms && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.paymentTerms}
                    </Text>
                  )}
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="taxPercent"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Tax % *
                  </Text>
                  <TextField.Root
                    id="taxPercent"
                    name="taxPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formik.values.taxPercent}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        formik.touched.taxPercent && formik.errors.taxPercent
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {formik.touched.taxPercent && formik.errors.taxPercent && (
                    <Text size="1" color="red" mt="1" className="block">
                      {formik.errors.taxPercent}
                    </Text>
                  )}
                </Box>

                <Box style={{ flex: "1", minWidth: "200px" }}>
                  <Text
                    size="2"
                    weight="medium"
                    mb="2"
                    as="label"
                    htmlFor="discountPercent"
                    className="block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Discount % *
                  </Text>
                  <TextField.Root
                    id="discountPercent"
                    name="discountPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formik.values.discountPercent}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    size="3"
                    style={{
                      background: "var(--color-dark-bg-secondary)",
                      border:
                        formik.touched.discountPercent &&
                        formik.errors.discountPercent
                          ? "1px solid var(--color-error)"
                          : "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  {formik.touched.discountPercent &&
                    formik.errors.discountPercent && (
                      <Text size="1" color="red" mt="1" className="block">
                        {formik.errors.discountPercent}
                      </Text>
                    )}
                </Box>
              </Flex>

              {/* Auto Invoice Toggle */}
              <Box>
                <Flex align="center" gap="3" justify="between" wrap="wrap">
                  <Box style={{ flex: "1", minWidth: "200px" }}>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Auto Invoice
                    </Text>
                    <Text
                      size="1"
                      style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}
                    >
                      Automatically generate invoice when a delivery is recorded
                    </Text>
                  </Box>
                  <Switch
                    checked={formik.values.autoInvoice}
                    onCheckedChange={(checked) =>
                      formik.setFieldValue("autoInvoice", checked)
                    }
                    size="3"
                  />
                </Flex>
              </Box>
                </Flex>
              </Box>
            </Flex>
          </Card>

          {/* Action Buttons - Only show for existing clients when form has changed */}
          {!isNew && hasFormChanged && (
            <Flex gap="3" justify="end" wrap="wrap">
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => {
                  if (originalFormValues) {
                    formik.setValues(originalFormValues);
                    // Reset to original values to hide buttons
                    setOriginalFormValues(JSON.parse(JSON.stringify(originalFormValues)));
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
                }}
              >
                <FiSave size={16} style={{ marginRight: "6px" }} />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </Flex>
          )}

          {/* Contacts Card */}
          <Card style={{ padding: "1.5rem" }}>
            <Flex align="center" justify="between" mb="4">
              <Heading size={{ initial: "4", md: "5" }}>Contacts</Heading>
              <Button
                type="button"
                size="2"
                onClick={addContact}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text-dark)",
                  fontWeight: "600",
                }}
              >
                <FiPlus size={16} style={{ marginRight: "4px" }} />
                Add Contact
              </Button>
            </Flex>

            <Flex direction="column" gap="4">
              {formik.values.contacts.map((contact, index) => {
                // Get contact types already used by other contacts (excluding current contact)
                const usedContactTypes = formik.values.contacts
                  .filter((c) => c.id !== contact.id && c.contact_type)
                  .map((c) => c.contact_type);
                
                // Available contact types: all types except those already used by other contacts
                // But always include the current contact's type so they can keep it
                const allContactTypes = [
                  { value: "main", label: "Main" },
                  { value: "secondary", label: "Secondary" },
                  { value: "accounting", label: "Accounting" },
                ];
                
                const availableContactTypes = allContactTypes.filter(
                  (type) => !usedContactTypes.includes(type.value) || type.value === contact.contact_type
                );

                return (
                  <Box key={contact.id}>
                    {index > 0 && <Separator my="4" />}
                    <Flex align="center" justify="between" mb="3">
                      <Text size="3" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                        Contact {index + 1}
                      </Text>
                      {formik.values.contacts.length > 1 && (
                        <Button
                          type="button"
                          size="1"
                          variant="ghost"
                          onClick={() => removeContact(contact.id!)}
                          style={{ color: "var(--color-error)" }}
                        >
                          <FiTrash2 size={16} />
                        </Button>
                      )}
                    </Flex>
                    <Flex direction="column" gap="3">
                      <Select.Root
                        value={contact.contact_type || ""}
                        onValueChange={(value) =>
                          updateContactField(contact.id!, "contact_type", value)
                        }
                      >
                        <Select.Trigger
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                            width: "100%",
                          }}
                        />
                        <Select.Content>
                          {availableContactTypes.map((type) => (
                            <Select.Item key={type.value} value={type.value}>
                              {type.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    <TextField.Root
                      placeholder="Name *"
                      value={contact.name || ""}
                      onChange={(e) =>
                        updateContactField(contact.id!, "name", e.target.value)
                      }
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
                          placeholder="Email"
                          type="email"
                          value={contact.email || ""}
                          onChange={(e) =>
                            updateContactField(contact.id!, "email", e.target.value)
                          }
                          size="3"
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                      </Box>
                      <Box style={{ flex: "1", minWidth: "200px" }}>
                        <TextField.Root
                          placeholder="Phone"
                          value={contact.phone || ""}
                          onChange={(e) =>
                            updateContactField(contact.id!, "phone", e.target.value)
                          }
                          size="3"
                          style={{
                            background: "var(--color-dark-bg-secondary)",
                            border: "1px solid var(--color-dark-bg-tertiary)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                      </Box>
                    </Flex>
                    {/* Save/Cancel buttons for contact - Only show for existing clients */}
                    {!isNew && editingContactId === contact.id && (
                      <Flex gap="2" justify="end" mt="3">
                        <Button
                          type="button"
                          size="2"
                          variant="soft"
                          onClick={() => cancelContactEdit(contact.id!)}
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          Cancel
                        </Button>
                          <Button
                            type="button"
                            size="2"
                            onClick={() => saveContact(contact.id!)}
                            disabled={savingContactId === contact.id}
                            style={{
                              background: savingContactId === contact.id ? "var(--color-disabled-bg)" : "var(--color-primary)",
                              color: savingContactId === contact.id ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                              fontWeight: "600",
                            }}
                          >
                            {savingContactId === contact.id ? "Saving..." : "Save Contact"}
                          </Button>
                      </Flex>
                    )}
                  </Flex>
                </Box>
                );
              })}
            </Flex>
          </Card>

          {/* Addresses Card */}
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
                {formik.values.addresses.map((address, index) => (
                  <Box key={address.id}>
                    {index > 0 && <Separator my="4" />}
                    <Flex align="center" justify="between" mb="3">
                      <Text size="3" weight="medium" style={{ color: "var(--color-text-primary)" }}>
                        Address {index + 1}
                      </Text>
                      <Button
                        type="button"
                        size="1"
                        variant="ghost"
                        onClick={() => removeAddress(address.id)}
                        style={{ color: "var(--color-error)" }}
                      >
                        <FiTrash2 size={16} />
                      </Button>
                    </Flex>
                    <Flex direction="column" gap="3">
                      <TextField.Root
                        placeholder="Label *"
                        value={address.label || ""}
                        onChange={(e) =>
                          updateAddressField(address.id, "label", e.target.value)
                        }
                        size="3"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <TextField.Root
                        placeholder="Address Line 1 *"
                        value={address.addressLine1 || ""}
                        onChange={(e) =>
                          updateAddressField(address.id, "addressLine1", e.target.value)
                        }
                        size="3"
                        style={{
                          background: "var(--color-dark-bg-secondary)",
                          border: "1px solid var(--color-dark-bg-tertiary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <TextField.Root
                        placeholder="Address Line 2 (Optional)"
                        value={address.addressLine2 || ""}
                        onChange={(e) =>
                          updateAddressField(address.id, "addressLine2", e.target.value)
                        }
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
                            value={address.city || ""}
                            onChange={(e) =>
                              updateAddressField(address.id, "city", e.target.value)
                            }
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
                            value={address.state || ""}
                            onChange={(e) =>
                              updateAddressField(address.id, "state", e.target.value)
                            }
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
                            value={address.zipCode || ""}
                            onChange={(e) =>
                              updateAddressField(address.id, "zipCode", e.target.value)
                            }
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
                            value={address.country || ""}
                            onChange={(e) =>
                              updateAddressField(address.id, "country", e.target.value)
                            }
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
                            checked={address.isDefault}
                            onCheckedChange={(checked) =>
                              updateAddressField(address.id, "isDefault", checked)
                            }
                            size="3"
                          />
                          <Text size="2" style={{ color: "var(--color-text-primary)" }}>
                            Set as default address
                          </Text>
                    </Flex>
                  </Box>
                      {/* Save/Cancel buttons for address - Only show for existing clients */}
                      {!isNew && editingAddressId === address.id && (
                        <Flex gap="2" justify="end" mt="3">
            <Button
              type="button"
                            size="2"
              variant="soft"
                            onClick={() => cancelAddressEdit(address.id)}
              style={{ color: "var(--color-text-primary)" }}
            >
              Cancel
            </Button>
            <Button
                            type="button"
                            size="2"
                            onClick={() => saveAddress(address.id)}
                            disabled={savingAddressId === address.id}
                            style={{
                              background: savingAddressId === address.id ? "var(--color-disabled-bg)" : "var(--color-primary)",
                              color: savingAddressId === address.id ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                              fontWeight: "600",
                            }}
                          >
                            {savingAddressId === address.id ? "Saving..." : "Save Address"}
                          </Button>
                        </Flex>
                      )}
                    </Flex>
                  </Box>
                ))}
              </Flex>
            )}
          </Card>

          {/* Action Buttons for New Clients - Show at bottom */}
          {isNew && (
            <Flex gap="3" justify="end" wrap="wrap">
            <Button
              type="button"
              variant="soft"
                size="2"
              onClick={() => router.push("/clients")}
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
              }}
            >
                <FiSave size={16} style={{ marginRight: "6px" }} />
                {isSaving ? "Saving..." : "Create Client"}
            </Button>
          </Flex>
          )}

          {/* Delete Client Button - Show at end of section for existing clients */}
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
                Delete Client
              </Button>
            </Flex>
          )}
        </Flex>
      </form>

      {/* Delete Client Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (!clientId || isNew) return;
          setIsDeleting(true);
          try {
            await dispatch(deleteClientAsync(parseInt(clientId))).unwrap();
            // Show success toast
            toast.success("Client deactivated successfully");
            // Navigate back to clients list after successful deletion
            router.push("/clients");
          } catch (error: any) {
            console.error("Error deleting client:", error);
            // Error toast is already shown in the slice
          } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
          }
        }}
        title="Confirm Delete"
        description="Are you sure you want to deactivate this client? This action cannot be undone."
        isLoading={isDeleting}
      />

      {/* Delete Contact Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteContactDialogOpen}
        onOpenChange={setDeleteContactDialogOpen}
        onConfirm={confirmDeleteContact}
        title="Confirm Delete Contact"
        description="Are you sure you want to delete this contact? This action cannot be undone."
        isLoading={isDeletingContact}
      />

      {/* Delete Address Confirmation Dialog */}
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

export default function ClientProfilePage() {
  return (
    <ProtectedRoute>
      <ClientProfileContent />
    </ProtectedRoute>
  );
}
