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

    // Moving Rect State
    isDraggingRect = false;
    draggedRectIndex: number | null = null;
    lastMouseX = 0;
    lastMouseY = 0;
    hoverRectIndex: number | null = null;
    activeIndex: number | null = 0;
    
    // Display Preferences
    showDefaultClasses = false;

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
                res.detections = res.detections.map((d: any) => {
                    const normalizedClass = this.normalizeClassName(d.class);
                    // Detections not strictly matching the backend taxonomy list are flagged as defaults.
                    const isCustomClass = this.classNames.some(c => c.toLowerCase() === normalizedClass.toLowerCase());
                    return {
                        ...d,
                        class: normalizedClass,
                        isDefaultYolo: !isCustomClass,
                        // Standardize initial review queues safely pushing out implicit omissions
                        reviewStatus: 'pending'
                    };
                });
                
                // Mount focus strictly onto the first logically displayed visual bounding instance natively
                this.activeIndex = res.detections.findIndex((d: any) => this.showDefaultClasses || !d.isDefaultYolo);
                if (this.activeIndex === -1 && res.detections.length) this.activeIndex = 0;

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
                // If it's a default class and the toggle is off, force hide everywhere.
                if (det.isDefaultYolo && !this.showDefaultClasses) return;
                
                // If it's skipped/wrong but NOT a default YOLO prediction we're previewing, hide standard rejected things.
                if ((det.reviewStatus === 'wrong' || det.reviewStatus === 'skipped') && !det.isDefaultYolo) return;

                const [x1, y1, x2, y2] = det.box;
                const cls = det.class;
                const textBgColor = this.getClassColor(cls);

                // Per-detection border rules based entirely on explicitly configured human actions
                let strokeColor = '#3b82f6'; // Pending (Blue/Yellow variant request, using blue-500)
                if (det.reviewStatus === 'correct') strokeColor = '#10b981'; // Green
                if (det.reviewStatus === 'wrong') strokeColor = '#ef4444'; // Red
                if (det.reviewStatus === 'skipped') strokeColor = '#64748b'; // Slate
                
                const isActive = (i === this.activeIndex);

                if (isActive) {
                    ctx.shadowColor = strokeColor;
                    ctx.shadowBlur = 10;
                    ctx.lineWidth = Math.max(3, (this.image.width * 0.006) / this.zoomScale);
                } else {
                    ctx.shadowBlur = 0;
                    ctx.lineWidth = Math.max(2, (this.image.width * 0.003) / this.zoomScale);
                }
                
                ctx.strokeStyle = strokeColor;
                
                if (det.isManual) {
                    ctx.setLineDash([10 / this.zoomScale, 10 / this.zoomScale]);
                } else {
                    ctx.setLineDash([]);
                }
                
                // Dim rejected items cleanly
                if (det.reviewStatus === 'wrong' || det.reviewStatus === 'skipped') {
                    ctx.globalAlpha = 0.4;
                }
                
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.setLineDash([]);
                ctx.shadowBlur = 0; // Prevent text blowing out

                const fontSize = Math.max(12, (this.image.width * 0.02) / this.zoomScale);
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                const text = `${i + 1}. ${det.class}${det.isDefaultYolo ? ' (Auto)' : ''}`;
                const pad = fontSize * 0.5;
                const textMetrics = ctx.measureText(text);

                ctx.fillStyle = textBgColor;
                ctx.fillRect(x1, y1 - fontSize - pad * 1.5, textMetrics.width + pad * 2, fontSize + pad * 2);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, x1 + pad, y1 - pad * 0.5);
                
                // Restore transparency
                ctx.globalAlpha = 1.0;
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

    getHoveredRectIndex(coords: {x: number, y: number}): number | null {
        if (!this.prediction) return null;
        for (let i = this.prediction.detections.length - 1; i >= 0; i--) {
            const det = this.prediction.detections[i];
            if (det.reviewStatus === 'wrong' || (!det.isManual && det.reviewStatus === 'skipped')) continue; 
            const [x1, y1, x2, y2] = det.box;
            if (coords.x >= x1 && coords.x <= x2 && coords.y >= y1 && coords.y <= y2) {
                return i;
            }
        }
        return null;
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
            return;
        }
        
        // Left click without space or ctrl
        if (e.button === 0 && !this.isLoading && !this.isTestMode) {
            const coords = this.getEventCoords(e);
            const hitIndex = this.getHoveredRectIndex(coords);
            if (hitIndex !== null && this.prediction) {
                this.isDraggingRect = true;
                this.draggedRectIndex = hitIndex;
                this.lastMouseX = coords.x;
                this.lastMouseY = coords.y;
            } else if (this.zoomScale > 1) {
                // Left click + drag on empty image area while zoomed = pan image
                e.preventDefault();
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
            }
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

        if (this.isDraggingRect && this.draggedRectIndex !== null && this.prediction) {
            const coords = this.getEventCoords(e);
            const dx = coords.x - this.lastMouseX;
            const dy = coords.y - this.lastMouseY;
            
            const det = this.prediction.detections[this.draggedRectIndex];
            det.box[0] += dx;
            det.box[1] += dy;
            det.box[2] += dx;
            det.box[3] += dy;
            
            this.lastMouseX = coords.x;
            this.lastMouseY = coords.y;
            this.redraw();
            return;
        }

        if (this.isDrawing) {
            const coords = this.getEventCoords(e);
            this.currentDrawX = coords.x;
            this.currentDrawY = coords.y;
            this.redraw();
            return;
        }
        
        // Handle hovering updates
        if (!this.isLoading && !this.isTestMode && !this.isPanning && !this.isDraggingRect && !this.isDrawing) {
            const coords = this.getEventCoords(e);
            const hitIndex = this.getHoveredRectIndex(coords);
            if (this.hoverRectIndex !== hitIndex) {
                this.hoverRectIndex = hitIndex;
            }
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
                    reviewStatus: 'pending',
                    isManual: true
                });
                // Mount active index mapping automatically onto the dynamically injected manual overlay natively
                this.activeIndex = this.prediction.detections.length - 1;
            }
            
            this.redraw();
        }
        
        if (this.isDraggingRect) {
            this.isDraggingRect = false;
            this.draggedRectIndex = null;
        }
    }

    onMouseLeave(e: MouseEvent) {
        this.isPanning = false;
        if (this.isDrawing) {
            this.isDrawing = false;
            this.redraw();
        }
        if (this.isDraggingRect) {
            this.isDraggingRect = false;
            this.draggedRectIndex = null;
        }
        this.hoverRectIndex = null;
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
            this.isLoading = true;
            this.api.addNewClass(trimmed).subscribe({
                next: () => {
                    this.isLoading = false;
                    if (!this.classNames.includes(trimmed)) {
                        this.classNames.push(trimmed);
                    }
                    if (this.targetDetectionForNewClass) {
                        this.targetDetectionForNewClass.class = trimmed;
                        this.lastSelectedClass = trimmed;
                    }
                    this.isAddingNewClass = false;
                    this.targetDetectionForNewClass = null;
                    this.redraw();
                },
                error: (err) => {
                    this.isLoading = false;
                    this.showToast('Failed to register class: ' + (err.error?.detail || err.message));
                    this.cancelNewClass();
                }
            });
        } else {
            this.cancelNewClass();
        }
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
        
        // Granular Per-Detection Keyboard Actions
        if (key === 'c' && !event.ctrlKey) {
            this.markActive('correct');
            return;
        } else if (key === 'x') {
            this.markActive('wrong');
            return;
        } else if (key === 's') {
            this.markActive('skipped');
            return;
        }
        
        // Navigation & Global Actions
        if (key === 'a' && !event.ctrlKey) {
            this.markAll(true);
        } else if (key === 'r') {
            this.markAll(false);
        } else if (key === 'enter') {
            this.accept();
        } else if (key === 'arrowleft' || key === 'backspace') {
            this.skip();
        } else if (key === 'm' || key === 'escape') {
            this.goBack();
        }
    }

    markActive(status: 'correct' | 'wrong' | 'skipped') {
        if (!this.prediction || this.activeIndex === null) return;
        const det = this.prediction.detections[this.activeIndex];
        if (!det) return;
        det.reviewStatus = status;

        // Auto advance active index towards next review item logically
        let next = this.activeIndex + 1;
        while (next < this.prediction.detections.length) {
            if (this.showDefaultClasses || !this.prediction.detections[next].isDefaultYolo) {
                this.activeIndex = next;
                break;
            }
            next++;
        }
        this.redraw();
    }
    
    setActiveIndex(index: number) {
        this.activeIndex = index;
        this.redraw();
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
            // Validation: Only mathematically proven classifications are merged! Defaults & wrong mappings explicitly destroyed.
            const validDetections = this.prediction.detections.filter((d: any) => d.reviewStatus === 'correct');
            
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
            this.prediction.detections.forEach((d: any) => {
                // Prevent hidden default YOLO items from being bulk-accepted
                if (correct && d.isDefaultYolo && !this.showDefaultClasses) {
                    return; 
                }
                d.reviewStatus = correct ? 'correct' : 'wrong';
            });
            this.redraw();
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
