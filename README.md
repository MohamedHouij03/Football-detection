

<div align="center">

# ⚽ PitchVision

**Football object detection from match images, in seconds.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-00FFBE?style=flat-square&logo=github&logoColor=black)](https://github.com/ultralytics/ultralytics)
[![License](https://img.shields.io/badge/License-Educational-green?style=flat-square)](#license)

Upload a match photo. Get every player, goalkeeper, referee, and ball detected with confidence scores — exported as an annotated image, CSV, or report.

[Features](#features) · [Getting Started](#getting-started) · [Model](#model) · [Project Structure](#project-structure)

</div>

---

## Demo Video
[![PitchVision Demo]](https://youtube.com/watch?v=g4Mm9K5nEwM)

## Features

| | Feature | Details |
|---|---|---|
| 🔍 | **Object Detection** | Players · Goalkeepers · Referees · Ball |
| 🖼️ | **Before / After** | Side-by-side original vs. annotated image |
| 📊 | **Detection Breakdown** | Per-class counts and confidence scores |
| 📥 | **Export** | Annotated PNG · CSV spreadsheet · text report |
| 📈 | **Accuracy Dashboard** | Training metrics, precision-recall charts |
| 🌙 | **Dark / Light Theme** | Persisted across sessions |

---

## Tech Stack

**Frontend**

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-2-22B5BF?style=flat-square)

**Backend**

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Uvicorn](https://img.shields.io/badge/Uvicorn-499848?style=flat-square)
![Pillow](https://img.shields.io/badge/Pillow-3776AB?style=flat-square&logo=python&logoColor=white)

**Model**

![YOLOv8n](https://img.shields.io/badge/YOLOv8n-Ultralytics-00FFBE?style=flat-square)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=flat-square&logo=pytorch&logoColor=white)

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/pitchvision.git
cd pitchvision
```

**2. Set up the Python backend**

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**3. Install frontend dependencies**

```bash
cd frontend
npm install
cd ..
```

### Running in Development

Open two terminals:

```bash
# Terminal 1 — backend
python server.py
# → API at http://localhost:8000
```

```bash
# Terminal 2 — frontend
cd frontend
npm run dev
# → UI at http://localhost:5173
```

### Running in Production (single server)

```bash
cd frontend && npm run build && cd ..
python server.py
# → Full app at http://localhost:8000
```

---

## Dataset

The training dataset was sourced from **[Roboflow](https://roboflow.com)** — a platform for computer vision dataset management and augmentation.

| Property | Value |
|---|---|
| Platform | Roboflow Universe |
| Workspace | `mohamed-houij` |
| Project | `testing_football` |
| Version | v1 |
| Format | YOLOv8 |

The dataset contains annotated football broadcast images split into `train`, `valid`, and `test` sets (6,690 files total). Each image is labeled with bounding boxes across 11 classes mixing French and English annotations (`Arbitre`, `Ballon`, `Football`, `Gardien`, `Joueur`, `Player`, `ball`, `big`, `person`, `player`, `refere`).

> Download via the Roboflow SDK:
> ```python
> from roboflow import Roboflow
> rf = Roboflow(api_key="YOUR_API_KEY")
> project = rf.workspace("mohamed-houij").project("testing_football")
> dataset = project.version(1).download("yolov8")
> ```

---

## Model

### Architecture

YOLOv8n (nano) trained on the Roboflow football dataset. Raw model class names are used directly — no remapping — so detections reflect exactly what the model learned.

### Training

| Setting | Value |
|---|---|
| Base model | `yolov8n.pt` |
| Epochs | 50 |
| Batch size | 16 |
| Input size | 640×640 |
| Optimizer | Auto (AdamW) |
| Platform | Kaggle GPU |
| Best checkpoint | Epoch 44 |

### Inference

| Parameter | Value | Effect |
|---|---|---|
| Confidence threshold | `0.10` | Catches partially visible objects |
| IoU threshold | `0.30` | Reduces duplicate boxes in crowds |
| Input size | `1280` | Better recall on aerial/broadcast images |
| Augmentation | `enabled` | Flipped/scaled passes for improved recall |

### Performance

| Metric | Best (Epoch 44) |
|---|---|
| mAP@50 | **42.78%** |
| mAP@50-95 | 29.34% |
| Precision | 60.86% |
| Recall | 50.31% |

---

## Project Structure

```
pitchvision/
├── server.py              # FastAPI backend (inference + accuracy API)
├── requirements.txt       # Python dependencies
│
├── frontend/              # React application (Vite)
│   ├── src/
│   │   ├── pages/         # Home · Analyze · Accuracy · Docs
│   │   ├── components/    # Navbar
│   │   ├── App.jsx        # Router + theme
│   │   └── index.css      # Design system (CSS custom properties)
│   ├── package.json
│   └── dist/              # Production build output (generated)
│
├── models/
│   └── football_best.pt   # Trained YOLOv8n weights
│
└── assets/
    ├── results.csv         # Training log (50 epochs)
    └── results.png         # Ultralytics training plot
```

---

## License

Released for educational and research purposes.  
Model weights are derived from [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics) under AGPL-3.0.
