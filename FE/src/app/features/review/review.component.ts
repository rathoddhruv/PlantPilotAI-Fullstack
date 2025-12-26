import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, PredictionResult, CLASS_NAMES } from '../../core/services/api.service';
import { ReviewQueueService, ReviewItem } from '../../core/services/review-queue.service';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './review.component.html',
    styleUrls: ['./review.component.scss']
})
export class ReviewComponent implements OnInit {
    @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>; // Static false because it might be in ngIf or layout shift

    current: ReviewItem | null = null;
    queueStats: { current: number, total: number } = { current: 0, total: 0 };
    isLoading = false;

    prediction: PredictionResult | null = null;
    image: HTMLImageElement = new Image();
    toastMessage: string | null = null;
    classNames = CLASS_NAMES;

    constructor(
        private router: Router,
        private api: ApiService,
        private reviewQueue: ReviewQueueService
    ) {
        // Keep potential state-based logic for direct linking if we want, but prioritize queue
        // const nav = this.router.getCurrentNavigation();
        // if (nav?.extras.state && nav.extras.state['prediction']) { ... }
    }

    ngOnInit() {
        this.reviewQueue.currentItem$.subscribe(item => {
            this.current = item;
            if (this.current) {
                // If this is a new file pending analysis, or we just switched to it?
                // If it already has prediction, just show it.
                // If it is 'pending' and has no prediction, run predict.
                if (this.current.status === 'pending' && !this.current.prediction && !this.current.error) {
                    this.runPrediction(this.current);
                } else if (this.current.prediction) {
                    this.prediction = this.current.prediction;
                    this.loadImage(this.current.prediction.url);
                }
            } else {
                // Queue is empty or reset
                // Check if we just finished?
                if (this.queueStats.total > 0 && this.queueStats.current > this.queueStats.total) {
                    // Done?
                }
            }
        });

        this.reviewQueue.queueStats$.subscribe(stats => {
            this.queueStats = stats;
        });

        // If queue is empty on init, redirect?
        // Timeout to allow subscription to fire if synchronous
        setTimeout(() => {
            if (!this.reviewQueue.getQueue().length) {
                // Fallback: Check if we have state from router (legacy single file support or direct link?)
                // If not, go back to upload
                // this.router.navigate(['/']);
                // Actually, let's just stay here or show "No images".
            }
        }, 100);
    }

    runPrediction(item: ReviewItem) {
        this.isLoading = true;

        // Optimistic update: analyzing
        this.reviewQueue.updateCurrentItem({ status: 'analyzing' });

        this.api.predict(item.file).subscribe({
            next: (res) => {
                this.isLoading = false;
                this.reviewQueue.updateCurrentItem({
                    status: 'pending', // Back to pending (user hasn't acted yet)
                    prediction: res
                });
                // The subscription will pick this up and call loadImage
            },
            error: (err) => {
                this.isLoading = false;
                this.reviewQueue.updateCurrentItem({
                    status: 'error',
                    error: err.message || 'Prediction failed'
                });
                this.showToast('Prediction failed');
            }
        });
    }

    // Wait for view init to draw on canvas if it wasn't ready
    ngAfterViewInit() {
        if (this.image.complete && this.prediction) {
            this.draw();
        }
    }

    loadImage(url: string) {
        const fullUrl = url.startsWith('http') ? url : `http://localhost:8000${url}`;
        this.image.src = fullUrl;

        this.image.onload = () => {
            // giving a slight delay for canvas binding in case of layout shifts
            setTimeout(() => this.draw(), 50);
        };

        this.image.onerror = (err) => {
            console.error('Failed to load image:', fullUrl, err);
            this.showToast('Error loading image. See console.');
        };
    }

    // ...

    markAll(correct: boolean) {
        if (!this.prediction) return;
        this.prediction.detections.forEach((d: any) => d.ignore = !correct);
        this.redraw();
    }

    toggleIgnore(det: any) {
        det.ignore = !det.ignore;
        this.redraw();
    }

    redraw() {
        this.draw();
    }

    draw() {
        if (!this.canvasRef) return;
        const canvas = this.canvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas to image size
        canvas.width = this.image.width;
        canvas.height = this.image.height;

        ctx.drawImage(this.image, 0, 0);

        if (this.prediction?.detections) {
            for (let i = 0; i < this.prediction.detections.length; i++) {
                const det = this.prediction.detections[i] as any;

                if (det.ignore) continue;

                const [x1, y1, x2, y2] = det.box;

                // Color based on class? For now nice Green.
                const isHydrangea = det.class.toLowerCase().includes('hydrangea');
                const color = isHydrangea ? '#3b82f6' : '#eab308'; // Blue vs Yellow

                // Box
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(3, this.image.width * 0.003);
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                // Label
                const fontSize = Math.max(16, this.image.width * 0.02);
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                const text = `${i + 1}. ${det.class}`;
                const pad = fontSize * 0.5;
                const textMetrics = ctx.measureText(text);

                ctx.fillStyle = color;
                ctx.fillRect(x1, y1 - fontSize - pad * 1.5, textMetrics.width + pad * 2, fontSize + pad * 2);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, x1 + pad, y1 - pad * 0.5);
            }
        }
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if (event.key === 'ArrowLeft') {
            this.reject();
        } else if (event.key === 'ArrowRight') {
            this.accept();
        }
    }

    accept() {
        if (!this.current || !this.prediction) return;

        // Filter out ignored detections
        const validDetections = this.prediction.detections.filter((d: any) => !d.ignore);

        this.showToast('Saving & Training...');
        this.reviewQueue.updateCurrentItem({ status: 'accepted' });

        this.api.saveAnnotation(
            this.prediction.filename,
            validDetections,
            this.image.width,
            this.image.height
        ).pipe(
            switchMap(() => this.api.triggerTraining())
        ).subscribe({
            next: () => {
                this.showToast('Saved & Training Triggered!');
                setTimeout(() => this.handleNext(), 1000);
            },
            error: (err) => {
                console.error("Save failed", err);
                this.showToast('Error saving annotation');
                setTimeout(() => this.handleNext(), 2000);
            }
        });
    }

    reject() {
        if (!this.current) return;
        this.showToast('Rejected.');
        this.reviewQueue.updateCurrentItem({ status: 'rejected' });
        this.handleNext();
    }

    handleNext() {
        if (this.queueStats.current < this.queueStats.total) {
            this.reviewQueue.next();
        } else {
            // End of queue
            this.showToast('All images reviewed!');
            setTimeout(() => this.goBack(), 1000);
        }
    }

    goPrevious() {
        this.reviewQueue.previous();
    }

    goBack() {
        this.reviewQueue.clear();
        this.router.navigate(['/']);
    }

    showToast(msg: string) {
        this.toastMessage = msg;
        setTimeout(() => {
            if (this.toastMessage === msg) this.toastMessage = null;
        }, 3000);
    }
}
