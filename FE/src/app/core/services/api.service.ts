import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Environment variable or hardcoded for dev
const API_URL = 'http://localhost:8000/api/v1';

export const CLASS_NAMES = ['Hydrangea', 'Dandelion'];

export interface Detection {
    class: string;
    confidence: number;
    box: [number, number, number, number]; // x1, y1, x2, y2
    ignore?: boolean;
    isManual?: boolean;
}

export interface PredictionResult {
    filename: string;
    url: string;
    detections: Detection[];
}

export interface RunMetrics {
    precision?: number;
    recall?: number;
    map50?: number;
    map50_95?: number;
    box_loss?: number;
    cls_loss?: number;
    dfl_loss?: number;
}

export interface RunInfo {
    kind: 'current' | 'archive';
    name: string;
    path: string;
    mtime: number;
    metrics: RunMetrics;
    args?: any;
}

export interface RunsResponse {
    status: string;
    count: number;
    runs: RunInfo[];
    manifest: any[];
}

@Injectable({
    providedIn: 'root'
})
export class ApiService {

    constructor(private http: HttpClient) { }

    /**
     * Initializes the PlantPilotAI environment from a Label Studio ZIP dataset.
     * Uploads the ZIP, extracts and normalizes the dataset, and triggers the initial training.
     */
    initProject(file: File, epochs: number = 100, imgsz: number = 960, model: string = 'yolov8n.pt'): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('epochs', epochs.toString());
        formData.append('imgsz', imgsz.toString());
        formData.append('model', model);
        return this.http.post(`${API_URL}/project/init`, formData);
    }

    /**
     * Sends an image to the backend for inference using the currently loaded model.
     * Returns bounding boxes, class names, and confidence scores.
     */
    predict(file: File, conf: number = 0.25): Observable<PredictionResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conf', conf.toString());
        return this.http.post<PredictionResult>(`${API_URL}/inference/predict`, formData);
    }

    /**
     * Triggers the active learning neural refinement pipeline in the backend.
     * Retrains the model sequentially with newly accepted annotations.
     */
    triggerTraining(epochs: number = 40, imgsz: number = 960, model: string = 'best.pt'): Observable<any> {
        return this.http.post(`${API_URL}/project/refine?epochs=${epochs}&imgsz=${imgsz}&model=${model}`, {});
    }

    /**
     * Saves user-verified predictions and manually drawn boxes to the dataset staging area.
     * Coordinate conversions to normalized YOLO variables happen in the backend.
     */
    saveAnnotation(filename: string, detections: any[], width: number, height: number): Observable<any> {
        return this.http.post(`${API_URL}/project/annotate`, { filename, detections, width, height });
    }

    /**
     * Skips the image explicitly by moving it outside of the pipeline without saving natively.
     */
    skipImage(filename: string): Observable<any> {
        return this.http.post(`${API_URL}/project/skip`, { filename });
    }

    /**
     * Polls the backend for all available active learning and base model runs.
     */
    getRuns(): Observable<RunsResponse> {
        // Note: Calling the legacy pipeline endpoint as verified in backend research
        // effectively /pipeline/runs but using absolute path since API_URL is /api/v1
        return this.http.get<RunsResponse>(`http://localhost:8000/pipeline/runs`);
    }

    /**
     * Gets system inference capabilities, available models, and connected devices (CUDA).
     */
    getSystemInfo(): Observable<any> {
        return this.http.get(`http://localhost:8000/pipeline/system/info`);
    }

    /**
     * Reverts the current active model sequentially backwards to a targeted historical archive.
     */
    rollback(runName: string): Observable<any> {
        return this.http.post(`http://localhost:8000/pipeline/rollback?run=${runName}`, {});
    }

    /**
     * Fetches the terminal active logs for viewing pipeline iterations safely in UI.
     */
    getLogs(): Observable<{ logs: string[] }> {
        return this.http.get<{ logs: string[] }>(`${API_URL}/project/logs`);
    }

    /**
     * Removes all active working datasets and completely restores backend to initial layout.
     */
    resetProject(archive: boolean = false): Observable<any> {
        return this.http.post(`${API_URL}/project/reset?archive=${archive}`, {});
    }

    /**
     * Gets stats on how many tracked image modifications wait safely inside staging areas.
     */
    getStagedStats(): Observable<{ images: number, classes: number }> {
        return this.http.get<{ images: number, classes: number }>(`${API_URL}/project/staged-stats`);
    }

    /**
     * Queries backend for any uploads waiting for human review sequence.
     */
    getPendingImages(): Observable<{ files: string[] }> {
        return this.http.get<{ files: string[] }>(`${API_URL}/project/pending-images`);
    }

    /**
     * Loads available plant classes from the BE.
     * These classes are used in the manual annotation dropdown.
     */
    getClasses(): Observable<{ classes: string[] }> {
        return this.http.get<{ classes: string[] }>(`${API_URL}/project/classes`);
    }

    /**
     * Creates and unconditionally persists a new user-defined annotation class 
     * strictly inside to the underlying modeling file map.
     */
    addNewClass(name: string): Observable<any> {
        return this.http.post(`${API_URL}/project/classes`, { name });
    }

    /**
     * Drops safely tracked staged variables that haven't been passed into formal training iteration yet.
     */
    flushStaged(): Observable<any> {
        return this.http.post(`${API_URL}/project/flush-staged`, {});
    }

    // ========== BATCH PROCESSING API ==========

    queueAnnotation(filename: string, detections: any[], width: number, height: number, labelType: string = 'correct'): Observable<any> {
        return this.http.post(`${API_URL}/project/batch/queue`, {
            filename,
            detections,
            width,
            height,
            label_type: labelType
        });
    }

    rejectBatchAnnotation(filename: string): Observable<any> {
        return this.http.post(`${API_URL}/project/batch/reject`, { filename });
    }

    getBatchStatus(): Observable<any> {
        return this.http.get(`${API_URL}/project/batch/status`);
    }

    acceptBatch(epochs: number = 40, imgsz: number = 960, model: string = 'yolov8n.pt'): Observable<any> {
        return this.http.post(`${API_URL}/project/batch/accept-all?epochs=${epochs}&imgsz=${imgsz}&model=${model}`, {});
    }
}
