import re
import unicodedata
import numpy as np
from sentence_transformers import SentenceTransformer
from diacritics import restore, is_non_diacritical

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text)
    return text


class Classifier:
    def __init__(self, intents: list[dict], fallback: str, signals: list[dict]):
        self.fallback = fallback
        self.signals = signals

        print(f"[NLU] Loading model: {MODEL_NAME}")
        self.model = SentenceTransformer(MODEL_NAME)
        print("[NLU] Model loaded")

        self._intents: list[dict] = []
        for intent in intents:
            # Support both new `examples` field and legacy `patterns`
            examples = intent.get("examples") or intent.get("patterns") or []
            if not examples:
                continue
            vecs = self.model.encode(examples, normalize_embeddings=True)
            proto = np.mean(vecs, axis=0)
            proto = proto / np.linalg.norm(proto)
            self._intents.append({"name": intent["name"], "proto": proto})
            print(f"[NLU]   intent '{intent['name']}' — {len(examples)} examples")

    def _score_text(self, text: str) -> dict[str, float]:
        vec = self.model.encode([text], normalize_embeddings=True)[0]
        return {i["name"]: float(np.dot(vec, i["proto"])) for i in self._intents}

    def _apply_signals(self, text: str, scores: dict[str, float]) -> dict[str, float]:
        for sig in self.signals:
            if re.search(sig["pattern"], text, re.IGNORECASE):
                name = sig["intent"]
                if name in scores:
                    scores[name] = min(1.0, scores[name] + sig["boost"])
        return scores

    def classify(self, text: str) -> dict:
        t = _normalize(text)
        print(f"[NLU] classify: \"{text}\"")

        # Pass A — raw text
        scores = self._score_text(t)

        # Pass B — diacritics restoration (only when input looks non-diacritical)
        if is_non_diacritical(t):
            restored = _normalize(restore(t))
            if restored != t:
                scores_b = self._score_text(restored)
                scores = {k: max(scores[k], scores_b[k]) for k in scores}
                print(f"[NLU]   diacritics pass: \"{restored}\"")

        # Keyword signal boosts (non-destructive)
        scores = self._apply_signals(t, scores)

        # Rank
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top1_name, top1_score = ranked[0]
        top2_score = ranked[1][1] if len(ranked) > 1 else 0.0
        margin = top1_score - top2_score

        scores_str = "  ".join(f"{k}:{v:.3f}" for k, v in ranked)
        print(f"[NLU]   scores: {scores_str}  margin:{margin:.3f}")

        # Abstain if confidence too low
        if top1_score < 0.35:
            print(f"[NLU]   → abstain (low confidence) → {self.fallback}")
            return {
                "intent": self.fallback,
                "confidence": round(top1_score, 3),
                "needs_llm_fallback": True,
            }

        # Flag for LLM review if ambiguous
        needs_llm_fallback = top1_score < 0.50 or margin < 0.08
        flag = " [needs_llm_fallback]" if needs_llm_fallback else ""
        print(f"[NLU]   → {top1_name} ({top1_score:.3f}){flag}")

        return {
            "intent": top1_name,
            "confidence": round(top1_score, 3),
            "needs_llm_fallback": needs_llm_fallback,
        }
