import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, RunInfo } from '../../core/services/api.service';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
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
    imports: [CommonModule, FormsModule],
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

    datasetImages = '0';
    datasetClasses = '0';
    stagedImages = 0;
    stagedClasses = 0;

    // Training Settings
    trainEpochs = 40;
    trainImgsz = 960;
    trainModel = 'yolov8n.pt';
    isFreshStart = false;

    // Mode Toggle
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

    // Hardware State
    public cudaAvailable = true; 

    constructor(
        private api: ApiService,
        public router: Router, // FIXED: Public for template access
        public reviewQueue: ReviewQueueService
    ) { }

    addLog(msg: string) {
        if (this.status === 'training' && !msg.toLowerCase().includes('error')) return;

        const timestamp = new Date().toLocaleTimeString();
        let type: 'info' | 'error' | 'success' | 'warn' = 'info';

        const lower = msg.toLowerCase();
        if (lower.includes('error')) type = 'error';
        else if (lower.includes('success') || lower.includes('complete')) type = 'success';
        else if (lower.includes('warn')) type = 'warn';

        if (this.devLogs.length > 0) {
            const top = this.devLogs[0];
            if (top.msg === msg) {
                top.count++;
                top.time = timestamp;
                return;
            }
        }

        this.devLogs.unshift({ msg, count: 1, time: timestamp, type });
        if (this.devLogs.length > 200) this.devLogs.pop();
    }

    ngOnInit() {
        const savedMode = localStorage.getItem('plantpilot_app_mode');
        if (savedMode === 'train' || savedMode === 'test') {
            this.appMode = savedMode;
        }

        this.trainEpochs = Number(localStorage.getItem('plantpilot_train_epochs')) || 40;
        this.trainImgsz = Number(localStorage.getItem('plantpilot_train_imgsz')) || 960;
        const savedModel = localStorage.getItem('plantpilot_train_model');
        this.trainModel = savedModel || 'yolov8n.pt';
        this.testConfidence = Number(localStorage.getItem('plantpilot_test_conf')) || 0.25;

        // 1. Initial Data Load
        this.refreshAllData();

        // 2. Hardware Status Check
        this.api.getSystemInfo().subscribe({
            next: (res: any) => this.cudaAvailable = res.cuda_available,
            error: () => {
                this.cudaAvailable = false;
                this.addLog("⚠️ Hardware Status Unknown.");
            }
        });

        // 3. Neural Heartbeat (Detect Background Training)
        this.api.getLogs().subscribe(res => {
            if (res.logs && res.logs.length > 0) {
                const logs = res.logs.slice(-50).join('\n').toLowerCase();
                const isTraining = (logs.includes('epoch') || logs.includes('training') || logs.includes('scanning') || logs.includes('ultralytics yolo'))
                                && !logs.includes('training completed successfully')
                                && !logs.includes('rollback successful');
                
                if (isTraining) {
                    this.addLog("♻️ Recovering active training session...");
                    this.status = 'training';
                    this.statusTitle = 'Forging Neural Engine';
                    this.statusMessage = 'Refinement in progress...';
                    this.startLogPolling();
                }
            }
        });
    }

    refreshAllData() {
        this.api.getRuns().subscribe(res => this.syncRunsData(res));
        this.api.getStagedStats().subscribe(res => {
            this.stagedImages = res.images;
        });
        
        // Fetch actual neural classes from the model
        this.api.getClasses().subscribe({
            next: (res) => {
                this.datasetClasses = res.classes.length.toString();
                this.stagedClasses = res.classes.length; // Assume same taxonomy for now
            },
            error: () => console.warn("Failed to fetch model classes.")
        });
    }

    reviveReview() {
        this.addLog("📥 Reviving pending review session...");
        this.api.getPendingImages().subscribe({
            next: (res) => {
                if (res.files && res.files.length > 0) {
                    this.addLog(`Loaded ${res.files.length} images from server queue.`);
                    this.reviewQueue.setRemoteFiles(res.files);
                    this.router.navigate(['/review'], { state: { testMode: false } });
                } else {
                    this.addLog("⚠️ No pending images found on server.");
                }
            },
            error: (err) => {
                this.error = "Revive failed: " + (err.error?.detail || err.message);
            }
        });
    }

    private syncRunsData(res: any) {
        this.runs = res.runs;
        this.manifest = res.manifest;

        const current = res.runs.find((r: any) => r.kind === 'current');
        const best = res.runs.find((r: any) => r.name === 'best.pt');

        if (current?.args?.nc) {
            this.datasetClasses = current.args.nc.toString();
        } else if (res.manifest && res.manifest.length > 0) {
            const lastMeta = [...res.manifest].reverse().find((m: any) => m.nc);
            if (lastMeta) this.datasetClasses = lastMeta.nc.toString();
        }

        if (res.manifest && res.manifest.length > 0) {
            const lastCount = [...res.manifest].reverse().find((m: any) => m.total_images);
            if (lastCount) this.datasetImages = lastCount.total_images.toString();
        }

        this.currentModelName = current ? current.name : (best ? 'best.pt (Refined)' : 'Base Model');
        this.runCount = res.runs.length;
        this.lastUpdate = new Date().toLocaleTimeString();
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
        this.stopLogPolling();
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
        this.isDragOver = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        this.isDragOver = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
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
            const zipFile = files.find(f => f.name.endsWith('.zip'));
            if (zipFile) {
                this.startZipFlow(zipFile);
                return;
            }

            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                this.addLog(`Queueing ${imageFiles.length} images for ACTIVE LEARNING.`);
                this.reviewQueue.setFiles(imageFiles);
                this.router.navigate(['/review'], { state: { testMode: false, conf: this.testConfidence } });
            }
        } else {
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                this.addLog(`Testing model with ${imageFiles.length} items...`);
                this.reviewQueue.setFiles(imageFiles);
                this.router.navigate(['/review'], { state: { testMode: true, conf: this.testConfidence } });
            }
        }
    }

    startZipFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = 'Initializing Project';
        this.statusMessage = 'Uploading...';
        this.progressPercent = 10;

        this.api.initProject(file, this.trainEpochs, this.trainImgsz, this.trainModel).subscribe({
            next: () => {
                this.progressPercent = 30;
                this.status = 'training';
                this.statusTitle = 'Training in Progress';
                this.statusMessage = 'Streaming logs...';
                this.startLogPolling();
            },
            error: (err) => {
                this.status = 'idle';
                this.error = "Init failed: " + (err.error?.detail || err.message);
            }
        });
    }

    startLogPolling() {
        this.stopLogPolling();
        this.logSub = interval(1000).pipe(
            switchMap(() => this.api.getLogs())
        ).subscribe({
            next: (res) => {
                if (res.logs && res.logs.length > 0) {
                    this.devLogs = this.processBackendLogs(res.logs);
                    const latestLog = res.logs[res.logs.length - 1].toLowerCase();
                    const logTail = res.logs.slice(-5).join(" ").toLowerCase();

                    // --- Real-time Stage Detection ---
                    if (logTail.includes("unpacking") || logTail.includes("extracting")) {
                        this.statusMessage = "Stage 1/5: Unpacking & Preparing Dataset...";
                        this.progressPercent = 15;
                    } else if (logTail.includes("scanning") || logTail.includes("validation")) {
                        this.statusMessage = "Stage 2/5: Validating Annotations...";
                        this.progressPercent = 30;
                    } else if (logTail.includes("initial") || logTail.includes("weights") || logTail.includes("igniting")) {
                        this.statusMessage = "Stage 3/5: Initializing YOLO Weights...";
                        this.progressPercent = 45;
                    } else if (logTail.includes("epoch")) {
                        const match = logTail.match(/epoch\s+(\d+\/\d+)/i);
                        this.statusMessage = `Stage 4/5: Active Training${match ? ' ('+match[1]+')' : ''}...`;
                        this.progressPercent = 60; // Base progress for training stage
                    } else if (logTail.includes("fusing") || logTail.includes("saving")) {
                        this.statusMessage = "Stage 5/5: Finalizing & Saving Best Model...";
                        this.progressPercent = 90;
                    }

                    if (logTail.includes("training completed successfully")) {
                        this.stopLogPolling();
                        this.statusMessage = "Refinement Successful. Model updated.";
                        this.progressPercent = 100;
                        this.refreshAllData();
                        setTimeout(() => this.status = 'idle', 5000);
                    }
                }
            }
        });
    }

    processBackendLogs(logs: string[]): LogEntry[] {
        const entries: LogEntry[] = [];
        for (const line of logs) {
            let type: 'info' | 'error' | 'success' | 'warn' = 'info';
            const lower = line.toLowerCase();
            if (lower.includes('error')) type = 'error';
            else if (lower.includes('complete')) type = 'success';
            else if (lower.includes('warn')) type = 'warn';

            if (entries.length > 0 && entries[entries.length - 1].msg === line) {
                entries[entries.length - 1].count++;
            } else {
                entries.push({ msg: line, count: 1, time: '', type });
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

    openProjectReset(archive: boolean = true) {
        this.status = 'initializing';
        this.statusTitle = archive ? 'Archiving Project' : 'Purging Environment';
        this.api.resetProject(archive).subscribe({
            next: () => {
                this.status = 'idle';
                this.datasetImages = '0';
                this.datasetClasses = '0';
                this.stagedImages = 0;
                this.stagedClasses = 0;
                this.runCount = 0;
                this.reviewQueue.clear();
                this.refreshAllData();
            },
            error: (err) => {
                this.status = 'idle';
                this.error = "Action failed: " + (err.error?.detail || err.message);
            }
        });
    }

    triggerManualRefinement() {
        if (!confirm('🚀 START MANUAL REFINEMENT: Trigger neural training on all active labels?')) return;
        
        this.status = 'training';
        this.statusTitle = 'Forging Neural Engine';
        this.statusMessage = 'Manually dispatched refinement...';
        this.progressPercent = 10;
        
        this.api.triggerTraining(this.trainEpochs, this.trainImgsz, this.trainModel).subscribe({
            next: () => {
                this.addLog("✅ Manual refinement dispatched successfully.");
                this.startLogPolling();
            },
            error: (err) => {
                this.status = 'idle';
                this.error = "Refinement failed: " + (err.error?.detail || err.message);
            }
        });
    }

    flushStagedData() {
        if (!confirm('🧼 FLUSH STAGING: Clear all pending images and start fresh?')) return;
        
        this.api.flushStaged().subscribe({
            next: () => {
                this.addLog("🧼 Staging folder cleared.");
                this.refreshAllData();
            },
            error: (err) => {
                this.error = "Flush failed: " + (err.error?.detail || err.message);
            }
        });
    }
}
