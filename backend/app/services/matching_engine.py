import logging
from typing import Dict, List, Tuple
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger("app.services.matching_engine")


# Keep module-level function for backward compatibility
def normalize_skill(skill: str) -> str:
    """Normalize skill for case-insensitive, punctuation-insensitive comparison"""
    return skill.lower().strip().replace('.', '').replace(' ', '').replace('-', '').replace('_', '')


@dataclass
class Match:
    """Represents a match between user and project"""
    target_id: str
    score: float
    reasons: List[str]
    shared_skills: List[str]
    complementary_skills: List[str]

    def to_dict(self):
        return {
            "target_id": self.target_id,
            "score": self.score,
            "reasons": self.reasons,
            "shared_skills": self.shared_skills,
            "complementary_skills": self.complementary_skills,
            "user": {"id": self.target_id},
        }


class MatchingEngine:
    def __init__(self, embedding_engine):
        self.embedding_engine = embedding_engine

        # Tunable weights
        self.WEIGHTS = {
            "skill_overlap": 0.45,
            "embedding_similarity": 0.25,
            "role_match": 0.15,
            "experience_fit": 0.06,
            "hackathon_bonus": 0.05,
            "availability": 0.04,
        }

    # ---------------------------- UTILS ----------------------------
    def calculate_embedding_score(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Cosine similarity between embeddings"""
        if emb1 is None or emb2 is None:
            return 0.0
        try:
            return float(self.embedding_engine.cosine_similarity(emb1, emb2))
        except Exception:
            return 0.0

    def calculate_role_match(self, user_roles: List[str], required_roles: List[str]) -> Tuple[float, List[str]]:
        """Role overlap ratio"""
        if not required_roles:
            return 1.0, []
        user_set = set(r.lower() for r in (user_roles or []))
        req_set = set(r.lower() for r in required_roles)
        matched = list(user_set & req_set)
        ratio = len(matched) / len(req_set) if req_set else 0.0
        return ratio, matched

    def calculate_skill_overlap(self, user_skills: List[str],
        required_skills: List[str]) -> Tuple[float, List[str], List[str]]:
        """Calculate skill overlap with normalization.

        Returns (score, shared_skills, complementary_skills)
        - shared_skills: list of skills present in both (project form)
        - complementary_skills: list of skills the project needs but the user doesn't have (user form)
        """
        if not required_skills:
            return 0.5, [], []

        # Normalize and keep maps: normalized -> original
        user_normalized = {normalize_skill(s): s for s in (user_skills or [])}
        req_normalized = {normalize_skill(s): s for s in (required_skills or [])}

        # Debug: show normalized keys
        logger.debug("SKILL_OVERLAP: user_norm_keys=%s req_norm_keys=%s",
                    list(user_normalized.keys()), list(req_normalized.keys()))

        # Shared keys are intersection
        shared_keys = set(user_normalized.keys()) & set(req_normalized.keys())

        # Complementary: skills required by project but missing from user
        comp_keys = set(req_normalized.keys()) - set(user_normalized.keys())

        # Build human-readable lists (preserve original formatting from DB / parser)
        shared = [req_normalized[k] for k in sorted(shared_keys)]
        complementary = [req_normalized[k] for k in sorted(comp_keys)]

        # Overlap ratio: fraction of project's required skills that the user covers
        overlap_ratio = len(shared_keys) / len(req_normalized) if req_normalized else 0.0

        # Complementary bonus: reward for having extra skills (kept small)
        # Note: since complementary now means "project needs but user lacks", we keep the bonus
        # based on number of user-only skills instead (if you want to reward extra user skills).
        user_only_keys = set(user_normalized.keys()) - set(req_normalized.keys())
        complementary_bonus = min(len(user_only_keys) * 0.05, 0.2)

        score = min(overlap_ratio + complementary_bonus, 1.0)
        return score, shared, complementary

    def calculate_experience_fit(self, user_exp: int, required_exp_min: int = 0, required_exp_max: int = 10) -> float:
        """Score experience level fit"""
        if user_exp < required_exp_min:
            gap = required_exp_min - user_exp
            return max(0.5, 1.0 - (gap * 0.15))
        elif user_exp > required_exp_max:
            gap = user_exp - required_exp_max
            return max(0.7, 1.0 - (gap * 0.05))
        return 1.0

    def calculate_availability_score(self, user_tz: str, project_tz: str) -> float:
        """Simple timezone compatibility"""
        if not user_tz or not project_tz:
            return 1.0
        return 1.0 if user_tz == project_tz else 0.8

    # ---------------------------- CORE MATCH ----------------------------
    def match_user_to_project(self, user_data: Dict, project_data: Dict) -> Match:
        """Calculate final weighted score"""

        # Defensive read for project skill key (support both 'skills' and 'required_skills')
        proj_skills = project_data.get("skills") or project_data.get("required_skills", []) or []
        user_skills = user_data.get("skills", []) or []

        logger.debug("MATCH_ENGINE: matching user_skills=%s against proj_skills=%s (proj_id=%s)",
                    user_skills, proj_skills, project_data.get("id"))

        # 1. Skill overlap
        skill_score, shared_skills, complementary = self.calculate_skill_overlap(
            user_skills,
            proj_skills,
        )

        logger.debug("MATCH_ENGINE: skill_score=%s shared=%s complementary=%s",
                    skill_score, shared_skills, complementary)

        # 2. Embedding similarity
        emb_score = self.calculate_embedding_score(
            user_data.get("embedding"), project_data.get("embedding")
        ) if (user_data.get("embedding") is not None and project_data.get("embedding") is not None) else 0.0

        logger.debug("MATCH_ENGINE: emb_score=%s", emb_score)

        # 3. Role match
        role_score, matched_roles = self.calculate_role_match(
            user_data.get("roles", []),
            project_data.get("required_roles", []) or project_data.get("roles", []),
        )

        # 4. Experience
        exp_score = self.calculate_experience_fit(
            user_data.get("experience_years", 0),
            project_data.get("min_experience", 0),
            project_data.get("max_experience", 10),
        )

        # 5. Availability
        avail_score = self.calculate_availability_score(
            user_data.get("timezone", ""), project_data.get("timezone", "")
        )

        # Weighted final score
        final_score = (
            skill_score * self.WEIGHTS["skill_overlap"]
            + emb_score * self.WEIGHTS["embedding_similarity"]
            + role_score * self.WEIGHTS["role_match"]
            + exp_score * self.WEIGHTS["experience_fit"]
            + avail_score * self.WEIGHTS["availability"]
        )

        # Additive boost: more shared skills = higher rank in ties
        try:
            final_score += min(len(shared_skills) * 0.02, 0.12)
            final_score = max(0.0, min(1.0, final_score))
        except Exception:
            pass

        # Human-friendly reasons
        reasons = []
        shared_count = len(shared_skills)
        required_count = len(proj_skills) if proj_skills is not None else 0
        if shared_count > 0:
            reasons.append(f"{shared_count}/{required_count} required skills matched")
        if required_count > 0 and shared_count >= max(1, int(required_count * 0.8)):
            reasons.append("Strong skill match!")
        if matched_roles:
            reasons.append(f"Role fit: {', '.join(matched_roles)}")
        if complementary and len(complementary) >= 3:
            reasons.append(f"+{len(complementary)} bonus skills")
        if emb_score > 0.7:
            reasons.append(f"Profile similarity: {emb_score:.0%}")

        # Final debug summary (short)
        logger.debug("MATCH_ENGINE: final_score=%s reasons=%s", final_score, reasons)

        return Match(
            target_id=str(project_data.get("id", "unknown")),
            score=final_score,
            reasons=reasons,
            shared_skills=shared_skills,
            complementary_skills=complementary,
    )


# ---------------------------- RANKING ----------------------------
    def rank_candidates(self, candidates: List[Dict], project_data: Dict, top_k: int = 20) -> List[Match]:
        """Rank multiple candidates for a project"""
        matches = []
        for candidate in candidates:
            try:
                m = self.match_user_to_project(candidate, project_data)
                matches.append(m)
            except Exception as e:
                logger.error(f"Error matching candidate {candidate.get('id', 'unknown')}: {e}", exc_info=True)
        # Sort by score, then shared skills (tie-breaker)
        matches.sort(key=lambda mm: (mm.score, len(mm.shared_skills) if mm.shared_skills else 0), reverse=True)
        return matches[:top_k]


# ---------------------------- WRAPPER ----------------------------
class MatchingEngineWrapper:
    """Wrapper to handle embedding generation and matching"""

    def __init__(self):
        try:
            from app.services.embedding_engine import EmbeddingEngine
            self.embedding_engine = EmbeddingEngine()
            logger.info("✅ EmbeddingEngine loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load EmbeddingEngine: {e}")
            self.embedding_engine = None
        self.matcher = MatchingEngine(self.embedding_engine) if self.embedding_engine else None

    def ensure_embedding(self, data_dict: Dict, kind: str = "profile") -> List[float]:
        """Generate or reuse embedding for profile/project"""
        if not self.embedding_engine:
            return [0.1] * 384
        try:
            if kind == "profile":
                emb = self.embedding_engine.embed_profile(data_dict)
            else:
                emb = self.embedding_engine.embed_project(data_dict)
            if hasattr(emb, "tolist"):
                return emb.tolist()
            return list(emb)
        except Exception as e:
            logger.error(f"Error generating embedding for {kind}: {e}", exc_info=True)
            return [0.1] * 384


# ---------------------------- DEBUG HELPER ----------------------------
def debug_score_user_against_candidates(wrapper: MatchingEngineWrapper, user_profile: dict, candidates: list, top_k: int = 10):
    """Print per-component scores for quick debugging"""
    results = []
    for c in candidates:
        m = wrapper.matcher.match_user_to_project(user_profile, c)
        results.append({
            "candidate_id": c.get("id"),
            "score": m.score,
            "shared": m.shared_skills,
            "reasons": m.reasons,
        })
    results.sort(key=lambda r: (r["score"], len(r["shared"])), reverse=True)
    for r in results[:top_k]:
        print(f"ID: {r['candidate_id']} | Score: {r['score']:.3f} | Shared: {r['shared']} | Reasons: {r['reasons']}")
    return results