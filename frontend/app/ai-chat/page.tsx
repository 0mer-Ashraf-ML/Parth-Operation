"use client";

import { useState, useRef, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Flex,
  Text,
  Heading,
  Box,
  TextField,
  Button,
  Card,
  Avatar,
  Separator,
  Dialog,
} from "@radix-ui/themes";
import { FiSend, FiMenu, FiChevronLeft, FiPlus, FiTrash2 } from "react-icons/fi";
import { useNarrowScreen } from "@/hooks/useNarrowScreen";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

function AIChatContent() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aiConversations");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.map((conv: any) => ({
            ...conv,
            messages: conv.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            })),
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
          }));
        } catch (e) {
          return [];
        }
      }
    }
    return [];
  });
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isNarrow = useNarrowScreen(768);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 768px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  // Load conversation on mount or when conversation ID changes
  useEffect(() => {
    if (currentConversationId) {
      const conversation = conversations.find((c) => c.id === currentConversationId);
      if (conversation) {
        setMessages(conversation.messages);
      }
    } else if (conversations.length > 0) {
      // Load the most recent conversation
      const mostRecent = conversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      )[0];
      setCurrentConversationId(mostRecent.id);
      setMessages(mostRecent.messages);
    } else {
      // No conversations, start with welcome message
      const welcomeMessage: Message = {
        id: "1",
        role: "assistant",
        content: "Hello! I'm your AI assistant. How can I help you today?",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [currentConversationId, conversations.length]);

  // Save conversations to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && conversations.length > 0) {
      localStorage.setItem("aiConversations", JSON.stringify(conversations));
    }
  }, [conversations]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);

    // Update or create conversation
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = Date.now().toString();
      const newConversation: Conversation = {
        id: conversationId,
        title: userMessage.content.substring(0, 50) + (userMessage.content.length > 50 ? "..." : ""),
        messages: updatedMessages,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setConversations((prev) => [newConversation, ...prev]);
      setCurrentConversationId(conversationId);
    } else {
      // Update existing conversation
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: updatedMessages,
                title: conv.messages.length === 0
                  ? userMessage.content.substring(0, 50) + (userMessage.content.length > 50 ? "..." : "")
                  : conv.title,
                updatedAt: new Date(),
              }
            : conv
        )
      );
    }

    // Simulate API call - replace with actual AI API endpoint
    try {
      // Simulate AI response delay
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

      // Mock AI response - replace with actual API response
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: generateMockResponse(userMessage.content),
        timestamp: new Date(),
      };

      const finalMessages = [...updatedMessages, aiResponse];
      setMessages(finalMessages);

      // Update conversation with AI response
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: finalMessages,
                updatedAt: new Date(),
              }
            : conv
        )
      );
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const generateMockResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    // Simple keyword-based responses for demo
    if (lowerMessage.includes("client") || lowerMessage.includes("customer")) {
      return "I can help you with client management. You can view all clients, add new ones, and manage their information including ship-to addresses, net terms, and financial settings. Would you like me to guide you through any specific client operations?";
    }
    if (lowerMessage.includes("sales order") || lowerMessage.includes("so")) {
      return "Sales Orders allow you to manage customer orders. You can create new sales orders, assign clients, add SKU line items, and track delivery status. The system supports statuses like Pending, Partial Delivered, and Delivered. How can I assist you with sales orders?";
    }
    if (lowerMessage.includes("purchase order") || lowerMessage.includes("po")) {
      return "Purchase Orders help you manage vendor orders. They can be linked to Sales Orders and have different status flows based on shipment type (drop-ship vs in-house). I can help you understand the status progression or create new purchase orders. What would you like to know?";
    }
    if (lowerMessage.includes("sku") || lowerMessage.includes("product")) {
      return "SKUs (Stock Keeping Units) are your products. Each SKU can have tiered pricing based on quantity, a default vendor, and various attributes. You can manage SKUs, set up pricing tiers, and assign vendors. What would you like to do with SKUs?";
    }
    if (lowerMessage.includes("vendor") || lowerMessage.includes("supplier")) {
      return "Vendors are your suppliers. You can manage vendor information, contact details, and addresses. Each SKU can have a default vendor assigned. How can I help you with vendor management?";
    }
    if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || lowerMessage.includes("hey")) {
      return "Hello! I'm here to help you with your finance management system. I can assist you with clients, sales orders, purchase orders, SKUs, vendors, and more. What would you like to know?";
    }
    if (lowerMessage.includes("help")) {
      return "I can help you with various aspects of the system:\n\n• **Clients**: Manage client information, ship-to addresses, and financial settings\n• **Sales Orders**: Create and track customer orders\n• **Purchase Orders**: Manage vendor orders and shipments\n• **SKUs**: Set up products with tiered pricing\n• **Vendors**: Manage supplier information\n• **Users**: Invite users and manage permissions\n\nWhat would you like help with?";
    }
    
    // Default response
    return `I understand you're asking about "${userMessage}". I'm here to help you navigate the finance management system. I can assist with clients, sales orders, purchase orders, SKUs, vendors, and user management. Could you provide more details about what you need help with?`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([
      {
        id: "1",
        role: "assistant",
        content: "Hello! I'm your AI assistant. How can I help you today?",
        timestamp: new Date(),
      },
    ]);
    setInputValue("");
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setMessages(conversation.messages);
    }
    if (isNarrow) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteConversation = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteConversation = () => {
    if (!conversationToDelete) return;
    
    const updatedConversations = conversations.filter((c) => c.id !== conversationToDelete);
    setConversations(updatedConversations);
    
    if (currentConversationId === conversationToDelete) {
      if (updatedConversations.length > 0) {
        const mostRecent = updatedConversations.sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        )[0];
        setCurrentConversationId(mostRecent.id);
        setMessages(mostRecent.messages);
      } else {
        setCurrentConversationId(null);
        setMessages([
          {
            id: "1",
            role: "assistant",
            content: "Hello! I'm your AI assistant. How can I help you today?",
            timestamp: new Date(),
          },
        ]);
      }
    }
    
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const sortedConversations = [...conversations].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  return (
    <>
      {isNarrow && sidebarOpen && (
        <Box
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <Flex
        className="w-full min-h-0 min-w-0 flex-col gap-4 md:flex-row"
        style={{
          height: "100%",
          maxHeight: "min(calc(100vh - 200px), calc(100dvh - 5rem))",
        }}
      >
      {/* Sidebar — drawer on mobile, column on md+ */}
      <Box
        className={
          sidebarOpen
            ? "flex flex-col max-md:fixed max-md:left-0 max-md:top-16 max-md:z-80 max-md:h-[calc(100dvh-4.5rem)] max-md:w-[min(280px,88vw)] max-md:shadow-2xl md:relative md:top-auto md:z-auto md:h-auto md:w-[280px] md:min-w-[280px] md:shadow-none"
            : "hidden flex-col md:flex md:w-0 md:min-w-0 md:overflow-hidden"
        }
        style={{
          overflow: "hidden",
          transition: "width 0.3s ease, min-width 0.3s ease",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          border: "1px solid var(--color-dark-bg-tertiary)",
        }}
      >
        {sidebarOpen && (
          <Flex direction="column" style={{ height: "100%", padding: "16px" }}>
            <Flex align="center" justify="between" mb="4">
              <Text size="3" weight="bold" style={{ color: "var(--color-text-primary)" }}>
                Conversations
              </Text>
              {isNarrow && (
                <Button
                  size="1"
                  variant="ghost"
                  onClick={() => setSidebarOpen(false)}
                  style={{ color: "var(--color-text-secondary)" }}
                  aria-label="Close conversations"
                >
                  <FiChevronLeft size={20} />
                </Button>
              )}
            </Flex>
            <Button
              size="3"
              onClick={handleNewChat}
              style={{
                background: "var(--color-primary)",
                color: "var(--color-text-dark)",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              <FiPlus size={18} style={{ marginRight: "8px" }} />
              New Chat
            </Button>
            <Box style={{ flex: 1, overflowY: "auto" }}>
              {sortedConversations.length === 0 ? (
                <Text size="2" style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>
                  No conversations yet. Start a new chat!
                </Text>
              ) : (
                <Flex direction="column" gap="2">
                  {sortedConversations.map((conversation) => (
                    <Card
                      key={conversation.id}
                      style={{
                        padding: "12px",
                        background:
                          currentConversationId === conversation.id
                            ? "var(--color-primary-hover)"
                            : "var(--color-dark-bg)",
                        border:
                          currentConversationId === conversation.id
                            ? "1px solid var(--color-primary)"
                            : "1px solid var(--color-dark-bg-tertiary)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onClick={() => handleSelectConversation(conversation.id)}
                      onMouseEnter={(e) => {
                        if (currentConversationId !== conversation.id) {
                          e.currentTarget.style.background = "var(--color-dark-bg-tertiary)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentConversationId !== conversation.id) {
                          e.currentTarget.style.background = "var(--color-dark-bg)";
                        }
                      }}
                    >
                      <Flex align="center" justify="between" gap="2">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            size="2"
                            weight="medium"
                            style={{
                              color:
                                currentConversationId === conversation.id
                                  ? "var(--color-primary)"
                                  : "var(--color-text-primary)",
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {conversation.title}
                          </Text>
                          <Text
                            size="1"
                            style={{
                              color: "var(--color-text-secondary)",
                              marginTop: "4px",
                            }}
                          >
                            {conversation.updatedAt.toLocaleDateString()}
                          </Text>
                        </Box>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={(e) => handleDeleteConversation(conversation.id, e)}
                          style={{
                            color: "var(--color-error)",
                            flexShrink: 0,
                          }}
                          className="no-hover-effect"
                        >
                          <FiTrash2 size={14} />
                        </Button>
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Box>
          </Flex>
        )}
      </Box>

      {/* Main Chat Area */}
      <Flex direction="column" className="min-h-0 min-w-0 flex-1" style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" justify="between" mb="4" wrap="wrap" gap="3" className="min-w-0">
          <Flex align="center" gap="2" className="min-w-0 sm:gap-3">
            {!sidebarOpen && (
              <Button
                size="2"
                variant="ghost"
                onClick={() => setSidebarOpen(true)}
                style={{ color: "var(--color-text-primary)" }}
                aria-label="Open conversations menu"
              >
                <FiMenu size={20} />
              </Button>
            )}
            <Box className="min-w-0 flex-1">
              <Heading size={{ initial: "5", sm: "6", md: "8" }} className="truncate">
                AI Chat
              </Heading>
              <Text
                size="2"
                className="max-sm:line-clamp-2"
                style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}
              >
                Chat with AI assistant for help and support
              </Text>
            </Box>
          </Flex>
          
        </Flex>

      {/* Messages Container */}
      <Box
        className="min-h-0 flex-1"
        style={{
          overflowY: "auto",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          padding: "clamp(0.75rem, 2vw, 1.5rem)",
          marginBottom: "16px",
          minHeight: "min(400px, 45vh)",
        }}
      >
        <Flex direction="column" gap="4">
          {messages.map((message) => (
            <Flex
              key={message.id}
              gap="3"
              justify={message.role === "user" ? "end" : "start"}
              style={{ width: "100%" }}
            >
              {message.role === "assistant" && (
                <Avatar
                  size="2"
                  radius="full"
                  fallback="AI"
                  style={{
                    background: "var(--color-primary-light)",
                    color: "var(--color-primary)",
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                />
              )}
              <Card
                className="max-w-[min(85vw,28rem)] sm:max-w-[75%]"
                style={{
                  padding: "12px 16px",
                  background:
                    message.role === "user"
                      ? "var(--color-primary)"
                      : "var(--color-dark-bg)",
                  border:
                    message.role === "user"
                      ? "none"
                      : "1px solid var(--color-dark-bg-tertiary)",
                  borderRadius: "12px",
                }}
              >
                <Text
                  size="3"
                  style={{
                    color:
                      message.role === "user"
                        ? "var(--color-text-dark)"
                        : "var(--color-text-primary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {message.content}
                </Text>
                <Text
                  size="1"
                  style={{
                    color:
                      message.role === "user"
                        ? "rgba(5, 5, 5, 0.6)"
                        : "var(--color-text-secondary)",
                    marginTop: "8px",
                    display: "block",
                  }}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </Card>
              {message.role === "user" && (
                <Avatar
                  size="2"
                  radius="full"
                  fallback="U"
                  style={{
                    background: "var(--color-dark-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                />
              )}
            </Flex>
          ))}
          {isLoading && (
            <Flex gap="3" justify="start" style={{ width: "100%" }}>
              <Avatar
                size="2"
                radius="full"
                fallback="AI"
                style={{
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  fontWeight: "600",
                  flexShrink: 0,
                }}
              />
              <Card
                style={{
                  padding: "12px 16px",
                  background: "var(--color-dark-bg)",
                  border: "1px solid var(--color-dark-bg-tertiary)",
                  borderRadius: "12px",
                }}
              >
                <Flex gap="2" align="center">
                  <Box
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <Box
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      animation: "pulse 1.5s ease-in-out infinite",
                      animationDelay: "0.2s",
                    }}
                  />
                  <Box
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      animation: "pulse 1.5s ease-in-out infinite",
                      animationDelay: "0.4s",
                    }}
                  />
                </Flex>
              </Card>
            </Flex>
          )}
          <div ref={messagesEndRef} />
        </Flex>
      </Box>

      {/* Input Container */}
      <Box
        style={{
          padding: "16px",
          background: "var(--color-dark-bg-secondary)",
          borderRadius: "8px",
          border: "1px solid var(--color-dark-bg-tertiary)",
        }}
      >
        <Flex gap="3" align="stretch" className="w-full min-w-0 flex-col sm:flex-row sm:items-end">
          <Box className="min-w-0 flex-1">
            <TextField.Root
              ref={inputRef}
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              size="3"
              style={{
                background: "var(--color-dark-bg)",
                border: "1px solid var(--color-dark-bg-tertiary)",
                color: "var(--color-text-primary)",
                minHeight: "48px",
              }}
            />
          </Box>
          <Button
            size="3"
            className="w-full shrink-0 sm:w-auto sm:min-w-[100px]"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            style={{
              background:
                !inputValue.trim() || isLoading
                  ? "var(--color-disabled-bg)"
                  : "var(--color-primary)",
              color:
                !inputValue.trim() || isLoading
                  ? "var(--color-disabled-text)"
                  : "var(--color-text-dark)",
              fontWeight: "600",
            }}
          >
            <FiSend size={18} style={{ marginRight: "8px" }} />
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </Flex>
        <Text
          size="1"
          style={{
            color: "var(--color-text-secondary)",
            marginTop: "8px",
            textAlign: "center",
          }}
        >
          Press Enter to send, Shift+Enter for new line
        </Text>
      </Box>
      </Flex>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Content style={{ maxWidth: 400 }}>
          <Dialog.Title>Confirm Delete</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Are you sure you want to delete this conversation? This action cannot be undone.
          </Dialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={confirmDeleteConversation}
              style={{
                background: "var(--color-error)",
                color: "white",
                fontWeight: "600",
              }}
            >
              Delete
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
    </>
  );
}

export default function AIChatPage() {
  return (
    <ProtectedRoute>
      <AIChatContent />
    </ProtectedRoute>
  );
}
