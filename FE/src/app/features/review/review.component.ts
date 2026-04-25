import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, PredictionResult } from '../../core/services/api.service';
import { ReviewQueueService, ReviewItem } from '../../core/services/review-queue.service';
import { switchMap, Subscription } from 'rxjs';
import { ToastService } from '../../core/services/toast.service';
import { Router } from '@angular/router';

/**
 * ReviewComponent handles the active learning human-in-the-loop workflow.
 * Renders model inferences on a canvas, allows users to accept/reject items,
 * and supports manual annotation for missed bounding boxes.
 */
@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './review.component.html',
    styleUrls: ['./review.component.scss']
})
export class ReviewComponent implements OnInit, OnDestroy {
    @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
    // Redraw trigger comment

    current: ReviewItem | null = null;
    prediction: PredictionResult | null = null;
    image = new Image();
    private sub: Subscription | null = null;

    isLoading = false;
    isTestMode = false;
    toastMessage: string | null = null;
    highlightedIndex: number | null = null;
    private toastTimeout: any;
    private highlightTimeout: any;

    classOptions = ['Dandelion', 'Hydrangea'];
    classNames = ['Dandelion', 'Hydrangea'];

    lastSelectedClass: string | null = null;
    isAddingNewClass: boolean = false;
    newClassName: string = '';
    targetDetectionForNewClass: any = null;

    constructor(
        private api: ApiService,
        private reviewQueue: ReviewQueueService,
        private toast: ToastService,
        private router: Router
    ) { }

    isDrawing = false;
    isCtrlPressed = false;
    drawStartX = 0;
    drawStartY = 0;
    currentDrawX = 0;
    currentDrawY = 0;

    // Zoom & Pan State
    zoomScale = 1;
    offsetX = 0;
    offsetY = 0;
    isPanning = false;
    isSpacePressed = false;
    panStartX = 0;
    panStartY = 0;

    classColors = [
        '#f59e0b', // amber-500
        '#3b82f6', // blue-500
        '#10b981', // emerald-500
        '#ef4444', // red-500
        '#8b5cf6', // violet-500
        '#ec4899', // pink-500
        '#14b8a6', // teal-500
        '#f97316', // orange-500
    ];

    getClassColor(className: string): string {
        const index = this.classNames.findIndex(c => c.toLowerCase() === className.toLowerCase());
        if (index === -1) return '#94a3b8'; // fallback slate-400
        return this.classColors[index % this.classColors.length];
    }

    ngOnInit() {
        this.api.getClasses().subscribe({
            next: (res) => {
                if (res.classes && res.classes.length > 0) {
                    this.classNames = res.classes;
                    this.classOptions = res.classes;
                    
                    // Retroactively patch racing conditions if the model prediction arrived strictly before the global class list loaded:
                    if (this.prediction?.detections) {
                        this.prediction.detections.forEach(det => {
                            det.class = this.normalizeClassName(det.class);
                        });
                        this.redraw();
                    }
                }
            },
            error: (err) => console.warn('Could not fetch classes:', err)
        });

        const state = window.history.state;
        if (state) {
            this.isTestMode = !!state.testMode;
        }

        const initial = this.reviewQueue.currentItem$.value;
        if (initial) {
            this.current = initial;
            this.loadPrediction(initial);
        } else {
            // Graceful fallback if user explicitly refreshed page natively dropping RAM
            this.router.navigate(['/upload']);
        }

        this.sub = this.reviewQueue.currentItem$.subscribe((item: ReviewItem | null) => {
            if (item && item !== this.current) {
                this.current = item;
                this.loadPrediction(item);
            }
        });
    }

    ngOnDestroy() {
        if (this.sub) this.sub.unsubscribe();
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
    }

    get queueStats() {
        return this.reviewQueue.getStats();
    }

    runPrediction(item: ReviewItem) {
        this.loadPrediction(item);
    }

    private loadPrediction(item: ReviewItem) {
        if (!item.file) return;
        this.isLoading = true;
        this.prediction = null;

        this.api.predict(item.file).subscribe({
            next: (res: any) => {
                this.isLoading = false;
                res.detections = res.detections.map((d: any) => ({
                    ...d,
                    class: this.normalizeClassName(d.class),
                    ignore: false
                }));
                this.prediction = res;
                this.loadImage(res.url);
            },
            error: () => {
                this.isLoading = false;
                this.showToast('Inference Error');
                this.reviewQueue.updateCurrentItem({ error: 'System error. Please skip or retry.' });
            }
        });
    }

    resetZoom() {
        this.zoomScale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.redraw();
    }

    zoomIn() {
        this.setZoom(this.zoomScale * 1.5);
    }

    zoomOut() {
        this.setZoom(this.zoomScale / 1.5);
    }

    setZoom(newZoom: number, focusX?: number, focusY?: number) {
        if (!this.canvas) return;
        newZoom = Math.max(1, Math.min(newZoom, 8));
        
        let cx = focusX;
        let cy = focusY;
        if (cx === undefined || cy === undefined) {
             const rect = this.canvas.nativeElement.getBoundingClientRect();
             cx = (rect.width * (this.canvas.nativeElement.width / rect.width)) / 2;
             cy = (rect.height * (this.canvas.nativeElement.height / rect.height)) / 2;
        }

        const newOffsetX = cx - (cx - this.offsetX) * (newZoom / this.zoomScale);
        const newOffsetY = cy - (cy - this.offsetY) * (newZoom / this.zoomScale);
        
        this.zoomScale = newZoom;
        this.offsetX = newOffsetX;
        this.offsetY = newOffsetY;
        this.constrainPan();
        this.redraw();
    }

    constrainPan() {
        if (this.zoomScale === 1) {
            this.offsetX = 0;
            this.offsetY = 0;
            return;
        }
        const canvas = this.canvas.nativeElement;
        // The bounds of offsets depend on zoomed boundaries minus canvas width
        const minOffsetX = canvas.width - (canvas.width * this.zoomScale);
        const minOffsetY = canvas.height - (canvas.height * this.zoomScale);
        
        this.offsetX = Math.min(0, Math.max(minOffsetX, this.offsetX));
        this.offsetY = Math.min(0, Math.max(minOffsetY, this.offsetY));
    }

    private normalizeClassName(cls: string): string {
        const lower = cls.toLowerCase();
        // Dynamically find exact-case match inside the currently loaded dropdown arrays
        const exactMatch = this.classNames.find(c => c.toLowerCase() === lower);
        return exactMatch ? exactMatch : cls;
    }

    private loadImage(url: string) {
        this.image.crossOrigin = "anonymous";
        let fullUrl = url.startsWith('/') ? `http://localhost:8000${url}` : url;
        this.image.src = fullUrl + (fullUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        this.image.onload = () => this.redraw();
        if (this.image.complete && this.image.width > 0) this.redraw();
    }

    /**
     * Redraws the primary active canvas utilizing HTML5 `getContext('2d')`.
     * Forces boxes to conform visually to their internally dynamic class mappings.
     */
    redraw() {
        if (!this.canvas || !this.image.width) return;
        const ctx = this.canvas.nativeElement.getContext('2d');
        if (!ctx) return;

        const canvas = this.canvas.nativeElement;

        if (canvas.width !== this.image.width || canvas.height !== this.image.height) {
            canvas.width = this.image.width;
            canvas.height = this.image.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoomScale, this.zoomScale);

        ctx.drawImage(this.image, 0, 0);

        if (this.prediction) {
            this.prediction.detections.forEach((det: any, i: number) => {
                if (det.ignore) return;

                const [x1, y1, x2, y2] = det.box;
                const cls = det.class;
                const color = this.getClassColor(cls);

                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(2, (this.image.width * 0.005) / this.zoomScale);
                
                if (det.isManual) {
                    ctx.setLineDash([10 / this.zoomScale, 10 / this.zoomScale]);
                } else {
                    ctx.setLineDash([]);
                }
                
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.setLineDash([]);

                const fontSize = Math.max(12, (this.image.width * 0.02) / this.zoomScale);
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                const text = `${i + 1}. ${det.class}`;
                const pad = fontSize * 0.5;
                const textMetrics = ctx.measureText(text);

                ctx.fillStyle = color;
                ctx.fillRect(x1, y1 - fontSize - pad * 1.5, textMetrics.width + pad * 2, fontSize + pad * 2);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, x1 + pad, y1 - pad * 0.5);
            });
        }

        if (this.isDrawing) {
            ctx.strokeStyle = this.classNames.length ? this.getClassColor(this.classNames[0]) : '#10b981';
            ctx.lineWidth = Math.max(1, (this.image.width * 0.003) / this.zoomScale);
            ctx.setLineDash([10 / this.zoomScale, 10 / this.zoomScale]);
            const w = this.currentDrawX - this.drawStartX;
            const h = this.currentDrawY - this.drawStartY;
            ctx.strokeRect(this.drawStartX, this.drawStartY, w, h);
            ctx.setLineDash([]);
        }
        
        ctx.restore();
    }

    toggleIgnore(det: any) {
        det.ignore = !det.ignore;
        this.redraw();
    }

    deleteDetection(index: number) {
        if (this.prediction && this.prediction.detections) {
            this.prediction.detections.splice(index, 1);
            this.redraw();
        }
    }

    /**
     * Converts the box drawn on the scaled UI image back to the original image size.
     * YOLO training needs coordinates based on the real image dimensions, not the
     * displayed browser size.
     */
    getCanvasCoords(e: MouseEvent) {
        const canvas = this.canvas.nativeElement;
        const rect = canvas.getBoundingClientRect();
        
        // Account for object-contain letterboxing natively
        const xRatio = rect.width / canvas.width;
        const yRatio = rect.height / canvas.height;
        const renderRatio = Math.min(xRatio, yRatio);
        
        const renderedWidth = canvas.width * renderRatio;
        const renderedHeight = canvas.height * renderRatio;
        const boundOffsetX = (rect.width - renderedWidth) / 2;
        const boundOffsetY = (rect.height - renderedHeight) / 2;
        
        return {
            x: (e.clientX - rect.left - boundOffsetX) / renderRatio,
            y: (e.clientY - rect.top - boundOffsetY) / renderRatio
        };
    }

    getEventCoords(e: MouseEvent) {
        const c = this.getCanvasCoords(e);
        return {
            x: (c.x - this.offsetX) / this.zoomScale,
            y: (c.y - this.offsetY) / this.zoomScale
        };
    }
    
    onWheel(e: WheelEvent) {
        if(e.target !== this.canvas?.nativeElement) return;
        e.preventDefault(); 
        
        const zoomDelta = e.deltaY < 0 ? 1.2 : 0.8;
        const c = this.getCanvasCoords(e as MouseEvent);
        this.setZoom(this.zoomScale * zoomDelta, c.x, c.y);
    }

    onMouseDown(e: MouseEvent) {
        if (this.isSpacePressed || e.button === 1) { // Middle click or Space
            e.preventDefault();
            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            return;
        }

        if (e.ctrlKey && !this.isLoading && !this.isTestMode) {
            const coords = this.getEventCoords(e);
            this.isDrawing = true;
            this.drawStartX = coords.x;
            this.drawStartY = coords.y;
            this.currentDrawX = coords.x;
            this.currentDrawY = coords.y;
        }
    }

    onMouseMove(e: MouseEvent) {
        if (this.isPanning) {
            const canvas = this.canvas.nativeElement;
            const rect = canvas.getBoundingClientRect();
            // Scale drag distances to native canvas resolution
            const renderRatio = Math.min(rect.width / canvas.width, rect.height / canvas.height);
            
            const dx = (e.clientX - this.panStartX) / renderRatio;
            const dy = (e.clientY - this.panStartY) / renderRatio;
            
            this.offsetX += dx;
            this.offsetY += dy;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            this.constrainPan();
            this.redraw();
            return;
        }

        if (this.isDrawing) {
            const coords = this.getEventCoords(e);
            this.currentDrawX = coords.x;
            this.currentDrawY = coords.y;
            this.redraw();
        }
    }

    onMouseUp(e: MouseEvent) {
        if (this.isPanning) {
            this.isPanning = false;
            return;
        }

        if (this.isDrawing) {
            this.isDrawing = false;
            const coords = this.getEventCoords(e);
            
            const x1 = Math.min(this.drawStartX, coords.x);
            const y1 = Math.min(this.drawStartY, coords.y);
            const x2 = Math.max(this.drawStartX, coords.x);
            const y2 = Math.max(this.drawStartY, coords.y);

            // Filter out accidental clicks
            if (x2 - x1 > 5 && y2 - y1 > 5 && this.prediction) {
                this.prediction.detections.push({
                    class: this.lastSelectedClass || (this.classNames[0] || 'Unknown'),
                    confidence: 1.0,
                    box: [x1, y1, x2, y2],
                    ignore: false,
                    isManual: true
                });
                this.highlightedIndex = this.prediction.detections.length - 1;
            }
            
            this.redraw();
        }
    }

    onMouseLeave(e: MouseEvent) {
        this.isPanning = false;
        if (this.isDrawing) {
            this.isDrawing = false;
            this.redraw();
        }
    }

    onClassChange(det: any, event: any) {
        if (det.class === '__ADD_NEW__') {
            this.isAddingNewClass = true;
            this.newClassName = '';
            this.targetDetectionForNewClass = det;
            det.class = this.lastSelectedClass || (this.classNames[0] || 'Unknown');
        } else {
            this.lastSelectedClass = det.class;
            this.redraw();
        }
    }

    confirmNewClass() {
        const trimmed = this.newClassName.trim();
        if (trimmed) {
            if (!this.classNames.includes(trimmed)) {
                this.classNames.push(trimmed);
            }
            if (this.targetDetectionForNewClass) {
                this.targetDetectionForNewClass.class = trimmed;
                this.lastSelectedClass = trimmed;
            }
        }
        this.isAddingNewClass = false;
        this.targetDetectionForNewClass = null;
        this.redraw();
    }

    cancelNewClass() {
        this.isAddingNewClass = false;
        this.targetDetectionForNewClass = null;
        this.redraw();
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if (event.code === 'Space') {
            this.isSpacePressed = true;
            if((event.target as HTMLElement)?.tagName !== 'INPUT') {
                event.preventDefault(); // prevent scroll
            }
        }
        
        if (event.key === 'Control') {
            this.isCtrlPressed = true;
        }

        if (this.isLoading) return;

        const key = event.key.toLowerCase();
        
        // 1-9 for Class Assignment or Toggling
        const num = parseInt(key);
        if (!isNaN(num) && num > 0) {
            // If user is hovering over a detection or we have a single detection, change class?
            // Existing logic: toggles ignore.
            // New logic: If there are classes, maybe shift+number changes class?
            // Actually, let's keep it simple: 1-9 toggles ignore for detection #N
            // And maybe Q, W, E for class assignment of the "highlighted" one?
            
            if (this.prediction?.detections && num <= this.prediction.detections.length) {
                this.highlightedIndex = num - 1;
                this.toggleIgnore(this.prediction.detections[num - 1]);
                if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
                this.highlightTimeout = setTimeout(() => this.highlightedIndex = null, 800);
                return;
            }
        }

        // Navigation & Batch
        if (key === 'arrowleft' || key === 'a' || key === 'backspace') {
            this.skip();
        } else if (key === 'arrowright' || key === 'd' || key === 'enter') {
            this.accept();
        } else if (key === 'c' || key === 'y') {
            this.markAll(true);
        } else if (key === 'x' || key === 'n') {
            this.markAll(false);
        } else if (key === 'm' || key === 'escape') {
            this.goBack();
        }
    }

    @HostListener('window:keyup', ['$event'])
    handleKeyUp(event: KeyboardEvent) {
        if (event.code === 'Space') {
            this.isSpacePressed = false;
        }
        if (event.key === 'Control') {
            this.isCtrlPressed = false;
        }
    }

    /**
     * Accepts and submits all non-ignored detections directly to the backend
     * staging queues to be natively formatted and merged into the training sequence.
     * Safely rolls the active queue forward automatically on completion!
     */
    accept() {
        if (this.isLoading) return;
        
        try {
            if (!this.prediction) {
                console.warn("[Review] Prediction missing, forcing dashboard return.");
                this.router.navigate(['/upload']);
                return;
            }

            this.isLoading = true;
            this.showToast('Saving & Refining...');

            const filename = (this.prediction as any).filename || 'unknown.jpg';
            const validDetections = this.prediction.detections.filter((d: any) => !d.ignore);
            
            // Mark as done in the queue
            if (this.current) {
                this.reviewQueue.updateCurrentItem({ status: 'accepted' });
            }

            // Save Annotation for the current image first
            const w = this.image.width || 0;
            const h = this.image.height || 0;
            const stats = this.queueStats;
            const isLast = stats.current >= stats.total;
            
            this.api.saveAnnotation(filename, validDetections, w, h).subscribe({
               next: () => {
                   console.log("[Review] Annotation save complete.");
                   if (isLast) {
                       console.log("[Review] Final image approved. Triggering Batch Refinement.");
                       this.api.triggerTraining().subscribe();
                       this.reviewQueue.clear();
                       this.router.navigate(['/upload']);
                   } else {
                       this.isLoading = false;
                       this.showToast('Image saved. Advancing...');
                       this.reviewQueue.next();
                   }
               },
               error: (e) => {
                   console.error("[Review] Annotation save failed", e);
                   this.isLoading = false;
                   this.showToast('Save Failed!');
               }
            });

        } catch (error) {
            console.error("[Review] Critical crash during accept, forcing exit:", error);
            this.isLoading = false;
            this.router.navigate(['/upload']);
        }
    }

    /**
     * Skips the image explicitly. Prevents any labels from saving and forces
     * the backend payload into SKIPPED_DIR without triggering iteration models natively.
     */
    skip() {
        if (!this.current || this.isLoading) return;
        this.isLoading = true;
        this.showToast('Skipping Image...');

        const filename = (this.prediction as any)?.filename || this.current.filename || 'unknown.jpg';
        
        // Predictively flag UI component to advance immediately.
        this.reviewQueue.updateCurrentItem({ status: 'rejected' });
        const stats = this.queueStats;
        const isLast = stats.current >= stats.total;

        this.api.skipImage(filename).subscribe({
            next: () => {
                if (isLast) {
                    this.reviewQueue.clear();
                    this.router.navigate(['/upload']);
                } else {
                    this.isLoading = false;
                    this.reviewQueue.next();
                }
            },
            error: (e) => {
                console.error("[Review] Gracefully skipping failed:", e);
                this.isLoading = false;
                if (isLast) {
                    this.router.navigate(['/upload']);
                } else {
                    this.reviewQueue.next();
                }
            }
        });
    }

    /**
     * Broadly toggles the ignore status safely across the active annotations array.
     * Triggers accepted pipeline automatically, sending an empty list if ALL are false.
     */
    markAll(correct: boolean) {
        if (this.prediction && !this.isLoading) {
            this.prediction.detections.forEach((d: any) => d.ignore = !correct);
            this.redraw();
            // Both "Accept All" and "Reject All" natively trigger training propagation.
            // If ALL are ignored, payload is [], creating a negative explicit sample.
            this.accept();
        }
    }

    handleNext() {
        const stats = this.queueStats;
        if (stats.current < stats.total) {
            this.reviewQueue.next();
        } else {
            this.router.navigate(['/upload']);
        }
    }

    goBack() {
        this.router.navigate(['/upload']);
    }

    private showToast(msg: string) {
        this.toastMessage = msg;
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
    }
}
