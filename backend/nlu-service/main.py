from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from pydantic import BaseModel
from classifier import Classifier

INTENTS_FILE = os.getenv("INTENTS_FILE", str(Path(__file__).parent / "intents" / "rcfield.json"))

_classifier: Classifier | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _classifier
    with open(INTENTS_FILE, encoding="utf-8") as f:
        config = json.load(f)
    _classifier = Classifier(
        intents=config["intents"],
        fallback=config.get("fallback", "rag_query"),
        signals=config.get("signals", []),
    )
    # Warmup: run one inference so PyTorch JIT compiles before first real request
    _classifier.classify("xin chào")
    print("[NLU] Warmup done — ready")
    yield


app = FastAPI(title="RCField NLU Service", lifespan=lifespan)


class ClassifyRequest(BaseModel):
    text: str


@app.post("/classify")
def classify_endpoint(body: ClassifyRequest):
    return _classifier.classify(body.text)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "intents_loaded": len(_classifier._intents) if _classifier else 0,
    }
