"use client";

import { Dialog, Button, Text, Flex } from "@radix-ui/themes";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemName?: string;
  isLoading?: boolean;
}

export default function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm Delete",
  description,
  itemName,
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 400 }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          {description || (
            <>
              Are you sure you want to delete{" "}
              {itemName ? (
                <Text weight="bold" style={{ color: "var(--color-error)" }}>
                  {itemName}
                </Text>
              ) : (
                "this item"
              )}
              ? This action cannot be undone.
            </>
          )}
        </Dialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={isLoading}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            style={{
              background: "var(--color-error)",
              color: "white",
              fontWeight: "600",
            }}
          >
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
