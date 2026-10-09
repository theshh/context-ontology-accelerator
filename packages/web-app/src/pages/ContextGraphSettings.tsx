// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Context graph › Settings — the existing edit dialog (display name and
 * description) and the existing roles / members permissions tabs, on one page.
 *
 * Routes: /namespaces/:namespaceId/settings and /namespaces/:namespaceId/permissions
 */
import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useGetNamespace } from "@api-hooks/use-get-namespace";
import { EditNamespaceModal } from "./GetNamespace";
import { PermissionsTabs } from "./NamespacePermissions";

export const ContextGraphSettings: React.FC = () => {
  const { namespaceId = "" } = useParams<{ namespaceId: string }>();
  const { data } = useGetNamespace(namespaceId);
  const ns = data?.namespace;
  const [editVisible, setEditVisible] = useState(false);

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button disabled={!ns} onClick={() => setEditVisible(true)}>
                Edit
              </Button>
            }
          >
            General
          </Header>
        }
      >
        <KeyValuePairs
          columns={2}
          items={[
            { label: "Display name", value: ns?.displayName ?? "—" },
            { label: "Description", value: ns?.description ?? "—" },
          ]}
        />
      </Container>

      <SpaceBetween size="s">
        <Header variant="h2">Permissions</Header>
        <PermissionsTabs namespaceId={namespaceId} />
      </SpaceBetween>

      <EditNamespaceModal
        namespaceId={namespaceId}
        displayName={ns?.displayName ?? ""}
        description={ns?.description ?? ""}
        visible={editVisible}
        onDismiss={() => setEditVisible(false)}
      />
    </SpaceBetween>
  );
};
