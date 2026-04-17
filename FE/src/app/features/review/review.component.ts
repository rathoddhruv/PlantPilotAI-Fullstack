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

    // Splitter State
    sidebarWidth = 320;
    isResizingSidebar = false;

    constructor(
        private api: ApiService,
        private reviewQueue: ReviewQueueService,
        private toast: ToastService,
        private router: Router
    ) { }

    ngOnInit() {
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

    // --- Splitter Logic ---
    startResizingSidebar(event: MouseEvent) {
        event.preventDefault();
        this.isResizingSidebar = true;
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (this.isResizingSidebar) {
            const containerWidth = window.innerWidth;
            const newWidth = containerWidth - event.clientX;
            if (newWidth > 200 && newWidth < 600) {
                this.sidebarWidth = newWidth;
                setTimeout(() => this.redraw()); // Force redraw of canvas if layout shifts
            }
        }
    }

    @HostListener('document:mouseup')
    onMouseUp() {
        this.isResizingSidebar = false;
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
                const cls = det.class.toLowerCase();
                const color = cls === 'dandelion' ? '#f59e0b' : '#3b82f6';

                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(4, this.image.width * 0.005);
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

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
    }

    // Keyboard and flow logic follows...
    @HostListener('window:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if (this.isLoading) return;
        const key = event.key.toLowerCase();
        
        const num = parseInt(key);
        if (!isNaN(num) && num > 0) {
            if (this.prediction?.detections && num <= this.prediction.detections.length) {
                this.highlightedIndex = num - 1;
                this.toggleIgnore(this.prediction.detections[num - 1]);
                if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
                this.highlightTimeout = setTimeout(() => this.highlightedIndex = null, 800);
                return;
            }
        }

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

    accept() {
        if (this.isLoading) return;
        try {
            if (!this.prediction) {
                this.router.navigate(['/upload']);
                return;
            }
            this.isLoading = true;
            this.showToast('Saving & Refining...');
            const filename = (this.prediction as any).filename || 'unknown.jpg';
            const validDetections = this.prediction.detections.filter((d: any) => !d.ignore);
            if (this.current) {
                this.reviewQueue.updateCurrentItem({ status: 'accepted' });
            }
            const w = this.image.width || 0;
            const h = this.image.height || 0;
            this.api.saveAnnotation(filename, validDetections, w, h).subscribe();
            
            const stats = this.queueStats;
            if (stats.current >= stats.total) {
                this.api.triggerTraining().subscribe();
                this.router.navigate(['/upload']);
            } else {
                this.isLoading = false;
                this.reviewQueue.next();
            }
        } catch (error) {
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
            if (correct) this.accept();
        }
    }

    toggleIgnore(det: any) {
        det.ignore = !det.ignore;
        this.redraw();
    }

    goBack() { this.router.navigate(['/upload']); }

    private showToast(msg: string) {
        this.toastMessage = msg;
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
    }
}
