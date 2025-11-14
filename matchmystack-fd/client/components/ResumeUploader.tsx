import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUpload, apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";

export default function ResumeUploader({
  onMatches,
  topK = 10,
}: {
  onMatches: (matches: any) => void;
  topK?: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const { token } = useAuth();

  const handleFile = (f?: File) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setOk(null);
  };

  const extractSkillsFromResponse = (res: any): string[] => {
    if (!res) return [];
    const out: string[] = [];
    const pushIf = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) out.push(...v);
      else if (typeof v === "string")
        out.push(...v.split(/,|\n/).map((s) => s.trim()).filter(Boolean));
      else if (typeof v === "object")
        Object.values(v).forEach(pushIf);
    };

    pushIf(res.skills);
    pushIf(res.parsed_resume?.skills);
    pushIf(res.result?.skills);
    pushIf(res.data?.skills);
    pushIf(res.parsed?.entities?.skills);
    pushIf(res.skills_by_category);

    return Array.from(new Set(out.map((s) => s.trim().toLowerCase()))).filter(Boolean);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    // ✅ Check BOTH context token AND localStorage
    const authToken = token || localStorage.getItem("mms_token");
    
    if (!authToken) {
      setError("Please log in to upload resume");
      return;
    }

    setLoading(true);
    setError(null);
    setOk(null);

    try {
      const form = new FormData();
      form.append("file", file, file.name);

      console.log("📤 Uploading resume...");

      // ✅ Correct endpoint with underscore
      const res = await apiUpload(`/match/upload_and_match?top_k=${topK}`, form);
      console.log("✅ upload_and_match response:", res);

      const skills = extractSkillsFromResponse(res);
      console.log("📊 Extracted skills:", skills);

      if (skills.length > 0) {
        console.log("💾 Saving skills to backend...");
        
        await apiFetch("/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills }),
        });
        
        console.log("✅ Skills saved successfully");
        setOk(`✅ Resume uploaded & ${skills.length} skills saved`);
      } else {
        console.log("⚠️ No skills detected in resume");
        setOk("Resume uploaded (no skills detected)");
      }

      console.log("📤 Passing matches to parent component");
      onMatches(res);

    } catch (e: any) {
      console.error("❌ Upload error:", e);
      
      if (e.status === 401 || e.message?.includes("Session expired") || e.message?.includes("log in")) {
        setError("Session expired. Please log in again.");
        localStorage.removeItem("mms_token");
      } else if (e.message) {
        setError(e.message);
      } else {
        setError("Upload failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ Check both context token and localStorage
  const hasAuth = Boolean(token || localStorage.getItem("mms_token"));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="font-semibold">Upload your resume</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a recent PDF or text resume — we'll parse it, save your skills, and show matches.
        </p>
        <div className="mt-3">
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            onChange={(e) => handleFile(e.target.files?.[0] ?? undefined)}
          />
        </div>
        {file && <div className="mt-2 text-sm text-muted-foreground">Selected: {file.name}</div>}
        {ok && <div className="mt-2 text-sm text-green-600">{ok}</div>}
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      <Button onClick={handleUpload} disabled={loading || !file || !hasAuth}>
        {loading ? "Uploading..." : "Upload & Match"}
      </Button>
    </div>
  );
}