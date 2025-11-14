# ============================================================
# 🧠 Lightweight Embedding Engine (TF-IDF version)
# ============================================================
# ✅ Drop-in replacement for HuggingFace/transformer embeddings
# ✅ Compatible with all previous APIs and outputs
# ✅ No external calls, minimal RAM, perfect for Render
# ============================================================

import numpy as np
from typing import Dict, List, Union
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

print("✅ Using TF-IDF based lightweight embedding engine (no transformer dependency)")

DEFAULT_DIM = 384  # kept for interface compatibility


class EmbeddingEngine:
    def __init__(self):
        # Keep vocabulary limited for memory safety
        self.vectorizer = TfidfVectorizer(max_features=2000, stop_words="english")
        self.embedding_dim = DEFAULT_DIM
        self._fitted = False
        self._corpus = []

    # -----------------------------
    # Helper: Flatten skills, etc.
    # -----------------------------
    def normalize_skills(self, skills: Union[List[str], Dict[str, List[str]]]) -> List[str]:
        if isinstance(skills, dict):
            all_skills = []
            for cat_skills in skills.values():
                all_skills.extend(cat_skills)
            return list(set(all_skills))
        elif isinstance(skills, list):
            return list(set(skills))
        return []

    # -----------------------------
    # Text builders (same schema)
    # -----------------------------
    def create_profile_text(self, profile_data: Dict) -> str:
        parts = []

        if profile_data.get("roles"):
            roles_text = ", ".join(profile_data["roles"])
            parts += [f"Roles: {roles_text}", f"Position: {roles_text}"]

        skills = self.normalize_skills(
            profile_data.get("skills") or profile_data.get("skills_by_category") or []
        )
        if skills:
            skills_text = ", ".join(skills[:20])
            parts += [
                f"Technical Skills: {skills_text}",
                f"Expertise: {skills_text}",
                f"Proficient in: {skills_text}",
            ]

        exp_years = profile_data.get("experience_years", 0)
        if exp_years is not None:
            if exp_years <= 1:
                level = "Junior"
            elif exp_years <= 3:
                level = "Mid-level"
            elif exp_years <= 7:
                level = "Senior"
            else:
                level = "Expert"
            parts.append(f"Experience: {exp_years} years, {level} level")

        if profile_data.get("hackathons"):
            h = profile_data["hackathons"]
            if h.get("has_hackathon_experience"):
                wins = h.get("wins_breakdown", {})
                if wins.get("first", 0) > 0:
                    parts.append(f"Hackathon winner with {wins['first']} wins")
                elif wins.get("second", 0) > 0:
                    parts.append("Hackathon finalist and top performer")
                elif h.get("total_hackathons", 0) >= 3:
                    parts.append("Active hackathon participant")

        if profile_data.get("bio"):
            parts.append(f"About: {profile_data['bio'][:200]}")

        if profile_data.get("interests"):
            parts.append(f"Interests: {', '.join(profile_data['interests'][:5])}")

        if profile_data.get("project_types"):
            parts.append(f"Looking to build: {', '.join(profile_data['project_types'])}")

        return " | ".join(parts)

    def create_project_text(self, project_data: Dict) -> str:
        parts = []
        if project_data.get("title"):
            parts.append(f"Project: {project_data['title']}")
        if project_data.get("description"):
            parts.append(f"Description: {project_data['description'][:300]}")
        if project_data.get("required_roles"):
            r = ", ".join(project_data["required_roles"])
            parts += [f"Looking for: {r}", f"Need: {r}"]

        skills = self.normalize_skills(project_data.get("required_skills") or [])
        if skills:
            s = ", ".join(skills)
            parts += [
                f"Required skills: {s}",
                f"Tech stack: {s}",
                f"Technologies: {s}",
            ]

        min_exp = project_data.get("min_experience", 0)
        max_exp = project_data.get("max_experience", 10)
        if min_exp > 0 or max_exp < 10:
            parts.append(f"Experience needed: {min_exp}-{max_exp} years")
        if project_data.get("project_type"):
            parts.append(f"Category: {project_data['project_type']}")
        return " | ".join(parts)

    def create_teammate_request_text(self, r: Dict) -> str:
        parts = []
        if r.get("project_idea"):
            parts.append(f"Building: {r['project_idea'][:200]}")
        if r.get("looking_for_roles"):
            roles = ", ".join(r["looking_for_roles"])
            parts += [f"Looking for: {roles}", f"Need teammates with roles: {roles}"]
        if r.get("looking_for_skills"):
            s = ", ".join(r["looking_for_skills"])
            parts += [
                f"Need skills: {s}",
                f"Required expertise: {s}",
                f"Tech stack: {s}",
            ]
        return " | ".join(parts)

    # -----------------------------
    # TF-IDF embedding logic
    # -----------------------------
    def _ensure_fitted(self, texts: List[str]):
        if not self._fitted:
            self._corpus = texts
            self.vectorizer.fit(texts)
            self._fitted = True

    def _encode_text(self, text: str) -> np.ndarray:
        if not self._fitted:
            # Fit on this text once if not yet fitted
            self._ensure_fitted([text])
        vec = self.vectorizer.transform([text]).toarray()
        if vec.shape[1] < self.embedding_dim:
            # pad to fixed size for compatibility
            padded = np.zeros((1, self.embedding_dim))
            padded[0, :vec.shape[1]] = vec[0]
            return padded[0]
        return vec[0][:self.embedding_dim]

    # -----------------------------
    # Public embedding API (same)
    # -----------------------------
    def embed_profile(self, profile_data: Dict) -> List[float]:
        return self._encode_text(self.create_profile_text(profile_data)).tolist()

    def embed_project(self, project_data: Dict) -> List[float]:
        return self._encode_text(self.create_project_text(project_data)).tolist()

    def embed_teammate_request(self, r: Dict) -> List[float]:
        return self._encode_text(self.create_teammate_request_text(r)).tolist()

    # -----------------------------
    # Similarity logic (unchanged)
    # -----------------------------
    def cosine_similarity(self, v1, v2) -> float:
        v1 = np.array(v1).reshape(1, -1)
        v2 = np.array(v2).reshape(1, -1)
        return float(cosine_similarity(v1, v2)[0][0])

    def cosine_similarity_batch(self, vec: np.ndarray, candidates: np.ndarray) -> np.ndarray:
        return cosine_similarity(candidates, vec.reshape(1, -1)).flatten()

    def find_similar(self, query, candidates, top_k: int = 10) -> List[tuple]:
        if not isinstance(query, np.ndarray):
            query = np.array(query)
        cands = np.array(candidates)
        sims = self.cosine_similarity_batch(query, cands)
        idxs = np.argsort(sims)[::-1][:top_k]
        return [(int(i), float(sims[i])) for i in idxs]
