# PlantPilotAI-Fullstack

## Overview
PlantPilotAI is an interactive ML-powered plant recognition and training system. The final vision includes a frontend drag-and-drop interface where users can upload images, receive predictions, confirm or correct labels, and the system refines the model over time using active learning.

## Architectural Overview
- **Frontend**: React or Next.js for user interaction.
- **Backend API**: FastAPI for handling requests and triggering ML scripts.
- **ML Pipeline**: YOLO-based active learning loop.

### Backend Routes
1. **/init**
   - Run initial training from Label Studio export.
2. **/run**
   - Run active learning retraining.
3. **/runs**
   - List all previous runs and manifest info.
4. **/rollback**
   - Rollback current training to a selected archived version.
5. **/file**
   - Upload files (Label Studio exports or images).

### Frontend Interactions
- Users drop images through the frontend interface.
- Backend predicts objects in the uploaded images.
- Users approve, correct, or add new labels.

### ML Pipeline
1. **User uploads new images**.
2. **Backend runs predict** using `predict_from_folder.py`.
3. **Low confidence detections go to manual_review** (`manual_review.py`).
4. **User confirms / corrects / removes detections** via the frontend.
5. **Boost merge labels merges everything** (`boost_merge_labels.py`).
6. **Fix non-normalized labels normalizes data** (`fix_non_normalized_labels.py`).
7. **Pipeline training runs again** using `active_learning_pipeline.py`.
8. **Runs saved to `runs/detect/train`**.
9. **Backend exposes history and rollback** via `/runs` and `/rollback`.

### Installation + Running Instructions

#### Backend
1. Navigate to the project directory:
   ```bash
   cd PlantPilotAI-Fullstack/BE
   ```
2. Activate the virtual environment:
   ```bash
   venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the backend server:
   ```bash
   python run_dev.py
   ```

#### Frontend (React/Next.js)
1. Navigate to the frontend directory:
   ```bash
   cd PlantPilotAI-Fullstack/FE
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the frontend server:
   ```bash
   npm run dev
   ```

#### ML Scripts
ML scripts are located in `ml/` and can be triggered by the backend API.

### Environment Variables
- **UPLOAD_DIR**: Directory for uploaded images.
- **LABEL_STUDIO_DIR**: Directory for Label Studio exports.
- **ML_DIR**: Path to the ML directory (default is outside the BE folder).

### Troubleshooting Tips
- Ensure all dependencies are installed in the virtual environment.
- Verify that paths in `settings.py` and other configuration files are correct.
- Check logs from the backend server for any errors.

### Future Roadmap
1. **Drag and Drop Interface**: Simplified image upload process.
2. **Annotation UI**: Browser-based interface for annotating images.
3. **Incremental Training**: Continuous model improvement based on user feedback.

## License
MIT License
