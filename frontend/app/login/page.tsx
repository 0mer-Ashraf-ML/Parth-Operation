"use client";

import { useFormik } from "formik";
import * as yup from "yup";
import { useRouter } from "next/navigation";
import {
  Flex,
  Text,
  TextField,
  Button,
  Card,
  Heading,
  Box,
  Separator,
  IconButton,
} from "@radix-ui/themes";
import { useState, useEffect } from "react";
import { FiMail, FiLock, FiEye, FiEyeOff, FiShield, FiSmartphone, FiTrendingUp, FiCheckCircle, FiBarChart2, FiZap, FiCpu } from "react-icons/fi";
import Image from "next/image";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { loginAsync } from "@/lib/store/authSlice";
import { toast } from "react-toastify";

const validationSchema = yup.object({
  email: yup
    .string()
    .email("Invalid email address")
    .required("Email is required"),
  password: yup
    .string()
    .min(5, "Password must be at least 5 characters")
    .required("Password is required"),
});

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: validationSchema,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async (values) => {
      try {
        await dispatch(loginAsync(values)).unwrap();
        toast.success("Login successful!");
        router.push("/");
      } catch (error: any) {
        // Show error toast
        const errorMessage = error || "Login failed. Please try again.";
        toast.error(errorMessage);
      }
    },
  });

  const isFormValid = formik.isValid && formik.dirty;
  const isButtonDisabled = !isFormValid || isLoading;

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="min-h-screen p-6"
      style={{
        background: "var(--gray-2)",
      }}
    >
      <Card
        className="max-w-5xl w-full"
        style={{
          padding: 0,
          background: "white",
          boxShadow: `0 20px 60px -12px var(--color-shadow)`,
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div className="flex min-h-0 w-full flex-col lg:min-h-[600px] lg:flex-row">
          <Box
            className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-10"
            style={{
              background: "var(--color-dark-bg)",
            }}
          >
            <Flex direction="column" gap="6" className="h-full">
              <Box>
                <Flex align="center" gap="3" mb="6">
                  <Box
                    className="w-9 h-9 rounded-lg"
                    style={{
                      background: "var(--color-dark-bg-tertiary)",
                      border: "2px solid var(--color-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                <Image src="/slogo.png" alt="PARTH Logo" width={40} height={40} />
                  </Box>
                  <Heading size={{ initial: "5", md: "6" }} weight="bold" style={{ color: "var(--color-text-primary)" }}>
                    PARTH
                  </Heading>
                </Flex>
                <Heading size={{ initial: "6", md: "8" }} mb="2" style={{ color: "var(--color-text-primary)" }}>
                  Sign in
                </Heading>
                <Text size="3" style={{ color: "var(--color-text-secondary)" }}>
                  to access your account
                </Text>
              </Box>

              <form onSubmit={formik.handleSubmit}>
                <Flex direction="column" gap="5">
                  <Box>
                    <Text
                      size="2"
                      weight="medium"
                      mb="2"
                      as="label"
                      htmlFor="email"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Email address
                    </Text>
                    <TextField.Root
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      color={
                        formik.touched.email && formik.errors.email ? "red" : undefined
                      }
                      size="3"
                      style={{
                        height: "44px",
                        background: "var(--color-dark-bg-secondary)",
                        border: "1px solid var(--color-dark-bg-tertiary)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <TextField.Slot>
                        <FiMail style={{ color: "var(--color-primary)" }} size={18} />
                      </TextField.Slot>
                    </TextField.Root>
                    {formik.touched.email && formik.errors.email && (
                      <Text size="1" color="red" mt="2" className="block">
                        {formik.errors.email}
                      </Text>
                    )}
                  </Box>

                  <Box>
                    <Flex justify="between" align="center" mb="2">
                    <Text
                      size="2"
                      weight="medium"
                      as="label"
                      htmlFor="password"
                      className="block"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Password
                    </Text>
                   
                  </Flex>
                  <TextField.Root
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    color={
                      formik.touched.password && formik.errors.password
                        ? "red"
                        : undefined
                    }
                    size="3"
                    style={{
                      height: "44px",
                      background: "var(--color-dark-bg-secondary)",
                      border: "1px solid var(--color-dark-bg-tertiary)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <TextField.Slot>
                      <FiLock style={{ color: "var(--color-primary)" }} size={18} />
                    </TextField.Slot>
                    <TextField.Slot side="right">
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="1"
                        onClick={() => setShowPassword(!showPassword)}
                        className="cursor-pointer"
                      >
                        {showPassword ? (
                          <FiEyeOff style={{ color: "var(--color-primary)" }} size={18} />
                        ) : (
                          <FiEye style={{ color: "var(--color-primary)" }} size={18} />
                        )}
                      </IconButton>
                    </TextField.Slot>
                  </TextField.Root>
                    {formik.touched.password && formik.errors.password && (
                      <Text size="1" color="red" mt="2" className="block">
                        {formik.errors.password}
                      </Text>
                    )}
                  </Box>

                  <Button
                    type="submit"
                    size="3"
                    disabled={isButtonDisabled}
                    className="w-full h-11 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isButtonDisabled ? "var(--color-disabled-bg)" : "var(--color-primary)",
                      color: isButtonDisabled ? "var(--color-disabled-text)" : "var(--color-text-dark)",
                      height: "44px",
                      fontWeight: "600",
                    }}
                  >
                    {isLoading ? "Signing in..." : "Sign in"}
                  </Button>
                </Flex>
              </form>

            
            </Flex>
          </Box>

          {/* Marketing column: hidden below lg so sm/md get a single-column login */}
          <Box
            className="hidden lg:flex w-full lg:w-1/2 flex-col justify-center items-center relative overflow-hidden p-10"
            style={{
              background: `linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)`,
              position: "relative",
            }}
          >
            {/* Animated background pattern */}
            <Box
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `radial-gradient(circle at 20% 50%, rgba(251, 182, 21, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 80% 80%, rgba(251, 182, 21, 0.08) 0%, transparent 50%)`,
                opacity: 0.6,
              }}
            />
            
            <Flex direction="column" gap="8" align="center" style={{ position: "relative", zIndex: 1 }}>
              {/* Logo Image */}
              <Box className="mb-4">
                <Image
                  src="/logo.png"
                  alt="PARTH Logo"
                  width={250}
                  height={250}
                  style={{
                    objectFit: "contain",
                  }}
                />
              </Box>

              {/* Main Heading */}
              <Heading
                size={{ initial: "5", md: "7" }}
                mt={"-80px"}
                weight="bold"
                style={{ color: "white", textAlign: "center" }}
              >
              Operations & Finance Platform
              </Heading>
              
            

              {/* Feature Cards */}
              <Flex direction="column" gap="4" mt="4" style={{ width: "100%", maxWidth: "400px" }}>
                <Flex gap="3" align="start">
                  <Box
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      background: "rgba(251, 182, 21, 0.15)",
                      border: "1px solid rgba(251, 182, 21, 0.3)",
                      flexShrink: 0,
                    }}
                  >
                    <FiCpu size={20} style={{ color: "var(--color-primary)" }} />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <Text size="3" style={{ color: "white", marginBottom: "8px" }}>
                      AI-Powered Insights
                    </Text>
                    <Text size="2" style={{ color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.5 }}>
                      {" "}Intelligent automation and predictive analytics for smarter decisions
                    </Text>
                  </Box>
                </Flex>

                <Flex gap="3" align="start">
                  <Box
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      background: "rgba(251, 182, 21, 0.15)",
                      border: "1px solid rgba(251, 182, 21, 0.3)",
                      flexShrink: 0,
                    }}
                  >
                    <FiCheckCircle size={20} style={{ color: "var(--color-primary)" }} />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <Text size="3" style={{ color: "white", marginBottom: "8px" }}>
                      Secure & Reliable
                    </Text>
                    <Text size="2" style={{ color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.5 }}>
                      {" "}Enterprise-grade security with encrypted data protection
                    </Text>
                  </Box>
                </Flex>

                <Flex gap="3" align="start">
                  <Box
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      background: "rgba(251, 182, 21, 0.15)",
                      border: "1px solid rgba(251, 182, 21, 0.3)",
                      flexShrink: 0,
                    }}
                  >
                    <FiTrendingUp size={20} style={{ color: "var(--color-primary)" }} />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <Text size="3" style={{ color: "white", marginBottom: "8px" }}>
                      Real-time Analytics
                    </Text>
                    <Text size="2" style={{ color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.5 }}>
                      {" "}Track your business metrics with powerful insights
                    </Text>
                  </Box>
                </Flex>
              </Flex>

              {/* Decorative elements */}
              <Flex gap="6" mt="6" align="center">
                <Box
                  style={{
                    width: "60px",
                    height: "2px",
                    background: "linear-gradient(90deg, transparent, rgba(251, 182, 21, 0.5), transparent)",
                  }}
                />
                <Box
                  className="shrink-0 text-center"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "20px",
                    background: "rgba(251, 182, 21, 0.1)",
                    border: "1px solid rgba(251, 182, 21, 0.3)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <Text
                    size="1"
                    weight="medium"
                    className="text-center"
                    style={{
                      color: "var(--color-primary)",
                      lineHeight: 1.35,
                    }}
                  >
                    Trusted by 1000+ Companies
                  </Text>
                </Box>
                <Box
                  style={{
                    width: "60px",
                    height: "2px",
                    background: "linear-gradient(90deg, transparent, rgba(251, 182, 21, 0.5), transparent)",
                  }}
                />
              </Flex>
            </Flex>
          </Box>
        </div>
      </Card>
      
      <Box className="mt-8">
        <Text size="2" style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>
          © 2026, Parth Corporation Pvt. Ltd. All Rights Reserved.
        </Text>
      </Box>
    </Flex>
  );
}
