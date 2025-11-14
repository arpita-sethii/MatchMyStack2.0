// client/pages/AddProject.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";

export default function AddProject() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>(); // route param for edit mode
  const isEditMode = Boolean(id);

  const { token: authTokenFromContext } = useAuth();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [rolesNeeded, setRolesNeeded] = useState<number | "">(3);
  const [deadline, setDeadline] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // helper to get token (useAuth or fallback to localStorage)
  const getToken = () => authTokenFromContext || localStorage.getItem("mms_token");

  useEffect(() => {
    if (!isEditMode) return;

    // load project data and prefill form
    (async () => {
      try {
        setLoadingProject(true);
        setError(null);
        const token = getToken();
        const res = await fetch(`${API_BASE}/projects/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Failed to load project ${id}`);
        }

        const proj = await res.json();
        // populate fields safely
        setName(proj.title ?? "");
        setDesc(proj.description ?? "");
        setSkills(Array.isArray(proj.required_skills) ? proj.required_skills : []);
        // if there are roles, set rolesNeeded to length else keep default
        setRolesNeeded(
          Array.isArray(proj.required_roles) ? proj.required_roles.length || 3 : 3
        );
        // created deadline isn't available in schema, but if you saved one in description or metadata, handle it here
        setDeadline("");
        // image preview not persisted currently — leave as null
      } catch (err: any) {
        console.error("Failed to load project:", err);
        setError(err?.message || "Failed to load project");
      } finally {
        setLoadingProject(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditMode]);

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills((k) => [s, ...k]);
      setSkillInput("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!desc.trim()) {
      setError("Description is required");
      return;
    }
    if (skills.length === 0) {
      setError("Add at least one skill");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = getToken();
      if (!token) {
        setError("Not authenticated. Please log in.");
        return;
      }

      const payload: any = {
        title: name,
        description: desc,
        required_skills: skills,
        // optional extras - adapt to backend schema if you persist roles/timezone etc.
        required_roles: Array.isArray([]) ? [] : undefined,
        // We store rolesNeeded as a numeric helper only; backend expects required_roles array
        // If you want to persist roles list use a UI to collect them. For now, leave required_roles empty.
      };

      let response: Response;
      if (isEditMode && id) {
        // Update existing project
        response = await fetch(`${API_BASE}/projects/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new project
        response = await fetch(`${API_BASE}/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to ${isEditMode ? "update" : "create"} project`);
      }

      const project = await response.json();
      console.log(isEditMode ? "Project updated:" : "Project created:", project);

      // Navigate back to projects list after success
      navigate("/projects");
    } catch (err: any) {
      console.error("Error saving project:", err);
      setError(err?.message || "Failed to save project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardContent>
          <h2 className="text-2xl font-bold">{isEditMode ? "Edit project" : "Create a new project"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isEditMode
              ? "Update your project details and save changes."
              : "Add project info so teammates can find you. Your project will appear in the swipe deck for users with matching skills."}
          </p>

          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {loadingProject ? (
            <div className="mt-6 text-muted-foreground">Loading project...</div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-1">
                <label className="text-sm font-medium">Project name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  placeholder="AI-Powered Chatbot"
                  disabled={loading}
                />

                <label className="mt-4 text-sm font-medium">Description *</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  rows={6}
                  placeholder="Build an intelligent chatbot using LLMs and vector databases..."
                  disabled={loading}
                />

                <label className="mt-4 text-sm font-medium">Required skills *</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="e.g., Python, React, FastAPI"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    disabled={loading}
                  />
                  <Button onClick={addSkill} disabled={loading}>
                    Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.length === 0 && (
                    <p className="text-sm text-muted-foreground">No skills added yet</p>
                  )}
                  {skills.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => !loading && removeSkill(s)}
                    >
                      {s} <span className="ml-1">×</span>
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-sm font-medium">Roles needed</label>
                    <input
                      type="number"
                      min={1}
                      value={rolesNeeded as any}
                      onChange={(e) => setRolesNeeded(Number(e.target.value))}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Deadline</label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? (isEditMode ? "Saving..." : "Creating...") : (isEditMode ? "Save changes" : "Save project")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/projects")}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>

              <div className="md:col-span-1">
                <label className="text-sm font-medium">Project image (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = URL.createObjectURL(f);
                    setImage(url);
                  }}
                  disabled={loading}
                />

                {image && (
                  <div className="mt-4">
                    <img
                      src={image}
                      alt="project preview"
                      className="w-full rounded-md object-cover max-h-60"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setImage(null)}
                      disabled={loading}
                    >
                      Remove image
                    </Button>
                  </div>
                )}

                <div className="mt-6 rounded-md border p-4">
                  <h4 className="font-semibold">How it works</h4>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>✅ Your project will be visible to all users</li>
                    <li>🎯 Users with matching skills will see it ranked higher</li>
                    <li>💬 You'll be notified when someone matches with your project</li>
                    <li>🤝 You can view all matches on the Projects page</li>
                  </ul>
                </div>

                <div className="mt-4 rounded-md border p-4 bg-blue-50">
                  <h4 className="font-semibold text-sm">Pro tip</h4>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Add specific skills to attract the right teammates. Users who upload resumes with these skills will see your project in their swipe deck!
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
