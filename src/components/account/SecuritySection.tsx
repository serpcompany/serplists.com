import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/authErrors";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";

export const SecuritySection: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Enter your current password and a new password");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.ok) {
      toast.error(policy.message);
      return;
    }

    setIsSaving(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });

      if (result?.error) {
        toast.error(getAuthErrorMessage(result.error, "Failed to change password"));
        return;
      }

      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setIsRevoking(true);
    try {
      const result = await authClient.revokeOtherSessions();
      if (result?.error) {
        toast.error(getAuthErrorMessage(result.error, "Failed to sign out other sessions"));
        return;
      }
      toast.success("Signed out other sessions");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign out other sessions");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldSet>
          <FieldLegend>Change password</FieldLegend>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="confirm-new-password">Confirm new password</FieldLabel>
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-describedby="confirm-new-password-description"
              />
              <FieldDescription id="confirm-new-password-description">
                Min 10 chars. Compromised/common passwords are blocked by the server.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="revoke-other-sessions">Sign out other sessions</FieldLabel>
                <FieldDescription id="revoke-other-sessions-description">
                  Keeps you signed in on this device.
                </FieldDescription>
              </FieldContent>
              <Switch
                // A native button, so the Label's htmlFor names it.
                nativeButton
                render={<button type="button" />}
                id="revoke-other-sessions"
                aria-describedby="revoke-other-sessions-description"
                checked={revokeOtherSessions}
                onCheckedChange={setRevokeOtherSessions}
              />
            </Field>

            <div>
              <Button onClick={handleChangePassword} disabled={isSaving}>
                {isSaving ? "Updating..." : "Update password"}
              </Button>
            </div>
          </FieldGroup>
        </FieldSet>

        <Separator />

        <FieldSet>
          <FieldLegend>Sessions</FieldLegend>
          <FieldDescription>Quickly sign out other devices if you suspect misuse.</FieldDescription>
          <div>
            <Button variant="outline" onClick={handleRevokeOtherSessions} disabled={isRevoking}>
              {isRevoking ? "Signing out..." : "Sign out other sessions"}
            </Button>
          </div>
        </FieldSet>
      </CardContent>
    </Card>
  );
};
