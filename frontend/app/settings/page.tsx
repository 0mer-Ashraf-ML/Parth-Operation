"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Flex, Text, Heading, Card, Box } from "@radix-ui/themes";

function SettingsContent() {
  return (
    <Flex direction="column" gap="4">
      <Heading size={{ initial: "6", md: "8" }}>Settings</Heading>
      <Text size="3" color="gray">
        Configure your application settings
      </Text>
      
      <Flex gap="4" wrap="wrap" mt="4">
        <Card style={{ flex: "1", minWidth: "250px", padding: "1.5rem" }}>
          <Heading size={{ initial: "3", md: "4" }} mb="2">General Settings</Heading>
          <Text size="2" color="gray">
            Configure general application preferences
          </Text>
        </Card>
        <Card style={{ flex: "1", minWidth: "250px", padding: "1.5rem" }}>
          <Heading size={{ initial: "3", md: "4" }} mb="2">Security</Heading>
          <Text size="2" color="gray">
            Manage security and privacy settings
          </Text>
        </Card>
      </Flex>
    </Flex>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
