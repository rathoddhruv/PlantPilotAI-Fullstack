import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, PredictionResult, CLASS_NAMES } from '../../core/services/api.service';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="flex flex-col h-full bg-gray-50 relative">
      
      <!-- Top Bar -->
      <div class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-20 flex-shrink-0">
             <button (click)="goBack()" 
                    class="flex items-center text-gray-500 hover:text-gray-900 font-medium transition-colors">
              <span class="mr-2 text-xl">←</span> Back
            </button>
            <h1 class="font-bold text-gray-800">Review Prediction</h1>
            <div class="flex items-center space-x-2 text-xs text-gray-400">
                <span class="border px-2 py-1 rounded bg-gray-50">← Reject</span>
                <span class="border px-2 py-1 rounded bg-gray-50">→ Accept</span>
            </div>
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="max-w-4xl mx-auto space-y-6">

            <!-- Canvas Container -->
            <div class="relative bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden text-center p-4">
                 <canvas #canvas class="max-w-full h-auto mx-auto rounded-lg shadow-inner bg-gray-100"></canvas>
                 <div *ngIf="!prediction" class="p-10 text-gray-400 italic">No image loaded</div>
            </div>

            <!-- Correction Panel -->
            <div *ngIf="prediction && prediction.detections.length > 0" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up">
                <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Detections ({{ prediction.detections.length }})</h3>
                
                <div class="space-y-3">
                    <div *ngFor="let det of prediction.detections; let i = index" 
                         class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                        
                        <div class="flex items-center space-x-3">
                            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{{ i + 1 }}</span>
                            <div>
                                <p class="text-[10px] text-gray-400 uppercase font-mono">Confidence: {{ (det.confidence * 100).toFixed(0) }}%</p>
                            </div>
                        </div>

                        <!-- Class Selector -->
                        <div class="flex items-center space-x-2">
                            <label class="text-xs font-semibold text-gray-600 mr-2">Class:</label>
                            <select [(ngModel)]="det.class" (change)="redraw()"
                                    class="block w-40 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm py-1.5 bg-white">
                                <option *ngFor="let name of classNames" [value]="name">{{ name }}</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <p class="text-xs text-blue-500 mt-4 flex items-center">
                    <span class="mr-1">ℹ️</span> Correct the classes above if needed, then click Accept.
                </p>
            </div>

            <!-- Empty State -->
             <div *ngIf="prediction && prediction.detections.length === 0" class="bg-yellow-50 text-yellow-800 p-4 rounded-xl border border-yellow-200 text-center">
                No objects detected. You can reject this image or accept it as empty background.
             </div>

        </div>
      </div>

      <!-- Sticky Bottom Action Bar -->
      <div class="h-20 bg-white border-t border-gray-200 flex items-center justify-center space-x-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 flex-shrink-0">
            <button (click)="reject()" 
                  class="group flex flex-col items-center justify-center w-32 h-14 rounded-xl border-2 border-transparent bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200 active:scale-95 transition-all">
               <span class="font-bold">Reject</span>
            </button>

            <button (click)="accept()" 
                  class="group flex flex-col items-center justify-center w-48 h-14 rounded-xl shadow-lg bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all">
               <span class="font-bold text-lg">Accept & Train</span>
            </button>
      </div>

      <!-- Toast -->
      <div *ngIf="toastMessage" class="absolute top-24 left-1/2 transform -translate-x-1/2 bg-gray-900/90 text-white px-6 py-3 rounded-full shadow-2xl flex items-center animate-fade-in-down z-50 backdrop-blur-sm border border-gray-700">
            <span class="text-green-400 mr-3 text-xl bg-green-500/20 rounded-full p-1">✓</span>
            {{ toastMessage }}
      </div>

    </div>
  `,
    styles: [`
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        .animate-fade-in-down { animation: fadeInDown 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    `]
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
