import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, PredictionResult } from '../../core/services/api.service';
import { ReviewQueueService, ReviewItem } from '../../core/services/review-queue.service';
import { switchMap, Subscription } from 'rxjs';
import { ToastService } from '../../core/services/toast.service';
import { Router } from '@angular/router';

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

    private normalizeClassName(cls: string): string {
        const lower = cls.toLowerCase();
        if (lower === 'dandelion') return 'Dandelion';
        if (lower === 'hydrangea') return 'Hydrangea';
        return cls;
    }

    private loadImage(url: string) {
        this.image.crossOrigin = "anonymous";
        let fullUrl = url.startsWith('/') ? `http://localhost:8000${url}` : url;
        this.image.src = fullUrl + (fullUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        this.image.onload = () => this.redraw();
        if (this.image.complete && this.image.width > 0) this.redraw();
    }

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
        ctx.drawImage(this.image, 0, 0);

        if (this.prediction) {
            this.prediction.detections.forEach((det: any, i: number) => {
                if (det.ignore) return;

                const [x1, y1, x2, y2] = det.box;
                const cls = det.class;
                const color = this.getClassColor(cls);

                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(4, this.image.width * 0.005);
                
                // For manual labels, maybe distinct
                if (det.isManual) {
                    ctx.setLineDash([10, 10]);
                } else {
                    ctx.setLineDash([]);
                }
                
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.setLineDash([]);

                const fontSize = Math.max(16, this.image.width * 0.02);
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

        // Draw the temporary rect if actively drawing
        if (this.isDrawing) {
            ctx.strokeStyle = this.classNames.length ? this.getClassColor(this.classNames[0]) : '#10b981';
            ctx.lineWidth = Math.max(2, this.image.width * 0.003);
            ctx.setLineDash([10, 10]);
            const w = this.currentDrawX - this.drawStartX;
            const h = this.currentDrawY - this.drawStartY;
            ctx.strokeRect(this.drawStartX, this.drawStartY, w, h);
            ctx.setLineDash([]);
        }
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

    getEventCoords(e: MouseEvent) {
        const canvas = this.canvas.nativeElement;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    startDraw(e: MouseEvent) {
        if (!e.ctrlKey || this.isLoading || this.isTestMode) return;
        const coords = this.getEventCoords(e);
        this.isDrawing = true;
        this.drawStartX = coords.x;
        this.drawStartY = coords.y;
        this.currentDrawX = coords.x;
        this.currentDrawY = coords.y;
    }

    onDraw(e: MouseEvent) {
        if (!this.isDrawing) return;
        const coords = this.getEventCoords(e);
        this.currentDrawX = coords.x;
        this.currentDrawY = coords.y;
        this.redraw();
    }

    endDraw(e: MouseEvent) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        const coords = this.getEventCoords(e);
        
        const x1 = Math.min(this.drawStartX, coords.x);
        const y1 = Math.min(this.drawStartY, coords.y);
        const x2 = Math.max(this.drawStartX, coords.x);
        const y2 = Math.max(this.drawStartY, coords.y);

        // Filter out accidental clicks
        if (x2 - x1 > 5 && y2 - y1 > 5) {
            if (!this.prediction) {
                // Should exist but just in case
                return;
            }
            
            this.prediction.detections.push({
                class: this.classNames[0] || 'Unknown',
                confidence: 1.0,
                box: [x1, y1, x2, y2],
                ignore: false,
                isManual: true
            });
            this.highlightedIndex = this.prediction.detections.length - 1;
        }
        
        this.redraw();
    }

    cancelDraw() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.redraw();
        }
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
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
            this.reject();
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
        if (event.key === 'Control') {
            this.isCtrlPressed = false;
        }
    }

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

    reject() {
        if (!this.current || this.isLoading) return;
        this.reviewQueue.updateCurrentItem({ status: 'rejected' });
        const stats = this.queueStats;
        if (stats.current >= stats.total) {
            this.router.navigate(['/upload']);
        } else {
            this.reviewQueue.next();
        }
    }

    markAll(correct: boolean) {
        if (this.prediction && !this.isLoading) {
            this.prediction.detections.forEach((d: any) => d.ignore = !correct);
            this.redraw();
            if (correct) {
                this.accept();
            } else {
                this.showToast("All items ignored.");
            }
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
