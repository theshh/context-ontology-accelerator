// SPDX-License-Identifier: Apache-2.0

/**
 * The two Business map editors that write back to COA:
 *  - EditDescriptionModal → the table's steward metadata (description, synonyms)
 *  - AddKindModal → a one-class ontology (a sub-class of the business thing)
 * Both go through existing COA APIs; nothing here is a new store.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { OntologyFileFormat, OntologyType } from "@coa/control-plane-client";
import { useGetOntologyUploadUrl } from "@api-hooks/use-get-ontology-upload-url";
import { useIngestOntologyFromS3 } from "@api-hooks/use-ingest-ontology-from-s3";
import { useUpdateSourceTableMetadata } from "@api-hooks/use-update-source-table-metadata";
import { buildKindOntology } from "./kinds";
import type { MapEntity } from "./model";
import type { TableRef } from "./DataCard";

const splitList = (s: string) =>
  [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

export function EditDescriptionModal({
  namespaceId,
  entity,
  tableRef,
  current,
  onClose,
}: {
  namespaceId: string;
  entity: MapEntity;
  tableRef: TableRef;
  current: { description: string; synonyms: string[] };
  onClose: () => void;
}) {
  const [description, setDescription] = useState(current.description);
  const [synonyms, setSynonyms] = useState(current.synonyms.join(", "));
  const save = useUpdateSourceTableMetadata(namespaceId, tableRef.sourceId, tableRef.tableId);
  useEffect(() => {
    setDescription(current.description);
    setSynonyms(current.synonyms.join(", "));
  }, [current.description, current.synonyms]);

  return (
    <Modal
      visible
      onDismiss={onClose}
      header={`Describe ${entity.label}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!description.trim()}
              onClick={() =>
                save.mutate(
                  { overrides: { description: description.trim(), synonyms: splitList(synonyms) } },
                  { onSuccess: onClose },
                )
              }
            >
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField
          label="What is it?"
          description="One or two sentences a new colleague would understand. Say what counts and what doesn't."
        >
          <Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} rows={4} />
        </FormField>
        <FormField
          label="Other names people use"
          description="Comma-separated. Questions using these words will find this thing."
        >
          <Input value={synonyms} onChange={({ detail }) => setSynonyms(detail.value)} placeholder="e.g. job, appointment, posting" />
        </FormField>
        <Box variant="small" color="text-body-secondary">
          Saved to the data catalog straight away. Answers and the ontology pick it up the next time
          the ontology is built (Curation → Ontology induction).
        </Box>
        {save.error && <Alert type="error">{save.error.message}</Alert>}
      </SpaceBetween>
    </Modal>
  );
}

export function AddKindModal({
  namespaceId,
  parent,
  onClose,
}: {
  namespaceId: string;
  parent: MapEntity;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [definition, setDefinition] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const uploadUrl = useGetOntologyUploadUrl(namespaceId);
  const ingest = useIngestOntologyFromS3(namespaceId);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const kind = buildKindOntology({ namespaceId, parentUri: parent.uri, label, definition });
      const target = await uploadUrl.mutateAsync({
        filename: kind.filename,
        contentType: "text/turtle",
        ontologyId: kind.ontologyId,
        title: `Kind: ${label.trim()} (of ${parent.label})`,
      });
      if (!target.uploadUrl || !target.s3Key) throw new Error("No upload address was returned.");
      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        body: kind.turtle,
        headers: { "Content-Type": "text/turtle" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      await ingest.mutateAsync({
        ontologyId: target.ontologyId ?? kind.ontologyId,
        s3Key: target.s3Key,
        format: OntologyFileFormat.TURTLE,
        title: `Kind: ${label.trim()} (of ${parent.label})`,
        ontologyType: OntologyType.USER_CREATED,
      });
      // The kind appears once its ontology is listed and loaded.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["ontologies", namespaceId] });
        void queryClient.invalidateQueries({ queryKey: ["ontology-overview", namespaceId] });
      }, 4000);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the kind.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      onDismiss={onClose}
      header={`Add a kind of ${parent.label.toLowerCase()}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!label.trim()} onClick={() => void add()}>
              Add kind
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField label="Name" description={`A business category of ${parent.label.toLowerCase()}.`}>
          <Input value={label} onChange={({ detail }) => setLabel(detail.value)} placeholder="e.g. Resignation" />
        </FormField>
        <FormField
          label="How do you tell it apart?"
          description="In plain words, including any code it maps to. This becomes its definition."
        >
          <Textarea
            value={definition}
            onChange={({ detail }) => setDefinition(detail.value)}
            rows={3}
            placeholder="e.g. Leaving where the reason is RSN (the officer resigned)"
          />
        </FormField>
        <Box variant="small" color="text-body-secondary">
          Added to the ontology as a kind of {parent.label} (a sub-class). It shows on the map in a
          few seconds, and questions about it can use the definition.
        </Box>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  );
}
