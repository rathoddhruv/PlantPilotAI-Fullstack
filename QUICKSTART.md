# PlantPilotAI - Quick Start Guide

## 🚀 How to Run the Project

### Option 1: Separate Terminals (Recommended)

This is the most reliable method:

#### Terminal 1 - Backend
```bash
# From project root directory
python -m uvicorn BE.main:app --reload --host 0.0.0.0 --port 8000
```

#### Terminal 2 - Frontend
```bash
cd FE
npm start
```

### Option 2: Single Command (Windows)

Run the provided batch file:
```bash
start_dev.bat
```

This will open two separate windows for backend and frontend.

---

## 📋 First Time Setup

1. **Install Python Dependencies**
```bash
pip install "numpy<2" opencv-python pillow ultralytics pyyaml fastapi uvicorn
```

2. **Install Node Dependencies**
```bash
cd FE
npm install
```

---

## 🌐 Access Points

Once both services are running:

- **Frontend**: http://localhost:4200
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## 🛠️ Troubleshooting

### Frontend Not Loading
- Make sure `npm start` is running in the `FE` folder
- Check that port 4200 is not in use
- Try: `cd FE && npm start`

### Backend Not Starting
- Ensure Python 3.11 is installed
- Check that port 8000 is not in use
- Verify dependencies: `pip list | findstr ultralytics`

### CUDA Not Detected
- Verify PyTorch with CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- Should print `True` if GPU is available

---

## 📝 Notes

- **Backend auto-reloads** when you edit Python files
- **Frontend auto-reloads** when you edit TypeScript/HTML files
- Use **Ctrl+C** in each terminal to stop services
- Training logs appear in the UI console in real-time
