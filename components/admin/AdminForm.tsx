"use client";

import { UserPlus } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export default function AdminForm({
  email,
  submitting,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  submitting: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-10">
      <Field>
        <FieldLabel htmlFor="admin-email">Add an admin</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="admin@example.com"
            className="font-mono text-sm"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="brand"
              size="xs"
              disabled={submitting}
              aria-busy={submitting}
            >
              <UserPlus data-icon="inline-start" />
              {submitting ? "Adding..." : "Add"}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </form>
  );
}
