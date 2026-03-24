/**
 * Reusable Form Field Component
 * Provides consistent styling and error handling
 */

import { Box, Text, TextField } from "@radix-ui/themes";
import { FieldInputProps, FieldMetaProps } from "formik";

type InputType = "number" | "email" | "url" | "search" | "time" | "text" | "hidden" | "tel" | "date" | "month" | "datetime-local" | "password" | "week";

interface FormFieldProps {
  label: string;
  name: string;
  type?: InputType;
  placeholder?: string;
  required?: boolean;
  field: FieldInputProps<any>;
  meta: FieldMetaProps<any>;
  min?: number;
  max?: number;
  step?: string;
  multiline?: boolean;
  rows?: number;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
  field,
  meta,
  min,
  max,
  step,
  multiline = false,
  rows = 3,
}) => {
  const hasError = meta.touched && meta.error;

  return (
    <Box>
      <Text
        size="2"
        weight="medium"
        mb="2"
        as="label"
        htmlFor={name}
        className="block"
        style={{ color: "var(--color-text-primary)" }}
      >
        {label} {required && "*"}
      </Text>
      {multiline ? (
        <TextField.Root
          id={name}
          {...field}
          placeholder={placeholder}
          size="3"
          style={{
            background: "var(--color-dark-bg-secondary)",
            border: hasError
              ? "1px solid var(--color-error)"
              : "1px solid var(--color-dark-bg-tertiary)",
            color: "var(--color-text-primary)",
            minHeight: `${rows * 24}px`,
          }}
        />
      ) : (
        <TextField.Root
          id={name}
          {...field}
          type={type}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          size="3"
          style={{
            background: "var(--color-dark-bg-secondary)",
            border: hasError
              ? "1px solid var(--color-error)"
              : "1px solid var(--color-dark-bg-tertiary)",
            color: "var(--color-text-primary)",
          }}
        />
      )}
      {hasError && (
        <Text size="1" color="red" mt="1" className="block">
          {meta.error}
        </Text>
      )}
    </Box>
  );
};
