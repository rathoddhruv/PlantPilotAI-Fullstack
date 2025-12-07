import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, PredictionResult, CLASS_NAMES } from '../../core/services/api.service';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './review.component.html',
    styleUrls: ['./review.component.scss']
})
export class ReviewComponent implements OnInit {
    @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>; // Static false because it might be in ngIf or layout shift

    prediction: PredictionResult | null = null;
    image: HTMLImageElement = new Image();
    toastMessage: string | null = null;
    classNames = CLASS_NAMES;

    constructor(private router: Router, private api: ApiService) {
        const nav = this.router.getCurrentNavigation();
        if (nav?.extras.state && nav.extras.state['prediction']) {
            this.prediction = nav.extras.state['prediction'];
        }
    }

    ngOnInit() {
        if (this.prediction) {
            this.loadImage(this.prediction.url);
        }
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
                const det = this.prediction.detections[i];
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
        this.showToast('Accepted! Training Started...');

        // Trigger active learning
        this.api.triggerTraining().subscribe({
            next: () => {
                setTimeout(() => this.goBack(), 2000);
            },
            error: (err) => {
                console.error(err);
                // navigate anyway for UX
                setTimeout(() => this.goBack(), 2000);
            }
        });
    }

    reject() {
        this.showToast('Rejected.');
        setTimeout(() => this.goBack(), 500);
    }

    goBack() {
        this.router.navigate(['/']);
    }

    showToast(msg: string) {
        this.toastMessage = msg;
        setTimeout(() => {
            if (this.toastMessage === msg) this.toastMessage = null;
        }, 3000);
    }
}
