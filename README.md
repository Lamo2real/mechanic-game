# CHASSIS — Automotive Engineering Sandbox

> A realistic car building and automotive engineering simulator.
> Build vehicles from bare chassis using real-world mechanical systems,
> physics, fabrication, and part compatibility.

---

## Quick Start

### Local (no Docker)
```bash
cd backend
pip install -r requirements.txt
python main.py
# Open http://localhost:8000
```

### Local Docker
```bash
docker-compose up --build
# Open http://localhost:8000
```

### EC2 (Amazon Linux 2)
```bash
sudo yum update -y && sudo yum install docker -y
sudo service docker start && sudo usermod -aG docker ec2-user
docker build -t chassis-game .
docker run -d -p 80:8000 --name chassis chassis-game
```

### ECS Fargate
```bash
# Push to ECR
aws ecr create-repository --repository-name chassis-game --region us-east-1
docker build -t chassis-game .
docker tag chassis-game:latest <ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/chassis-game:latest
docker push <ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com/chassis-game:latest
# Create ECS task: port 8000, health check /api/health
# Attach ALB: port 80 → target group port 8000
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + part counts |
| GET | `/api/chassis` | All 12 chassis platforms |
| GET | `/api/parts/search?q=2JZ` | Full-text + filter search |
| GET | `/api/parts/{engine_id}/curve` | Engine dyno curve |
| POST | `/api/builds` | Create new build |
| PUT | `/api/builds/{id}/install` | Install part in slot |
| PUT | `/api/builds/{id}/tune` | Update ECU tune |
| GET | `/api/builds/{id}/physics` | Full physics simulation |
| POST | `/api/compatibility/check` | Part compatibility check |
| WS | `/ws/{client_id}` | Real-time updates |

---

## Architecture

```
backend/
  main.py           FastAPI — all REST + WebSocket endpoints
  models.py         Pydantic data models
  parts_db.py       24 engines, 12 chassis, turbos, transmissions, ECUs...
  physics_engine.py 0-60, quarter mile, aero, thermal, reliability
  compatibility.py  Dimensional fitment + fabrication checker

frontend/
  index.html        Game UI
  css/style.css     Dark industrial UI
  js/api.js         REST client
  js/scene3d.js     Three.js 3D garage
  js/ui.js          Game controller
```