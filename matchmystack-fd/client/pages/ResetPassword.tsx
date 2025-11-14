// client/pages/ResetPassword.tsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { apiFetch } from "@/utils/api";

/** Basic password scoring (0..4) */
function getPasswordScore(pwd: string) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function strengthLabel(score: number) {
  if (score <= 1) return { label: "Very weak", color: "bg-red-500" };
  if (score === 2) return { label: "Weak", color: "bg-orange-400" };
  if (score === 3) return { label: "Good", color: "bg-yellow-400" };
  return { label: "Strong", color: "bg-green-500" };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwdScore = getPasswordScore(newPassword);
  const pwdStrength = strengthLabel(pwdScore);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    // Get token from URL query params
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError("Invalid reset link. Please request a new password reset.");
    }
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!token) {
      setError("Invalid reset token");
      return;
    }

    if (pwdScore < 2) {
      setError("Please choose a stronger password");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      
      const response = await apiFetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      });

      console.log("Password reset success:", response);
      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/auth");
      }, 3000);
      
    } catch (err: any) {
      console.error("Password reset error:", err);
      const errorMsg = err?.body?.detail || err?.message || "Failed to reset password";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md mt-20">
      <Card className="p-6">
        <CardContent>
          <h2 className="text-2xl font-bold mb-2">Reset Your Password</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your new password below
          </p>

          {success ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h3 className="text-xl font-semibold">Password Reset Successful!</h3>
              <p className="text-sm text-muted-foreground text-center">
                Your password has been updated. Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="grid gap-4">
              <div>
                <label className="text-sm">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 pr-10"
                    placeholder="••••••••"
                    required
                    disabled={!token || loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password strength indicator */}
                {newPassword.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <div>
                        Password strength: <span className="font-medium">{pwdStrength.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{newPassword.length} chars</div>
                    </div>
                    <div className="w-full h-2 rounded bg-muted/30 overflow-hidden">
                      <div
                        className={`${pwdStrength.color} h-2 transition-all`}
                        style={{ width: `${(pwdScore / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm">Confirm New Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? "border-green-300/80"
                        : "border-red-300"
                      : ""
                  }`}
                  placeholder="••••••••"
                  required
                  disabled={!token || loading}
                />
                {confirmPassword.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {passwordsMatch ? (
                      <>
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-green-600">Passwords match</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="text-red-600">Passwords don't match</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button
                  type="submit"
                  disabled={!token || loading || !passwordsMatch || pwdScore < 2}
                  className="flex-1"
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}