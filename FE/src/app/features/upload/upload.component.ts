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
    unrefinedCount = 0;

    // Training Settings
    trainEpochs = 40;
    trainImgsz = 960;
    trainModel = 'yolov8n.pt';
    isFreshStart = false;

    // Mode Toggle: train (with review/labeling) vs test (direct inference results)
    appMode: 'train' | 'test' = 'train';
    testConfidence = 0.25;

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

    // Modal State
    showImportModal = false;
    showMaintenanceModal = false;
    pendingZipFile: File | null = null;

    constructor(
        public api: ApiService,
        private router: Router,
        public reviewQueue: ReviewQueueService
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
        // Restore persistsed mode
        const savedMode = localStorage.getItem('plantpilot_app_mode');
        if (savedMode === 'train' || savedMode === 'test') {
            this.appMode = savedMode;
        }

        // Restore parameters
        this.trainEpochs = Number(localStorage.getItem('plantpilot_train_epochs')) || 40;
        this.trainImgsz = Number(localStorage.getItem('plantpilot_train_imgsz')) || 960;

        // Smarter default: if we have runs, default to resume from best.pt
        const savedModel = localStorage.getItem('plantpilot_train_model');
        this.trainModel = savedModel || 'yolov8n.pt';

        this.testConfidence = Number(localStorage.getItem('plantpilot_test_conf')) || 0.25;

        this.statusPollSub = interval(5000).pipe(
            startWith(0),
            switchMap(() => this.api.getRuns())
        ).subscribe({
            next: (res: any) => {
                this.runs = res.runs;
                this.manifest = res.manifest;

                // Sync Dataset Stats from Manifest and Run Args
                const current = res.runs.find((r: any) => r.kind === 'current');
                const best = res.runs.find((r: any) => r.name === 'best.pt');

                // 1. Extract Number of Classes
                if (current?.args?.nc) {
                    this.datasetClasses = current.args.nc.toString();
                } else if (res.manifest && res.manifest.length > 0) {
                    const lastMeta = [...res.manifest].reverse().find(m => m.nc);
                    if (lastMeta) this.datasetClasses = lastMeta.nc.toString();
                }

                this.unrefinedCount = res.unrefined_count || 0;

                // 2. Extract Total Image Count
                if (res.manifest && res.manifest.length > 0) {
                    const lastCount = [...res.manifest].reverse().find(m => m.total_images);
                    if (lastCount) this.datasetImages = lastCount.total_images.toString();
                }

                // 3. Update Model Status Display
                if (current) {
                    this.currentModelName = current.name;
                } else if (best) {
                    this.currentModelName = 'best.pt (Refined)';
                    if (!localStorage.getItem('plantpilot_train_model')) {
                        this.trainModel = 'best.pt';
                    }
                } else {
                    this.currentModelName = 'Base Model (Unrefined)';
                }

                this.runCount = res.runs.length;
                this.lastUpdate = new Date().toLocaleTimeString();
            },
            error: () => {
                this.currentModelName = 'yolov8s.pt (Fallback)';
            }
        });
    }

    setMode(mode: 'train' | 'test') {
        this.appMode = mode;
        localStorage.setItem('plantpilot_app_mode', mode);
    }

    saveParams() {
        localStorage.setItem('plantpilot_train_epochs', this.trainEpochs.toString());
        localStorage.setItem('plantpilot_train_imgsz', this.trainImgsz.toString());
        localStorage.setItem('plantpilot_train_model', this.trainModel);
        localStorage.setItem('plantpilot_test_conf', this.testConfidence.toString());
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

        if (this.appMode === 'train') {
            // Training Mode logic
            const zipFile = files.find(f => f.name.endsWith('.zip'));
            if (zipFile) {
                if (files.length > 1) {
                    this.error = 'Please upload only one ZIP file at a time for training.';
                    return;
                }
                this.addLog("ZIP file dropped: " + zipFile.name);
                this.pendingZipFile = zipFile;
                this.showImportModal = true;
                return;
            }

            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                this.addLog(`Queueing ${imageFiles.length} images for ACTIVE LEARNING.`);
                this.reviewQueue.setFiles(imageFiles);
                this.router.navigate(['/review'], { state: { testMode: false, conf: this.testConfidence } });
            } else {
                this.error = 'Drop a ZIP for project init or Images for active learning.';
            }
        } else {
            // TEST Mode logic
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length === 0) {
                this.error = 'Test mode requires image files (.jpg, .png). ZIPs are for training.';
                return;
            }

            this.addLog(`Testing model with ${imageFiles.length} items...`);
            this.reviewQueue.setFiles(imageFiles);
            this.router.navigate(['/review'], { state: { testMode: true, conf: this.testConfidence } });
        }
    }

    // --- Process Flow ---
    startZipFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = this.isFreshStart ? 'Resetting & Initializing' : 'Initializing Project';
        this.statusMessage = 'Uploading...';
        this.progressPercent = 10;
        this.extractedCount = 0;

        // Sequence: Reset (Optional) -> Init -> Poll Logs
        const flow$ = this.isFreshStart
            ? this.api.resetProject().pipe(switchMap(() => this.api.initProject(file, this.trainEpochs, this.trainImgsz, this.trainModel)))
            : this.api.initProject(file, this.trainEpochs, this.trainImgsz, this.trainModel);

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
                this.error = "Faled: " + msg;
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

                    // --- Real-time Stage Detection ---
                    const latestLog = res.logs[res.logs.length - 1];
                    const lowerLog = latestLog.toLowerCase();

                    if (lowerLog.includes("unpacking") || lowerLog.includes("extracting")) {
                        this.statusMessage = "Stage 1/5: Unpacking & Preparing Dataset...";
                    } else if (lowerLog.includes("scanning") || lowerLog.includes("validation")) {
                        this.statusMessage = "Stage 2/5: Validating Annotations...";
                    } else if (lowerLog.includes("initial") || lowerLog.includes("weights")) {
                        this.statusMessage = "Stage 3/5: Initializing YOLO Weights...";
                    } else if (lowerLog.includes("epoch")) {
                        // Extract "Epoch X/Y" if possible
                        const match = latestLog.match(/epoch\s+(\d+\/\d+)/i);
                        const progress = match ? ` (${match[1]})` : "";
                        this.statusMessage = `Stage 4/5: Active Training${progress}...`;
                    } else if (lowerLog.includes("fusing") || lowerLog.includes("results")) {
                        this.statusMessage = "Stage 5/5: Finalizing & Saving Best Model...";
                    }

                    // Check if finished (Scan last 5 lines for robustness)
                    const logTail = res.logs.slice(-5).join(" ").toLowerCase();
                    if (logTail.includes("reloading model") || logTail.includes("training completed successfully")) {
                        this.status = 'ready';
                        this.statusTitle = 'Training Complete';
                        this.statusMessage = 'AWAITING DISPATCH: Model updated successfully.';
                        this.stopLogPolling();
                        this.progressPercent = 100;
                        setTimeout(() => this.status = 'idle', 5000);
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

    openProjectReset() {
        this.showMaintenanceModal = true;
    }

    archiveProject() {
        this.api.resetProject(true).subscribe({
            next: () => {
                alert('Project archived. Workspace is clean.');
                window.location.reload();
            },
            error: (e) => alert('Archive failed: ' + e.message)
        });
    }

    wipeProject() {
        if (!confirm('PERMANENT WIPE: This will delete everything. Are you sure?')) return;
        this.api.resetProject(false).subscribe({
            next: () => {
                alert('Environment wiped.');
                window.location.reload();
            },
            error: (e) => alert('Wipe failed: ' + e.message)
        });
    }

    confirmImport(isFresh: boolean) {
        if (!this.pendingZipFile) return;
        this.isFreshStart = isFresh;
        this.showImportModal = false;
        this.startZipFlow(this.pendingZipFile);
    }
}
