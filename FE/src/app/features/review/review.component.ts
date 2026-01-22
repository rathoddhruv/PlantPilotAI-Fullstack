import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, PredictionResult } from '../../core/services/api.service';
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
    classNames: string[] = [];

    // Interaction State
    interactionMode: 'review' | 'box' | 'poly' = 'box';
    isDrawing = false;
    dragStart: { x: number, y: number } | null = null;
    currentBox: { x: number, y: number, w: number, h: number } | null = null;
    currentPoly: { x: number, y: number }[] = [];

    constructor(
        private router: Router,
        private api: ApiService,
        private reviewQueue: ReviewQueueService
    ) { }

    ngOnInit() {
        // Fetch classes dynamicallly
        this.api.getClasses().subscribe({
            next: (res) => {
                this.classNames = res.classes || [];
            },
            error: (err) => console.error("Failed to fetch classes", err)
        });

        this.reviewQueue.currentItem$.subscribe(item => {
            this.current = item;
            if (this.current) {
                if (this.current.status === 'pending' && !this.current.prediction && !this.current.error) {
                    this.runPrediction(this.current);
                } else if (this.current.prediction) {
                    this.prediction = this.current.prediction;
                    this.loadImage(this.current.prediction.url);
                }
            }
        });

        this.reviewQueue.queueStats$.subscribe(stats => {
            this.queueStats = stats;
        });
    }

    setMode(mode: 'review' | 'box' | 'poly') {
        this.interactionMode = mode;
        this.isDrawing = false;
        this.currentBox = null;
        this.currentPoly = [];
        this.draw(); // Clear any temp drawing
    }

    // Canvas Events
    onMouseDown(e: MouseEvent) {
        if (this.interactionMode !== 'box') return;

        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.image.width / rect.width);
        const y = (e.clientY - rect.top) * (this.image.height / rect.height);

        this.isDrawing = true;
        this.dragStart = { x, y };
        this.currentBox = { x, y, w: 0, h: 0 };
    }

    onMouseMove(e: MouseEvent) {
        if (!this.isDrawing && this.interactionMode !== 'poly') return;

        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        let x = (e.clientX - rect.left) * (this.image.width / rect.width);
        let y = (e.clientY - rect.top) * (this.image.height / rect.height);

        // Clamp to image bounds to avoid corrupt labels
        x = Math.max(0, Math.min(x, this.image.width));
        y = Math.max(0, Math.min(y, this.image.height));

        if (this.interactionMode === 'box' && this.dragStart) {
            this.currentBox = {
                x: Math.min(this.dragStart.x, x),
                y: Math.min(this.dragStart.y, y),
                w: Math.abs(x - this.dragStart.x),
                h: Math.abs(y - this.dragStart.y)
            };
            this.draw();
        } else if (this.interactionMode === 'poly' && this.currentPoly.length > 0) {
            // Visualize line to cursor?
            this.draw();
            // We need to pass cursor pos to draw for live line, but simplest is just draw existing points
            // For advanced poly: draw line from last point to current mouse
            this.drawPolyLine(x, y);
        }
    }

    onMouseUp(e: MouseEvent) {
        if (this.interactionMode !== 'box' || !this.isDrawing) return;

        this.isDrawing = false;
        if (this.currentBox && this.currentBox.w > 5 && this.currentBox.h > 5) {
            // Add Detection
            const defClass = this.reviewQueue.defaultClass;
            this.addDetection({
                class: defClass && defClass.length > 0 ? defClass : (this.classNames[0] || 'Object'),
                confidence: 1.0,
                box: [
                    this.currentBox.x,
                    this.currentBox.y,
                    this.currentBox.x + this.currentBox.w,
                    this.currentBox.y + this.currentBox.h
                ],
                ignore: false
            });
        }
        this.currentBox = null;
        this.draw();
    }

    onCanvasClick(e: MouseEvent) {
        if (this.interactionMode !== 'poly') return;

        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.image.width / rect.width);
        const y = (e.clientY - rect.top) * (this.image.height / rect.height);

        // Add point
        this.currentPoly.push({ x, y });
        this.draw();
    }

    onCanvasDblClick(e: MouseEvent) {
        if (this.interactionMode !== 'poly') return;
        e.preventDefault();

        if (this.currentPoly.length >= 3) {
            // Close Polygon
            // Convert poly to detection with bounding box
            const xs = this.currentPoly.map(p => p.x);
            const ys = this.currentPoly.map(p => p.y);
            const x1 = Math.min(...xs);
            const y1 = Math.min(...ys);
            const x2 = Math.max(...xs);
            const y2 = Math.max(...ys);

            // Normalize poly for backend (0-1)
            // But detection object stores normalized? No, Frontend seems to use pixels for rendering?
            // Wait, standard detections from API are PIXELS in `box` if `result.boxes` used `xyxy`?
            // Let's check `ml_service`:
            // `box: box.xyxy.tolist()[0]` -> YOLO returns pixels.
            // So we store pixels.
            // `poly`: `obb.xyxyxyxyn` -> Normalized.

            // WE NEED TO NORMALIZE POLY for consistency if Backend expects it.
            // `save_annotation` expects `poly` to be normalized lists?
            // `ml_service.py` line 227: `poly_str = " ".join([f"{p:.6f}" for p in det['poly']])`.
            // YOLO txt format expects normalized.
            // So we should store NORMALIZED poly in `det['poly']`.

            const normPoly = this.currentPoly.flatMap(p => [
                p.x / this.image.width,
                p.y / this.image.height
            ]);

            this.addDetection({
                class: this.classNames[0] || 'Object',
                confidence: 1.0,
                box: [x1, y1, x2, y2],
                poly: normPoly,
                ignore: false
            });
        }

        this.currentPoly = [];
        this.draw();
    }

    addDetection(det: any) {
        if (!this.prediction) {
            // If no prediction object (e.g. error or empty), create one
            this.prediction = {
                filename: this.current?.file.name || 'unknown',
                url: this.image.src,
                detections: []
            };
        }
        this.prediction.detections.push(det);
    }

    deleteDetection(index: number) {
        if (this.prediction) {
            this.prediction.detections.splice(index, 1);
            this.draw();
        }
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
                // Create empty prediction so user can draw
                this.prediction = {
                    filename: item.file.name,
                    url: URL.createObjectURL(item.file),
                    detections: []
                };
                this.loadImage(this.prediction.url);
                this.showToast('Prediction failed, but you can draw manually.');
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
        const fullUrl = url.startsWith('http') || url.startsWith('blob:') ? url : `http://localhost:8000${url}`;
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

    drawPolyLine(cursorX: number, cursorY: number) {
        // Helper to draw the elastic line
        const ctx = this.canvasRef.nativeElement.getContext('2d');
        if (!ctx || this.currentPoly.length === 0) return;

        ctx.beginPath();
        const last = this.currentPoly[this.currentPoly.length - 1];
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(cursorX, cursorY);
        ctx.strokeStyle = '#ef4444'; // Red elastic
        ctx.lineWidth = 1;
        ctx.stroke();
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

        // Draw In-Progress Stuff
        if (this.interactionMode === 'box' && this.currentBox) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(this.currentBox.x, this.currentBox.y, this.currentBox.w, this.currentBox.h);
            ctx.setLineDash([]);
        }

        if (this.interactionMode === 'poly' && this.currentPoly.length > 0) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';

            ctx.beginPath();
            ctx.moveTo(this.currentPoly[0].x, this.currentPoly[0].y);
            for (let i = 1; i < this.currentPoly.length; i++) {
                ctx.lineTo(this.currentPoly[i].x, this.currentPoly[i].y);
            }
            ctx.stroke();

            // Draw points
            ctx.fillStyle = '#ef4444';
            for (const p of this.currentPoly) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

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

                if (det.poly) {
                    // Draw Polygon if exists
                    // Poly is normalized [x, y, x, y...] flat list
                    ctx.beginPath();
                    // denormalize
                    const px = det.poly[0] * this.image.width;
                    const py = det.poly[1] * this.image.height;
                    ctx.moveTo(px, py);
                    for (let j = 2; j < det.poly.length; j += 2) {
                        ctx.lineTo(det.poly[j] * this.image.width, det.poly[j + 1] * this.image.height);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    ctx.fillStyle = color + '33'; // transparent fill
                    ctx.fill();
                } else {
                    // Draw Box
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                }

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
        } else if (event.key === 'Enter') {
            if (this.interactionMode === 'poly' && this.currentPoly.length >= 3) {
                // Trigger Close Logic (simulate dblclick event or call method logic)
                // Cannot simulate event easily, extract logic
                this.finishPoly();
            }
        } else if (event.key === 'Escape') {
            this.setMode('review');
        }
    }

    finishPoly() {
        if (this.currentPoly.length >= 3) {
            const xs = this.currentPoly.map(p => p.x);
            const ys = this.currentPoly.map(p => p.y);
            const x1 = Math.min(...xs);
            const y1 = Math.min(...ys);
            const x2 = Math.max(...xs);
            const y2 = Math.max(...ys);

            const normPoly = this.currentPoly.flatMap(p => [
                p.x / this.image.width,
                p.y / this.image.height
            ]);

            this.addDetection({
                class: this.classNames[0] || 'Object',
                confidence: 1.0,
                box: [x1, y1, x2, y2],
                poly: normPoly,
                ignore: false
            });
        }
        this.currentPoly = [];
        this.draw();
    }

    get mode() {
        return this.reviewQueue.mode;
    }

    accept() {
        if (!this.current || !this.prediction) return;

        // If Test Mode, just finish
        if (this.mode === 'test') {
            this.showToast('Finished (Test Mode)');
            this.handleNext();
            return;
        }

        // Filter out ignored detections
        const validDetections = this.prediction.detections.filter((d: any) => !d.ignore);

        this.showToast('Saving...');
        this.reviewQueue.updateCurrentItem({ status: 'accepted' });

        // Save Annotation
        this.api.saveAnnotation(
            this.prediction.filename, // Using filename with UUID from prediction (backend compatible)
            validDetections,
            this.image.width,
            this.image.height
        ).subscribe({
            next: () => {
                this.showToast('Saved! Training queued in background.');

                // Fire and forget training (don't block UI)
                const config = this.reviewQueue.trainingConfig;
                this.api.triggerTraining(config).subscribe({
                    error: (err) => console.warn('Background training trigger failed', err)
                });

                // Move to next immediately
                this.handleNext();
            },
            error: (err) => {
                console.error("Save failed", err);
                this.showToast('Error saving annotation');
                // Still move next? No, let user retry.
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
