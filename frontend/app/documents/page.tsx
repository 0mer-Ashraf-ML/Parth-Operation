"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Card, Box } from "@radix-ui/themes";

function DocumentsContent() {
  return (
    <Flex direction="column" gap="4">
      <Heading size={{ initial: "6", md: "8" }}>Documents</Heading>
      <Text size="3" color="gray">
        Manage your documents and files
      </Text>
      
      <Flex gap="4" wrap="wrap" mt="4">
        <Card style={{ flex: "1", minWidth: "250px", padding: "1.5rem" }}>
          <Heading size={{ initial: "3", md: "4" }} mb="2">All Documents</Heading>
          <Text size="2" color="gray">
            View and manage all your documents
          </Text>
        </Card>
        <Card style={{ flex: "1", minWidth: "250px", padding: "1.5rem" }}>
          <Heading size={{ initial: "3", md: "4" }} mb="2">Recent Files</Heading>
          <Text size="2" color="gray">
            Access your recently opened files
          </Text>
        </Card>
      </Flex>
    </Flex>
  );
}

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
      <DocumentsContent />
    </ProtectedRoute>
  );
}
