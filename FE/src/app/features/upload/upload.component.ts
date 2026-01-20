import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, RunInfo } from '../../core/services/api.service';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { DashboardSidebarComponent } from './sidebar/dashboard-sidebar.component';
import { ReviewQueueService } from '../../core/services/review-queue.service';

export interface LogEntry {
    msg: string;
    count: number;
    time: string;
    type: 'info' | 'error' | 'success' | 'warn';
}

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [CommonModule, FormsModule, DashboardSidebarComponent],
    templateUrl: './upload.component.html',
    styleUrls: ['./upload.component.scss']
})
export class UploadComponent implements OnInit, OnDestroy {
    isDragOver = false;
    status: 'idle' | 'initializing' | 'training' | 'ready' = 'idle';
    uploadMode: 'train' | 'test' = 'train'; // New Mode

    // UI Props
    statusTitle = '';
    statusMessage = '';
    progressPercent = 0;
    extractedCount = 0;
    currentModelName = 'Loading...';
    runCount = 0;
    lastUpdate = '-';
    error = '';

    datasetImages = '-';
    datasetClasses = '-';

    // Training Settings
    trainEpochs = 50;
    trainImgsz = 640;
    trainModel = 'yolov8n.pt';
    // isFreshStart = false; // Removed

    runs: RunInfo[] = [];
    manifest: any = null;

    devLogs: LogEntry[] = [];
    private logSub: Subscription | null = null;
    private statusPollSub: Subscription | null = null;

    // Layout State
    sidebarWidth = 320;
    consoleHeight = 256;
    isResizingSidebar = false;
    isResizingConsole = false;

    constructor(
        private api: ApiService,
        private router: Router,
        private reviewQueue: ReviewQueueService
    ) { }

    addLog(msg: string) {
        // Don't manually add logs during training (polling handles it) unless it's an error
        if (this.status === 'training' && !msg.toLowerCase().includes('error')) return;

        this.pushLogEntry(msg);
    }

    private pushLogEntry(msg: string) {
        const timestamp = new Date().toLocaleTimeString();
        let type: 'info' | 'error' | 'success' | 'warn' = 'info';

        const lower = msg.toLowerCase();
        if (lower.includes('error') || lower.includes('fail')) type = 'error';
        else if (lower.includes('success') || lower.includes('complete')) type = 'success';
        else if (lower.includes('warn') || lower.includes('reloading')) type = 'warn';

        // Grouping Check (Compare with top log)
        if (this.devLogs.length > 0) {
            const top = this.devLogs[0];
            if (top.msg === msg) {
                top.count++;
                top.time = timestamp;
                return;
            }
        }

        this.devLogs.unshift({
            msg,
            count: 1,
            time: timestamp,
            type
        });

        if (this.devLogs.length > 200) {
            this.devLogs.pop();
        }
    }

    ngOnInit() {
        this.statusPollSub = interval(5000).pipe(
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

        // Fetch System info once to set initial mode/model
        this.api.getSystemInfo().subscribe(res => {
            if (res.active_model && !res.active_model.includes('Base') && !res.active_model.includes('None')) {
                this.uploadMode = 'train'; // Default to train for active projects
            }
        });
    }

    ngOnDestroy() {
        if (this.statusPollSub) this.statusPollSub.unsubscribe();
        this.stopLogPolling();
    }

    // --- Drag & Drop ---
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
        if (files && files.length > 0) this.handleFiles(files);
    }

    onFileSelected(event: any) {
        const files = event.target.files;
        if (files && files.length > 0) this.handleFiles(files);
    }

    handleFiles(fileList: FileList) {
        this.error = '';
        const files = Array.from(fileList);

        // Check for ZIP (Training Mode) - Enforce single file for now
        const zipFile = files.find(f => f.name.endsWith('.zip'));
        if (zipFile) {
            if (files.length > 1) {
                this.error = 'Please upload only one ZIP file at a time for training.';
                return;
            }
            this.addLog("ZIP file dropped: " + zipFile.name);
            this.startZipFlow(zipFile);
            return;
        }

        // Check for Images (Prediction Mode)
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            this.error = 'No valid images found. Use ZIP for training or Images for prediction.';
            return;
        }

        this.addLog(`Queueing ${imageFiles.length} images for review.`);
        this.reviewQueue.clear(); // Clear any previous state
        this.reviewQueue.mode = this.uploadMode; // Pass mode
        this.reviewQueue.addFiles(imageFiles);
        this.router.navigate(['/review']);
    }

    // --- Process Flow ---
    startZipFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = 'Initializing Project';
        this.statusMessage = 'Uploading...';
        this.progressPercent = 10;
        this.extractedCount = 0;

        // Sequence: Init -> Poll Logs
        // We rely on Sidebar 'Reset' for fresh starts. Here we just upload/append.
        const flow$ = this.api.initProject(file, this.trainEpochs, this.trainImgsz, this.trainModel);

        flow$.subscribe({
            next: (res) => {
                this.progressPercent = 30;
                this.addLog("Init success. Training started.");

                this.status = 'training';
                this.statusTitle = 'Training in Progress';
                this.statusMessage = 'Streaming logs from backend...';

                this.startLogPolling();

                // Fake progress visual since validation takes time
                let p = 30;
                const int = setInterval(() => {
                    if (this.status !== 'training') {
                        clearInterval(int);
                        return;
                    }
                    if (p < 90) {
                        p++;
                        this.progressPercent = p;
                    }
                }, 1000);
            },
            error: (err: any) => {
                this.status = 'idle';
                const msg = err.error?.detail || err.message || "Upload failed";
                this.error = "Failed: " + msg;
                this.addLog("Error: " + msg);
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
                this.addLog("Prediction success.");
                setTimeout(() => {
                    this.status = 'idle';
                    this.router.navigate(['/review'], { state: { prediction: res } });
                }, 500);
            },
            error: (err: any) => {
                this.status = 'idle';
                this.error = "Prediction failed: " + (err.error?.detail || err.message);
            }
        });
    }

    // --- Logging ---
    startLogPolling() {
        this.stopLogPolling();
        this.logSub = interval(1000).pipe(
            switchMap(() => this.api.getLogs())
        ).subscribe({
            next: (res) => {
                if (res.logs && res.logs.length > 0) {
                    this.devLogs = this.processBackendLogs(res.logs);

                    // Check if finished
                    if (res.logs[res.logs.length - 1].includes("Reloading model")) {
                        this.status = 'ready';
                        this.statusTitle = 'Training Complete';
                        this.statusMessage = 'Model updated.';
                        this.stopLogPolling();
                        this.progressPercent = 100;
                        setTimeout(() => this.status = 'idle', 3000);
                    }
                }
            }
        });
    }

    processBackendLogs(logs: string[]): LogEntry[] {
        // Process raw strings into grouped entries
        const entries: LogEntry[] = [];

        for (const line of logs) {
            let type: 'info' | 'error' | 'success' | 'warn' = 'info';
            const lower = line.toLowerCase();
            if (lower.includes('error') || lower.includes('fail')) type = 'error';
            else if (lower.includes('success') || lower.includes('complete')) type = 'success';
            else if (lower.includes('warn') || lower.includes('reloading')) type = 'warn';

            if (entries.length > 0 && entries[entries.length - 1].msg === line) {
                entries[entries.length - 1].count++;
            } else {
                entries.push({
                    msg: line,
                    count: 1,
                    time: '',
                    type
                });
            }
        }
        return entries.reverse();
    }

    stopLogPolling() {
        if (this.logSub) {
            this.logSub.unsubscribe();
            this.logSub = null;
        }
    }

    // --- Resizing Logic ---
    startResizeSidebar(e: MouseEvent) {
        e.preventDefault();
        this.isResizingSidebar = true;
    }

    startResizeConsole(e: MouseEvent) {
        e.preventDefault();
        this.isResizingConsole = true;
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(e: MouseEvent) {
        if (this.isResizingSidebar) {
            this.sidebarWidth = Math.max(200, Math.min(e.clientX, 600)); // Clamp 200-600
        }
        if (this.isResizingConsole) {
            const containerHeight = window.innerHeight;
            const newHeight = containerHeight - e.clientY;
            this.consoleHeight = Math.max(100, Math.min(newHeight, 800)); // Clamp 100-800
        }
    }

    @HostListener('document:mouseup')
    onMouseUp() {
        this.isResizingSidebar = false;
        this.isResizingConsole = false;
    }
}
