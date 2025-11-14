// client/pages/Projects.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Plus,
  Mail,
  MessageCircle,
  Edit,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Project {
  id: number;
  title: string;
  description: string;
  required_skills: string[];
  required_roles?: string[];
  min_experience?: number;
  max_experience?: number;
  timezone?: string;
  created_at?: string;
  owner?: {
    id: number;
    name: string;
    email: string;
  };
}

interface InterestedUser {
  id: number;
  name: string;
  email: string;
  bio?: string;
  skills: string[];
  role?: string;
  matched_at?: string;
}

function formatDate(dateString?: string) {
  if (!dateString) return "";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function Projects() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [interestedUsers, setInterestedUsers] = useState<InterestedUser[]>([]);
  const [loadingInterested, setLoadingInterested] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      loadProjects();
    } else if (!authLoading && !user) {
      setProjectsLoading(false);
    }
  }, [authLoading, user]);

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      setError(null);

      const response = await apiFetch("/projects");
      let projectsList: Project[] = [];
      if (Array.isArray(response)) {
        projectsList = response;
      } else if (response?.projects && Array.isArray(response.projects)) {
        projectsList = response.projects;
      } else if (response?.data && Array.isArray(response.data)) {
        projectsList = response.data;
      }
      setProjects(projectsList);
    } catch (err: any) {
      console.error("Failed to load projects:", err);
      setError(err?.message || "Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadInterestedUsers = async (projectId: number) => {
    try {
      setLoadingInterested(true);
      const response = await apiFetch(`/projects/${projectId}/interested`);
      setInterestedUsers(Array.isArray(response) ? response : []);
    } catch (err: any) {
      console.error("Failed to load interested users:", err);
      setInterestedUsers([]);
    } finally {
      setLoadingInterested(false);
    }
  };

  const handleViewDetails = async (project: Project) => {
    setSelectedProject(project);
    setShowDetailsModal(true);
    await loadInterestedUsers(project.id);
  };

  const handleEditProject = (project: Project) => {
    navigate(`/projects/${project.id}/edit`);
  };

  const handleDeleteProject = async (project: Project) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.title}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      await apiFetch(`/projects/${project.id}`, {
        method: "DELETE",
      });

      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setShowDetailsModal(false);
      alert("Project deleted successfully!");
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      alert(`Failed to delete project: ${err?.message ?? String(err)}`);
    }
  };

  const handleChatWithUser = async (userId: number) => {
    if (!selectedProject) return;
    try {
      const token = localStorage.getItem("mms_token");
      if (!token) {
        alert("Please log in first");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE ?? "http://localhost:8000"}/chat/rooms`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        throw new Error("Failed to load chat rooms");
      }

      const rooms = await response.json();
      const room = rooms.find(
        (r: any) => r.project_id === selectedProject.id && r.other_user_id === userId
      );

      if (room) {
        navigate(`/chat/${room.id}`);
      } else {
        alert("This user hasn't started a conversation yet. They'll need to send the first message.");
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      alert("Failed to open chat. Please try again.");
    }
  };

  const handleAddProject = () => {
    navigate("/add-project");
  };

  if (authLoading || projectsLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold mb-6">Projects & Teams</h2>
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-muted-foreground">Loading projects...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold mb-6">Projects & Teams</h2>
        <div className="text-center text-muted-foreground">Please log in to view your projects.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold mb-6">Projects & Teams</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
          <Button onClick={loadProjects} variant="outline" size="sm" className="mt-2">Retry</Button>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projects & Teams</h2>
          <Button onClick={handleAddProject} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Project
          </Button>
        </div>

        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-full max-w-4xl rounded-lg border-2 border-dashed border-muted/50 p-12">
            <div className="flex flex-col items-center justify-center text-center gap-6">
              <h3 className="text-xl font-semibold mb-1">No projects yet</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                Create your first project to start finding teammates and collaborators.
              </p>
              <div>
                <Button onClick={handleAddProject} size="lg" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Create Your First Project
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Projects & Teams</h2>
        <Button onClick={handleAddProject} className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Project
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{project.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.required_skills?.slice(0, 3).map((skill) => (
                      <Badge key={skill} variant="secondary">{skill}</Badge>
                    ))}
                    {project.required_skills && project.required_skills.length > 3 && (
                      <Badge variant="outline">+{project.required_skills.length - 3}</Badge>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex items-center">
                  <Button onClick={() => handleViewDetails(project)}>View</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[999999]">
          {selectedProject && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{selectedProject.title}</DialogTitle>
                    <DialogDescription className="text-base mt-2">
                      {selectedProject.description}
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditProject(selectedProject)}
                      title="Edit project"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteProject(selectedProject)}
                      title="Delete project"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.required_skills?.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-sm">{skill}</Badge>
                    ))}
                  </div>
                </div>

                {selectedProject.created_at && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Created {formatDate(selectedProject.created_at)}</span>
                    </div>
                  </div>
                )}

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <UsersIcon className="h-5 w-5" />
                    Interested Candidates ({interestedUsers.length})
                  </h3>

                  {loadingInterested && (
                    <div className="text-center py-8 text-muted-foreground">Loading interested candidates...</div>
                  )}

                  {!loadingInterested && interestedUsers.length === 0 && (
                    <div className="text-center py-8 rounded-lg bg-muted/30">
                      <p className="text-muted-foreground">No one has shown interest yet. Share your project to get matches!</p>
                    </div>
                  )}

                  {!loadingInterested && interestedUsers.length > 0 && (
                    <div className="space-y-3">
                      {interestedUsers.map((interested) => (
                        <div
                          key={interested.id}
                          className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
                        >
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                            <span className="text-lg font-semibold">{interested.name?.charAt(0).toUpperCase() || "U"}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <h4 className="font-semibold">{interested.name || "Anonymous"}</h4>
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {interested.email}
                                </p>
                                {interested.role && <p className="text-sm text-muted-foreground mt-1">{interested.role}</p>}
                              </div>

                              <Button size="sm" onClick={() => handleChatWithUser(interested.id)} className="flex items-center gap-1">
                                <MessageCircle className="h-4 w-4" />
                                Chat
                              </Button>
                            </div>

                            {interested.bio && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{interested.bio}</p>}

                            {interested.skills && interested.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-3">
                                {interested.skills.slice(0, 5).map((skill) => (
                                  <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                                ))}
                                {interested.skills.length > 5 && <Badge variant="outline" className="text-xs">+{interested.skills.length - 5}</Badge>}
                              </div>
                            )}

                            {interested.matched_at && <p className="text-xs text-muted-foreground mt-2">Matched {interested.matched_at ? new Date(interested.matched_at).toLocaleString() : ""}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}