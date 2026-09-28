import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Shield } from "lucide-react";
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
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Change password</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Min 10 chars. Compromised/common passwords are blocked by the server.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Sign out other sessions</Label>
              <p className="text-xs text-muted-foreground">Keeps you signed in on this device.</p>
            </div>
            <Switch checked={revokeOtherSessions} onCheckedChange={setRevokeOtherSessions} />
          </div>

          <Button onClick={handleChangePassword} disabled={isSaving}>
            {isSaving ? "Updating..." : "Update password"}
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Sessions</h3>
          <p className="text-xs text-muted-foreground">Quickly sign out other devices if you suspect misuse.</p>
          <Button variant="outline" onClick={handleRevokeOtherSessions} disabled={isRevoking}>
            {isRevoking ? "Signing out..." : "Sign out other sessions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
