"use client";

import { Flex, Box, Text, Button, Avatar, Badge, IconButton, TextField, Tooltip, Dialog, Popover, Separator } from "@radix-ui/themes";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { 
  FiLayout, 
  FiUsers, 
  FiPackage, 
  FiTruck, 
  FiFileText, 
  FiShoppingCart, 
  FiUser, 
  FiMessageCircle,
  FiLogOut, 
  FiMenu, 
  FiBell, 
  FiSearch,
  FiChevronLeft,
  FiDollarSign,
  FiBarChart
} from "react-icons/fi";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { logoutAsync } from "@/lib/store/authSlice";
import Image from "next/image";

type UserRole = "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR" | "admin" | "account_manager" | "vendor";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebarOpen");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebarVisible");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [logoutHovered, setLogoutHovered] = useState(false);
  const [hideSidebarHovered, setHideSidebarHovered] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isLgUp, setIsLgUp] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsLgUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (isLgUp) setMobileDrawerOpen(false);
  }, [isLgUp]);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileDrawerOpen || isLgUp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileDrawerOpen, isLgUp]);

  // Mock notification data - replace with actual API call
  const notifications = [
    {
      id: "1",
      title: "New Sales Order",
      message: "SO-2024-001 has been created",
      time: "2 hours ago",
      type: "success",
      read: false,
    },
    {
      id: "2",
      title: "Purchase Order Delivered",
      message: "PO-2024-045 has been delivered",
      time: "5 hours ago",
      type: "info",
      read: false,
    },
    {
      id: "3",
      title: "Client Added",
      message: "New client Tech Solutions has been added",
      time: "1 day ago",
      type: "info",
      read: true,
    },
    {
      id: "4",
      title: "SKU Price Updated",
      message: "SKU-004 price has been updated",
      time: "2 days ago",
      type: "warning",
      read: true,
    },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const userEmail = user?.email || "";
  const userRole = user?.role?.toUpperCase() as UserRole | null;
  const userName = user?.full_name || "";

  const handleSidebarToggle = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem("sidebarOpen", String(newState));
  };

  const handleSidebarHide = () => {
    const newState = !sidebarVisible;
    setSidebarVisible(newState);
    localStorage.setItem("sidebarVisible", String(newState));
  };

  const handleLogout = async () => {
    setLogoutDialogOpen(false);
    await dispatch(logoutAsync());
    router.push("/login");
  };

  const allMenuItems = [
    { icon: FiLayout, label: "Dashboard", path: "/", roles: ["ADMIN"] as UserRole[] },
    { icon: FiUsers, label: "Clients", path: "/clients", roles: ["ADMIN", "ACCOUNT_MANAGER"] as UserRole[] },
    { icon: FiTruck, label: "Vendors", path: "/vendors", roles: ["ADMIN"] as UserRole[] },
    { icon: FiPackage, label: "SKUs", path: "/skus", roles: ["ADMIN"] as UserRole[] },
    { icon: FiFileText, label: "Sales Orders", path: "/sales-orders", roles: ["ADMIN", "ACCOUNT_MANAGER"] as UserRole[] },
    { icon: FiShoppingCart, label: "Purchase Orders", path: "/purchase-orders", roles: ["ADMIN", "ACCOUNT_MANAGER", "VENDOR"] as UserRole[] },
    // { icon: FiDollarSign, label: "Invoices", path: "/invoices", roles: ["ADMIN", "ACCOUNT_MANAGER"] as UserRole[] },
    // { icon: FiBarChart, label: "Reports", path: "/reports", roles: ["ADMIN", "ACCOUNT_MANAGER"] as UserRole[] },
    { icon: FiMessageCircle, label: "AI Chat", path: "/ai-chat", roles: ["ADMIN", "ACCOUNT_MANAGER", "VENDOR"] as UserRole[] },
    { icon: FiUser, label: "Users", path: "/users", roles: ["ADMIN"] as UserRole[] },
  ];

  // Normalize role for comparison (API returns lowercase, menu uses uppercase)
  const normalizedRole = userRole?.toUpperCase() as "ADMIN" | "ACCOUNT_MANAGER" | "VENDOR" | null;
  
  const menuItems = normalizedRole
    ? allMenuItems.filter((item) => item.roles.includes(normalizedRole))
    : [];

  const isActive = (path: string) => pathname === path;

  const navigateTo = useCallback(
    (path: string) => {
      router.push(path);
      if (!isLgUp) setMobileDrawerOpen(false);
    },
    [router, isLgUp]
  );

  const showSidebarChrome = menuItems.length > 0 && (!isLgUp || sidebarVisible);
  /** Mobile overlay drawer always uses expanded labels; desktop uses collapsed rail when sidebarOpen is false */
  const railExpanded = isLgUp ? sidebarOpen : true;

  return (
    <Flex className="relative min-h-screen min-w-0" style={{ background: "var(--gray-1)" }}>
      {!isLgUp && mobileDrawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-90 bg-black/60 lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      {showSidebarChrome && (
        <Box
          className={`flex flex-col max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-100 max-lg:h-screen max-lg:shadow-xl lg:shrink-0 ${
            !isLgUp && !mobileDrawerOpen ? "max-lg:pointer-events-none max-lg:-translate-x-full" : ""
          } ${!isLgUp && mobileDrawerOpen ? "max-lg:pointer-events-auto max-lg:translate-x-0" : ""} max-lg:transition-transform max-lg:duration-300 max-lg:ease-out`}
          style={{
            width: isLgUp ? (sidebarOpen ? "256px" : "80px") : "min(280px, 85vw)",
            background: "var(--color-dark-bg)",
            borderRight: "1px solid var(--color-dark-bg-secondary)",
            transition: isLgUp ? "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
            overflow: "hidden",
          }}
        >
        <Box 
          className="p-5" 
          style={{ 
            borderBottom: "1px solid var(--color-dark-bg-secondary)",
            transition: "all 0.3s ease",
          }}
        >
          <Flex align="center" gap="3" justify={railExpanded ? "start" : "center"}>
            <Box
              className="w-9 h-9 rounded-lg cursor-pointer transition-transform duration-200 hover:scale-105"
              onClick={() => {
                if (isLgUp) handleSidebarToggle();
              }}
              style={{
                background: "var(--color-dark-bg-tertiary)",
                border: "2px solid var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
                              <Image src="/slogo.png" alt="PARTH Logo" width={40} height={40} />
            </Box>
            {railExpanded && (
              <Text 
                size="5" 
                weight="bold" 
                style={{ 
                  color: "var(--color-text-primary)",
                  whiteSpace: "nowrap",
                  opacity: railExpanded ? 1 : 0,
                  transition: "opacity 0.2s ease",
                
                }}
              >
                PARTH
              </Text>
            )}
          </Flex>
        </Box>

        <Flex direction="column" gap="2" className="flex-1 p-3 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const isHovered = hoveredItem === item.path && !active;
            const menuButton = (
              <Button
                key={item.path}
                variant="ghost"
                className="w-full transition-all duration-200"
                style={{
                  padding: "0.875rem 1rem",
                  marginBottom: "0.25rem",
                  background: active ? "var(--color-primary)" : isHovered ? "var(--color-primary-hover)" : "transparent",
                  color: active ? "var(--color-text-dark)" : isHovered ? "var(--color-primary)" : "var(--color-text-primary)",
                  fontWeight: active ? "600" : "400",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: railExpanded ? "flex-start" : "center",
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setHoveredItem(item.path)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => navigateTo(item.path)}
              >
                <Icon 
                  size={20} 
                  style={{ 
                    marginRight: railExpanded ? "0.875rem" : "0",
                    color: active ? "var(--color-text-dark)" : isHovered ? "var(--color-primary)" : "var(--color-text-primary)",
                    flexShrink: 0,
                    transition: "color 0.2s ease",
                  }} 
                />
                {railExpanded && (
                  <Text 
                    size="2" 
                    weight={active ? "bold" : "regular"} 
                    style={{ 
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      opacity: railExpanded ? 1 : 0,
                      transition: "opacity 0.2s ease, color 0.2s ease",
                      color: active ? "var(--color-text-dark)" : isHovered ? "var(--color-primary)" : "var(--color-text-primary)",
                    }}
                  >
                    {item.label}
                  </Text>
                )}
              </Button>
            );

            // Show tooltip only when desktop rail is collapsed
            if (!railExpanded) {
              return (
                <Tooltip key={item.path} content={item.label} side="left">
                  {menuButton}
                </Tooltip>
              );
            }

            return menuButton;
          })}
        </Flex>

        <Box 
          className="p-3" 
          style={{ 
            borderTop: "1px solid var(--color-dark-bg-secondary)",
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {(() => {
            const logoutButton = (
              <Button
                variant="ghost"
                className="w-full transition-all duration-200"
                style={{
                  padding: "0.75rem 0.5rem",
                  color: logoutHovered ? "var(--color-error-hover)" : "var(--color-error)",
                  background: logoutHovered ? "var(--color-error-light)" : "transparent",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: railExpanded ? "flex-start" : "center",
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "100%",
                }}
                onMouseEnter={() => setLogoutHovered(true)}
                onMouseLeave={() => setLogoutHovered(false)}
                onClick={() => setLogoutDialogOpen(true)}
              >
                <FiLogOut 
                  size={20} 
                  style={{ 
                    marginRight: railExpanded ? "0.875rem" : "0",
                    flexShrink: 0, 
                    color: logoutHovered ? "var(--color-error-hover)" : "var(--color-error)",
                    transition: "color 0.2s ease",
                  }} 
                />
                {railExpanded && (
                  <Text 
                    size="2" 
                    weight="medium" 
                    style={{ 
                      whiteSpace: "nowrap", 
                      color: logoutHovered ? "var(--color-error-hover)" : "var(--color-error)",
                      transition: "color 0.2s ease, opacity 0.2s ease",
                      opacity: railExpanded ? 1 : 0,
                    }}
                  >
                    Logout
                  </Text>
                )}
              </Button>
            );

            if (!railExpanded) {
              return (
                <Tooltip content="Logout" side="left">
                  {logoutButton}
                </Tooltip>
              );
            }

            return logoutButton;
          })()}
          
          {/* Separator Line */}
          <Box
            style={{
              height: "1px",
              background: "var(--color-dark-bg-secondary)",
              margin: "0.5rem 0",
              width: "100%",
            }}
          />
          
          {(() => {
            const hideSidebarButton = (
              <Button
                variant="ghost"
                className="w-full transition-all duration-200"
                style={{
                  padding: "0.75rem 0.5rem",
                  color: hideSidebarHovered ? "var(--color-primary)" : "var(--color-text-secondary)",
                  background: hideSidebarHovered ? "var(--color-primary-hover)" : "transparent",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: railExpanded ? "flex-start" : "center",
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "100%",
                }}
                onMouseEnter={() => setHideSidebarHovered(true)}
                onMouseLeave={() => setHideSidebarHovered(false)}
                onClick={() => {
                  if (!isLgUp) setMobileDrawerOpen(false);
                  else handleSidebarHide();
                }}
              >
                <FiChevronLeft 
                  size={20} 
                  style={{ 
                    marginRight: railExpanded ? "0.875rem" : "0",
                    flexShrink: 0, 
                    color: hideSidebarHovered ? "var(--color-primary)" : "var(--color-text-secondary)",
                    transition: "color 0.2s ease",
                  }} 
                />
                {railExpanded && (
                  <Text 
                    size="2" 
                    weight="medium" 
                    style={{ 
                      whiteSpace: "nowrap", 
                      color: hideSidebarHovered ? "var(--color-primary)" : "var(--color-text-secondary)",
                      transition: "color 0.2s ease, opacity 0.2s ease",
                      opacity: railExpanded ? 1 : 0,
                    }}
                  >
                    {!isLgUp ? "Close menu" : "Hide Sidebar"}
                  </Text>
                )}
              </Button>
            );

            if (!railExpanded) {
              return (
                <Tooltip content="Hide Sidebar" side="left">
                  {hideSidebarButton}
                </Tooltip>
              );
            }

            return hideSidebarButton;
          })()}
       
        </Box>
      </Box>
      )}

      <Flex direction="column" className="flex-1 min-w-0">
        <Box
          className="h-16 px-6"
          style={{
            borderBottom: "1px solid var(--color-dark-bg-secondary)",
            background: "var(--gray-1)",
          }}
        >
          <Flex align="center" justify="between" className="h-full">
            <Flex align="center" gap="4" className="flex-1 min-w-0">
              {menuItems.length > 0 && (
                <>
                  {!isLgUp && (
                    <IconButton
                      variant="ghost"
                      size="2"
                      onClick={() => setMobileDrawerOpen((open) => !open)}
                      aria-expanded={mobileDrawerOpen}
                      aria-label={mobileDrawerOpen ? "Close menu" : "Open menu"}
                      className="lg:hidden shrink-0"
                      style={{ color: "var(--gray-11)" }}
                    >
                      <FiMenu size={20} />
                    </IconButton>
                  )}
                  {isLgUp && !sidebarVisible && (
                    <IconButton
                      variant="ghost"
                      size="2"
                      onClick={handleSidebarHide}
                      aria-label="Show sidebar"
                      className="shrink-0"
                      style={{ color: "var(--gray-11)" }}
                    >
                      <FiMenu size={20} />
                    </IconButton>
                  )}
                </>
              )}
            </Flex>
            <Flex align="center" gap="4">
              {/* Notifications hidden until responsive UX is ready */}
              <Box style={{ display: "none" }} aria-hidden>
              <Popover.Root>
                <Popover.Trigger>
                  <IconButton 
                    variant="ghost" 
                    size="2" 
                    className="relative"
                    style={{ color: "var(--gray-11)" }}
                  >
                    <FiBell size={18} />
                    {unreadCount > 0 && (
                      <Badge
                        size="1"
                        color="red"
                        className="absolute top-0 right-0"
                        style={{
                          width: "8px",
                          height: "8px",
                          padding: 0,
                          borderRadius: "50%",
                        }}
                      />
                    )}
                  </IconButton>
                </Popover.Trigger>
                <Popover.Content side="left" style={{ width: 360, maxHeight: 500, overflowY: "auto" }}>
                  <Flex direction="column" gap="2">
                    <Flex align="center" justify="between" mb="2">
                      <Text size="4" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                        Notifications
                      </Text>
                      {unreadCount > 0 && (
                        <Badge size="2" color="red">
                          {unreadCount} new
                        </Badge>
                      )}
                    </Flex>
                    <Separator />
                    {notifications.length === 0 ? (
                      <Box py="4" style={{ textAlign: "center" }}>
                        <Text size="2" style={{ color: "var(--color-text-secondary)" }}>
                          No notifications
                        </Text>
                      </Box>
                    ) : (
                      <Flex direction="column" gap="2">
                        {notifications.map((notification) => (
                          <Box
                            key={notification.id}
                            style={{
                              padding: "12px",
                              background: notification.read
                                ? "transparent"
                                : "var(--color-primary-light)",
                              borderRadius: "8px",
                              border: notification.read
                                ? "1px solid var(--color-dark-bg-tertiary)"
                                : "1px solid var(--color-primary-border)",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--color-dark-bg-secondary)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = notification.read
                                ? "transparent"
                                : "var(--color-primary-light)";
                            }}
                          >
                            <Flex direction="column" gap="1">
                              <Flex align="center" justify="between" gap="2">
                                <Text
                                  size="2"
                                  weight={notification.read ? "regular" : "bold"}
                                  style={{ color: "var(--color-text-primary)" }}
                                >
                                  {notification.title}
                                </Text>
                                {!notification.read && (
                                  <Box
                                    style={{
                                      width: "8px",
                                      height: "8px",
                                      borderRadius: "50%",
                                      background: "var(--color-primary)",
                                    }}
                                  />
                                )}
                              </Flex>
                              <Text
                                size="1"
                                style={{
                                  color: "var(--color-text-secondary)",
                                  lineHeight: 1.4,
                                }}
                              >
                                {notification.message}
                              </Text>
                              <Text
                                size="1"
                                style={{
                                  color: "var(--color-text-secondary)",
                                  marginTop: "4px",
                                }}
                              >
                                {notification.time}
                              </Text>
                            </Flex>
                          </Box>
                        ))}
                      </Flex>
                    )}
                    {notifications.length > 0 && (
                      <>
                        <Separator />
                        <Button
                          variant="soft"
                          size="2"
                          style={{
                            width: "100%",
                            marginTop: "4px",
                          }}
                        >
                          Mark all as read
                        </Button>
                      </>
                    )}
                  </Flex>
                </Popover.Content>
              </Popover.Root>
              </Box>
              <Flex align="center" gap="3">
                <Box className="text-right hidden sm:block">
                  <Text size="2" weight="medium" className="block" style={{ color: "var(--gray-12)" }}>
                    {userName}
                  </Text>
                  <Text size="1" className="block" style={{ color: "var(--gray-10)" }}>
                    {userEmail}
                  </Text>
                </Box>
                <Avatar
                  size="3"
                  radius="full"
                  fallback={userEmail.charAt(0).toUpperCase()}
                  style={{
                    background: "var(--color-dark-bg-tertiary)",
                    border: "2px solid var(--color-primary)",
                    color: "var(--color-primary)",
                    fontWeight: "600",
                  }}
                />
              </Flex>
            </Flex>
          </Flex>
        </Box>

        <Box
          className="flex-1 p-6 overflow-auto"
          maxHeight="calc(100vh - 100px)"
          style={{
            background: "var(--gray-1)",
          }}
        >
          {children}
        </Box>
      </Flex>

      {/* Logout Confirmation Dialog */}
      <Dialog.Root open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <Dialog.Content style={{ maxWidth: 400 }}>
          <Dialog.Title>Confirm Logout</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Are you sure you want to logout? You will need to login again to access your account.
          </Dialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleLogout}
              style={{
                background: "var(--color-error)",
                color: "white",
                fontWeight: "600",
              }}
            >
              Logout
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}
