# PlantPilotAI-Fullstack

An early full-stack active learning computer vision platform built around YOLOv8, bridging dataset management, human review, and model refinement.

> **⚠️ Project Evolution Notice**  
> PlantPilotAI-Fullstack is the original full-stack active learning computer vision platform that became one of the architectural foundations for **TrainFlowVision**. This repository is intentionally kept as a working reference implementation of the earlier YOLO-focused system. Active development has moved to [TrainFlowVision](https://github.com/rathoddhruv/TrainFlowVision), where the architecture is being generalized beyond a single dataset, a single domain, and one model family.

## 📖 What PlantPilotAI Is

PlantPilotAI began as a practical, end-to-end experiment connecting a frontend Angular management interface, a FastAPI backend, and an Ultralytics YOLOv8 machine learning pipeline. It is not just a model script; it is a complete active learning loop where images are uploaded, predictions are rendered, human experts correct the labels, and the refined dataset triggers automated model retraining.

## 🎯 Why This Project Was Built

An important purpose of this project was not simply plant detection, but exploring the engineering required to build a feedback loop around an ML model. Production AI is more than `model.predict()`. A useful vision system requires:
- Robust dataset management
- Human feedback and annotation interfaces
- Training orchestration and hardware acceleration management
- Model history, evaluation, and reproducibility
- Controlled model deployment

## ✨ Core Capabilities

- **Drag & Drop Upload**: Intake ZIP exports from tools like Label Studio.
- **Real-time Training**: Orchestrated PyTorch/YOLOv8 training with GPU acceleration.
- **Live Logs**: Real-time training metrics streaming directly to the UI.
- **Model History & Rollback**: Track run history and safely rollback to prior model states.
- **Human-in-the-Loop Review**: Render detections, allow users to adjust classes or bounding boxes, and curate trusted datasets.

## 🏗️ Architecture

PlantPilotAI is divided into three primary layers, integrated to form a continuous active learning loop:

### Frontend (FE) Architecture
- **Framework**: Angular 17 (Standalone), TypeScript, SCSS.
- **Role**: Provides the management dashboard, system metrics, and the interactive human-review canvas for adjusting bounding boxes and verifying model inferences.

### Backend (BE) Architecture
- **Framework**: FastAPI (Python 3.11).
- **Role**: Manages file uploads, datasets, training orchestration, live WebSocket logs, and API routes for model inference.

### Machine Learning (ML) Architecture
- **Framework**: PyTorch, Ultralytics YOLOv8.
- **Role**: Handles raw inference, model weight tracking, dataset refinement, and continuous retraining iterations utilizing NVIDIA CUDA hardware acceleration.

### Active Learning Lifecycle

TrainFlowVision uses the same broader engineering idea pioneered here:

```mermaid
graph TD
    Data[New Real World Data] --> Model[Model]
    Model --> Prediction[Prediction]
    Prediction --> Review[Human Review]
    Review --> Correction[Correction]
    Correction --> Refinement[Dataset Refinement]
    Refinement --> Training[Training]
    Training --> Evaluation[Evaluation]
    Evaluation --> Versioned[Versioned Model]
    Versioned --> Deployment[Deployment]
    Deployment -.-> Data
```

### Human-in-the-Loop Workflow

At the core of PlantPilotAI is the human review interface. When predictions are made, they are not blindly trusted. Users review the bounding boxes, correct misclassifications, draw missing annotations, and mark examples as correct or wrong. Only verified, high-quality annotations are fed back into the dataset for the next training cycle.

### Model Lifecycle & History

The system tracks model evolution. Users can view the system dashboard, compare run histories, and actively rollback the live prediction model to a previous, more stable state if a retraining iteration introduces regressions.

## 🚀 From PlantPilotAI to TrainFlowVision

The concepts pioneered in PlantPilotAI proved that closing the loop between inference and human review is critical for AI performance. However, PlantPilotAI was heavily coupled to plant detection and the YOLOv8 model architecture. 

**TrainFlowVision** is the evolution of these concepts. While PlantPilotAI asked *"Can I build a complete active learning application around a YOLO plant detector?"*, TrainFlowVision asks *"Can I build a reusable computer vision learning platform where data collection, human feedback, model training, evaluation, versioning, and deployment are modular enough to support different domains, tasks, runtimes, and eventually different model architectures?"*

```mermaid
graph TD
    subgraph PlantPilotAI
        A[FE + BE + YOLO + Dataset + Training]
    end
    
    subgraph Core
        B[Reusable active learning concepts]
    end

    subgraph TrainFlowVision
        C[Generalized Data + Review + ML + MLOps + Edge AI Platform]
    end

    A --> B
    B --> C
```

### PlantPilotAI vs TrainFlowVision

| Feature/Concept | PlantPilotAI (Implemented) | TrainFlowVision (Evolved / Direction) |
|---|---|---|
| **Domain** | Plant-focused use case | Domain-independent platform |
| **Model Coupling** | YOLOv8 centered | Pluggable model backends |
| **Task Types** | Object Detection | Detection, Segmentation, Rotated Bounding Boxes (where implemented) |
| **Data Intake** | ZIP / Static Images | Intelligent Image & Video intake, duplicate reduction |
| **MLOps Lineage** | Basic run history & rollback | Stronger experiment lineage, neural history, versioning |
| **Deployment** | Local PyTorch inference | ONNX export, TensorRT optimized, NVIDIA Jetson Edge |
| **Robotics & Simulation**| None | Simulation driven (PX4, Gazebo), drone experimentation |

### Model-Agnostic Direction

Technical honesty is extremely important: TrainFlowVision currently leverages robust YOLO-based workflows, but its *architectural direction* is designed to become model-agnostic. The new architecture is moving toward pluggable model backends to generalize beyond a YOLO-only workflow. Future model adapters can support additional detector, segmentation, transformer-based, or multimodal architectures. **These future adapters are planned architectural capabilities, not completed features.**

## 📌 Current Repository Status

**PlantPilotAI-Fullstack is currently in reference and maintenance mode.** 

Major new research and architecture development continues in [TrainFlowVision](https://github.com/rathoddhruv/TrainFlowVision). This repository remains extremely useful for understanding the original full-stack implementation and the evolution of the active learning architecture. 

## 🛠️ Tech Stack

- **Backend**: Python 3.11, FastAPI, PyTorch, Ultralytics YOLOv8
- **Frontend**: Angular 17 (Standalone), TypeScript, SCSS
- **Environment**: Windows / Linux / macOS (NVIDIA GPU with CUDA highly recommended)

## 💻 Running Locally

> **Note**: For comprehensive instructions, please refer to the [Quick Start Guide](QUICKSTART.md).

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

### Access Points
- **Frontend**: `http://localhost:4200`
- **Backend API**: `http://localhost:8000`
- **API Docs**: `http://localhost:8000/docs`

## 📁 Repository Structure

- `/FE`: Angular 17 Frontend application.
- `/BE`: FastAPI Backend orchestration and REST endpoints.
- `/ML`: Machine Learning scripts, YOLO configurations, and dataset utilities.
- `/data`: Local data storage for datasets and runs.

## 🧠 Lessons & Engineering Impact

Building PlantPilotAI-Fullstack proved that a single engineer can build the entire lifecycle of an AI product—from the frontend UI to the GPU memory management. It highlighted the friction points of manual data curation and validated the necessity of a seamless `Data -> Model -> Prediction -> Human Review -> Correction -> Dataset Refinement -> Training` loop. These lessons are the bedrock of the TrainFlowVision project.

## 🔗 Related Projects

- **[TrainFlowVision (Private Main Repository)](https://github.com/rathoddhruv/TrainFlowVision)** - The main generalized active learning platform under active development.
- **[TrainFlowVision-Showcase (Public)](https://github.com/rathoddhruv/TrainFlowVision-Showcase)** - Public architecture, portfolio showcase, and documentation for the TrainFlowVision project.
