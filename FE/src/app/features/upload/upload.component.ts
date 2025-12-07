import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-upload',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="flex h-screen w-full items-center justify-center bg-gray-50 p-4 transition-colors duration-300"
         [class.bg-green-50]="isDragOver"
         (dragover)="onDragOver($event)"
         (dragleave)="onDragLeave($event)"
         (drop)="onDrop($event)">
      
      <div class="text-center max-w-lg w-full rounded-2xl border-4 border-dashed border-gray-300 p-12 bg-white shadow-sm transition-all duration-300"
           [class.border-green-500]="isDragOver"
           [class.scale-105]="isDragOver">
        
        <div class="mb-6 text-6xl animate-bounce">🌿</div>
        
        <h1 class="text-3xl font-bold text-gray-800 mb-2">PlantPilotAI</h1>
        <p class="text-gray-500 mb-8">Drag & Drop a <span class="font-bold text-green-600">Label Studio ZIP</span> or <span class="font-bold text-blue-600">Image</span> to begin.</p>
        
        <input type="file" #fileInput (change)="onFileSelected($event)" class="hidden" />
        
        <button (click)="fileInput.click()" 
                class="px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-black transition-colors focus:ring-4 focus:ring-gray-200">
          Browse Files
        </button>

        <div *ngIf="loading" class="mt-8 flex flex-col items-center animate-pulse">
           <div class="h-2 w-full bg-gray-200 rounded-full overflow-hidden max-w-xs">
             <div class="h-full bg-green-500 w-1/2 animate-slide"></div>
           </div>
           <span class="text-sm text-gray-400 mt-2">Processing...</span>
        </div>

        <div *ngIf="message" class="mt-6 p-4 bg-green-100 text-green-700 rounded-lg border border-green-200">
          {{ message }}
        </div>
        
        <div *ngIf="error" class="mt-6 p-4 bg-red-100 text-red-700 rounded-lg border border-red-200">
          {{ error }}
        </div>
      </div>
    </div>
  `,
    styles: [`
   @keyframes slide {
     0% { transform: translateX(-100%); }
     100% { transform: translateX(200%); }
   }
   .animate-slide {
     animation: slide 1.5s infinite linear;
   }
  `]
})
export class UploadComponent {
    isDragOver = false;
    loading = false;
    message = '';
    error = '';

    constructor(private api: ApiService, private router: Router) { }

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
        if (files && files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    handleFile(file: File) {
        this.loading = true;
        this.message = '';
        this.error = '';

        if (file.name.endsWith('.zip')) {
            this.api.initProject(file).subscribe({
                next: (res) => {
                    this.loading = false;
                    this.message = 'Project initialized! Training started in background.';
                },
                error: (err) => {
                    this.loading = false;
                    this.error = 'Upload failed: ' + err.message;
                }
            });
        } else if (file.type.startsWith('image/')) {
            this.api.predict(file).subscribe({
                next: (res) => {
                    this.loading = false;
                    this.router.navigate(['/review'], { state: { prediction: res } });
                },
                error: (err) => {
                    this.loading = false;
                    this.error = 'Prediction failed: ' + err.message;
                }
            });
        } else {
            this.loading = false;
            this.error = 'Unsupported file type. Please upload a .zip or .jpg/.png image.';
        }
    }
}
