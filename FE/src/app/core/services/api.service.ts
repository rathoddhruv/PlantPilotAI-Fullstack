import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Environment variable or hardcoded for dev
const API_URL = 'http://localhost:8000/api/v1';

export const CLASS_NAMES = ['Hydrangea', 'Dandelion'];

export interface Detection {
    class: string;
    confidence: number;
    box: [number, number, number, number]; // x1, y1, x2, y2
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

    initProject(file: File, epochs: number = 100, imgsz: number = 960): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('epochs', epochs.toString());
        formData.append('imgsz', imgsz.toString());
        return this.http.post(`${API_URL}/project/init`, formData);
    }

    predict(file: File): Observable<PredictionResult> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<PredictionResult>(`${API_URL}/inference/predict`, formData);
    }

    triggerTraining(): Observable<any> {
        // Calling project/train which triggers background task
        return this.http.post(`${API_URL}/project/train`, {});
    }

    getRuns(): Observable<RunsResponse> {
        // Note: Calling the legacy pipeline endpoint as verified in backend research
        // effectively /pipeline/runs but using absolute path since API_URL is /api/v1
        return this.http.get<RunsResponse>(`http://localhost:8000/pipeline/runs`);
    }

    getSystemInfo(): Observable<any> {
        return this.http.get(`http://localhost:8000/pipeline/system/info`);
    }

    rollback(runName: string): Observable<any> {
        return this.http.post(`http://localhost:8000/pipeline/rollback?run=${runName}`, {});
    }
}
