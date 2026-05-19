# ════════════════════════════════════════════════════
#  CHASSIS Game — Dockerfile
#  Local + EC2 / ECS Fargate compatible
#  Single-container: Python FastAPI serves the frontend
# ════════════════════════════════════════════════════

FROM python:3.12-slim

LABEL maintainer="CHASSIS Dev Team"
LABEL description="CHASSIS Automotive Engineering Sandbox"

# ── System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Working dir
WORKDIR /app

# ── Python dependencies (install before copying source for cache efficiency)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy backend source
COPY backend/ ./backend/

# ── Copy frontend assets
COPY frontend/ ./frontend/

# ── Environment defaults (override via -e or ECS task def)
ENV PORT=8000
ENV ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# ── Health check (for ECS/Fargate target group)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# ── Expose port
EXPOSE ${PORT}

# ── Run
WORKDIR /app/backend
CMD ["python", "main.py"]
