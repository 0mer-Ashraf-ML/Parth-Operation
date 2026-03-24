/**
 * Reusable Save/Cancel Buttons Component
 * Simplified version for inline use
 */

import { Flex, Button } from "@radix-ui/themes";
import { FiSave } from "react-icons/fi";

interface SaveCancelButtonsProps {
  onCancel: () => void;
  onSave: () => void;
  isSaving?: boolean;
  isValid?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  size?: "1" | "2" | "3";
}

export const SaveCancelButtons: React.FC<SaveCancelButtonsProps> = ({
  onCancel,
  onSave,
  isSaving = false,
  isValid = true,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  size = "2",
}) => {
  return (
    <Flex gap="2" justify="end" mt="3">
      <Button
        type="button"
        size={size}
        variant="soft"
        onClick={onCancel}
        disabled={isSaving}
        style={{ color: "var(--color-text-primary)" }}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        size={size}
        onClick={onSave}
        disabled={isSaving || !isValid}
        style={{
          background: isSaving || !isValid ? "var(--color-disabled-bg)" : "var(--color-primary)",
          color: isSaving || !isValid ? "var(--color-disabled-text)" : "var(--color-text-dark)",
          fontWeight: "600",
        }}
      >
        <FiSave size={16} style={{ marginRight: "6px" }} />
        {isSaving ? "Saving..." : saveLabel}
      </Button>
    </Flex>
  );
};
