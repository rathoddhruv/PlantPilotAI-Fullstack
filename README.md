# General Vision AI - Active Learning Platform

A generalized object detection system powered by **YOLOv8** and **Active Learning**, optimized for detecting objects in **aerial and top-down imagery (drone view)**.

This platform provides a complete **Human-in-the-Loop** workflow for rapidly building and refining datasets from scratch (Cold Start) or improving existing models.

## 🚀 Key Capabilities

- **🧠 Active Learning Loop**: Upload images -> Review predictions -> Correct mistakes -> Auto-train in background.
- **🛰️ Drone View Optimized**: Designed for detecting small objects in high-resolution aerial footage.
- **🌱 Cold Start**: Start with 0 data. Manually draw Bounding Boxes or Polygons to bootstrap your model.
- **🔍 Dual Modes**:
  - **Train Mode**: Add data to dataset and fine-tune model.
  - **Test Mode**: Run inference without modifying the dataset.
- **⚙️ Full Control**: Real-time training logs, model metrics history, and one-click project reset.

## 🚀 Quick Start

### Windows
Double-click `start_dev.bat` or run:
```bash
start_dev.bat
```

### Linux/Mac
```bash
chmod +x start_dev.sh
./start_dev.sh
```

## 📖 Documentation
- [Walkthrough](C:\Users\admin\.gemini\antigravity\brain\316c2645-af66-4d7b-bb68-45795242e240\walkthrough.md) - Features & Daily Log

## 🌐 Access Points
- **Frontend**: http://localhost:4200
- **Backend API**: http://localhost:8000  
- **API Docs**: http://localhost:8000/docs

## 🛠️ Tech Stack
- **Backend**: FastAPI, PyTorch, YOLOv8, Ultralytics
- **Frontend**: Angular 17 (Standalone), TypeScript, SCSS
- **ML**: Active Learning, Transfer Learning

## 📝 Requirements
- Python 3.11
- Node.js 18+
- NVIDIA GPU with CUDA support (Recommended)
