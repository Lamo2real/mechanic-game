"""
CHASSIS Game — FastAPI Backend
Serves the game API and static frontend assets.
"""

import os
import uuid
import json
from typing import Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from models import (
    CompatibilityRequest, CompatibilityResult,
    PhysicsRequest, PhysicsResult,
    SearchRequest, TuneRequest,
)
from parts_db import (
    ALL_PARTS, PARTS_BY_ID, CHASSIS_LIST, CHASSIS_BY_ID,
    search_parts, ENGINES, TURBOS, TRANSMISSIONS,
    SUSPENSION_KITS, WHEELS, TIRES, ECUS,
)
from physics_engine import run_physics
from compatibility import check_compatibility


# ─────────────────────────────────────────────────────────────
#  App setup
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="CHASSIS Game Engine",
    description="Automotive engineering sandbox simulation API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory build store (replace with SQLite/PostgreSQL for persistence)
BUILDS: dict[str, dict] = {}

# Active WebSocket connections
CONNECTIONS: dict[str, WebSocket] = {}


# ─────────────────────────────────────────────────────────────
#  Health
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "game": "CHASSIS",
        "engines": len(ENGINES),
        "chassis": len(CHASSIS_LIST),
        "total_parts": len(ALL_PARTS),
    }


# ─────────────────────────────────────────────────────────────
#  Parts catalog
# ─────────────────────────────────────────────────────────────

@app.get("/api/parts")
async def get_all_parts(
    category: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    """Return all parts, optionally filtered by category."""
    parts = ALL_PARTS
    if category:
        parts = [p for p in parts if p.category.value.lower() == category.lower()]
    total = len(parts)
    return {
        "total": total,
        "parts": [p.model_dump() for p in parts[offset: offset + limit]],
    }


@app.get("/api/parts/search")
async def search_parts_endpoint(
    q: str | None = None,
    category: str | None = None,
    min_hp: int | None = None,
    max_weight_kg: float | None = None,
    max_price: int | None = None,
    chassis_id: str | None = None,
    limit: int = 50,
):
    """Full-text and filter search across all parts."""
    results = search_parts(
        query=q,
        category=category,
        min_hp=min_hp,
        max_weight_kg=max_weight_kg,
        max_price=max_price,
        chassis_id=chassis_id,
        limit=limit,
    )
    return {
        "query": q,
        "total": len(results),
        "parts": [p.model_dump() for p in results],
    }


@app.get("/api/parts/{part_id}")
async def get_part(part_id: str):
    part = PARTS_BY_ID.get(part_id)
    if not part:
        raise HTTPException(404, f"Part '{part_id}' not found")
    return part.model_dump()


# ─────────────────────────────────────────────────────────────
#  Chassis catalog
# ─────────────────────────────────────────────────────────────

@app.get("/api/chassis")
async def get_all_chassis():
    return {
        "total": len(CHASSIS_LIST),
        "chassis": [c.model_dump() for c in CHASSIS_LIST],
    }


@app.get("/api/chassis/{chassis_id}")
async def get_chassis(chassis_id: str):
    chassis = CHASSIS_BY_ID.get(chassis_id)
    if not chassis:
        raise HTTPException(404, f"Chassis '{chassis_id}' not found")
    return chassis.model_dump()


@app.get("/api/chassis/{chassis_id}/compatible-parts")
async def get_compatible_parts(chassis_id: str, category: str | None = None):
    """Return parts that are compatible with a given chassis."""
    chassis = CHASSIS_BY_ID.get(chassis_id)
    if not chassis:
        raise HTTPException(404, f"Chassis '{chassis_id}' not found")

    results = search_parts(category=category, chassis_id=chassis_id, limit=200)
    return {
        "chassis_id": chassis_id,
        "total": len(results),
        "parts": [p.model_dump() for p in results],
    }


# ─────────────────────────────────────────────────────────────
#  Build management
# ─────────────────────────────────────────────────────────────

@app.post("/api/builds")
async def create_build(payload: dict):
    build_id = str(uuid.uuid4())[:8]
    chassis_id = payload.get("chassis_id")
    if not CHASSIS_BY_ID.get(chassis_id):
        raise HTTPException(400, f"Invalid chassis_id: {chassis_id}")

    chassis = CHASSIS_BY_ID[chassis_id]
    build = {
        "id": build_id,
        "name": payload.get("name", f"Build #{build_id}"),
        "chassis_id": chassis_id,
        "installed_parts": {
            "engine": chassis.stock_engine_id,
        },
        "fabrication_mods": [],
        "tune": {
            "boost_psi": None,
            "ignition_timing_deg": 14.0,
            "fuel_map_pct": 0.0,
            "rev_limit_rpm": None,
            "launch_rpm": 3000,
            "traction_slip_pct": 10.0,
        },
        "notes": payload.get("notes", ""),
    }
    BUILDS[build_id] = build
    return build


@app.get("/api/builds")
async def list_builds():
    return {"builds": list(BUILDS.values())}


@app.get("/api/builds/{build_id}")
async def get_build(build_id: str):
    build = BUILDS.get(build_id)
    if not build:
        raise HTTPException(404, f"Build '{build_id}' not found")
    return build


@app.put("/api/builds/{build_id}/install")
async def install_part(build_id: str, payload: dict):
    """Install a part into a slot on a build."""
    build = BUILDS.get(build_id)
    if not build:
        raise HTTPException(404, f"Build '{build_id}' not found")

    slot    = payload.get("slot")
    part_id = payload.get("part_id")
    force   = payload.get("force", False)

    if not slot or not part_id:
        raise HTTPException(400, "slot and part_id are required")

    # Compatibility check
    compat = check_compatibility(
        chassis_id=build["chassis_id"],
        part_id=part_id,
        slot=slot,
        installed_parts=build["installed_parts"],
    )

    if not compat.compatible and not force:
        return {
            "success": False,
            "compatibility": compat.model_dump(),
            "message": "Part is not compatible. Use force=true to install anyway with fabrication required.",
        }

    # Install the part
    build["installed_parts"][slot] = part_id

    # Update fabrication mods if needed
    if compat.requires_fabrication:
        for fab in compat.fabrication_items:
            if not any(m.get("name") == fab for m in build["fabrication_mods"]):
                build["fabrication_mods"].append({
                    "id": str(uuid.uuid4())[:8],
                    "name": fab,
                    "description": f"Required for {slot} installation",
                    "difficulty": 5,
                    "cost_usd": 500,
                    "time_hours": 8.0,
                })

    return {
        "success": True,
        "build": build,
        "compatibility": compat.model_dump(),
    }


@app.put("/api/builds/{build_id}/remove")
async def remove_part(build_id: str, payload: dict):
    build = BUILDS.get(build_id)
    if not build:
        raise HTTPException(404, f"Build '{build_id}' not found")

    slot = payload.get("slot")
    if slot in build["installed_parts"]:
        del build["installed_parts"][slot]

    return {"success": True, "build": build}


@app.put("/api/builds/{build_id}/tune")
async def update_tune(build_id: str, tune: dict):
    build = BUILDS.get(build_id)
    if not build:
        raise HTTPException(404, f"Build '{build_id}' not found")
    build["tune"].update(tune)
    return {"success": True, "build": build}


@app.delete("/api/builds/{build_id}")
async def delete_build(build_id: str):
    if build_id not in BUILDS:
        raise HTTPException(404, f"Build '{build_id}' not found")
    del BUILDS[build_id]
    return {"success": True}


# ─────────────────────────────────────────────────────────────
#  Physics simulation
# ─────────────────────────────────────────────────────────────

@app.post("/api/physics/calculate")
async def calculate_physics(req: PhysicsRequest):
    result = run_physics(req.chassis_id, req.installed_parts, req.tune)
    return result.model_dump()


@app.get("/api/builds/{build_id}/physics")
async def build_physics(build_id: str):
    build = BUILDS.get(build_id)
    if not build:
        raise HTTPException(404, f"Build '{build_id}' not found")

    result = run_physics(
        build["chassis_id"],
        build["installed_parts"],
        build["tune"],
    )
    return result.model_dump()


# ─────────────────────────────────────────────────────────────
#  Compatibility check endpoint
# ─────────────────────────────────────────────────────────────

@app.post("/api/compatibility/check")
async def compat_check(req: CompatibilityRequest):
    result = check_compatibility(
        chassis_id=req.chassis_id,
        part_id=req.part_id,
        slot=req.slot,
        installed_parts=req.installed_parts,
    )
    return result.model_dump()


# ─────────────────────────────────────────────────────────────
#  Engine torque/power curve
# ─────────────────────────────────────────────────────────────

@app.get("/api/parts/{engine_id}/curve")
async def engine_curve(engine_id: str, boost_psi: float | None = None):
    from physics_engine import engine_torque_at_rpm, engine_hp_at_rpm
    engine = PARTS_BY_ID.get(engine_id)
    if not engine or not hasattr(engine, "redline_rpm"):
        raise HTTPException(404, "Engine not found or part is not an engine")

    idle    = engine.idle_rpm
    redline = engine.redline_rpm
    step    = max(100, (redline - idle) // 50)
    rpms    = list(range(idle, redline + step, step))

    curve = []
    for rpm in rpms:
        torque = engine_torque_at_rpm(engine, rpm, boost_psi)
        hp     = engine_hp_at_rpm(engine, rpm, boost_psi)
        curve.append({"rpm": rpm, "torque_nm": round(torque, 1), "hp": round(hp, 1)})

    return {"engine_id": engine_id, "boost_psi": boost_psi, "curve": curve}


# ─────────────────────────────────────────────────────────────
#  Part categories endpoint
# ─────────────────────────────────────────────────────────────

@app.get("/api/categories")
async def get_categories():
    from models import PartCategory
    return {"categories": [c.value for c in PartCategory]}


# ─────────────────────────────────────────────────────────────
#  WebSocket — real-time build updates
# ─────────────────────────────────────────────────────────────

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    CONNECTIONS[client_id] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            msg  = json.loads(data)
            action = msg.get("action")

            if action == "physics":
                build_id = msg.get("build_id")
                build    = BUILDS.get(build_id)
                if build:
                    result = run_physics(
                        build["chassis_id"],
                        build["installed_parts"],
                        build["tune"],
                    )
                    await websocket.send_json({
                        "type": "physics_update",
                        "build_id": build_id,
                        "data": result.model_dump(),
                    })

            elif action == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        CONNECTIONS.pop(client_id, None)


# ─────────────────────────────────────────────────────────────
#  Static frontend
# ─────────────────────────────────────────────────────────────

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
    app.mount("/css",    StaticFiles(directory=str(FRONTEND_DIR / "css")),    name="css")
    app.mount("/js",     StaticFiles(directory=str(FRONTEND_DIR / "js")),     name="js")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"error": "Frontend not found"}, status_code=404)

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(str(FRONTEND_DIR / "index.html"))


# ─────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("ENV", "production") == "development",
        log_level="info",
    )
