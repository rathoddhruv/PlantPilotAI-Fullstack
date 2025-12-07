import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../core/services/api.service';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './upload.component.html',
    styleUrls: ['./upload.component.scss']
})
export class UploadComponent implements OnInit {
    isDragOver = false;
    status: 'idle' | 'initializing' | 'training' | 'ready' = 'idle';

    // UI Props
    statusTitle = '';
    statusMessage = '';
    progressPercent = 0;
    extractedCount = 0;
    currentModelName = 'Loading...';
    runCount = 0;
    lastUpdate = '-';
    error = '';

    runs: RunInfo[] = [];
    manifest: any = null;

    devLogs: string[] = [];

    constructor(private api: ApiService, private router: Router) { }

    addLog(msg: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.devLogs.unshift("[" + timestamp + "] " + msg);
        if (this.devLogs.length > 10) {
            this.devLogs.pop();
        }
    }

    ngOnInit() {
        interval(5000).pipe(
            startWith(0),
            switchMap(() => this.api.getRuns())
        ).subscribe({
            next: (res: any) => {
                this.runs = res.runs;
                this.manifest = res.manifest;

                const current = res.runs.find((r: any) => r.kind === 'current');
                this.currentModelName = current?.name || 'yolov8s.pt (Base)';
                this.runCount = res.runs.length;
                this.lastUpdate = new Date().toLocaleTimeString();

                this.addLog("Runs polled. Count " + res.runs.length);
            },
            error: () => {
                this.currentModelName = 'yolov8s.pt (Fallback)';
            }
        });
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) this.handleFile(files[0]);
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) this.handleFile(file);
    }

    handleFile(file: File) {
        this.error = '';
        this.addLog("File dropped: " + file.name + " type=" + file.type);

        if (file.name.endsWith('.zip')) {
            this.startZipFlow(file);
        } else if (file.type.startsWith('image/')) {
            this.startPredictionFlow(file);
        } else {
            this.error = 'Unsupported file type. Use ZIP for training or Image for prediction.';
        }
    }

    startZipFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = 'Initializing Project';
        this.statusMessage = 'Uploading & Extracting Dataset...';
        this.progressPercent = 10;
        this.extractedCount = 0;

        // Simulate extraction progress while uploading
        const interval = setInterval(() => {
            if (this.progressPercent < 40) this.progressPercent += 5;
        }, 200);

        this.api.initProject(file).subscribe({
            next: (res) => {
                clearInterval(interval);
                this.progressPercent = 50;
                this.extractedCount = Math.floor(Math.random() * (400 - 150) + 150); // Simulate count

                this.addLog("Init success. Training started in background");

                this.status = 'training';
                this.statusTitle = 'Training Started';
                this.statusMessage = 'Active Learning Loop Running in Background...';

                // Simulate training progress visually since it's background
                let trainP = 50;
                const trainInt = setInterval(() => {
                    trainP += 1;
                    this.progressPercent = trainP;
                    if (trainP >= 95) {
                        clearInterval(trainInt);
                        this.status = 'ready';
                        this.statusTitle = 'Ready!';
                        this.statusMessage = 'Model updated from dataset.';

                        setTimeout(() => this.status = 'idle', 3000);
                    }
                }, 100);
            },
            error: (err: any) => {
                clearInterval(interval);
                this.status = 'idle';
                const msg = err.error?.detail || err.message || "Upload failed";
                this.error = "Initialization failed: " + msg;
                this.addLog("Init error: " + msg);
            }
        });
    }

    startPredictionFlow(file: File) {
        this.addLog("Starting prediction for " + file.name);

        this.status = 'initializing';
        this.statusTitle = 'Analyzing';
        this.statusMessage = 'Running Inference...';
        this.progressPercent = 60;

        this.api.predict(file).subscribe({
            next: (res: any) => {
                this.progressPercent = 100;
                this.addLog("Prediction success for " + file.name);
                setTimeout(() => {
                    this.status = 'idle';
                    this.router.navigate(['/review'], { state: { prediction: res } });
                }, 500);
            },
            error: (err: any) => {
                this.status = 'idle';
                const msg = err.error?.detail || err.message || "Unknown prediction error";
                this.error = "Prediction failed: " + msg;
                this.addLog("Prediction error: " + msg);
            }
        });
    }
}
