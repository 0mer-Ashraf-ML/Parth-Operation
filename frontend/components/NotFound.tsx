"use client";

import { useRouter } from "next/navigation";
import { Flex, Text, Heading, Button, Box } from "@radix-ui/themes";
import { IconType } from "react-icons";

interface NotFoundProps {
  title?: string;
  description?: string;
  icon?: IconType;
  backButtonLabel?: string;
  backButtonPath?: string;
  showHomeButton?: boolean;
}

export default function NotFound({
  title = "404 - Not Found",
  description = "The resource you're looking for doesn't exist or has been removed.",
  icon: Icon,
  backButtonLabel = "Go Back",
  backButtonPath,
  showHomeButton = false,
}: NotFoundProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backButtonPath) {
      router.push(backButtonPath);
    } else {
      router.back();
    }
  };

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        padding: "2rem",
        background: "var(--color-dark-bg)",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* Background gradient effect */}
      <Box
        style={{
          position: "absolute",
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          background: `radial-gradient(circle, rgba(251, 182, 21, 0.08) 0%, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <Flex
        direction="column"
        align="center"
        gap="6"
        style={{
          maxWidth: "700px",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Icon with gradient background */}
        {Icon && (
          <Box
            style={{
              position: "relative",
              marginBottom: "1rem",
            }}
          >
            {/* Outer glow effect */}
            <Box
              className="not-found-glow"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "180px",
                height: "180px",
                borderRadius: "50%",
                background: `radial-gradient(circle, rgba(251, 182, 21, 0.2) 0%, transparent 70%)`,
              }}
            />
            {/* Icon container */}
            <Box
              style={{
                width: "140px",
                height: "140px",
                borderRadius: "50%",
                background: `linear-gradient(135deg, rgba(251, 182, 21, 0.15) 0%, rgba(251, 182, 21, 0.05) 100%)`,
                border: "2px solid rgba(251, 182, 21, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                backdropFilter: "blur(10px)",
                boxShadow: `
                  0 0 40px rgba(251, 182, 21, 0.2),
                  inset 0 0 20px rgba(251, 182, 21, 0.1)
                `,
              }}
            >
              <Icon
                size={70}
                style={{
                  color: "var(--color-primary)",
                  filter: "drop-shadow(0 2px 8px rgba(251, 182, 21, 0.4))",
                }}
              />
            </Box>
          </Box>
        )}

        {/* Title with gradient text effect */}
        <Heading
          size="9"
          style={{
            background: `linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-primary) 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontWeight: "800",
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
            textAlign: "center",
            lineHeight: "1.2",
          }}
        >
          {title}
        </Heading>

        {/* Description */}
        <Text
          size="4"
          style={{
            color: "var(--color-text-secondary)",
            lineHeight: "1.7",
            maxWidth: "550px",
            textAlign: "center",
            marginBottom: "1rem",
          }}
        >
          {description}
        </Text>

        {/* Decorative line */}
        <Box
          style={{
            width: "80px",
            height: "3px",
            background: `linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)`,
            borderRadius: "2px",
            marginBottom: "1rem",
          }}
        />

        {/* Action Buttons */}
        <Flex gap="4" justify="center" wrap="wrap" style={{ marginTop: "1rem" }}>
          <Button
            size="3"
            onClick={handleBack}
            style={{
              background: "var(--color-dark-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-dark-bg-tertiary)",
              fontWeight: "600",
              padding: "0.875rem 2rem",
              minWidth: "160px",
              borderRadius: "8px",
              transition: "all 0.2s ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-dark-bg-secondary)";
              e.currentTarget.style.borderColor = "var(--color-primary-border)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-dark-bg-tertiary)";
              e.currentTarget.style.borderColor = "var(--color-dark-bg-tertiary)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {backButtonLabel}
          </Button>
          {showHomeButton && (
            <Button
              size="3"
              onClick={() => router.push("/")}
              style={{
                background: "var(--color-primary)",
                color: "var(--color-text-dark)",
                fontWeight: "700",
                padding: "0.875rem 2rem",
                minWidth: "160px",
                borderRadius: "8px",
                transition: "all 0.2s ease",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(251, 182, 21, 0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f0a500";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(251, 182, 21, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-primary)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(251, 182, 21, 0.3)";
              }}
            >
              Go Home
            </Button>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
