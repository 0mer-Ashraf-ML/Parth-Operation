/**
 * Reusable Action Buttons Component
 * Provides consistent button styling and layout
 */

import { Flex, Button } from "@radix-ui/themes";
import { FiSave, FiTrash2 } from "react-icons/fi";

interface ActionButtonsProps {
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isValid?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  deleteLabel?: string;
  showDelete?: boolean;
  size?: "1" | "2" | "3" | "4";
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onCancel,
  onSave,
  onDelete,
  isSaving = false,
  isValid = true,
  saveLabel = "Save Changes",
  cancelLabel = "Cancel",
  deleteLabel = "Delete",
  showDelete = false,
  size = "2",
}) => {
  return (
    <Flex gap="3" justify="between" wrap="wrap">
      {showDelete && onDelete && (
        <Button
          type="button"
          size={size}
          variant="soft"
          color="red"
          onClick={onDelete}
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <FiTrash2 size={18} style={{ marginRight: "8px" }} />
          {deleteLabel}
        </Button>
      )}
      <Flex gap="3" justify="end" style={{ flex: 1 }}>
        <Button
          type="button"
          variant="soft"
          size={size}
          onClick={onCancel}
          disabled={isSaving}
          style={{ color: "var(--color-text-primary)" }}
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
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
    </Flex>
  );
};
