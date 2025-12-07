import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Environment variable or hardcoded for dev
const API_URL = 'http://localhost:8000/api/v1';

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

@Injectable({
    providedIn: 'root'
})
export class ApiService {

    constructor(private http: HttpClient) { }

    initProject(file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post(`${API_URL}/project/init`, formData);
    }

    predict(file: File): Observable<PredictionResult> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<PredictionResult>(`${API_URL}/inference/predict`, formData);
    }

    triggerTraining(): Observable<any> {
        return this.http.post(`${API_URL}/project/train`, {});
    }
}
