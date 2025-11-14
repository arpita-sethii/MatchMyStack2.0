# backend/app/services/resume_parser.py
import re
import logging
from io import BytesIO
from typing import Dict, List, Any, Optional
from collections import defaultdict

try:
    import pdfplumber
    PDF_LIBRARY = "pdfplumber"
except ImportError:
    PDF_LIBRARY = None
    pdfplumber = None

logger = logging.getLogger("app.services.resume_parser")
logging.basicConfig(level=logging.INFO)

# Exported constant (routes import this)
MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB

# Regex patterns
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"[\+\(]?[0-9][0-9\-\s\.\(\)]{7,}[0-9]")
GITHUB_RE = re.compile(r"github\.com/([A-Za-z0-9_-]+)", re.IGNORECASE)
LINKEDIN_RE = re.compile(r"linkedin\.com/in/([A-Za-z0-9_-]+)", re.IGNORECASE)


def normalize_text_for_matching(text: str) -> str:
    """Normalize text for skill matching - removes punctuation and spaces"""
    return text.lower().replace('.', '').replace(' ', '').replace('-', '').replace('_', '').replace(',', '')


# Minimal skill ontology — extend as needed
SKILL_KEYWORDS = {
    "frontend": {
        "react": ["react", "reactjs", "react.js", "react js"],
        "javascript": ["javascript", "js"],
        "html": ["html", "html5"],
        "css": ["css", "scss", "sass"],
        "tailwind": ["tailwind", "tailwindcss", "tailwind css"],
        "vue": ["vue", "vuejs", "vue.js"],
        "angular": ["angular", "angularjs"],
        "typescript": ["typescript", "ts"],
    },
    "backend": {
        "python": ["python", "python3"],
        "fastapi": ["fastapi", "fast api"],
        "flask": ["flask"],
        "django": ["django"],
        "nodejs": ["node", "nodejs", "node.js", "node js"],
        "express": ["express", "expressjs", "express.js"],
        "java": ["java"],
        "csharp": ["c#", "csharp", ".net", "dotnet"],
        "go": ["golang", "go"],
        "rust": ["rust"],
    },
    "ml_ai": {
        "pytorch": ["pytorch", "torch"],
        "tensorflow": ["tensorflow", "tf", "keras"],
        "sklearn": ["scikit-learn", "sklearn", "scikit learn"],
        "nlp": ["nlp", "natural language processing"],
        "cv": ["computer vision", "opencv", "cv"],
        "transformers": ["transformers", "bert", "gpt", "llm", "huggingface"],
        "pandas": ["pandas"],
        "numpy": ["numpy"],
    },
    "data": {
        "sql": ["sql", "mysql", "postgres", "postgresql"],
        "mongodb": ["mongo", "mongodb"],
        "elasticsearch": ["elasticsearch", "elastic"],
        "redis": ["redis"],
    },
    "devops": {
        "docker": ["docker", "dockerfile"],
        "kubernetes": ["kubernetes", "k8s"],
        "aws": ["aws", "amazon web services", "ec2", "s3"],
        "gcp": ["gcp", "google cloud", "gcloud"],
        "azure": ["azure", "microsoft azure"],
        "cicd": ["ci/cd", "jenkins", "github actions"],
    },
}

# Build reverse map: normalized_synonym -> (canonical, category)
_skill_syn = {}
for cat, kv in SKILL_KEYWORDS.items():
    for canonical, syns in kv.items():
        for s in syns:
            normalized = normalize_text_for_matching(s)
            _skill_syn[normalized] = (canonical, cat)

logger.info(f"✅ Loaded {len(_skill_syn)} skill synonyms across {len(SKILL_KEYWORDS)} categories")

ROLE_PATTERNS = {
    "frontend": ["frontend", "front end", "front-end", "ui developer", "ui engineer"],
    "backend": ["backend", "backend engineer", "api developer", "back end", "back-end"],
    "fullstack": ["fullstack", "full-stack", "full stack"],
    "ml_engineer": ["machine learning", "ml engineer", "data scientist", "ai engineer"],
    "devops": ["devops", "sre", "site reliability", "infrastructure"],
    "mobile": ["mobile developer", "android", "ios", "react native", "flutter"],
}

HACKATHON_KEYWORDS = ["hackathon", "devpost", "mlh", "challenge", "competition"]


class ImprovedResumeParser:
    def __init__(self):
        if not pdfplumber:
            raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")
        logger.info("Initialized ImprovedResumeParser with pdfplumber")

    # -------------------------
    # PDF text extraction - PDFPLUMBER ONLY
    # -------------------------
    def extract_text_from_pdf(self, pdf_bytes: bytes) -> tuple[str, str, Optional[str]]:
        """
        Extract text using pdfplumber only.
        Returns: (raw_text, parsing_library_used, parsing_note)
        """
        if not pdf_bytes:
            logger.warning("extract_text_from_pdf: empty bytes")
            return "", "none", "empty_input"

        if len(pdf_bytes) > MAX_PDF_BYTES:
            logger.info("extract_text_from_pdf: truncating %d -> %d", len(pdf_bytes), MAX_PDF_BYTES)
            pdf_bytes = pdf_bytes[:MAX_PDF_BYTES]

        try:
            parts: List[str] = []
            with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
                logger.info("pdfplumber: opened PDF with %d pages", len(pdf.pages))
                for i, page in enumerate(pdf.pages):
                    try:
                        text = page.extract_text() or ""
                        if text:
                            parts.append(text)
                    except Exception as page_err:
                        logger.warning(f"pdfplumber page {i} failed: {page_err}")
                        
            result = "\n".join(parts).strip()
            if result:
                logger.info("✅ pdfplumber extracted %d chars from %d pages", len(result), len(parts))
                return result, "pdfplumber", None
            else:
                logger.warning("⚠️ No text extracted - PDF may be image-based or empty")
                return "", "pdfplumber", "no_text_extracted"
                
        except Exception as e:
            logger.error(f"❌ pdfplumber extraction failed: {e}")
            return "", "error", str(e)

    # -------------------------
    # Simple extractors
    # -------------------------
    def extract_contact_info(self, text: str) -> Dict[str, Optional[str]]:
        email = EMAIL_RE.search(text)
        phone = PHONE_RE.search(text)
        gh = GITHUB_RE.search(text)
        li = LINKEDIN_RE.search(text)
        return {
            "email": email.group(0) if email else None,
            "phone": phone.group(0) if phone else None,
            "github": f"https://{gh.group(0)}" if gh else None,
            "linkedin": f"https://{li.group(0)}" if li else None,
        }

    def extract_name(self, text: str) -> Optional[str]:
        # Heuristic: first non-empty line that is not a section header
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            low = line.lower()
            if any(skip in low for skip in ["skills", "experience", "education", "projects", "summary", "contact"]):
                continue
            if 2 <= len(line.split()) <= 4 and re.match(r"^[A-Za-z .'\-]{2,}$", line):
                return line
        return None

    def extract_skills(self, text: str) -> Dict[str, List[str]]:
        """Extract skills with improved normalization for better matching"""
        text_normalized = normalize_text_for_matching(text)
        
        found = defaultdict(set)
        
        for normalized_syn, (canonical, cat) in _skill_syn.items():
            if normalized_syn in text_normalized:
                found[cat].add(canonical)
                logger.debug(f"Found skill: {canonical} (category: {cat})")
        
        result = {k: sorted(v) for k, v in found.items()}
        total_skills = sum(len(v) for v in result.values())
        logger.info(f"✅ Extracted {total_skills} unique skills across {len(result)} categories")
        
        return result

    def extract_roles(self, text: str) -> List[str]:
        text_lower = text.lower()
        roles = set()
        for role, pats in ROLE_PATTERNS.items():
            for pat in pats:
                if pat in text_lower:
                    roles.add(role)
                    break
        logger.info(f"✅ Extracted roles: {sorted(roles)}")
        return sorted(list(roles))

    def extract_experience_years(self, text: str) -> int:
        matches = re.findall(r"(\d{1,2})\+?\s*(?:years|yrs)\s+(?:of\s+)?experience", text.lower())
        if matches:
            try:
                nums = [int(m) for m in matches]
                years = max(nums)
                logger.info(f"✅ Extracted experience: {years} years")
                return years
            except Exception:
                pass
        return 0

    def extract_education(self, text: str) -> List[Dict[str, str]]:
        degrees = []
        patterns = [
            (r"b(?:\.tech|\.?tech|achelor)", "Bachelor"),
            (r"m(?:\.tech|\.?tech|aster)", "Master"),
            (r"(?:phd|ph\.d\.)", "PhD"),
        ]
        for pat, label in patterns:
            if re.search(pat, text, flags=re.IGNORECASE):
                degrees.append({"degree": label, "field": "Unknown"})
        return degrees

    def extract_work_experience(self, text: str) -> List[Dict[str, str]]:
        companies = []
        for m in re.finditer(r"(?:at|@)\s+([A-Z][A-Za-z0-9 &\.\-]{2,50})", text):
            name = m.group(1).strip()
            companies.append({"company": name})
        # Dedupe
        seen = set()
        out = []
        for c in companies:
            key = c["company"].lower()
            if key not in seen:
                seen.add(key)
                out.append(c)
        return out[:5]

    def extract_hackathon_wins(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        found = []
        wins = {"first": 0, "second": 0, "third": 0, "finalist": 0, "participant": 0}
        for kw in HACKATHON_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.find(kw)
                start = max(0, idx - 120)
                end = min(len(text_lower), idx + 120)
                snippet = text[start:end]
                placement = "participant"
                if re.search(r"\b(winner|1st|first|champion|gold)\b", snippet, re.IGNORECASE):
                    placement = "first"
                elif re.search(r"\b(runner up|runner-up|2nd|second|silver)\b", snippet, re.IGNORECASE):
                    placement = "second"
                elif re.search(r"\b(3rd|third|bronze)\b", snippet, re.IGNORECASE):
                    placement = "third"
                wins[placement] += 1
                found.append({"context": snippet[:200], "placement": placement})
        score = wins["first"] * 10 + wins["second"] * 7 + wins["third"] * 5 + wins["finalist"] * 3 + wins["participant"]
        
        logger.info(f"✅ Hackathon data: {len(found)} mentions, score: {score}")
        return {
            "total_hackathons": len(found),
            "achievements": found,
            "wins_breakdown": wins,
            "hackathon_score": score,
            "has_hackathon_experience": len(found) > 0
        }

    # -------------------------
    # Main parse function
    # -------------------------
    def parse_resume(self, pdf_bytes: bytes = None, text: str = None) -> Dict[str, Any]:
        """
        Returns a dict with parsed resume data including both skills_by_category and all_skills (flat list)
        """
        raw_text = ""
        parsing_library = "none"
        parsing_note = None
        
        try:
            if pdf_bytes:
                raw_text, parsing_library, parsing_note = self.extract_text_from_pdf(pdf_bytes)
            if not raw_text and text:
                raw_text = text
                parsing_library = "text_input"
            raw_text = (raw_text or "").strip()
            if not raw_text or len(raw_text) < 40:
                logger.info("parse_resume: no meaningful text extracted (len=%d)", len(raw_text))
                return {
                    "error": "No meaningful text to parse", 
                    "raw_text": raw_text[:500],
                    "parsing_library": parsing_library,
                    "parsing_note": parsing_note
                }
        except Exception as e:
            logger.exception("parse_resume extraction error: %s", e)
            return {
                "error": f"text extraction failed: {str(e)}", 
                "raw_text": "",
                "parsing_library": "error",
                "parsing_note": str(e)
            }

        logger.info(f"📄 Parsing resume with {len(raw_text)} characters")
        
        contact = self.extract_contact_info(raw_text)
        name = self.extract_name(raw_text) or ""
        skills_by_category = self.extract_skills(raw_text)
        
        # Create flat list of all skills for matching engine
        all_skills = sorted({s for cat in skills_by_category.values() for s in cat})
        
        roles = self.extract_roles(raw_text)
        experience_years = self.extract_experience_years(raw_text)
        education = self.extract_education(raw_text)
        work_experience = self.extract_work_experience(raw_text)
        hackathon_data = self.extract_hackathon_wins(raw_text)

        result = {
            "name": name,
            "contact": contact,
            "skills_by_category": skills_by_category,  # For display purposes
            "all_skills": all_skills,  # For matching engine (flat list)
            "skills": all_skills,  # Alias for backward compatibility
            "roles": roles,
            "experience_years": experience_years,
            "education": education,
            "work_experience": work_experience,
            "hackathons": hackathon_data,
            "raw_text_preview": raw_text[:500],
            "raw_text": raw_text,
            "total_text_length": len(raw_text),
            "parsing_library": parsing_library,
        }
        
        if parsing_note:
            result["parsing_note"] = parsing_note
        
        logger.info(f"✅ Parsing complete: {len(all_skills)} skills, {len(roles)} roles")
        return result


# Quick CLI test
if __name__ == "__main__":
    p = ImprovedResumeParser()
    sample = """
    John Doe
    john.doe@example.com | github.com/johndoe | +1-234-567-8900

    Senior Full-Stack Developer with 5 years of experience

    Technical Skills:
    React.js, JavaScript, TypeScript, Tailwind CSS, Python, FastAPI, Docker, Kubernetes, PyTorch, TensorFlow, SQL, Postgres, Node.js

    Experience:
    Software Engineer at Google (2020 - Present)
    
    Hackathons:
    - Won 1st place at TechCrunch Disrupt 2023
    - Runner-up at MLH Hackathon 2022
    """
    result = p.parse_resume(text=sample)
    print("\n=== PARSED RESULT ===")
    print(f"Name: {result['name']}")
    print(f"Skills (flat): {result['all_skills']}")
    print(f"Skills by category: {result['skills_by_category']}")
    print(f"Roles: {result['roles']}")
    print(f"Experience: {result['experience_years']} years")
    print(f"Hackathons: {result['hackathons']['total_hackathons']}")