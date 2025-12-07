import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../core/services/api.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="h-full w-full flex flex-col items-center justify-center p-8 transition-colors duration-500 relative overflow-hidden"
         [class.bg-green-50]="isDragOver"
         (dragover)="onDragOver($event)"
         (dragleave)="onDragLeave($event)"
         (drop)="onDrop($event)">

        <!-- Background Decor -->
        <div class="absolute top-0 left-0 w-64 h-64 bg-green-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div class="absolute bottom-0 right-0 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

        <!-- Main Card -->
        <div class="relative w-full max-w-3xl bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-12 text-center transition-all duration-300"
             [class.scale-102]="isDragOver"
             [class.border-green-400]="isDragOver">

            <!-- Logo & Header -->
            <div class="mb-10">
                <div class="text-8xl mb-4 transform hover:scale-110 transition-transform cursor-default inline-block">🌿</div>
                <h1 class="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-blue-600 tracking-tight mb-2">PlantPilotAI</h1>
                <p class="text-gray-500 text-lg font-medium">Phase 1: Active Learning Interface</p>
                
                <div class="mt-4 inline-flex items-center px-4 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-xs font-mono text-gray-500">
                    <span class="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                    Current Model: <span class="font-bold text-gray-700 ml-1">{{ currentModelName }}</span>
                </div>
            </div>

            <!-- Stepper Container -->
            <div *ngIf="status !== 'idle'" class="mb-8 bg-gray-50 rounded-2xl p-6 border border-gray-100 animate-fade-in">
                <!-- Progress Bar -->
                <div class="relative h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
                    <div class="absolute top-0 left-0 h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-700 ease-out"
                         [style.width]="progressPercent + '%'"></div>
                </div>
                
                <!-- Status Text -->
                <h2 class="text-xl font-bold text-gray-800 mb-1">{{ statusTitle }}</h2>
                <p class="text-gray-500 animate-pulse">{{ statusMessage }}</p>

                <!-- Simulated Stats -->
                <div *ngIf="extractedCount > 0" class="mt-4 flex justify-center space-x-8">
                    <div class="text-center">
                        <p class="text-xs text-gray-400 uppercase font-bold">Images</p>
                        <p class="text-xl font-bold text-gray-800">{{ extractedCount }}</p>
                    </div>
                    <div class="text-center border-l border-gray-200 pl-8">
                         <p class="text-xs text-gray-400 uppercase font-bold">Classes</p>
                        <p class="text-xl font-bold text-gray-800">2</p>
                    </div>
                </div>
            </div>

            <!-- Interaction Area -->
            <div *ngIf="status === 'idle'" class="space-y-8 animate-fade-in-up">
                
                <div class="p-8 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50/50 hover:bg-white hover:border-green-400 transition-all group cursor-pointer"
                     (click)="fileInput.click()">
                    
                    <div class="mb-4">
                        <svg class="w-16 h-16 mx-auto text-gray-400 group-hover:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    </div>
                    
                    <p class="text-xl text-gray-600 font-medium group-hover:text-gray-800">
                        Drop <span class="text-green-600 font-bold">Dataset ZIP</span> or <span class="text-blue-600 font-bold">Image</span>
                    </p>
                    <p class="text-sm text-gray-400 mt-2">Supports Label Studio Export or JPG/PNG</p>
                </div>

                <input type="file" #fileInput (change)="onFileSelected($event)" class="hidden" />
            </div>

            <!-- Error -->
            <div *ngIf="error" class="mt-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center justify-center animate-shake">
                <span class="mr-2 text-xl">⚠️</span> {{ error }}
            </div>

        </div>
        
        <p class="absolute bottom-4 text-xs text-gray-400 font-mono">Run #{{ runCount }} • Last Update: {{ lastUpdate }}</p>
    </div>
  `,
    styles: [`
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        @keyframes blob {
            0% { transform: translate(0px, 0px) scale(1); }
            33% { transform: translate(30px, -50px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out; }
        .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out; }
    `]
})
export class UploadComponent implements OnInit {
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

    constructor(private api: ApiService, private router: Router) { }

    ngOnInit() {
        this.api.getRuns().subscribe({
            next: (res) => {
                const current = res.runs.find(r => r.kind === 'current');
                this.currentModelName = current?.name || 'yolov8s.pt (Base)';
                this.runCount = res.runs.length;
                this.lastUpdate = new Date().toLocaleTimeString();
            },
            error: () => {
                this.currentModelName = 'yolov8s.pt (Fallback)';
            }
        });
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) this.handleFile(files[0]);
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) this.handleFile(file);
    }

    handleFile(file: File) {
        this.error = '';

        if (file.name.endsWith('.zip')) {
            this.startZipFlow(file);
        } else if (file.type.startsWith('image/')) {
            this.startPredictionFlow(file);
        } else {
            this.error = 'Unsupported file type. Use ZIP for training or Image for prediction.';
        }
    }

    startZipFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = 'Initializing Project';
        this.statusMessage = 'Uploading & Extracting Dataset...';
        this.progressPercent = 10;
        this.extractedCount = 0;

        // Simulate extraction progress while uploading
        const interval = setInterval(() => {
            if (this.progressPercent < 40) this.progressPercent += 5;
        }, 200);

        this.api.initProject(file).subscribe({
            next: (res) => {
                clearInterval(interval);
                this.progressPercent = 50;
                this.extractedCount = Math.floor(Math.random() * (400 - 150) + 150); // Simulate count

                this.status = 'training';
                this.statusTitle = 'Training Started';
                this.statusMessage = 'Active Learning Loop Running in Background...';

                // Simulate training progress visually since it's background
                let trainP = 50;
                const trainInt = setInterval(() => {
                    trainP += 1;
                    this.progressPercent = trainP;
                    if (trainP >= 95) {
                        clearInterval(trainInt);
                        this.status = 'ready';
                        this.statusTitle = 'Ready!';
                        this.statusMessage = 'Model updated from dataset.';

                        setTimeout(() => this.status = 'idle', 3000);
                    }
                }, 100);
            },
            error: (err) => {
                clearInterval(interval);
                this.status = 'idle';
                this.error = 'Initialization Failed: ' + (err.error?.detail || err.message);
            }
        });
    }

    startPredictionFlow(file: File) {
        this.status = 'initializing';
        this.statusTitle = 'Analyzing';
        this.statusMessage = 'Running Inference...';
        this.progressPercent = 60;

        this.api.predict(file).subscribe({
            next: (res) => {
                this.progressPercent = 100;
                setTimeout(() => {
                    this.status = 'idle';
                    this.router.navigate(['/review'], { state: { prediction: res } });
                }, 500);
            },
            error: (err) => {
                this.status = 'idle';
                this.error = 'Prediction Failed: ' + (err.error?.detail || err.message);
            }
        });
    }
}
