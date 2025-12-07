import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PredictionResult } from '../../core/services/api.service';

@Component({
    selector: 'app-review',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="flex flex-col h-screen bg-gray-100 p-6">
      
      <!-- Toolbar -->
      <div class="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <button (click)="goBack()" 
                class="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors">
          <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back to Upload
        </button>
        <div class="flex items-center space-x-4 bg-gray-50 px-4 py-2 rounded-full text-sm text-gray-500 border border-gray-200">
           <span class="flex items-center"><kbd class="px-2 py-1 bg-white border rounded shadow-sm mr-2 text-xs">←</kbd> Reject</span>
           <span class="w-px h-4 bg-gray-300"></span>
           <span class="flex items-center"><kbd class="px-2 py-1 bg-white border rounded shadow-sm mr-2 text-xs">→</kbd> Accept</span>
        </div>
      </div>

      <!-- Main Canvas Area -->
      <div class="flex-1 flex flex-col justify-center items-center relative gap-6">
        <div class="relative bg-white p-2 rounded-xl shadow-lg ring-1 ring-gray-200 overflow-hidden">
             <canvas #canvas class="max-w-[85vw] max-h-[70vh] rounded-lg"></canvas>
        </div>

        <div class="flex space-x-6">
          <button (click)="reject()" 
                  class="flex items-center px-8 py-4 bg-white text-red-600 border border-red-200 rounded-xl shadow-sm hover:bg-red-50 hover:border-red-300 hover:-translate-y-1 transition-all duration-200 font-bold active:bg-red-100">
             <span class="mr-2 text-xl">✕</span> Reject
          </button>
          
          <button (click)="accept()" 
                  class="flex items-center px-8 py-4 bg-white text-green-600 border border-green-200 rounded-xl shadow-sm hover:bg-green-50 hover:border-green-300 hover:-translate-y-1 transition-all duration-200 font-bold active:bg-green-100">
             <span class="mr-2 text-xl">✓</span> Accept
          </button>
        </div>
      </div>

      <!-- Info Panel -->
      <div class="mt-6 flex justify-center text-sm text-gray-500" *ngIf="prediction">
        <p>Detected <span class="font-bold text-gray-800">{{prediction.detections.length}}</span> objects in <span class="font-mono">{{prediction.filename}}</span></p>
      </div>

    </div>
  `,
    styles: [] // No CSS needed, pure Tailwind!
})
export class ReviewComponent implements OnInit {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
    prediction: PredictionResult | null = null;
    image: HTMLImageElement = new Image();

    constructor(private router: Router) {
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

    loadImage(url: string) {
        const fullUrl = url.startsWith('http') ? url : `http://localhost:8000${url}`;
        this.image.src = fullUrl;
        this.image.onload = () => {
            this.draw();
        };
    }

    draw() {
        const canvas = this.canvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // We will resize the canvas to match the image dimensions naturally, 
        // and let CSS (max-w/h) handle the display sizing
        canvas.width = this.image.width;
        canvas.height = this.image.height;

        ctx.drawImage(this.image, 0, 0);

        if (this.prediction?.detections) {
            for (const det of this.prediction.detections) {
                const [x1, y1, x2, y2] = det.box; // Assuming absolute coords in original image

                ctx.strokeStyle = '#22c55e'; // Tailwind green-500
                ctx.lineWidth = 4;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                // Label bg
                const fontSize = Math.max(16, this.image.width * 0.02);
                ctx.font = `bold ${fontSize}px sans-serif`;
                const text = `${det.class} ${Math.round(det.confidence * 100)}%`;
                const textMetrics = ctx.measureText(text);
                const pad = 4;

                ctx.fillStyle = '#22c55e';
                ctx.fillRect(x1, y1 - fontSize - pad * 2, textMetrics.width + pad * 2, fontSize + pad * 2);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, x1 + pad, y1 - pad);
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
        // Add logic to call API
        // For now we simulate success and go back
        this.goBack();
    }

    reject() {
        this.goBack();
    }

    goBack() {
        this.router.navigate(['/']);
    }
}
